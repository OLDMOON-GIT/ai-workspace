import { NextRequest, NextResponse } from 'next/server';
import { getOne, run } from '@/lib/mysql';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getCurrentUser } from '@/lib/session';
import { promises as fs } from 'fs';
import { createBackup } from '@/lib/backup';
import { sendErrorEmail } from '@/lib/email';
import { getDefaultModelByType, updateQueueStatus } from '@/lib/automation';
import { getCachedPrompt } from '@/lib/prompt-cache';

const execAsync = promisify(exec);

// 실행 중인 프로세스를 추적하는 Map (로컬 참조용)
const runningProcesses = new Map<string, any>();

// 프롬프트 로딩 함수들 (캐시 사용)
async function getShortFormPrompt(): Promise<string> {
  return getCachedPrompt('shortform');
}

async function getLongFormPrompt(): Promise<string> {
  return getCachedPrompt('longform');
}

async function getSora2Prompt(): Promise<string> {
  return getCachedPrompt('sora2');
}

async function getProductInfoPrompt(): Promise<string> {
  return getCachedPrompt('product_info');
}

async function getProductPrompt(): Promise<string> {
  return getCachedPrompt('product');
}

// 로그 추가 헬퍼 함수 (content 테이블 사용)
async function addLog(taskId: string, message: string) {
  try {
    const { addContentLog } = await import('@/lib/content');
    // v3: type 제거됨
    addContentLog(taskId, message);

    // 디버깅: 로그가 제대로 추가되었는지 확인
    console.log(`[LOG ${taskId}] ${message}`);
  } catch (error) {
    console.error('Failed to add log:', error);
    console.error('TaskId:', taskId);
    console.error('Message:', message);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 내부 요청 확인 (자동화 시스템에서의 호출)
    const isInternalRequest = request.headers.get('X-Internal-Request') === 'automation-system';
    console.log('🔍 [AUTH] isInternalRequest:', isInternalRequest);

    // 사용자 인증 확인 (내부 요청이 아닐 경우만)
    let user: { userId: string; email: string; isAdmin: boolean } | null = null;
    if (!isInternalRequest) {
      user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        );
      }
    }

    // 대본 생성 전 자동 백업 (매 10번째 요청마다)
    if (Math.random() < 0.1) { // 10% 확률
      try {
        await createBackup('auto_before_script');
        console.log('✅ 자동 백업 완료');
      } catch (error) {
        console.error('⚠️ 자동 백업 실패 (무시하고 진행):', error);
      }
    }

    const body = await request.json();
    const { title, type, videoFormat, useClaudeLocal, scriptModel, model, category, userId: internalUserId, mode, taskId: externalTaskId } = body;
    let productInfo = body.productInfo; // let으로 선언하여 나중에 재할당 가능

    // ⭐ mode 파라미터 확인 (chrome 또는 api)
    const generationMode = mode || 'chrome'; // 기본값: chrome
    console.log('🔍 [MODE] Generation mode:', generationMode);

    console.log('🔍 [AUTH] internalUserId from body:', internalUserId);
    console.log('🛍️ [PRODUCT-INFO] productInfo 수신:', productInfo ? 'YES ✅' : 'NO ❌');
    if (productInfo) {
      console.log('  - title:', productInfo.title);
      console.log('  - thumbnail:', productInfo.thumbnail);
      console.log('  - product_link:', productInfo.product_link);
      console.log('  - description:', productInfo.description);
    }

    // 내부 요청일 경우 body에서 userId를 가져와 user 객체 생성
    if (isInternalRequest && internalUserId) {
      user = { userId: internalUserId, email: '', isAdmin: false };
      console.log('✅ [AUTH] Created internal user:', user.userId);
    }

    // user가 여전히 null이면 에러 (내부 요청인데 userId가 없거나, 일반 요청인데 인증 실패)
    if (!user) {
      console.error('❌ [AUTH] No user! isInternal:', isInternalRequest, 'userId:', internalUserId);
      return NextResponse.json(
        { error: '사용자 인증이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('✅ [AUTH] Final user:', user.userId);

    // ⭐ mode === 'api'일 경우 /api/generate-script로 리다이렉트
    if (generationMode === 'api') {
      console.log('🔀 [MODE] Redirecting to /api/generate-script (API mode)');

      // /api/generate-script 형식으로 변환
      const generateScriptBody = {
        prompt: '', // 프롬프트는 /api/generate-script 내부에서 로드됨
        topic: title,
        promptFormat: type,
        model: scriptModel || model || 'claude',
        productInfo: productInfo,
        category: category || '일반',
        userId: user.userId
      };

      // 내부 API 호출
      const generateScriptResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'automation-system'
        },
        body: JSON.stringify(generateScriptBody)
      });

      // 응답 그대로 반환
      const data = await generateScriptResponse.json();
      return NextResponse.json(data, { status: generateScriptResponse.status });
    }

    // ⭐ mode === 'chrome' (기본값): 기존 로직 계속 진행
    console.log('🚀 [Scripts Generate] 요청 받음 (Chrome mode)');
    console.log('  📝 제목:', title);
    console.log('  🤖 scriptModel:', scriptModel);
    console.log('  🤖 model:', model);
    console.log('  📌 useClaudeLocal:', useClaudeLocal);

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // scriptModel을 agent 이름으로 매핑
    const MODEL_TO_AGENT: Record<string, string> = {
      'gpt': 'chatgpt',
      'chatgpt': 'chatgpt',  // 프론트엔드에서 'chatgpt'로 전송
      'gemini': 'gemini',
      'claude': 'claude',
      'grok': 'grok'
    };

    const modelInput = scriptModel || model;  // scriptModel 또는 model 둘 다 지원
    let agentName = modelInput && MODEL_TO_AGENT[modelInput]
      ? MODEL_TO_AGENT[modelInput]
      : getDefaultModelByType(type || videoFormat);  // 타입별 기본 모델 선택

    console.log('  🔍 modelInput:', modelInput);
    console.log('  ✅ Agent 이름:', agentName);

    // type 또는 videoFormat에서 스크립트 타입 결정
    // 입력: 'longform', 'shortform', 'sora2', 'product', 'product-info' (통일된 형식)
    const inputType = type || videoFormat || 'longform';

    // 내부 처리용 타입 (프롬프트 선택용)
    let scriptType: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info' = 'longform';
    if (inputType === 'sora2') {
      scriptType = 'sora2';
    } else if (inputType === 'shortform') {
      scriptType = 'shortform';
    } else if (inputType === 'product') {
      scriptType = 'product';
    } else if (inputType === 'product-info') {
      scriptType = 'product-info';
    } else if (inputType === 'longform') {
      scriptType = 'longform';
    }

    console.log(`  📌 대본 타입: ${scriptType} (입력: ${inputType})`);

    // 🔒 중복 체크: 같은 제목으로 이미 생성 중인 대본이 있는지 확인
    const existingScript = await getOne(`
      SELECT content_id, status FROM content
      WHERE user_id = ?
        AND title = ?
        AND prompt_format = ?
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `, [user.userId, title, scriptType]) as { content_id: string; status: string } | undefined;

    if (existingScript) {
      console.warn(`⚠️ [SCRIPT] 중복 대본 생성 방지: title="${title}"에 이미 ${existingScript.status} 중인 대본(${existingScript.content_id})이 있습니다.`);
      return NextResponse.json({
        success: true,
        taskId: existingScript.content_id,
        message: '이미 생성 중인 대본이 있습니다'
      });
    }

    // contents 테이블을 사용하여 스크립트 작업 생성
    const { createContent } = await import('@/lib/content');

    const content = await createContent(
      user.userId,
      title,
      {
        // ⭐ externalTaskId가 있으면 content.id = task.id로 설정 (ID 통일)
        id: externalTaskId || undefined,
        promptFormat: scriptType,
        originalTitle: title,
        useClaudeLocal: useClaudeLocal,
        aiModel: agentName,
        productInfo: (scriptType === 'product' || scriptType === 'product-info') && productInfo ? productInfo : undefined,
        // 상품 타입이거나 product_info.thumbnail이 있으면 카테고리를 '상품'으로 강제 설정
        category: (scriptType === 'product' || scriptType === 'product-info' || !!productInfo?.thumbnail) ? '상품' : (category || '일반')
      }
    );

    const taskId = content.id;

    // 백그라운드에서 대본 생성 실행
    // 타입에 따라 다른 프롬프트 사용
    let prompt: string;
    if (scriptType === 'shortform') {
      // 숏폼: 파일에서 읽어온 짧은 프롬프트 사용 (빠름)
      const shortFormPromptTemplate = await getShortFormPrompt();
      prompt = shortFormPromptTemplate.replace(/{title}/g, title);
      console.log('✅ 숏폼 프롬프트 사용');
    } else if (scriptType === 'sora2') {
      // SORA2: SORA2 전용 프롬프트 사용
      const sora2PromptTemplate = await getSora2Prompt();
      prompt = sora2PromptTemplate.replace(/{title}/g, title);
      console.log('✅ SORA2 프롬프트 사용');
    } else if (scriptType === 'product') {
      // 상품: 상품 소개 전용 프롬프트 사용
      const productPromptTemplate = await getProductPrompt();
      prompt = productPromptTemplate.replace(/{title}/g, title);

      // productInfo가 없으면 DB에서 찾아오기
      if (!productInfo) {
        console.log('⚠️ productInfo가 전달되지 않음, DB에서 찾는 중...');

        // title이 "[광고] XXX"와 같은 형식이면 그대로 사용
        const searchTitle = title;
        console.log('  검색 제목:', searchTitle);

        // DB에서 제목의 product_info 찾기
        const task = await getOne(`
          SELECT product_info FROM content
          WHERE title = ?
          ORDER BY created_at DESC
          LIMIT 1
        `, [searchTitle]) as { product_info: string } | undefined;

        if (task && task.product_info) {
          try {
            productInfo = JSON.parse(task.product_info);
            console.log('✅ DB에서 productInfo 로드 성공:', productInfo);
          } catch (e) {
            console.error('❌ product_info JSON 파싱 실패:', e);
          }
        } else {
          console.error('❌ DB에서 제목을 찾을 수 없음:', searchTitle);
        }
      }

      // productInfo가 있으면 플레이스홀더 치환
      if (productInfo) {
        console.log('🛍️ 상품 정보 치환 시작:', productInfo);

        // ⭐ 통일된 구조: { productId, title, price, thumbnail, deepLink, category }
        // deepLink를 product_link 플레이스홀더에 매핑
        const productTitle = productInfo.title || '';
        const productThumbnail = productInfo.thumbnail || '';
        const productLink = productInfo.deepLink || ''; // 통일: deepLink
        const productDescription = productInfo.description || '';

        console.log('  - title:', productTitle);
        console.log('  - thumbnail:', productThumbnail);
        console.log('  - product_link:', productLink);
        console.log('  - description:', productDescription);

        // DB에서 사용자 설정 가져오기
        const userSettings = await getOne('SELECT google_sites_home_url, nickname FROM user WHERE user_id = ?', [user.userId]) as { google_sites_home_url?: string; nickname?: string } | undefined;
        const homeUrl = userSettings?.google_sites_home_url || 'https://sites.google.com/view/coupnagbigsale/%ED%99%88';
        const nickname = userSettings?.nickname || '쿠팡빅세일';
        console.log('🏠 home_url 설정:', homeUrl);
        console.log('👤 별명 설정:', nickname);

        prompt = prompt
          .replace(/{title}/g, productTitle)
          .replace(/{thumbnail}/g, productThumbnail)
          .replace(/{product_link}/g, productLink)
          .replace(/{product_description}/g, productDescription)
          .replace(/{home_url}/g, homeUrl)
          .replace(/{별명}/g, nickname);

        console.log('✅ 상품 정보 플레이스홀더 치환 완료');
        console.log('  - {title} → ', productTitle);
      } else {
        console.warn('⚠️ productInfo를 찾을 수 없습니다! 플레이스홀더가 그대로 남아있을 수 있습니다.');
      }

      console.log('✅ 상품 프롬프트 사용');
    } else if (scriptType === 'product-info') {
      // ⚠️ DEPRECATED: product-info는 product로 통합됨
      console.log('⚠️ product-info 타입 감지 → product 프롬프트 사용');
      scriptType = 'product'; // product로 변경
      const productPromptTemplate = await getProductPrompt();
      prompt = productPromptTemplate.replace(/{title}/g, title);

      // productInfo가 없으면 DB에서 찾아오기
      if (!productInfo) {
        console.log('⚠️ productInfo가 전달되지 않음, DB에서 찾는 중...');

        // title에서 원본 제목 추출: "[광고] XXX - 상품 기입 정보" → "[광고] XXX"
        const originalTitle = title.replace(/ - 상품 기입 정보$/, '');
        console.log('  원본 제목:', originalTitle);

        // DB에서 원본 제목의 product_info 찾기
        const task = await getOne(`
          SELECT product_info FROM content
          WHERE title = ?
          ORDER BY created_at DESC
          LIMIT 1
        `, [originalTitle]) as { product_info: string } | undefined;

        if (task && task.product_info) {
          try {
            productInfo = JSON.parse(task.product_info);
            console.log('✅ DB에서 productInfo 로드 성공:', productInfo);
          } catch (e) {
            console.error('❌ product_info JSON 파싱 실패:', e);
          }
        } else {
          console.error('❌ DB에서 원본 제목을 찾을 수 없음:', originalTitle);
        }
      }

      // productInfo가 있으면 플레이스홀더 치환
      if (productInfo) {
        console.log('🛍️🛍️🛍️ 상품 정보 치환 시작:', productInfo);

        // ⭐ 통일된 구조: { productId, title, price, thumbnail, deepLink, category }
        // deepLink를 product_link 플레이스홀더에 매핑
        const productTitle = productInfo.title || '';
        const productThumbnail = productInfo.thumbnail || '';
        const productLink = productInfo.deepLink || ''; // 통일: deepLink
        const productDescription = productInfo.description || '';

        console.log('  - title:', productTitle);
        console.log('  - thumbnail:', productThumbnail);
        console.log('  - product_link:', productLink);
        console.log('  - description:', productDescription);

        // DB에서 사용자 설정 가져오기
        const userSettings2 = await getOne('SELECT google_sites_home_url, nickname FROM user WHERE user_id = ?', [user.userId]) as { google_sites_home_url?: string; nickname?: string } | undefined;
        const homeUrl = userSettings2?.google_sites_home_url || 'https://sites.google.com/view/coupnagbigsale/%ED%99%88';
        const nickname = userSettings2?.nickname || '쿠팡빅세일';
        console.log('🏠 home_url 설정:', homeUrl);
        console.log('👤 별명 설정:', nickname);

        prompt = prompt
          .replace(/{title}/g, productTitle)
          .replace(/{thumbnail}/g, productThumbnail)
          .replace(/{product_link}/g, productLink)
          .replace(/{product_description}/g, productDescription)
          .replace(/{home_url}/g, homeUrl)
          .replace(/{별명}/g, nickname);

        console.log('✅ 상품 정보 플레이스홀더 치환 완료');
        console.log('  - {title} → ', productTitle);
      } else {
        console.error('❌ productInfo를 찾을 수 없습니다! 프롬프트에 플레이스홀더가 그대로 남습니다.');
      }

      console.log('✅ 상품정보 프롬프트 사용');
    } else {
      // 롱폼: 파일에서 읽어온 상세 프롬프트 사용
      const longFormPromptTemplate = await getLongFormPrompt();
      prompt = longFormPromptTemplate.replace(/{title}/g, title);  // 전역 치환 (여러 개 있을 수 있음)
      console.log('✅ 롱폼 프롬프트 사용');
    }

    // 카테고리 스타일 지침 추가 (프롬프트에 직접 삽입)
    // 상품 타입이거나 product_info.thumbnail이 있으면 카테고리를 '상품'으로 강제 설정
    const scriptTypeStr = scriptType as string; // TypeScript narrowing 우회
    const finalCategory = (scriptTypeStr === 'product' || scriptTypeStr === 'product-info' || !!productInfo?.thumbnail) ? '상품' : (category || '일반');

    if (category && category !== '일반') {
      const categoryStyles: Record<string, string> = {
        '북한탈북자사연': '북한 탈북자의 실제 경험담과 사연을 바탕으로, 감동적이고 진솔한 스토리텔링으로 작성하세요. 탈북 과정의 어려움, 새로운 삶에 대한 희망, 가족에 대한 그리움 등을 담아주세요.',
        '막장드라마': '막장 드라마 스타일로 극적이고 자극적인 전개를 사용하세요. 배신, 복수, 충격적인 반전, 과장된 감정 표현을 포함하며, 시청자의 몰입을 극대화하세요.',
        '감동실화': '실화를 바탕으로 한 감동적인 스토리로 작성하세요. 진정성 있는 감정 표현과 희망적인 메시지를 전달하며, 시청자의 공감을 이끌어내세요.',
        '복수극': '복수를 주제로 한 긴장감 넘치는 스토리로 작성하세요. 치밀한 계획, 카타르시스, 정의의 실현 등을 극적으로 표현하세요.',
        '로맨스': '로맨틱하고 감성적인 사랑 이야기로 작성하세요. 설렘, 애틋함, 감동적인 순간들을 세심하게 묘사하세요.',
        '스릴러': '긴장감과 서스펜스가 넘치는 스릴러 스타일로 작성하세요. 예측 불가능한 전개와 반전, 긴박한 상황을 효과적으로 연출하세요.',
        '코미디': '유머러스하고 재미있는 코미디 스타일로 작성하세요. 웃음 포인트를 적절히 배치하고, 밝고 경쾌한 분위기를 유지하세요.'
      };

      const categoryInstruction = categoryStyles[category];
      if (categoryInstruction) {
        prompt = `${prompt}\n\n[카테고리: ${category}]\n${categoryInstruction}`;
        console.log(`🎭 카테고리 스타일 적용: ${category}`);
      }
    }

    // JSON 스키마에서 category와 scriptId를 직접 치환 (지시문 대신 값 삽입)
    prompt = prompt.replace('"category": "일반"', `"category": "${finalCategory}"`);
    prompt = prompt.replace('"scriptId": "자동생성됨"', `"scriptId": "${taskId}"`);
    console.log(`🎯 JSON 스키마 업데이트: category="${finalCategory}", scriptId="${taskId}"`);

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    // 프롬프트 내용 확인 로그
    console.log('\n' + '='.repeat(80));
    console.log('📝 생성된 프롬프트 내용:');
    console.log('  타입:',
      scriptType === 'shortform' ? '⚡ 숏폼' :
      scriptType === 'sora2' ? '🎥 SORA2' :
      scriptType === 'product' ? '🛍️ 상품' :
      '📝 롱폼');
    console.log('  제목:', title);
    console.log('  프롬프트 길이:', prompt.length, '자');
    console.log('  프롬프트 미리보기:', prompt.substring(0, 200) + '...');
    console.log('  제목 포함 여부:', prompt.includes(title) ? '✅ 포함됨' : '❌ 미포함');
    console.log('='.repeat(80) + '\n');

    // userId를 클로저에 저장
    const currentUserId = user.userId;

    // 작업 시작 시간 기록 (응답 파일 필터링용)
    const taskStartTime = Date.now();

    // ⭐ 내부 요청(unified-worker)일 때는 동기 방식, 일반 요청일 때는 비동기 방식
    const executeScriptGeneration = async () => {
      let stdout = '';
      let stderr = '';
      let promptFileName = '';
      let promptFilePath = '';
      try {
        await addLog(taskId, '작업 시작됨');

        // content 테이블 업데이트 - processing 상태로 변경 (type='script')
        const { updateContentStatus } = await import('@/lib/content');

        const modelNames: Record<string, string> = {
          'chatgpt': 'ChatGPT',
          'gemini': 'Gemini',
          'claude': 'Claude'
        };
        const modelDisplayName = modelNames[agentName] || agentName;

        const message = scriptType === 'shortform'
          ? `⚡ ${modelDisplayName}가 숏폼 대본을 생성하고 있습니다...`
          : scriptType === 'sora2'
          ? `🎥 ${modelDisplayName}가 SORA2 프롬프트를 생성하고 있습니다...`
          : scriptType === 'product'
          ? `🛍️ ${modelDisplayName}가 상품 소개 대본을 생성하고 있습니다...`
          : `📝 ${modelDisplayName}가 롱폼 대본을 생성하고 있습니다...`;

        await addLog(taskId, message);
        updateContentStatus(taskId, 'processing');

        // 프롬프트를 임시 파일로 저장 (명령줄 길이 제한 및 특수문자 문제 회피)
        promptFileName = `prompt_${Date.now()}.txt`;
        promptFilePath = path.join(backendPath, promptFileName);

        const fsSync = require('fs');
        fsSync.writeFileSync(promptFilePath, prompt, 'utf-8');
        addLog(taskId, `프롬프트 파일 생성: ${promptFileName}`);
        const typeEmoji = scriptType === 'shortform' ? '⚡' :
                          scriptType === 'sora2' ? '🎥' :
                          scriptType === 'product' ? '🛍️' : '📝';
        const typeName = scriptType === 'shortform' ? '숏폼' :
                         scriptType === 'sora2' ? 'SORA2' :
                         scriptType === 'product' ? '상품' : '롱폼';
        addLog(taskId, `${typeEmoji} 타입: ${typeName}`);
        addLog(taskId, `📝 제목: "${title}"`);
        addLog(taskId, `📄 프롬프트 길이: ${prompt.length}자`);
        addLog(taskId, `✅ 프롬프트에 제목 포함: ${prompt.includes(title) ? 'Yes' : 'No'}`);

        // 실행할 명령어 구성 (backend의 ai_aggregator 모듈 사용)
        // headless 제거: 로그인 필요 시 브라우저가 표시되어야 함
        const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', promptFileName, '-a', agentName, '--auto-close'];
        const commandStr = `python ${pythonArgs.join(' ')}`;

        addLog(taskId, '📌 Python 스크립트 실행 시작');
        addLog(taskId, `🤖 사용 모델: ${modelDisplayName}`);
        addLog(taskId, `💻 실행 명령어: ${commandStr}`);
        addLog(taskId, `📂 작업 디렉토리: ${backendPath}`);
        addLog(taskId, `🌐 브라우저 자동화로 ${modelDisplayName} 웹사이트 접속 중...`);
        addLog(taskId, '👁️ 브라우저가 표시됩니다 (로그인 필요 시 수동 로그인 가능)');
        addLog(taskId, '💡 이미 로그인되어 있으면 자동으로 진행됩니다');
        addLog(taskId, '⏱️ 1-2분 소요 예상');

        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${taskId}] 실행 명령어:`);
        console.log(`  모델: ${modelDisplayName} (agent: ${agentName})`);
        console.log(`  작업 디렉토리: ${backendPath}`);
        console.log(`  명령어: ${commandStr}`);
        console.log(`  🏷️  Agent 파라미터: ${agentName}`);
        console.log(`${'='.repeat(80)}\n`);

        // -f 옵션으로 파일 경로 전달
        // Headless 모드로 실행 (백그라운드, 브라우저 숨김)

        // 🔍 실행 전 환경 검증
        console.log(`\n${'='.repeat(80)}`);
        console.log('🔍 [PYTHON SPAWN] 실행 전 환경 검증');
        console.log(`  - backendPath: ${backendPath}`);
        console.log(`  - backendPath exists: ${require('fs').existsSync(backendPath)}`);
        console.log(`  - promptFilePath: ${promptFilePath}`);
        console.log(`  - promptFilePath exists: ${require('fs').existsSync(promptFilePath)}`);
        console.log(`  - pythonArgs:`, pythonArgs);
        console.log(`  - process.env.PATH:`, process.env.PATH?.substring(0, 200));
        console.log(`${'='.repeat(80)}\n`);

        let pythonProcess;
        try {
          pythonProcess = spawn('python', pythonArgs, {
            cwd: backendPath,
            env: {
              ...process.env,
              PYTHONIOENCODING: 'utf-8',
              PYTHONUTF8: '1',  // Python 3.7+ UTF-8 모드 강제
              PYTHONUNBUFFERED: '1',  // Python 출력 버퍼링 비활성화 (실시간 로그)
              JOB_ID: taskId  // DB 로깅용 JOB_ID 전달
            }
          });
        } catch (spawnError: any) {
          console.error('❌ [PYTHON SPAWN] spawn() 호출 실패:', spawnError);
          console.error('  - Error code:', spawnError.code);
          console.error('  - Error message:', spawnError.message);
          console.error('  - Error stack:', spawnError.stack);
          await addLog(taskId, `❌ Python 프로세스 시작 실패: ${spawnError.message}`);
          throw new Error(`Python 프로세스 시작 실패: ${spawnError.message}`);
        }

        // 프로세스 저장
        runningProcesses.set(taskId, pythonProcess);

        if (pythonProcess.pid) {
          addLog(taskId, `🔢 프로세스 PID: ${pythonProcess.pid}`);
          console.log(`✅ 프로세스 시작됨: PID ${pythonProcess.pid} for task ${taskId}`);
        }

        // stdout 버퍼 (부분적인 줄 처리용)
        let stdoutBuffer = '';

        pythonProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          stdoutBuffer += output;

          // 줄바꿈으로 완성된 줄들만 처리
          const lines = stdoutBuffer.split('\n');
          // 마지막 요소는 불완전할 수 있으므로 버퍼에 보관
          stdoutBuffer = lines.pop() || '';

          // 완성된 줄들만 로그에 추가
          lines.forEach((line: string) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              console.log('[Python]', trimmedLine);
              addLog(taskId, trimmedLine);
            }
          });
        });

        // stderr 버퍼
        let stderrBuffer = '';

        pythonProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          stderr += error;
          stderrBuffer += error;

          // 줄바꿈으로 완성된 줄들만 처리
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() || '';

          lines.forEach((line: string) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              console.error('[Python stderr]', trimmedLine);
              addLog(taskId, `⚠️ ${trimmedLine}`);
            }
          });
        });

        // 프로세스 완료 대기
        await new Promise<void>((resolve, reject) => {
          pythonProcess.on('close', (code, signal) => {
            runningProcesses.delete(taskId);

            // 버퍼에 남은 내용 처리 (마지막 줄이 줄바꿈 없이 끝난 경우)
            if (stdoutBuffer.trim()) {
              console.log('[Python] (final)', stdoutBuffer.trim());
              addLog(taskId, stdoutBuffer.trim());
            }
            if (stderrBuffer.trim()) {
              console.error('[Python stderr] (final)', stderrBuffer.trim());
              addLog(taskId, `⚠️ ${stderrBuffer.trim()}`);
            }

            console.log(`\n${'='.repeat(80)}`);
            console.log('🏁 [PYTHON PROCESS] 프로세스 종료');
            console.log(`  - Exit code: ${code}`);
            console.log(`  - Signal: ${signal || 'N/A'}`);
            if (code !== 0 && code !== null) {
              console.log(`  - Exit code (hex): 0x${(code >>> 0).toString(16).toUpperCase()}`);
              if (code === 3221225794 || code === -1073741502) {
                console.error('  ❌ ACCESS_DENIED (0xC0000022) - Windows 보안 제한');
                console.error('  가능한 원인:');
                console.error('    1. 백신/Windows Defender가 Python 실행 차단');
                console.error('    2. Chrome 프로필 접근 권한 없음');
                console.error('    3. 관리자 권한 필요');
                addLog(taskId, '❌ Windows 보안 제한으로 Python 실행 실패');
                addLog(taskId, '백신 소프트웨어 또는 Windows Defender 확인 필요');
              }
            }
            console.log(`${'='.repeat(80)}\n`);

            if (code === 0 || code === null) {
              resolve();
            } else {
              reject(new Error(`Python script exited with code ${code}\n`));
            }
          });

          pythonProcess.on('error', (error: any) => {
            runningProcesses.delete(taskId);
            console.error('❌ [PYTHON PROCESS] error 이벤트 발생:', error);
            console.error('  - Error type:', error.constructor.name);
            console.error('  - Error code:', error.code);
            console.error('  - Error message:', error.message);
            console.error('  - Error syscall:', error.syscall);
            console.error('  - Error errno:', error.errno);

            // 상세 에러 정보를 로그에 기록
            addLog(taskId, `❌ Python 프로세스 에러: ${error.message}`);
            addLog(taskId, `  - Error code: ${error.code}`);
            addLog(taskId, `  - Error type: ${error.constructor.name}`);
            if (error.code === 'ENOENT') {
              addLog(taskId, '  ⚠️ python 명령어를 찾을 수 없습니다. PATH 환경변수를 확인하세요.');
            } else if (error.code === 'EACCES') {
              addLog(taskId, '  ⚠️ python 실행 권한이 없습니다.');
            }

            reject(error);
          });
        });

        console.log('Python output:', stdout);
        if (stderr) console.error('Python stderr:', stderr);

        addLog(taskId, '✅ Python 스크립트 실행 완료!');

        // 프롬프트 파일 삭제
        try {
          fsSync.unlinkSync(promptFilePath);
          addLog(taskId, '🗑️ 프롬프트 파일 정리 완료');
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }

        addLog(taskId, '📂 Claude 응답 파일 검색 중...');

        // 최신 ai_responses 파일 찾기 (trend-video-backend/ai_response에서)
        const fs = require('fs');
        const scriptsPath = path.join(backendPath, 'ai_response');

        addLog(taskId, `📁 검색 경로: ${scriptsPath}`);
        console.log('📁 대본 파일 검색 경로:', scriptsPath);

        // ai_response 디렉토리가 없으면 생성
        if (!fs.existsSync(scriptsPath)) {
          fs.mkdirSync(scriptsPath, { recursive: true });
          addLog(taskId, '📁 ai_response 디렉토리 생성됨');
        }

        const aiResponseFiles = fs.readdirSync(scriptsPath)
          .filter((f: string) => f.startsWith('ai_responses_') && f.endsWith('.txt'))
          .map((f: string) => ({
            name: f,
            path: path.join(scriptsPath, f),
            time: fs.statSync(path.join(scriptsPath, f)).mtime.getTime()
          }))
          // 작업 시작 시간 이후에 생성된 파일만 선택 (오래된 파일 제외)
          .filter((f: any) => f.time >= taskStartTime)
          .sort((a: any, b: any) => b.time - a.time);

        console.log(`📦 발견된 대본 파일 수: ${aiResponseFiles.length} (작업 시작 후 생성된 파일만)`);

        let scriptContent = '';
        if (aiResponseFiles.length > 0) {
          addLog(taskId, `✓ 응답 파일 발견: ${aiResponseFiles[0].name}`);
          // 가장 최신 파일 읽기
          const fullContent = fs.readFileSync(aiResponseFiles[0].path, 'utf-8');

          // Claude의 응답만 추출
          const claudeMatch = fullContent.match(/--- Claude ---\s+([\s\S]*?)(?=\n-{80}|\n--- |$)/);
          if (claudeMatch && claudeMatch[1]) {
            scriptContent = claudeMatch[1].trim();
            addLog(taskId, `✓ Claude 응답 추출 완료 (${scriptContent.length} 글자)`);
          } else {
            // Claude 섹션을 찾지 못한 경우 전체 내용 사용
            scriptContent = fullContent;
            addLog(taskId, `✓ 대본 내용 읽기 완료 (${scriptContent.length} 글자)`);
          }

          // "JSON" 텍스트 제거 (AI가 응답 앞에 "JSON"을 붙이는 경우가 있음)
          if (scriptContent.trim().startsWith('JSON')) {
            scriptContent = scriptContent.trim().substring(4).trim();
            addLog(taskId, '🔧 "JSON" 텍스트 제거됨');
          }

          // { 이전의 불필요한 텍스트 제거
          const jsonStart = scriptContent.indexOf('{');
          if (jsonStart > 0) {
            scriptContent = scriptContent.substring(jsonStart);
            addLog(taskId, '🔧 JSON 시작 부분 정리됨');
          }
        } else {
          const errorMsg = `응답 파일을 찾을 수 없음 (작업 시작: ${new Date(taskStartTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`;
          addLog(taskId, `⚠️ 경고: ${errorMsg}`);
          console.error(`❌ ${errorMsg}`);
          console.error('  - scripts 경로:', scriptsPath);
          console.error('  - 전체 파일:', fs.readdirSync(scriptsPath).filter((f: string) => f.startsWith('ai_responses_')));
          // ⭐ 응답 파일이 없으면 에러 발생 (0바이트 story.json 방지)
          throw new Error('Claude 응답 파일을 찾을 수 없습니다. 브라우저 자동화가 정상적으로 완료되지 않았을 수 있습니다.');
        }

        // SORA2 형식인 경우 JSON 정리
        if (scriptType === 'sora2' && scriptContent) {
          addLog(taskId, '🔧 SORA2 JSON 정리 중...');
          console.log('🔧 SORA2 JSON 정리 시작 - 원본 길이:', scriptContent.length);

          // 1. 코드펜스 제거 (```json 또는 ```)
          let cleanedContent = scriptContent.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

          // 2. 첫 번째 { 찾기 및 마지막 } 찾기
          const jsonStart = cleanedContent.indexOf('{');
          const jsonEnd = cleanedContent.lastIndexOf('}');

          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            // { 이전과 } 이후의 텍스트 제거
            cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
            addLog(taskId, `✅ JSON 추출 완료 (${cleanedContent.length}자)`);
            console.log('✅ JSON 추출 완료:', cleanedContent.substring(0, 200) + '...');

            // 2.5. 한글 따옴표 제거 (JSON 파싱 오류 방지)
            const beforeLength = cleanedContent.length;
            cleanedContent = cleanedContent
              .replace(/"/g, '')  // 한글 여는 따옴표 제거
              .replace(/"/g, ''); // 한글 닫는 따옴표 제거

            const removedCount = beforeLength - cleanedContent.length;
            if (removedCount > 0) {
              addLog(taskId, `🔧 한글 따옴표 ${removedCount}개 제거`);
              console.log(`🔧 한글 따옴표 ${removedCount}개 제거`);
            }

            // 3. JSON 유효성 검증 및 포맷팅
            try {
              const parsed = JSON.parse(cleanedContent);
              addLog(taskId, '✅ JSON 파싱 성공');
              console.log('✅ JSON 파싱 성공 - 객체 키:', Object.keys(parsed).join(', '));

              // 4. JSON 포맷팅 (예쁘게 정리)
              scriptContent = JSON.stringify(parsed, null, 2);
              addLog(taskId, '✨ JSON 포맷팅 완료');
              console.log('✨ JSON 포맷팅 완료 - 최종 길이:', scriptContent.length);
            } catch (jsonError: any) {
              addLog(taskId, `⚠️ JSON 파싱 실패: ${jsonError.message}`);
              console.error('❌ JSON 파싱 실패:', jsonError);
              console.log('파싱 시도한 내용 (처음 500자):', cleanedContent.substring(0, 500));
              // 파싱 실패해도 정리된 내용 사용
              scriptContent = cleanedContent;
            }
          } else {
            addLog(taskId, '⚠️ JSON 구조를 찾을 수 없음 (원본 사용)');
            console.warn('⚠️ JSON 구조를 찾을 수 없음');
          }
        }

        // productInfo가 있으면 AI 응답에서 플레이스홀더 치환
        console.log(`🔍 [PLACEHOLDER-CHECK] scriptType: ${scriptType}, productInfo: ${productInfo ? 'YES' : 'NO'}`);
        if (scriptType === 'product') {
          // product 타입이면 무조건 플레이스홀더 치환 시도
          // productInfo가 없으면 빈 문자열로 치환
          const safeProductInfo = productInfo || { thumbnail: '', product_link: '', description: '' };

          console.log('🛍️🛍️🛍️ AI 응답 플레이스홀더 치환 시작:', safeProductInfo);
          console.log('  - 치환 대상 타입:', scriptType);
          console.log('  - productInfo 전달됨:', !!productInfo);
          addLog(taskId, '🛍️ 상품 정보 플레이스홀더 치환 중...');

          // JSON인 경우 파싱 후 치환 (구조 유지)
          try {
            const parsedContent = JSON.parse(scriptContent);
            const jsonString = JSON.stringify(parsedContent);

            // 플레이스홀더 확인
            const hasThumbnail = jsonString.includes('{thumbnail}');
            const hasProductLink = jsonString.includes('{product_link}');
            const hasProductDescription = jsonString.includes('{product_description}');

            console.log('🔍 플레이스홀더 확인:', { hasThumbnail, hasProductLink, hasProductDescription });

            if (hasThumbnail || hasProductLink || hasProductDescription) {
              console.log('⚠️ AI 응답에 플레이스홀더 발견! 치환 시작...');
              console.log('  - {thumbnail} 치환:', safeProductInfo.thumbnail);
              console.log('  - {product_link} 치환:', safeProductInfo.product_link);
              console.log('  - {product_description} 치환:', safeProductInfo.description);

              // JSON 문자열에서 플레이스홀더 치환
              let replacedJson = jsonString
                .replace(/{thumbnail}/g, safeProductInfo.thumbnail || '')
                .replace(/{product_link}/g, safeProductInfo.product_link || '')
                .replace(/{product_description}/g, safeProductInfo.description || '');

              // 다시 JSON으로 파싱하고 포맷팅
              scriptContent = JSON.stringify(JSON.parse(replacedJson), null, 2);
              console.log('✅ AI 응답 플레이스홀더 치환 완료 (JSON)');
              console.log('  - 치환 후 내용 샘플:', scriptContent.substring(0, 300));
            } else {
              console.log('✅ AI 응답에 플레이스홀더 없음 (정상)');
            }
          } catch (e) {
            // JSON이 아니면 문자열 치환
            console.log('⚠️ JSON 파싱 실패, 문자열 치환 시도');
            scriptContent = scriptContent
              .replace(/{thumbnail}/g, safeProductInfo.thumbnail || '')
              .replace(/{product_link}/g, safeProductInfo.product_link || '')
              .replace(/{product_description}/g, safeProductInfo.description || '');
            console.log('✅ AI 응답 플레이스홀더 치환 완료 (문자열)');
          }

          addLog(taskId, '✅ 상품 정보 플레이스홀더 치환 완료');
        } else {
          console.log(`⚠️ [PLACEHOLDER-SKIP] 상품 타입이 아니므로 치환 스킵 (type: ${scriptType})`);
        }

        // ⭐ 대본 내용 검증 - 비어있으면 에러 발생 (0바이트 story.json 방지)
        if (!scriptContent || scriptContent.trim().length < 100) {
          const errorMsg = `대본 내용이 비어있거나 너무 짧습니다 (${scriptContent?.length || 0}자)`;
          addLog(taskId, `❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }

        addLog(taskId, '💾 contents 테이블에 저장 중...');

        // content 테이블에 대본 내용 업데이트 (type='script')
        const { updateContent } = await import('@/lib/content');

        // tasks/{taskId}/story.json 파일 생성
        const taskFolderPath = path.join(backendPath, 'tasks', taskId);
        const storyPath = path.join(taskFolderPath, 'story.json');

        try {
          // tasks 폴더 생성
          if (!fsSync.existsSync(taskFolderPath)) {
            fsSync.mkdirSync(taskFolderPath, { recursive: true });
            await addLog(taskId, `📁 tasks/${taskId} 폴더 생성됨`);
          }

          // story.json 저장 (JSON 포맷팅)
          let formattedContent = scriptContent;
          try {
            // JSON 파싱 후 예쁘게 포맷팅
            const parsed = JSON.parse(scriptContent);
            formattedContent = JSON.stringify(parsed, null, 2);
            await addLog(taskId, '✨ JSON 포맷팅 완료');
          } catch (formatError) {
            // JSON 파싱 실패 시 원본 그대로 저장
            console.warn('⚠️ JSON 포맷팅 실패, 원본 저장:', formatError);
          }
          fsSync.writeFileSync(storyPath, formattedContent, 'utf-8');
          await addLog(taskId, `📄 story.json 저장 완료`);
          console.log(`✅ story.json 저장: ${storyPath}`);

          // DB에 대본 내용 업데이트
          // ⭐ formattedContent 사용 (story.json과 동일한 포맷팅)
          const updatedContent = await updateContent(taskId, {
            content: formattedContent,
            status: 'completed',
            progress: 100
          });

          if (updatedContent) {
            await addLog(taskId, `✓ 대본 저장 완료! (${formattedContent.length} 글자)`);
            await addLog(taskId, `📁 폴더: tasks/${taskId}/story.json`);

            // ✅ task_queue 상태는 unified-worker가 관리함
            console.log(`✅ [Script] 대본 생성 완료: ${taskId}`);
          }
        } catch (saveError: any) {
          console.error('❌ 대본 저장 실패:', saveError);
          await addLog(taskId, `❌ 대본 저장 실패: ${saveError.message}`);
        }

        // 성공 시 프롬프트 파일 정리
        try {
          if (promptFilePath && fsSync.existsSync(promptFilePath)) {
            fsSync.unlinkSync(promptFilePath);
            console.log('프롬프트 파일 정리 완료');
          }
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }
      } catch (error: any) {
        console.error('❌ 스크립트 생성 중 오류:', error);
        const errorMsg = error.message || error.toString() || '';
        await addLog(taskId, `❌ 오류 발생: ${errorMsg}`);

        // 에러 발생 시 이메일 전송
        try {
          await sendErrorEmail({
            taskId,
            title,
            errorMessage: errorMsg,
            stdout: stdout || '(출력 없음)',
            stderr: stderr || '(출력 없음)',
            timestamp: new Date().toISOString(),
          });
          console.log('✅ 에러 알림 이메일 전송 완료');
        } catch (emailError) {
          console.error('❌ 에러 이메일 전송 실패:', emailError);
        }

        // 에러 발생 시에도 프롬프트 파일 정리
        try {
          const fs = require('fs');
          if (promptFilePath && fs.existsSync(promptFilePath)) {
            fs.unlinkSync(promptFilePath);
            console.log('프롬프트 파일 정리 완료 (에러 후)');
          }
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }

        // content 테이블 상태 업데이트 - failed
        const { updateContent: updateContentError } = await import('@/lib/content');
        updateContentError(taskId, {
          status: 'failed',
          error: `오류: ${error.message}`
        });

        // ⭐ task_queue 상태도 업데이트 (script 단계 실패)
        updateQueueStatus(taskId, 'script', 'failed', { errorMessage: error.message });
        console.log(`❌ [Queue] script 단계 실패: ${taskId}`);
        throw error; // 내부 요청 시 에러를 상위로 전달
      }
    };

    // ⭐ 내부 요청(unified-worker)이면 동기 실행, 일반 요청이면 비동기 실행
    if (isInternalRequest) {
      console.log('🔄 [INTERNAL] 내부 요청 감지 - 동기 방식으로 실행 (완료까지 대기)');
      try {
        await executeScriptGeneration();
        return NextResponse.json({
          success: true,
          taskId,
          message: '대본 생성이 완료되었습니다'
        });
      } catch (error: any) {
        console.error('❌ [INTERNAL] 동기 실행 실패:', error);
        return NextResponse.json(
          { error: error.message || 'Script generation failed' },
          { status: 500 }
        );
      }
    } else {
      console.log('⏱️ [USER] 일반 요청 - 비동기 방식으로 실행 (즉시 응답)');
      // 일반 사용자 요청: 비동기로 실행하고 즉시 응답
      setTimeout(() => {
        executeScriptGeneration().catch((error) => {
          console.error('❌ [USER] 비동기 실행 실패:', error);
        });
      }, 100);

      return NextResponse.json({
        success: true,
        taskId,
        message: '대본 생성이 시작되었습니다'
      });
    }
  } catch (error: any) {
    console.error('Error creating script task:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create script task' },
      { status: 500 }
    );
  }
}
