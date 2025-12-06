import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/mysql';

// snake_case를 camelCase로 변환
function toCamelCase(obj: any) {
  if (!obj) return obj;

  // metadata 파싱
  let metadata = obj.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (e) {
      metadata = {};
    }
  }

  return {
    id: obj.id,
    title: obj.title,
    summary: obj.summary,
    status: obj.status,
    logPath: obj.log_path,
    screenshotPath: obj.screenshot_path,
    videoPath: obj.video_path,
    tracePath: obj.trace_path,
    resolutionNote: obj.resolution_note,
    createdAt: obj.created_at,
    updatedAt: obj.updated_at,
    assignedTo: obj.assigned_to,
    metadata: metadata || {}
  };
}

// GET: 버그 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') || 'open';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const q = searchParams.get('q');

    // status counts 조회
    const [countRows] = await db.query(`
      SELECT status, COUNT(*) as count FROM bugs GROUP BY status
    `) as any;

    const statusCounts: any = {
      all: 0,
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0
    };

    let totalCount = 0;
    for (const row of countRows) {
      statusCounts[row.status] = row.count;
      totalCount += row.count;
    }
    statusCounts.all = totalCount;

    // 버그 목록 조회
    let query = 'SELECT * FROM bugs WHERE 1=1';
    const params: any[] = [];

    if (statusParam !== 'all') {
      query += ' AND status = ?';
      params.push(statusParam);
    }

    if (q) {
      query += ' AND (id LIKE ? OR title LIKE ? OR summary LIKE ?)';
      const searchPattern = `%${q}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY created_at DESC';

    // 페이지네이션
    const offset = (page - 1) * pageSize;
    query += ` LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);

    const [bugRows] = await db.query(query, params) as any;

    // 전체 개수 조회 (페이지네이션용)
    let countQuery = 'SELECT COUNT(*) as total FROM bugs WHERE 1=1';
    const countParams: any[] = [];

    if (statusParam !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(statusParam);
    }

    if (q) {
      countQuery += ' AND (id LIKE ? OR title LIKE ? OR summary LIKE ?)';
      const searchPattern = `%${q}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }

    const [totalRows] = await db.query(countQuery, countParams) as any;
    const total = totalRows[0]?.total || 0;

    // camelCase로 변환
    const bugs = bugRows.map(toCamelCase);

    return NextResponse.json({ bugs, total, statusCounts });
  } catch (error: any) {
    console.error('GET /api/bugs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST, PATCH, DELETE는 MCP Debugger가 자동으로 처리하므로 현재는 구현하지 않음
