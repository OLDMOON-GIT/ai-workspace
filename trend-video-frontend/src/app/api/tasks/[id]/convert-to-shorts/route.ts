import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getOne, run } from '@/lib/mysql';
import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { addContentLog } from '@/lib/content';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';


export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 내부 요청 확인
    const isInternalRequest = request.headers.get('X-Internal-Request');
    const internalUserId = request.headers.get('X-User-Id');

    // 사용자 인증
    let user;
    if (isInternalRequest && internalUserId) {
      // 내부 요청이면 전달받은 userId 사용
      user = { userId: internalUserId };
      console.log('🔧 Internal request - using provided userId:', internalUserId);
    } else {
      // 일반 요청이면 세션에서 사용자 확인
      user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        );
      }
    }

    const params = await context.params;
    const { id: taskId } = params;

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 원본 작업 조회 (content 테이블 - jobs 통합됨)
    // MySQL: using imported db
    console.log('🔍 작업 조회:', { taskId, userId: user.userId });

    // content 테이블에서 조회 (jobs → content 통합)
    let originalJob: any = await getOne('SELECT *, content_id as contentId FROM content WHERE content_id = ? AND user_id = ?', [taskId, user.userId]);

    if (!originalJob) {
      console.log('❌ 작업을 찾을 수 없음:', taskId);
      // MySQL: pool manages connections
      return NextResponse.json(
        { error: '원본 작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('✅ content 테이블에서 찾음:', originalJob.id);

    // ⭐ video_path 컬럼 없음 - tasks 폴더에서 직접 탐색
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolder = path.join(backendPath, 'tasks', taskId);

    let videoPath: string | null = null;
    try {
      const fsSync = await import('fs');
      if (fsSync.existsSync(taskFolder)) {
        const files = fsSync.readdirSync(taskFolder);
        const videoFile = files.find((f: string) =>
          f.endsWith('.mp4') &&
          !f.startsWith('scene_') &&
          !f.includes('_audio')
        );
        if (videoFile) {
          videoPath = path.join(taskFolder, videoFile);
        }
      }
    } catch (e) {
      console.log('⚠️ tasks 폴더 탐색 실패:', e);
    }

    // ⭐ video_path는 오직 폴더 탐색으로만 결정 (DB 컬럼 무시)
    originalJob.video_path = videoPath;

    console.log('📁 비디오 경로 확인:', originalJob.video_path);

    if (!originalJob.video_path) {
      console.log('❌ 비디오 경로 없음. taskFolder:', taskFolder);
      // MySQL: pool manages connections
      return NextResponse.json(
        { error: '비디오 경로를 찾을 수 없습니다. 이 작업은 아직 완료되지 않았을 수 있습니다.' },
        { status: 400 }
      );
    }

    const normalizedPath = originalJob.video_path.replace(/\\/g, '/');

    // 대본 찾기
    let scriptContent = '';
    let folderPath = '';

    // output 폴더인지 확인
    const outputMatch = normalizedPath.match(/output\/([^/]+)/);
    if (outputMatch) {
      const folderName = outputMatch[1];
      folderPath = path.join(backendPath, 'output', folderName);

      // original_story.json 시도
      try {
        const originalJsonPath = path.join(folderPath, 'original_story.json');
        scriptContent = await fs.readFile(originalJsonPath, 'utf-8');
      } catch (error) {
        // config.json 시도
        try {
          const configPath = path.join(folderPath, 'config.json');
          const configContent = await fs.readFile(configPath, 'utf-8');
          const config = JSON.parse(configContent);

          let scriptData: any = {};
          if (config.narration_text) scriptData.narration = config.narration_text;
          if (config.scenes) scriptData.scenes = config.scenes;
          if (config.title) scriptData.title = config.title;

          scriptContent = JSON.stringify(scriptData, null, 2);
        } catch (configError) {
          // MySQL: pool manages connections
          return NextResponse.json(
            { error: '대본 파일을 찾을 수 없습니다.' },
            { status: 404 }
          );
        }
      }
    } else {
      // tasks 폴더 확인 (하위 호환: input도 체크)
      const tasksMatch = normalizedPath.match(/(tasks|input)\/([^/]+)/);
      if (tasksMatch) {
        const folderName = tasksMatch[2];
        folderPath = path.join(backendPath, 'tasks', folderName);

        try {
          const storyPath = path.join(folderPath, 'story.json');
          scriptContent = await fs.readFile(storyPath, 'utf-8');
        } catch (error) {
          // MySQL: pool manages connections
          return NextResponse.json(
            { error: '대본 파일을 찾을 수 없습니다.' },
            { status: 404 }
          );
        }
      } else {
        // 기타: tasks 폴더에서 확인 (하위 호환: uploads도 체크)
        const otherMatch = normalizedPath.match(/(uploads)\/([^/]+)/);
        if (otherMatch) {
          const folderName = otherMatch[2];
          // uploads는 tasks로 리다이렉트
          folderPath = path.join(backendPath, 'tasks', folderName);
          console.log('📂 tasks 폴더 확인 (uploads 경로에서):', folderPath);

          // story.json 시도
          try {
            const storyPath = path.join(folderPath, 'story.json');
            scriptContent = await fs.readFile(storyPath, 'utf-8');
            console.log('✅ story.json 찾음');

            // 내용 요약 출력
            try {
              const storyData = JSON.parse(scriptContent);
              console.log('📄 story.json 내용:');
              console.log(`   - 제목: ${storyData.title || '(제목 없음)'}`);
              console.log(`   - 타입: ${storyData.type || '(타입 없음)'}`);
              console.log(`   - 씬 개수: ${storyData.scenes?.length || 0}개`);
              if (storyData.metadata) {
                console.log(`   - 메타데이터:`, JSON.stringify(storyData.metadata, null, 2));
              }
              console.log('');
            } catch (parseErr) {
              console.log('   (JSON 파싱 실패, 원본 텍스트 사용)\n');
            }
          } catch (error) {
            // script.json 시도
            try {
              const scriptPath = path.join(folderPath, 'script.json');
              scriptContent = await fs.readFile(scriptPath, 'utf-8');
              console.log('✅ script.json 찾음');

              // 내용 요약 출력
              try {
                const scriptData = JSON.parse(scriptContent);
                console.log('📄 script.json 내용:');
                console.log(`   - 제목: ${scriptData.title || '(제목 없음)'}`);
                console.log(`   - 타입: ${scriptData.type || '(타입 없음)'}`);
                console.log(`   - 씬 개수: ${scriptData.scenes?.length || 0}개\n`);
              } catch (parseErr) {
                console.log('   (JSON 파싱 실패, 원본 텍스트 사용)\n');
              }
            } catch (scriptError) {
              console.log('❌ 대본 파일 없음:', { storyError: error, scriptError });
              // MySQL: pool manages connections
              return NextResponse.json(
                { error: '대본 파일을 찾을 수 없습니다. (story.json 또는 script.json)' },
                { status: 404 }
              );
            }
          }
        } else {
          console.log('❌ 지원하지 않는 폴더:', normalizedPath);
          // MySQL: pool manages connections
          return NextResponse.json(
            { error: '지원하지 않는 폴더 구조입니다.' },
            { status: 400 }
          );
        }
      }
    }

    console.log('\n🎬 ========== 쇼츠 변환 시작 ==========');
    console.log('📋 원본 대본 내용:\n');

    // 원본 대본 출력 (처음 1000자)
    try {
      const originalData = JSON.parse(scriptContent);
      console.log(`   제목: ${originalData.title || '(없음)'}`);
      console.log(`   씬 개수: ${originalData.scenes?.length || 0}개`);
      if (originalData.scenes && originalData.scenes.length > 0) {
        console.log('\n   첫 번째 씬:');
        console.log(`   ${originalData.scenes[0].narration?.substring(0, 200) || '내용 없음'}...`);
      }
    } catch (e) {
      console.log(`   (대본 미리보기 실패)\n`);
    }

    console.log('\n🤖 Claude AI 호출 중...\n');

    // API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('🔑 ANTHROPIC_API_KEY 존재:', !!apiKey, '길이:', apiKey?.length || 0);

    if (!apiKey) {
      // 환경변수 목록 출력 (디버깅용)
      const envKeys = Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('API'));
      console.log('⚠️ 관련 환경변수:', envKeys);

      // MySQL: pool manages connections
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const prompt = `당신은 영상 대본을 1분 40초 쇼츠로 요약하는 전문가입니다.

주어진 영상 대본의 **씬 개수는 그대로 유지**하되, 각 씬의 나레이션을 짧게 요약하여 총 100초(1분 40초)로 맞춰주세요.

**핵심 원칙:**
- 씬 개수: 원본과 동일하게 유지
- 씬 순서: 원본과 동일하게 유지
- 나레이션: 핵심만 남기고 짧게 요약
- 이미지: 원본 이미지 재사용 (image_prompt 생성 안 함)

**엔딩 멘트 (마지막 씬에 추가):**
마지막 씬의 나레이션 끝에 다음 내용을 자연스럽게 추가해주세요:
- "롱폼영상은 댓글에 있습니다"
- "구독과 좋아요 부탁드립니다"

이 엔딩 멘트를 포함한 총 글자가 100초(1500자)를 넘지 않도록 조절해주세요.

**시간 계산 (TTS 기준 1초당 15자):**
- 총 길이: 정확히 100초 (1분 40초)
- 총 글자 수: 1500자 (100초 × 15자) - 엔딩 멘트 포함
- 각 씬 길이: 1500자를 씬 개수로 균등 분배 (마지막 씬은 엔딩 멘트 포함)

**예시:**
- 원본 10개 씬 → 쇼츠 10개 씬, 각 150자 (10초)
- 원본 5개 씬 → 쇼츠 5개 씬, 각 300자 (20초)
- 원본 4개 씬 → 쇼츠 4개 씬, 각 375자 (25초)

**나레이션 요약 규칙:**
1. 핵심 내용만 남기고 불필요한 설명 제거
2. 감정과 임팩트는 유지
3. 구어체, 짧은 문장 사용
4. 각 씬의 글자 수를 균등하게 맞춤
5. 마지막 씬에 엔딩 멘트 자연스럽게 포함

**출력 형식:**
- 순수 JSON만 출력 (코드펜스 없음)
- 첫 글자: {, 마지막 글자: }
- scenes 배열에 원본과 동일한 개수의 씬
- 각 씬에 sceneNumber, narration만 포함 (**imagePrompt는 생략**)
- metadata에 type: "shortform" 설정

**중요: imagePrompt는 절대 생성하지 마세요!**
원본 이미지를 재사용하므로 imagePrompt 필드는 포함하지 않습니다.

원본 대본:
${scriptContent}

1분 쇼츠로 요약된 JSON을 출력하세요 (image_prompt 없이):`;

    let message;
    try {
      message = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
    } catch (claudeError: any) {
      console.error('❌ Claude API 호출 실패:', claudeError.message);
      console.error('❌ Claude 에러 상세:', claudeError);
      return NextResponse.json(
        { error: `Claude AI 호출 중 오류가 발생했습니다: ${claudeError.message}` },
        { status: 500 }
      );
    }

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    console.log('📝 Claude 응답 길이:', responseText.length);

    // JSON 파싱
    let cleaned = responseText
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const jsonStart = cleaned.indexOf('{');
    if (jsonStart > 0) {
      cleaned = cleaned.substring(jsonStart);
    }

    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) {
      cleaned = cleaned.substring(0, jsonEnd + 1);
    }

    let shortsScript;
    try {
      shortsScript = JSON.parse(cleaned);
    } catch (parseError: any) {
      console.error('❌ Claude 응답 JSON 파싱 실패:', parseError.message);
      console.error('❌ 원본 응답 (처음 500자):', responseText.substring(0, 500));
      console.error('❌ 정리된 JSON (처음 500자):', cleaned.substring(0, 500));
      return NextResponse.json(
        { error: `Claude AI 응답을 파싱할 수 없습니다: ${parseError.message}` },
        { status: 500 }
      );
    }

    // scenes 배열이 없거나 비어있으면 에러
    if (!shortsScript.scenes || !Array.isArray(shortsScript.scenes) || shortsScript.scenes.length === 0) {
      console.error('❌ Claude 응답에 유효한 scenes 배열이 없습니다:', JSON.stringify(shortsScript, null, 2).substring(0, 500));
      return NextResponse.json(
        { error: 'Claude AI 응답에 유효한 씬 정보가 없습니다.' },
        { status: 500 }
      );
    }

    // 생성된 쇼츠 대본 출력
    console.log('\n✅ Claude AI 응답 완료!\n');
    console.log('📋 생성된 쇼츠 대본:\n');
    console.log(`   씬 개수: ${shortsScript.scenes?.length || 0}개`);
    if (shortsScript.scenes && shortsScript.scenes.length > 0) {
      shortsScript.scenes.forEach((scene: any, idx: number) => {
        console.log(`\n   씬 ${idx + 1}: ${scene.narration?.substring(0, 100) || '내용 없음'}...`);
      });
    }
    console.log('\n');

    // 새 작업 ID 먼저 생성 (UUID 사용, prefix 제거)
    const newJobId = crypto.randomUUID();

    // 작업 타이틀 (원본 제목 그대로 사용, "(쇼츠)" 추가하지 않음)
    const originalTitle = originalJob.title?.replace(/\s*\(쇼츠\)\s*$/, '') || '제목 없음';
    const title = originalTitle;

    // title 추가 (최상위)
    shortsScript.title = title;

    // metadata 추가
    if (!shortsScript.metadata) {
      shortsScript.metadata = {};
    }
    shortsScript.metadata.type = 'shortform';
    shortsScript.metadata.converted_from = originalJob.id;
    shortsScript.metadata.converted_at = new Date().toISOString();
    shortsScript.metadata.job_id = newJobId;  // job_id 추가

    // 크레딧 확인 (1분 쇼츠 = 60초, Claude API 비용 포함)
    const creditCost = 200;
    const userCredits: any = await getOne('SELECT credits FROM user WHERE user_id = ?', [user.userId]);

    if (!userCredits || userCredits.credits < creditCost) {
      // MySQL: pool manages connections
      return NextResponse.json(
        { error: `크레딧이 부족합니다. 필요: ${creditCost}, 보유: ${userCredits?.credits || 0}` },
        { status: 400 }
      );
    }

    // 크레딧 차감
    await run('UPDATE user SET credits = credits - ? WHERE user_id = ?', [creditCost, user.userId]);

    // 새 작업 생성
    // MySQL datetime 형식: 'YYYY-MM-DD HH:MM:SS' (ISO 8601 형식 거부)
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // converted_from_job_id 컬럼은 MySQL 마이그레이션에서 이미 처리됨

    // 새 프로젝트 생성 (tasks 폴더에)
    // ⚠️ 폴더명 = content_id (DB와 일치해야 함)
    const newProjectName = newJobId;
    const newProjectPath = path.join(backendPath, 'tasks', newProjectName);
    console.log('📂 새 프로젝트 경로:', newProjectPath);

    // ⚠️ video_path 컬럼 없음 - 경로는 task_id에서 계산됨 (tasks/{content_id}/)
    // ⭐ progress 컬럼 제거됨 - status로 계산
    await run(`
      INSERT INTO content (content_id, user_id, title, prompt_format, status, source_content_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [newJobId, user.userId, title, 'shortform', 'processing', taskId, now, now]);

    // MySQL: pool manages connections

    await fs.mkdir(newProjectPath, { recursive: true });
    console.log('📁 프로젝트 폴더 생성:', newProjectPath);

    // 롱폼 이미지를 쇼츠 형태로 변환 (16:9 → 9:16)
    console.log('\n🎨 ========== 롱폼 → 쇼츠 이미지 변환 시작 ==========');
    console.log('📂 원본 폴더 경로:', folderPath);

    try {
      const convertScript = path.join(backendPath, 'src', 'video_generator', 'convert_images_to_shorts.py');
      console.log('🚀 이미지 변환 스크립트 실행:', convertScript);

      await new Promise<void>((resolve, reject) => {
        const convertProcess = spawn('python', [
          convertScript,
          '--folder', folderPath
        ], {
          cwd: backendPath,
          shell: true
        });

        convertProcess.stdout.on('data', (data: Buffer) => {
          console.log(`[이미지 변환] ${data.toString('utf-8')}`);
        });

        convertProcess.stderr.on('data', (data: Buffer) => {
          console.error(`[이미지 변환 ERROR] ${data.toString('utf-8')}`);
        });

        convertProcess.on('close', (code: number) => {
          if (code === 0) {
            console.log('✅ 이미지 변환 완료 (shorts_images 폴더에 저장됨)');
            resolve();
          } else {
            console.log(`⚠️ 이미지 변환 실패 (코드: ${code}), 기존 이미지 사용`);
            resolve(); // 실패해도 계속 진행
          }
        });

        convertProcess.on('error', (err: Error) => {
          console.error('❌ 이미지 변환 프로세스 실행 실패:', err);
          resolve(); // 실패해도 계속 진행
        });
      });
    } catch (err: any) {
      console.error('⚠️ 이미지 변환 중 오류 (무시하고 계속):', err.message);
    }

    console.log('🎨 ========== 롱폼 → 쇼츠 이미지 변환 종료 ==========\n');

    // 원본 폴더에서 9:16 비율의 이미지 찾아서 복사
    console.log('\n🖼️ ========== 9:16 이미지 복사 시작 ==========');
    console.log('📂 원본 폴더 경로:', folderPath);
    console.log('📂 새 프로젝트 경로:', newProjectPath);

    try {
      const sizeOf = (await import('image-size')).default;

      // 1. 메인 폴더에서 이미지 찾기
      let files: string[] = [];
      try {
        files = await fs.readdir(folderPath);
        console.log(`📁 메인 폴더 내 전체 파일 (${files.length}개):`, files.slice(0, 10));
      } catch (err: any) {
        console.error('❌ 메인 폴더 읽기 실패:', err.message);
        throw err;
      }

      // 2. shorts_images 서브폴더 확인 (롱폼→쇼츠 변환된 이미지)
      const shortsImagesFolder = path.join(folderPath, 'shorts_images');
      let hasShortsFolder = false;
      console.log(`🔍 shorts_images 폴더 확인 중: ${shortsImagesFolder}`);
      try {
        await fs.access(shortsImagesFolder);
        hasShortsFolder = true;
        console.log('✅ shorts_images 폴더 발견! (롱폼 이미지가 9:16으로 변환됨)');
        const shortsFiles = await fs.readdir(shortsImagesFolder);
        console.log(`📁 shorts_images 폴더 내 파일 (${shortsFiles.length}개):`, shortsFiles);

        // shorts_images 폴더의 파일만 사용 (이미 9:16이므로 비율 체크 필요 없음)
        console.log(`📋 변환된 이미지를 새 프로젝트로 복사합니다...`);

        let copiedCount = 0;
        for (const file of shortsFiles) {
          if (/\.(jpg|jpeg|png)$/i.test(file) && !file.includes('thumbnail')) {
            copiedCount++;
            const sourcePath = path.join(shortsImagesFolder, file);
            const targetFileName = `scene_${copiedCount.toString().padStart(2, '0')}_image${path.extname(file)}`;
            const targetPath = path.join(newProjectPath, targetFileName);

            await fs.copyFile(sourcePath, targetPath);
            console.log(`   📋 복사: ${file} → ${targetFileName}`);
          }
        }

        console.log(`\n✅ 변환된 이미지 복사 완료: ${copiedCount}개`);
        console.log('💡 원본 이미지를 재사용하므로 DALL-E 생성이 필요 없습니다.');

        // 이미지가 복사되었으므로 추가 처리 건너뛰기
        console.log('🖼️ ========== 9:16 이미지 복사 종료 ==========\n');

      } catch (err: any) {
        console.log(`ℹ️ shorts_images 폴더 없음 (${err.message}). 메인 폴더의 9:16 이미지를 사용합니다.`);
        hasShortsFolder = false;
      }

      // shorts_images가 없는 경우에만 메인 폴더에서 9:16 이미지 찾기
      if (!hasShortsFolder) {

      const imageFiles = files.filter(f => {
        const basename = path.basename(f);
        return /\.(jpg|jpeg|png)$/i.test(basename) && !basename.includes('thumbnail');
      });
      console.log(`🔍 원본 폴더에서 이미지 탐색 중... (총 ${imageFiles.length}개 이미지)`);
      console.log(`   이미지 파일 목록:`, imageFiles);

      // 9:16 이미지만 필터링
      const verticalImages: Array<{ file: string; path: string; dimensions: any; seq: number | null; mtime: number }> = [];
      const targetRatio = 9 / 16; // 세로 비율
      const tolerance = 0.05; // 5% 오차 허용

      for (const file of imageFiles) {
        try {
          const imagePath = path.join(folderPath, file);
          const basename = path.basename(file);

          console.log(`   📷 분석 중: ${basename}`);
          console.log(`      전체 경로: ${imagePath}`);

          // 파일을 Buffer로 읽어서 크기 확인 (ESM 호환성)
          let dimensions;
          try {
            const buffer = await fs.readFile(imagePath);
            console.log(`      ✅ 파일 읽기 성공 (${(buffer.length / 1024).toFixed(1)} KB)`);
            dimensions = sizeOf(buffer);
            console.log(`      🔍 sizeOf 결과:`, dimensions);
          } catch (sizeErr: any) {
            console.error(`      ❌ 이미지 처리 실패: ${basename} - ${sizeErr.message}`);
            console.error(`      스택:`, sizeErr.stack);
            continue;
          }

          if (dimensions && dimensions.width && dimensions.height) {
            const ratio = dimensions.width / dimensions.height;
            const isVertical = Math.abs(ratio - targetRatio) < tolerance;

            console.log(`      ${dimensions.width}x${dimensions.height} (비율: ${ratio.toFixed(3)}) - ${isVertical ? '✅ 9:16 OK' : '❌ SKIP'}`);

            if (isVertical) {
              // 시퀀스 번호 추출 (엄격한 패턴만 인식)
              const baseName = path.basename(file, path.extname(file));
              let seq: number | null = null;

              // 명확한 시퀀스 패턴만 인식:
              // - scene_01, image_01, img_1 형식
              // - 파일명 끝에 _01 또는 _1 형식
              // - 파일명 시작에 01_ 또는 1_ 형식
              // - 해시값 내부의 숫자는 무시
              const seqPatterns = [
                /(?:scene|image|img)_(\d{1,3})$/i,  // scene_01, image_1 등
                /_(\d{1,3})$/,                       // 끝에 _01, _1 등
                /^(\d{1,3})_/,                       // 시작에 01_, 1_ 등
              ];

              for (const pattern of seqPatterns) {
                const match = baseName.match(pattern);
                if (match) {
                  seq = parseInt(match[1]);
                  console.log(`      🔢 시퀀스 추출: ${match[0]} → ${seq}`);
                  break;
                }
              }

              if (seq === null) {
                console.log(`      ℹ️ 시퀀스 없음 (오래된 순으로 정렬됨)`);
              }

              // 파일 수정 시간
              const stat = await fs.stat(imagePath);
              const mtime = stat.mtimeMs;

              verticalImages.push({ file: basename, path: imagePath, dimensions, seq, mtime });
            }
          }
        } catch (err: any) {
          console.error(`   ⚠️ 이미지 처리 실패: ${file} - ${err.message}`);
          console.error(`      스택: ${err.stack}`);
        }
      }

      // 정렬: 시퀀스 번호 우선, 없으면 수정 시간 순
      verticalImages.sort((a, b) => {
        if (a.seq !== null && b.seq !== null) {
          return a.seq - b.seq; // 시퀀스 번호로 정렬
        } else if (a.seq !== null) {
          return -1; // a가 시퀀스 있으면 앞으로
        } else if (b.seq !== null) {
          return 1; // b가 시퀀스 있으면 뒤로
        } else {
          return a.mtime - b.mtime; // 둘 다 없으면 수정 시간 순
        }
      });

      console.log(`\n📋 9:16 이미지 정렬 완료 (${verticalImages.length}개):`);
      verticalImages.forEach((img, idx) => {
        console.log(`   ${idx + 1}. ${img.file} (seq: ${img.seq !== null ? img.seq : 'none'}, mtime: ${new Date(img.mtime).toLocaleString()})`);
      });

      // scene_XX_image 형식으로 복사
      let copiedCount = 0;
      for (const img of verticalImages) {
        copiedCount++;
        const targetFileName = `scene_${copiedCount.toString().padStart(2, '0')}_image${path.extname(img.file)}`;
        const targetPath = path.join(newProjectPath, targetFileName);

        await fs.copyFile(img.path, targetPath);
        console.log(`   📋 복사: ${img.file} → ${targetFileName}`);
      }

      console.log(`\n✅ 9:16 이미지 복사 완료: ${copiedCount}개`);

      if (copiedCount > 0) {
        console.log('💡 복사된 이미지는 재사용되고, 부족한 씬만 DALL-E로 생성됩니다.');
      } else {
        console.log('ℹ️ 9:16 이미지가 없어서 모든 씬을 DALL-E로 생성합니다.');
      }

      } // if (!hasShortsFolder) 닫기

    } catch (err: any) {
      console.error('\n❌ 이미지 복사 중 오류 발생 (무시하고 계속):');
      console.error('   에러 메시지:', err.message);
      console.error('   에러 스택:', err.stack);
      console.error('   → 원본 이미지를 사용합니다.');
    }

    console.log('🖼️ ========== 9:16 이미지 복사 종료 ==========\n');

    // story.json 저장
    const storyPath = path.join(newProjectPath, 'story.json');
    await fs.writeFile(storyPath, JSON.stringify(shortsScript, null, 2));
    console.log('📝 story.json 저장 완료:', storyPath);
    console.log('📄 story.json 내용:', JSON.stringify(shortsScript, null, 2).substring(0, 500) + '...');

    // Python 스크립트 실행
    const createVideoScript = path.join(backendPath, 'src', 'video_generator', 'create_video_from_folder.py');
    console.log('🚀 Python 스크립트 실행:', {
      script: createVideoScript,
      storyPath: storyPath,
      cwd: backendPath,
      taskId: newJobId
    });

    const pythonProcess = spawn('python', [
      createVideoScript,
      '--folder', newProjectPath,  // 폴더 경로 전달
      '--aspect-ratio', '9:16',     // 세로 비율
      '--add-subtitles'             // 자막 추가
      // --image-source 옵션 없음 → 폴더의 이미지 자동 사용
    ], {
      cwd: backendPath,
      shell: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', PYTHONPATH: backendPath },
      windowsHide: true
    });

    console.log('✅ Python 프로세스 생성됨, PID:', pythonProcess.pid);

    // 로그 처리 (비동기) - 파일 기반 로그
    pythonProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      console.log(`[쇼츠 변환 ${newJobId}] ${text}`);

      try {
        addContentLog(newJobId, text, 'video');
      } catch (err) {
        console.error('로그 저장 실패:', err);
      }
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      console.error(`[쇼츠 변환 ERROR ${newJobId}] ${text}`);

      // 에러도 로그로 저장
      try {
        addContentLog(newJobId, `❌ ERROR: ${text}`, 'video');
      } catch (err) {
        console.error('에러 로그 저장 실패:', err);
      }
    });

    pythonProcess.on('error', (error: Error) => {
      console.error(`[쇼츠 변환 프로세스 실행 실패 ${newJobId}]`, error);

      // MySQL 비동기 업데이트
      run('UPDATE content SET status = ?, error = ? WHERE content_id = ?', ['failed', error.message, newJobId])
        .catch(err => console.error('상태 업데이트 실패:', err));
    });

    pythonProcess.on('close', async (code: number) => {
      console.log(`[쇼츠 변환 ${newJobId}] 프로세스 종료, 코드: ${code}`);

      try {
        if (code === 0) {
          // 성공: 생성된 비디오 경로 찾기 (루트 폴더에서 먼저 확인)
          let videoPath: string | null = null;

          // 1. 루트 폴더에서 .mp4 파일 찾기 (쇼츠 변환은 여기에 생성됨)
          try {
            const rootFiles = await fs.readdir(newProjectPath);
            const videoFile = rootFiles.find(f => f.endsWith('.mp4') && !f.includes('scene_'));
            if (videoFile) {
              videoPath = path.join(newProjectPath, videoFile);
              console.log(`✅ 비디오 파일 발견 (루트): ${videoPath}`);
            }
          } catch (err) {
            console.log('루트 폴더 확인 실패 (무시하고 계속)');
          }

          // 2. generated_videos 폴더 확인 (없으면 넘어감)
          if (!videoPath) {
            try {
              const generatedVideosPath = path.join(newProjectPath, 'generated_videos');
              const files = await fs.readdir(generatedVideosPath);
              const videoFile = files.find(f => f.endsWith('.mp4') && !f.includes('scene_'));
              if (videoFile) {
                videoPath = path.join(generatedVideosPath, videoFile);
                console.log(`✅ 비디오 파일 발견 (generated_videos): ${videoPath}`);
              }
            } catch (err) {
              console.log('generated_videos 폴더 확인 실패 (무시하고 계속)');
            }
          }

          if (videoPath) {
            const thumbnailPath = path.join(newProjectPath, 'thumbnail.jpg');

            // 썸네일 생성
            let thumbnailGenerated = false;
            try {
              const thumbnailScript = path.join(backendPath, 'src', 'video_generator', 'create_thumbnail.py');
              await new Promise<void>((resolve, reject) => {
                const thumbProcess = spawn('python', [
                  thumbnailScript,
                  '--folder', newProjectPath,
                  '--output', thumbnailPath
                ], {
                  cwd: backendPath,
                  shell: true
                });
                thumbProcess.on('close', (thumbCode) => {
                  if (thumbCode === 0) {
                    thumbnailGenerated = true;
                    resolve();
                  } else {
                    reject(new Error('Thumbnail creation failed'));
                  }
                });
              });
            } catch (err) {
              console.error('썸네일 생성 실패 (무시하고 계속):', err);
              thumbnailGenerated = false;
            }

            // 데이터베이스 업데이트: completed (MySQL)
            await run('UPDATE content SET status = ? WHERE content_id = ?', ['completed', newJobId]);

            console.log(`✅ 쇼츠 변환 완료: ${videoPath}${thumbnailGenerated ? ` (썸네일: ${thumbnailPath})` : ' (썸네일 없음)'}`);
          } else {
            console.error(`❌ 비디오 파일을 찾을 수 없습니다. 프로젝트 경로: ${newProjectPath}`);
            await run('UPDATE content SET status = ?, error = ? WHERE content_id = ?',
              ['failed', `생성된 비디오 파일을 찾을 수 없습니다. (경로: ${newProjectPath})`, newJobId]);
          }
        } else if (code !== null) {
          // 실패 (MySQL)
          await run('UPDATE content SET status = ?, error = ? WHERE content_id = ?',
            ['failed', `Python 프로세스가 코드 ${code}로 종료되었습니다.`, newJobId]);
        }
      } catch (err) {
        console.error('프로세스 종료 처리 실패:', err);
      }
    });

    return NextResponse.json({
      success: true,
      taskId: newJobId,
      message: '쇼츠 변환이 시작되었습니다.',
      creditsUsed: creditCost
    });

  } catch (error: any) {
    console.error('쇼츠 변환 실패:', error);
    return NextResponse.json(
      { error: error?.message || '쇼츠 변환 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
