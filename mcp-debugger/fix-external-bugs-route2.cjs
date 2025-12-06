const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/external/bugs/route.ts';

const newContent = `import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql';

// 숫자 ID를 BTS- 형식으로 변환
function formatBugId(numId: number | string): string {
  const num = typeof numId === 'string' ? parseInt(numId, 10) : numId;
  return \`BTS-\${String(num).padStart(7, '0')}\`;
}

// ChatGPT GPT Builder용 외부 API
// API Key 인증 사용

const VALID_API_KEYS = [
  process.env.EXTERNAL_API_KEY || 'trend-video-chatgpt-2024-secret-key',
];

function validateApiKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  // Bearer token 또는 X-API-Key 헤더 지원
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return VALID_API_KEYS.includes(token);
  }

  const apiKey = request.headers.get('X-API-Key');
  if (apiKey && VALID_API_KEYS.includes(apiKey)) {
    return true;
  }

  return false;
}

// GET: 버그/스펙 목록 조회 또는 등록
// title 파라미터가 있으면 등록, 없으면 목록 조회
export async function GET(request: NextRequest) {
  try {
    // 모든 요청에 API Key 인증 필요
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title')?.trim();

    // title이 있으면 버그 등록 모드
    if (title) {
      const type = (searchParams.get('type') || 'bug').toLowerCase();
      const priority = searchParams.get('priority') || 'P2';
      const summary = searchParams.get('summary')?.trim() || '';
      const category = searchParams.get('category') || null;

      if (!['bug', 'spec'].includes(type)) {
        return NextResponse.json(
          { success: false, error: 'type은 "bug" 또는 "spec"만 가능합니다' },
          { status: 400 }
        );
      }

      const metadata = {
        source: 'url-api',
        priority,
        category,
        registeredAt: new Date().toISOString()
      };

      // 중복 방지: 최근 10개 버그의 title과 비교
      const [recentBugs1] = await db.query(
        'SELECT id, title FROM bugs ORDER BY created_at DESC LIMIT 10'
      ) as any;
      const dup1 = recentBugs1.find((bug: any) => bug.title === title);
      if (dup1) {
        const existingId = formatBugId(dup1.id);
        const html = \`<!DOCTYPE html><html><head><meta charset="utf-8"><title>중복 버그</title>
<style>body{font-family:system-ui,sans-serif;padding:40px;background:#fef2f2}.card{background:white;padding:30px;border-radius:12px;max-width:500px;margin:0 auto;box-shadow:0 2px 10px rgba(0,0,0,0.1)}h1{color:#ef4444}a{color:#3b82f6}</style></head>
<body><div class="card"><h1>중복 버그</h1><p>동일한 제목의 버그가 이미 존재합니다: <strong>\${existingId}</strong></p><p><a href="/admin/bugs">버그 목록 보기</a></p></div></body></html>\`;
        return new NextResponse(html, { status: 409, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // AUTO_INCREMENT 사용 (id 컬럼 생략)
      const [result] = await db.execute(
        \`INSERT INTO bugs (type, title, summary, status, created_at, updated_at, metadata)
         VALUES (?, ?, ?, 'open', NOW(), NOW(), ?)\`,
        [type, title, summary || null, JSON.stringify(metadata)]
      ) as any;

      const id = \`BTS-\${String(result.insertId).padStart(7, '0')}\`;

      // HTML 응답 (브라우저에서 보기 좋게)
      const html = \`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>버그 등록 완료</title>
<style>body{font-family:system-ui,sans-serif;padding:40px;background:#f5f5f5}
.card{background:white;padding:30px;border-radius:12px;max-width:500px;margin:0 auto;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
h1{color:#22c55e;margin-bottom:20px}.info{background:#f0fdf4;padding:15px;border-radius:8px;margin:15px 0}
.info p{margin:8px 0}.label{color:#666;font-size:12px}.value{font-weight:600;color:#333}
.id{font-size:24px;color:#22c55e;font-weight:bold}a{color:#3b82f6}</style></head>
<body><div class="card"><h1>버그 등록 완료!</h1>
<div class="info"><p><span class="label">ID</span><br><span class="id">\${id}</span></p>
<p><span class="label">제목</span><br><span class="value">\${title}</span></p>
<p><span class="label">타입</span><br><span class="value">\${type}</span></p>
<p><span class="label">우선순위</span><br><span class="value">\${priority}</span></p>
\${summary ? \`<p><span class="label">요약</span><br><span class="value">\${summary}</span></p>\` : ''}</div>
<p><a href="/admin/bugs">버그 목록 보기</a></p></div></body></html>\`;

      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // title이 없으면 목록 조회 모드 (API Key 필요)
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const status = searchParams.get('status') || 'open';
    const type = searchParams.get('type') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query = 'SELECT id, type, title, summary, status, screenshot_path, log_path, video_path, trace_path, created_at, updated_at FROM bugs WHERE 1=1';
    const params: any[] = [];

    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await db.query(query, params) as any;

    const bugs = rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      summary: row.summary,
      status: row.status,
      screenshotPath: row.screenshot_path,
      logPath: row.log_path,
      videoPath: row.video_path,
      tracePath: row.trace_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      success: true,
      count: bugs.length,
      bugs,
    });
  } catch (error: any) {
    console.error('GET /api/external/bugs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 버그/스펙 등록 (ChatGPT에서 호출)
export async function POST(request: NextRequest) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 필수 필드 검증
    const title = (body.title || '').trim();
    const summary = (body.summary || '').trim();
    const type = (body.type || 'bug').trim().toLowerCase();

    if (!title) {
      return NextResponse.json(
        { error: 'title 필드는 필수입니다' },
        { status: 400 }
      );
    }

    if (!['bug', 'spec'].includes(type)) {
      return NextResponse.json(
        { error: 'type은 "bug" 또는 "spec"만 가능합니다' },
        { status: 400 }
      );
    }

    // 이미지/파일 경로 (선택적) - camelCase와 snake_case 모두 지원
    const screenshotPath = (body.screenshotPath || body.screenshot_path || '').trim() || null;
    const logPath = (body.logPath || body.log_path || '').trim() || null;
    const videoPath = (body.videoPath || body.video_path || '').trim() || null;
    const tracePath = (body.tracePath || body.trace_path || '').trim() || null;

    // 선택적 메타데이터
    const metadata = {
      source: 'chatgpt',
      priority: body.priority || 'P2',
      category: body.category || null,
      affectedFiles: body.affectedFiles || [],
      steps: body.steps || [],
      expectedBehavior: body.expectedBehavior || null,
      actualBehavior: body.actualBehavior || null,
      ...body.metadata,
    };

    // 중복 방지: 최근 10개 버그의 title과 비교
    const [recentBugs] = await db.query(
      'SELECT id, title FROM bugs ORDER BY created_at DESC LIMIT 10'
    ) as any;
    const duplicateBug = recentBugs.find((bug: any) => bug.title === title);
    if (duplicateBug) {
      const existingId = formatBugId(duplicateBug.id);
      return NextResponse.json({
        error: \`동일한 제목의 버그가 이미 존재합니다: \${existingId}\`,
        existingId,
        duplicate: true
      }, { status: 409 });
    }

    // AUTO_INCREMENT 사용 (id 컬럼 생략) - 이미지/파일 경로 포함
    const [result] = await db.execute(
      \`
        INSERT INTO bugs (
          type, title, summary, status, log_path, screenshot_path, video_path, trace_path,
          resolution_note, created_at, updated_at, assigned_to, metadata
        ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, NULL, NOW(), NOW(), NULL, ?)
      \`,
      [type, title, summary || null, logPath, screenshotPath, videoPath, tracePath, JSON.stringify(metadata)]
    ) as any;

    const id = \`BTS-\${String(result.insertId).padStart(7, '0')}\`;

    return NextResponse.json({
      success: true,
      id,  // BTS ID를 최상위에 반환
      btsId: id,  // 명시적인 BTS ID 필드
      message: \`등록 완료! BTS ID: \${id}\`,
      bug: {
        id,
        type,
        title,
        summary,
        status: 'open',
        priority: metadata.priority,
        screenshotPath,
        logPath,
        videoPath,
        tracePath,
      },
    });
  } catch (error: any) {
    console.error('POST /api/external/bugs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// CORS preflight 지원
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
`;

fs.writeFileSync(path, newContent);
console.log('File written successfully to:', path);
