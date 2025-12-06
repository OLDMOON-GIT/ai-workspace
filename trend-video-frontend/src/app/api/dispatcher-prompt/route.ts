import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getCurrentUser } from '@/lib/session';

// Dispatcher 프롬프트 파일 경로
const PROMPT_FILENAME = 'prompt_dispatcher.txt';

// 캐시 저장소
let promptCache: {
  content: string;
  lastModified: number;
} | null = null;

export async function GET(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const projectRoot = process.cwd();
    const filePath = path.join(projectRoot, 'prompts', PROMPT_FILENAME);

    // 파일 존재 확인
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json(
        { error: `prompts/${PROMPT_FILENAME} 파일을 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    const stats = await fs.stat(filePath);
    const lastModified = stats.mtimeMs;

    // 캐시 확인
    let content: string;
    let cached = false;

    if (promptCache && promptCache.lastModified === lastModified) {
      console.log('📋 Dispatcher 프롬프트 캐시 사용');
      content = promptCache.content;
      cached = true;
    } else {
      console.log('📄 Dispatcher 프롬프트 파일 읽기');
      content = await fs.readFile(filePath, 'utf-8');
      promptCache = { content, lastModified };
    }

    // Accept 헤더 확인
    const acceptHeader = request.headers.get('accept') || '';
    const wantsHtml = acceptHeader.includes('text/html');

    if (wantsHtml) {
      // HTML 편집기 UI 반환
      const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dispatcher 프롬프트 편집</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      min-height: 100vh;
      color: #e2e8f0;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #f472b6, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .info-box {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 0.75rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    .info-box h3 { color: #a78bfa; margin-bottom: 0.5rem; }
    .info-box ul { margin-left: 1.5rem; color: #cbd5e1; }
    .info-box li { margin: 0.25rem 0; }
    textarea {
      width: 100%;
      min-height: 500px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1rem;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.9rem;
      color: #e2e8f0;
      resize: vertical;
      line-height: 1.6;
    }
    textarea:focus {
      outline: none;
      border-color: #8b5cf6;
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
    }
    .button-group {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }
    button {
      padding: 0.75rem 2rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .save-btn {
      background: linear-gradient(135deg, #8b5cf6, #a855f7);
      color: white;
      border: none;
    }
    .save-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); }
    .reset-btn {
      background: transparent;
      color: #94a3b8;
      border: 1px solid #475569;
    }
    .reset-btn:hover { border-color: #64748b; color: #e2e8f0; }
    .status {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      display: none;
    }
    .status.success { display: block; background: rgba(34, 197, 94, 0.2); color: #4ade80; }
    .status.error { display: block; background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .back-link {
      display: inline-block;
      margin-bottom: 1rem;
      color: #a78bfa;
      text-decoration: none;
    }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <a href="/admin/prompts" class="back-link">← 프롬프트 관리로 돌아가기</a>
    <h1>🤖 Dispatcher 프롬프트</h1>
    <p class="subtitle">Spawning Pool v2 - AI 워커 작업 분배 프롬프트</p>

    <div class="info-box">
      <h3>📋 워커 할당 기준</h3>
      <ul>
        <li><strong>CLAUDE</strong>: 롱폼, 복잡한 버그, 긴 프롬프트, 다중 파일 수정</li>
        <li><strong>GEMINI</strong>: 숏폼, 상품, 썸네일, 간단한 수정</li>
        <li><strong>CODEX</strong>: 플래닝, 아키텍처, 코드 리뷰, 리팩토링</li>
      </ul>
    </div>

    <textarea id="promptContent">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>

    <div class="button-group">
      <button class="save-btn" onclick="savePrompt()">💾 저장하기</button>
      <button class="reset-btn" onclick="resetPrompt()">↺ 초기화</button>
    </div>

    <div id="status" class="status"></div>
  </div>

  <script>
    const originalContent = document.getElementById('promptContent').value;

    async function savePrompt() {
      const content = document.getElementById('promptContent').value;
      const status = document.getElementById('status');

      try {
        const res = await fetch('/api/dispatcher-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });

        const data = await res.json();

        if (res.ok) {
          status.className = 'status success';
          status.textContent = '✅ ' + data.message;
        } else {
          status.className = 'status error';
          status.textContent = '❌ ' + (data.error || '저장 실패');
        }
      } catch (err) {
        status.className = 'status error';
        status.textContent = '❌ 네트워크 오류: ' + err.message;
      }
    }

    function resetPrompt() {
      if (confirm('변경사항을 모두 취소하고 원래 내용으로 되돌리시겠습니까?')) {
        document.getElementById('promptContent').value = originalContent;
        document.getElementById('status').className = 'status';
      }
    }
  </script>
</body>
</html>`;
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // JSON 응답
    return NextResponse.json({
      content,
      filename: PROMPT_FILENAME,
      cached,
      lastModified: new Date(lastModified).toISOString()
    });

  } catch (error) {
    console.error('Dispatcher 프롬프트 읽기 오류:', error);
    return NextResponse.json(
      { error: '프롬프트 파일 읽기 실패' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: '프롬프트 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    const projectRoot = process.cwd();
    const filePath = path.join(projectRoot, 'prompts', PROMPT_FILENAME);

    // 백업 생성
    const backupPath = path.join(
      projectRoot,
      'prompts',
      `prompt_dispatcher_backup_${Date.now()}.txt`
    );
    try {
      const existingContent = await fs.readFile(filePath, 'utf-8');
      await fs.writeFile(backupPath, existingContent, 'utf-8');
      console.log('📦 백업 생성:', backupPath);
    } catch {
      // 기존 파일이 없으면 백업 스킵
    }

    // 새 내용 저장
    await fs.writeFile(filePath, content, 'utf-8');
    console.log('💾 Dispatcher 프롬프트 저장 완료');

    // 캐시 초기화
    promptCache = null;

    return NextResponse.json({
      success: true,
      message: '프롬프트가 저장되었습니다.',
      filename: PROMPT_FILENAME
    });

  } catch (error) {
    console.error('Dispatcher 프롬프트 저장 오류:', error);
    return NextResponse.json(
      { error: '프롬프트 파일 저장 실패' },
      { status: 500 }
    );
  }
}
