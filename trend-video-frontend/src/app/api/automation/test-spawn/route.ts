import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

/**
 * Spawning Pool v2 라우팅 테스트 API
 *
 * 롱폼 대본 프롬프트를 가져와서 Dispatcher가 어떤 워커를 선택하는지 테스트
 */

export async function POST(request: NextRequest) {
  try {
    const { titleId, title, prompt } = await request.json();

    if (!titleId && !prompt) {
      return NextResponse.json(
        { error: 'titleId 또는 prompt가 필요합니다.' },
        { status: 400 }
      );
    }

    // 테스트용 프롬프트 생성
    const testPrompt = prompt || `롱폼 대본 생성 요청

제목: ${title || '테스트 롱폼 영상'}
타입: longform
설명: 16:9 가로형 롱폼 영상 대본을 생성합니다.

이 작업을 어떤 AI 워커에게 할당해야 할지 판단해주세요.

워커 특성:
- CLAUDE: 롱폼 영상, 긴 대본, 복잡한 버그 수정, 다단계 작업
- GEMINI: 숏폼 영상, 상품 관련, 썸네일, 간단한 작업
- CODEX: 플래닝, 아키텍처 설계, 코드 리뷰, 리팩토링

답변 형식 (한 줄만):
WORKER: [CLAUDE|GEMINI|CODEX] REASON: [간단한 이유]`;

    // Claude CLI 호출해서 라우팅 테스트
    const workspaceDir = 'C:\\Users\\oldmoon\\workspace';
    const promptFile = path.join(workspaceDir, `.prompt-spawn-test-${Date.now()}.txt`);

    // 프롬프트 파일 생성
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile(promptFile, testPrompt, 'utf-8');

    // Claude CLI 실행
    const result = await new Promise<{ success: boolean; output: string; worker?: string }>((resolve) => {
      const cmd = `type "${promptFile}" | claude --dangerously-skip-permissions -p`;

      const proc = spawn('cmd', ['/c', cmd], {
        cwd: workspaceDir,
        shell: true
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        // 프롬프트 파일 삭제
        try {
          await fs.unlink(promptFile);
        } catch {}

        const output = stdout + stderr;

        // 워커 결정 파싱
        let worker = 'UNKNOWN';
        const outputUpper = output.toUpperCase();

        if (outputUpper.includes('WORKER: CLAUDE') || outputUpper.includes('CLAUDE')) {
          worker = 'CLAUDE';
        } else if (outputUpper.includes('WORKER: GEMINI') || outputUpper.includes('GEMINI')) {
          worker = 'GEMINI';
        } else if (outputUpper.includes('WORKER: CODEX') || outputUpper.includes('CODEX')) {
          worker = 'CODEX';
        }

        resolve({
          success: code === 0,
          output: output.substring(0, 1000),
          worker
        });
      });

      // 30초 타임아웃
      setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          output: 'Timeout (30s)',
          worker: 'TIMEOUT'
        });
      }, 30000);
    });

    // 키워드 기반 빠른 라우팅 결과도 반환
    const keywords = {
      claude: ['롱폼', 'longform', '대본', 'script', 'complex', '복잡', 'error', '에러', 'bug', '버그', 'fix', '수정'],
      gemini: ['숏폼', 'shortform', '상품', 'product', 'coupang', '쿠팡', 'thumbnail', '썸네일', 'simple', '간단'],
      codex: ['plan', '플랜', '아키텍처', 'architecture', 'review', '리뷰', 'design', '설계', 'refactor', '리팩토링']
    };

    const promptLower = testPrompt.toLowerCase();
    let keywordMatch = null;

    for (const [worker, kws] of Object.entries(keywords)) {
      for (const kw of kws) {
        if (promptLower.includes(kw)) {
          keywordMatch = { worker: worker.toUpperCase(), keyword: kw };
          break;
        }
      }
      if (keywordMatch) break;
    }

    return NextResponse.json({
      success: true,
      titleId,
      title,
      routing: {
        keywordMatch,
        dispatcherResult: result.worker,
        dispatcherOutput: result.output,
        finalWorker: keywordMatch?.worker || result.worker || 'CLAUDE'
      },
      message: `라우팅 결과: ${keywordMatch?.worker || result.worker || 'CLAUDE'}`
    });

  } catch (error: any) {
    console.error('Spawn test error:', error);
    return NextResponse.json(
      { error: error.message || 'Spawn 테스트 실패' },
      { status: 500 }
    );
  }
}
