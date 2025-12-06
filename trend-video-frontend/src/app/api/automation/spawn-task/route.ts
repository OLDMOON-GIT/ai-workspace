import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
// BTS-3239: 실시간 스트리밍용 동기 fs 함수
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { addContentLog } from '@/lib/content';
import { run, getOne } from '@/lib/mysql';

/**
 * Spawning Pool 직접 호출 API (BTS-3103, BTS-3112, BTS-3136, BTS-3199, SPEC-3247, BTS-3239)
 *
 * POST: title, promptFormat을 받아서 Claude CLI로 직접 대본 생성
 * - SPEC-3247: task_queue에 script processing 상태로 등록 (task_lock 없음)
 * - 결과를 tasks/{taskId}/story.json으로 저장
 * - BTS-3199: promptFormat별 프롬프트 파일 사용 및 script.log 로그 기록
 * - BTS-3239: Claude CLI 실시간 출력을 slog에 스트리밍
 */

const WORKSPACE_DIR = 'C:\\Users\\oldmoon\\workspace';
const TASKS_DIR = path.join(WORKSPACE_DIR, 'trend-video-backend', 'tasks');
const PROMPTS_DIR = path.join(WORKSPACE_DIR, 'trend-video-frontend', 'prompts');
const SCRIPT_LOG = path.join(WORKSPACE_DIR, 'trend-video-backend', 'logs', 'script.log');
// SPEC-3239: slog 연동용 로그 디렉토리
const SLOG_DIR = path.join(WORKSPACE_DIR, 'mcp-debugger', 'logs');
// BTS-3290: Claude CLI 전체 경로 (shell spawn에서 PATH 누락 문제 해결)
const CLAUDE_CLI_PATH = 'C:\\Users\\USER\\.local\\bin\\claude.exe';

// promptFormat → 프롬프트 파일 매핑
const PROMPT_FILE_MAP: Record<string, string> = {
  'product_review': 'prompt_product.txt',
  'product': 'prompt_product.txt',
  'longform': 'prompt_longform.txt',
  'shortform': 'prompt_shortform.txt',
  'sora2': 'prompt_sora2.txt',
  'default': 'prompt_longform.txt'
};

// 로그 기록 함수
async function writeScriptLog(message: string) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `[${timestamp}] [SPAWN] ${message}\n`;
  try {
    // logs 폴더 생성
    await fs.mkdir(path.dirname(SCRIPT_LOG), { recursive: true });
    await fs.appendFile(SCRIPT_LOG, logLine, 'utf-8');
  } catch (e) {
    console.error('Log write error:', e);
  }
}

// SPEC-3239: slog 연동용 로그 (worker-spawn-{taskId}.log)
async function writeSlogLog(taskId: string, message: string) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `[${timestamp}] [INFO] ${message}\n`;
  const logPath = path.join(SLOG_DIR, `worker-spawn-${taskId.substring(0, 8)}.log`);
  try {
    await fs.mkdir(SLOG_DIR, { recursive: true });
    await fs.appendFile(logPath, logLine, 'utf-8');
  } catch (e) {
    console.error('Slog write error:', e);
  }
}

// BTS-3239: 실시간 스트리밍용 동기 로그 함수 (stdout/stderr 이벤트에서 사용)
let slogDirCreated = false;

function writeSlogLogSync(taskId: string, message: string, level: string = 'STREAM') {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  const logPath = path.join(SLOG_DIR, `worker-spawn-${taskId.substring(0, 8)}.log`);
  try {
    if (!slogDirCreated && !existsSync(SLOG_DIR)) {
      mkdirSync(SLOG_DIR, { recursive: true });
      slogDirCreated = true;
    }
    appendFileSync(logPath, logLine, 'utf-8');
  } catch (e) {
    // 동기 로그는 에러 무시 (실시간 스트리밍 성능 유지)
  }
}

