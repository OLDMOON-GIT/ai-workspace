import { NextRequest, NextResponse } from 'next/server';
import { getAll, getOne, run } from '@/lib/mysql';
import { requireAuth } from '@/lib/auth-helper';

interface TestUsecase {
  usecaseId: number;
  name: string;
  description: string | null;
  category: string | null;
  priority: 'P1' | 'P2' | 'P3';
  precondition: string | null;
  steps: any;
  expectedResult: string | null;
  targetUrl: string | null;
  selectors: any;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

// GET: 유스케이스 목록 조회
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const isActive = searchParams.get('isActive');

    let sql = `
      SELECT
        usecase_id as usecaseId,
        name,
        description,
        category,
        priority,
        precondition,
        steps,
        expected_result as expectedResult,
        target_url as targetUrl,
        selectors,
        is_active as isActive,
        created_at as createdAt,
        updated_at as updatedAt
      FROM test_usecase
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (priority) {
      sql += ' AND priority = ?';
      params.push(priority);
    }
    if (isActive !== null && isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(isActive === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY priority ASC, created_at DESC';

    const usecases = await getAll<TestUsecase>(sql, params);

    // JSON 파싱
    const parsed = usecases.map(u => ({
      ...u,
      steps: u.steps ? (typeof u.steps === 'string' ? JSON.parse(u.steps) : u.steps) : [],
      selectors: u.selectors ? (typeof u.selectors === 'string' ? JSON.parse(u.selectors) : u.selectors) : {}
    }));

    return NextResponse.json({ usecases: parsed });
  } catch (error: any) {
    console.error('[test-automation/usecases] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 유스케이스 생성
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const {
      name,
      description,
      category,
      priority = 'P2',
      precondition,
      steps = [],
      expectedResult,
      targetUrl,
      selectors = {},
      isActive = true
    } = body;

    if (!name) {
      return NextResponse.json({ error: '유스케이스 이름은 필수입니다' }, { status: 400 });
    }

    const result = await run(
      `INSERT INTO test_usecase
       (name, description, category, priority, precondition, steps, expected_result, target_url, selectors, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        category || null,
        priority,
        precondition || null,
        JSON.stringify(steps),
        expectedResult || null,
        targetUrl || null,
        JSON.stringify(selectors),
        isActive ? 1 : 0
      ]
    );

    return NextResponse.json({
      success: true,
      usecaseId: result.insertId,
      message: '유스케이스가 생성되었습니다'
    });
  } catch (error: any) {
    console.error('[test-automation/usecases] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: 유스케이스 수정
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { usecaseId, ...updateFields } = body;

    if (!usecaseId) {
      return NextResponse.json({ error: 'usecaseId는 필수입니다' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updateFields.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updateFields.name);
    }
    if (updateFields.description !== undefined) {
      setClauses.push('description = ?');
      params.push(updateFields.description);
    }
    if (updateFields.category !== undefined) {
      setClauses.push('category = ?');
      params.push(updateFields.category);
    }
    if (updateFields.priority !== undefined) {
      setClauses.push('priority = ?');
      params.push(updateFields.priority);
    }
    if (updateFields.precondition !== undefined) {
      setClauses.push('precondition = ?');
      params.push(updateFields.precondition);
    }
    if (updateFields.steps !== undefined) {
      setClauses.push('steps = ?');
      params.push(JSON.stringify(updateFields.steps));
    }
    if (updateFields.expectedResult !== undefined) {
      setClauses.push('expected_result = ?');
      params.push(updateFields.expectedResult);
    }
    if (updateFields.targetUrl !== undefined) {
      setClauses.push('target_url = ?');
      params.push(updateFields.targetUrl);
    }
    if (updateFields.selectors !== undefined) {
      setClauses.push('selectors = ?');
      params.push(JSON.stringify(updateFields.selectors));
    }
    if (updateFields.isActive !== undefined) {
      setClauses.push('is_active = ?');
      params.push(updateFields.isActive ? 1 : 0);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다' }, { status: 400 });
    }

    params.push(usecaseId);
    await run(`UPDATE test_usecase SET ${setClauses.join(', ')} WHERE usecase_id = ?`, params);

    return NextResponse.json({ success: true, message: '유스케이스가 수정되었습니다' });
  } catch (error: any) {
    console.error('[test-automation/usecases] PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 유스케이스 삭제
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const usecaseId = searchParams.get('usecaseId');

    if (!usecaseId) {
      return NextResponse.json({ error: 'usecaseId는 필수입니다' }, { status: 400 });
    }

    await run('DELETE FROM test_usecase WHERE usecase_id = ?', [usecaseId]);

    return NextResponse.json({ success: true, message: '유스케이스가 삭제되었습니다' });
  } catch (error: any) {
    console.error('[test-automation/usecases] DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