// SPEC-3247: task_queue에 script processing 상태로 등록 (task_lock 없음)
// BTS-3278: status ENUM에 맞는 값 사용 (waiting/processing/completed/failed/cancelled)
async function registerTaskQueue(taskId: string, title: string) {
  try {
    const existing = await getOne<any>(
      'SELECT task_id FROM task_queue WHERE task_id = ?',
      [taskId]
    );

    if (existing) {
      // 기존 레코드 업데이트 → type=script, status=processing
      await run(
        `UPDATE task_queue SET type = 'script', status = 'processing', updated_at = NOW() WHERE task_id = ?`,
        [taskId]
      );
    } else {
      // 새로 생성 → type=script, status=processing
      await run(
        `INSERT INTO task_queue (task_id, type, status, created_at, updated_at, user_id)
         VALUES (?, 'script', 'processing', NOW(), NOW(), 'system')`,
        [taskId]
      );
    }
    console.log(`[SPAWN-TASK] ${taskId} task_queue 등록: type=script, status=processing`);
  } catch (e) {
    console.error('task_queue 등록 실패:', e);
  }
}

// BTS-3250: task_queue 완료 업데이트 - script 완료 후 image 단계로 전환
// BTS-3278: status ENUM에 맞는 값 사용 (waiting/processing/completed/failed/cancelled)
async function updateTaskQueueComplete(taskId: string, success: boolean, sceneCount: number = 0) {
  try {
    if (success) {
      // script 완료 → type=image, status=waiting으로 전환 (자동화 파이프라인)
      await run(
        `UPDATE task_queue SET type = 'image', status = 'waiting', updated_at = NOW() WHERE task_id = ?`,
        [taskId]
      );
      console.log(`[SPAWN-TASK] ${taskId} task_queue 업데이트: type=image, status=waiting (${sceneCount} scenes)`);
    } else {
      // 실패 시 status=failed
      await run(
        `UPDATE task_queue SET status = 'failed', error = 'script generation failed', updated_at = NOW() WHERE task_id = ?`,
        [taskId]
      );
      console.log(`[SPAWN-TASK] ${taskId} task_queue 업데이트: status=failed`);
    }
  } catch (e) {
    console.error('task_queue 업데이트 실패:', e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { titleId, taskId: inputTaskId, title, promptFormat, productInfo } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: 'title이 필요합니다.' },
        { status: 400 }
      );
    }

    // taskId 생성 (UUID)
    const taskId = inputTaskId || titleId || uuidv4();

    // BTS-3199: promptFormat에 따른 프롬프트 파일 로드
    const format = promptFormat || 'default';
    const promptFileName = PROMPT_FILE_MAP[format] || PROMPT_FILE_MAP['default'];
    const promptFilePath = path.join(PROMPTS_DIR, promptFileName);

    // SPEC-3247: task_queue에 script processing 등록
    await registerTaskQueue(taskId, title);

    // BTS-3255: 현재 채널 정보 조회 (content_setting 우선, content 폴백)
    let channelName = '';
    try {
      // content_setting 테이블에서 먼저 조회 (채널 변경 시 여기가 업데이트됨)
      const setting = await getOne<any>(
        'SELECT youtube_channel FROM content_setting WHERE content_id = ?',
        [taskId]
      );
      if (setting?.youtube_channel) {
        channelName = setting.youtube_channel;
      } else {
        // content_setting에 없으면 content 테이블에서 조회
        const content = await getOne<any>(
          'SELECT youtube_channel FROM content WHERE content_id = ?',
          [taskId]
        );
        if (content?.youtube_channel) {
          channelName = content.youtube_channel;
        }
      }
    } catch (e) {
      // 채널 조회 실패해도 계속 진행
    }

    // SPEC-3247: 자동화 로그 규격 사용 (addContentLog → tasks/{taskId}/script.log)
    addContentLog(taskId, `========== Spawn 작업 시작 ==========`);
    addContentLog(taskId, `🤖 Spawn [${format}] "${title}"${channelName ? ` (채널: ${channelName})` : ''}`);
    addContentLog(taskId, `taskId: ${taskId}`);
    addContentLog(taskId, `promptFile: ${promptFileName}`);
    if (productInfo) {
      addContentLog(taskId, `productInfo: ${JSON.stringify(productInfo).substring(0, 200)}...`);
    }

    // 기존 로그도 유지 (script.log 전역 로그) - BTS-3255: 채널명 추가
    await writeScriptLog(`========== 새 Spawn 작업 시작 ==========`);
    await writeScriptLog(`taskId: ${taskId}`);
    await writeScriptLog(`title: ${title}`);
    await writeScriptLog(`promptFormat: ${format}`);
    if (channelName) {
      await writeScriptLog(`channel: ${channelName}`);
    }

    // SPEC-3239: slog 연동 - BTS-3255: 채널명 추가
    await writeSlogLog(taskId, `========== Spawn 작업 시작 ==========`);
    await writeSlogLog(taskId, `🤖 Spawn [${format}] "${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"${channelName ? ` (채널: ${channelName})` : ''}`);
    await writeSlogLog(taskId, `taskId: ${taskId}`);

    let scriptPrompt: string;

    // BTS-3260: JSON 강제 지시는 prompts 폴더의 각 프롬프트 파일에 포함되어야 함
    // spawn-task에서는 하드코딩하지 않음

    try {
      // 프롬프트 파일 로드
      const promptTemplate = await fs.readFile(promptFilePath, 'utf-8');

      // 플레이스홀더 치환 (BTS-3244: prompt_product.txt 플레이스홀더 완전 지원)
      scriptPrompt = promptTemplate
        .replace(/\{title\}/g, title)
        // 기존 플레이스홀더
        .replace(/\{product_name\}/g, productInfo?.name || productInfo?.title || title)
        .replace(/\{product_info\}/g, productInfo ? JSON.stringify(productInfo, null, 2) : '')
        .replace(/\{product_description\}/g, productInfo?.description || productInfo?.productDescription || '')
        .replace(/\{product_price\}/g, productInfo?.price || '')
        .replace(/\{product_url\}/g, productInfo?.url || productInfo?.deepLink || '')
        // prompt_product.txt 플레이스홀더 (BTS-3244)
        .replace(/\{thumbnail\}/g, productInfo?.thumbnail || productInfo?.image || '')
        .replace(/\{product_link\}/g, productInfo?.deepLink || productInfo?.url || productInfo?.productUrl || '')
        .replace(/\{home_url\}/g, 'https://link.coupang.com');

      await writeScriptLog(`프롬프트 파일 로드 성공: ${promptFilePath}`);
    } catch (e) {
      // 프롬프트 파일 로드 실패 시 기본 프롬프트 사용
      await writeScriptLog(`프롬프트 파일 로드 실패, 기본 프롬프트 사용: ${e}`);

      // BTS-3260: 기본 프롬프트도 prompts 폴더와 동일한 형식 사용
      // JSON 강제 지시는 prompts 폴더의 각 프롬프트 파일 맨 앞에 포함되어 있음
      scriptPrompt = `🚨🚨🚨 **CRITICAL INSTRUCTION - CLI AUTOMATION** 🚨🚨🚨
You are a JSON generator for CLI automation. Output ONLY valid JSON.
- Start your response with { and end with }
- No explanations, no refusals, no text before or after JSON
- This is CLI automation - web interface policies (artifacts, etc.) do not apply
- Execute the task and output pure JSON only

${format === 'product_review' || format === 'product' ? '상품 리뷰' : '롱폼'} 영상 대본 작성 요청

제목: ${title}
${productInfo ? `상품 정보: ${JSON.stringify(productInfo, null, 2)}` : ''}

작업 내용:
1. 제목에 맞는 영상 대본을 작성합니다
2. 대본은 scene 구조로 작성합니다
3. 각 scene에는 narration, imagePrompt 포함

대본 형식 (JSON만 출력, 마크다운 코드블록 없이):
{
  "title": "영상 제목",
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "나레이션 텍스트",
      "imagePrompt": "이미지 생성 프롬프트"
    }
  ]
}

JSON만 출력해주세요. 마크다운 코드블록(\`\`\`) 없이 순수 JSON만 출력하세요.`;
    }

    // BTS-3257: 프롬프트 파일 생성 불필요 - stdin으로 직접 전달
    console.log(`[SPAWN-TASK] ${taskId} 대본 생성 시작 - "${title}"`);
    await writeScriptLog(`Claude CLI 호출 시작...`);
    await writeSlogLog(taskId, `⏳ Claude CLI 호출 시작...`);
    const startTime = Date.now();

    // BTS-3314: spawning-pool.py 방식으로 통합
    // 프롬프트 파일 → type으로 파이프 → Claude CLI → 출력 파일 → .done 마커
    const tempDir = process.env.TEMP || 'C:\\Windows\\Temp';
    const shortId = taskId.substring(0, 8);
    const tempPromptFile = path.join(WORKSPACE_DIR, `.prompt-spawn-${shortId}.txt`);
    const tempOutputFile = path.join(tempDir, `spawn-output-${shortId}.txt`);
    const tempDoneFile = path.join(tempDir, `spawn-done-${shortId}.txt`);
    const storyJsonPath = path.join(TASKS_DIR, taskId, 'story.json');

    // tasks/{taskId} 폴더 미리 생성
    await fs.mkdir(path.join(TASKS_DIR, taskId), { recursive: true });

    // 프롬프트를 워크스페이스에 저장 (spawning-pool 방식)
    await fs.writeFile(tempPromptFile, scriptPrompt, 'utf-8');
    console.log(`[SPAWN-TASK] 프롬프트 파일 저장: ${tempPromptFile}`);
    addContentLog(taskId, `📄 프롬프트 파일: ${tempPromptFile}`);
    addContentLog(taskId, `🖥️ spawning-pool 방식 CMD 창에서 실행 중...`);

    const titleShort = title.substring(0, 25).replace(/[<>:"/\\|?*]/g, '');

    // BTS-3314: spawning-pool.py와 동일한 방식
    // chcp 65001: UTF-8, type: 파일 내용 파이프, cmd /k: 창 유지
    // 출력을 story.json에 직접 저장 + done 마커 생성
    const wrapperCmd = `chcp 65001 >nul && type "${tempPromptFile}" | "${CLAUDE_CLI_PATH}" --model claude-sonnet-4-20250514 --dangerously-skip-permissions -p > "${storyJsonPath}" 2>&1 && echo done > "${tempDoneFile}" && echo. && echo ====== Spawn ${shortId} 완료 ====== && echo story.json 저장됨: ${storyJsonPath} && echo 이 창을 닫으려면 아무 키나 누르세요... && pause >nul`;

    console.log(`[SPAWN-TASK] spawning-pool 방식 CMD 준비 완료`);

    // cmd /k로 창 유지 (spawning-pool 방식)
    const proc = spawn('cmd', ['/c', `start "Spawn - ${titleShort}" cmd /k "${wrapperCmd}"`], {
      cwd: WORKSPACE_DIR,
      shell: true,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });

    proc.unref();

    // .done 마커 파일 폴링
    const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
      const startWait = Date.now();
      const maxWait = 900000; // 15분
      const pollInterval = 2000;

      const checkDone = async () => {
        const elapsed = Date.now() - startWait;

        if (elapsed > maxWait) {
          resolve({ success: false, output: 'Timeout (15분) - Claude CLI 응답 없음' });
          return;
        }

        try {
          await fs.access(tempDoneFile);
          // 완료! story.json 읽기
          await new Promise(r => setTimeout(r, 500));

          const output = await fs.readFile(storyJsonPath, 'utf-8');
          console.log(`[SPAWN-TASK] story.json 읽기 성공: ${output.length} bytes`);

          // slog에 기록
          const lines = output.split('\n').filter((l: string) => l.trim());
          for (const line of lines.slice(0, 50)) {
            writeSlogLogSync(taskId, line.substring(0, 200), 'OUTPUT');
          }

          // 임시 파일 삭제 (story.json은 유지)
          try {
            await fs.unlink(tempPromptFile);
            await fs.unlink(tempDoneFile);
            console.log(`[SPAWN-TASK] 임시 파일 삭제 완료`);
          } catch (e) {
            // 삭제 실패해도 진행
          }

          const hasJson = output.includes('{') && output.includes('}');
          resolve({ success: hasJson, output });
          return;
        } catch (e) {
          // 아직 진행 중
        }

        setTimeout(checkDone, pollInterval);
      };

      setTimeout(checkDone, pollInterval);
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      // BTS-3244: JSON 추출 로직 강화 - 텍스트 응답에서 JSON만 추출
      let jsonOutput = result.output.trim();

      // 1. 마크다운 코드블록 제거 (```json ... ```)
      const codeBlockMatch = jsonOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonOutput = codeBlockMatch[1].trim();
      }

      // BTS-3244: JSON이 전혀 없는 텍스트 응답 감지
      const firstBraceIndex = jsonOutput.indexOf('{');
      if (firstBraceIndex === -1) {
        // JSON 객체가 없음 - 완전 텍스트 응답
        const errorMsg = `Claude가 JSON 대신 텍스트로 응답함: "${jsonOutput.substring(0, 200)}..."`;
        console.error(`[SPAWN-TASK] ${taskId} ${errorMsg}`);
        addContentLog(taskId, `❌ JSON 형식 오류 - 텍스트 응답`);
        addContentLog(taskId, `응답: ${jsonOutput.substring(0, 300)}`);
        addContentLog(taskId, `========== Spawn 작업 실패 (재시도 필요) ==========`);
        await writeScriptLog(`❌ JSON 형식 오류: ${errorMsg}`);
        await writeSlogLog(taskId, `❌ JSON 형식 오류 - 텍스트 응답 (재시도 필요)`);
        await updateTaskQueueComplete(taskId, false);

        return NextResponse.json({
          success: false,
          taskId,
          title,
          message: 'Claude가 JSON 대신 텍스트로 응답함 - 재시도 필요',
          error: jsonOutput.substring(0, 500)
        }, { status: 500 });
      }

      // 2. JSON 객체가 아닌 텍스트가 앞에 있으면 제거
      if (firstBraceIndex > 0) {
        const preamble = jsonOutput.substring(0, firstBraceIndex).trim();
        if (preamble) {
          await writeScriptLog(`JSON 앞 텍스트 제거: "${preamble.substring(0, 100)}..."`);
        }
        jsonOutput = jsonOutput.substring(firstBraceIndex);
      }

      // 3. JSON 객체가 끝난 후 텍스트가 있으면 제거 (마지막 } 찾기)
      const lastBraceIndex = jsonOutput.lastIndexOf('}');
      if (lastBraceIndex >= 0 && lastBraceIndex < jsonOutput.length - 1) {
        const postamble = jsonOutput.substring(lastBraceIndex + 1).trim();
        if (postamble) {
          await writeScriptLog(`JSON 뒤 텍스트 제거: "${postamble.substring(0, 100)}..."`);
        }
        jsonOutput = jsonOutput.substring(0, lastBraceIndex + 1);
      }

      // 4. JSON 유효성 검증 - BTS-3244: 파싱 실패 시 에러 반환
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(jsonOutput);
      } catch (parseErr) {
        const errorMsg = `JSON 파싱 실패: ${(parseErr as Error).message}`;
        console.error(`[SPAWN-TASK] ${taskId} ${errorMsg}`);
        addContentLog(taskId, `❌ JSON 파싱 실패`);
        addContentLog(taskId, `에러: ${(parseErr as Error).message}`);
        addContentLog(taskId, `응답 앞부분: ${jsonOutput.substring(0, 200)}`);
        addContentLog(taskId, `========== Spawn 작업 실패 (재시도 필요) ==========`);
        await writeScriptLog(`❌ JSON 파싱 실패: ${errorMsg}`);
        await writeScriptLog(`응답 앞부분: ${jsonOutput.substring(0, 300)}`);
        await writeSlogLog(taskId, `❌ JSON 파싱 실패 - ${(parseErr as Error).message}`);
        await updateTaskQueueComplete(taskId, false);

        return NextResponse.json({
          success: false,
          taskId,
          title,
          message: 'JSON 파싱 실패 - 재시도 필요',
          error: jsonOutput.substring(0, 500)
        }, { status: 500 });
      }

      // tasks/{taskId} 폴더 생성
      const taskDir = path.join(TASKS_DIR, taskId);
      await fs.mkdir(taskDir, { recursive: true });

      // story.json 저장
      const storyPath = path.join(taskDir, 'story.json');
      await fs.writeFile(storyPath, jsonOutput, 'utf-8');

      // BTS-3244, BTS-3250: 씬 카운트 계산 (이미 파싱된 parsedJson 사용)
      let sceneCount = 0;
      if (parsedJson.scenes && Array.isArray(parsedJson.scenes)) {
        sceneCount = parsedJson.scenes.length;
      }

      console.log(`[SPAWN-TASK] ${taskId} story.json 저장 완료: ${storyPath}`);

      // SPEC-3247: 자동화 로그 규격 사용
      addContentLog(taskId, `✅ 대본 생성 완료 - ${elapsed}s, ${sceneCount} scenes`);
      addContentLog(taskId, `저장: tasks/${taskId}/story.json`);
      addContentLog(taskId, `========== Spawn 작업 완료 ==========`);

      // BTS-3250: task_queue 완료 업데이트 (sceneCount 전달)
      await updateTaskQueueComplete(taskId, true, sceneCount);

      // 기존 로그 유지
      await writeScriptLog(`✅ 성공 - ${elapsed}s, ${sceneCount} scenes`);
      await writeScriptLog(`저장: tasks/${taskId}/story.json`);
      await writeScriptLog(`========== 작업 완료 ==========\n`);

      // SPEC-3239: slog 연동
      await writeSlogLog(taskId, `✅ 성공 - ${elapsed}s, ${sceneCount} scenes`);
      await writeSlogLog(taskId, `저장: tasks/${taskId}/story.json`);
      await writeSlogLog(taskId, `========== 작업 완료 ==========`);

      return NextResponse.json({
        success: true,
        taskId,
        title,
        promptFormat: format,
        message: '대본 생성 완료',
        storyPath: `tasks/${taskId}/story.json`,
        sceneCount
      });
    } else {
      console.error(`[SPAWN-TASK] ${taskId} 대본 생성 실패:`, result.output.substring(0, 200));

      // SPEC-3247: 자동화 로그 규격 사용
      addContentLog(taskId, `❌ 대본 생성 실패 - ${elapsed}s`);
      addContentLog(taskId, `에러: ${result.output.substring(0, 300)}`);
      addContentLog(taskId, `========== Spawn 작업 실패 ==========`);

      // SPEC-3247: task_queue 에러 업데이트
      await updateTaskQueueComplete(taskId, false);

      // 기존 로그 유지
      await writeScriptLog(`❌ 실패 - ${elapsed}s`);
      await writeScriptLog(`에러: ${result.output.substring(0, 300)}`);
      await writeScriptLog(`========== 작업 실패 ==========\n`);

      // SPEC-3239: slog 연동
      await writeSlogLog(taskId, `❌ 실패 - ${elapsed}s`);
      await writeSlogLog(taskId, `에러: ${result.output.substring(0, 200)}`);
      await writeSlogLog(taskId, `========== 작업 실패 ==========`);

      return NextResponse.json({
        success: false,
        taskId,
        title,
        message: '대본 생성 실패',
        error: result.output.substring(0, 500)
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Spawn task error:', error);
    return NextResponse.json(
      { error: error.message || 'Spawn task 실행 실패' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Spawn Task API - POST로 title을 보내면 Claude CLI로 직접 대본 생성',
    usage: 'POST { title: "영상 제목" }',
    output: 'tasks/{taskId}/story.json'
  });
}
