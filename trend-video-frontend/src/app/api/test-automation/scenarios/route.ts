import { NextRequest, NextResponse } from 'next/server';
import { getAll, getOne, run } from '@/lib/mysql';
import { requireAuth } from '@/lib/auth-helper';

interface TestScenario {
  scenarioId: number;
  usecaseId: number;
  name: string;
  testCode: string | null;
  testData: any;
  status: string;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runCount: number;
  passCount: number;
  failCount: number;
  createdAt: string;
  updatedAt: string;
}

// GET: 시나리오 목록 조회
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const usecaseId = searchParams.get('usecaseId');
    const status = searchParams.get('status');

    let sql = `
      SELECT
        s.scenario_id as scenarioId,
        s.usecase_id as usecaseId,
        s.name,
        s.test_code as testCode,
        s.test_data as testData,
        s.status,
        s.last_run_at as lastRunAt,
        s.last_duration_ms as lastDurationMs,
        s.last_error as lastError,
        s.run_count as runCount,
        s.pass_count as passCount,
        s.fail_count as failCount,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        u.name as usecaseName,
        u.category as usecaseCategory
      FROM test_scenario s
      LEFT JOIN test_usecase u ON s.usecase_id = u.usecase_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (usecaseId) {
      sql += ' AND s.usecase_id = ?';
      params.push(usecaseId);
    }
    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.created_at DESC';

    const scenarios = await getAll<TestScenario & { usecaseName: string; usecaseCategory: string }>(sql, params);

    // JSON 파싱
    const parsed = scenarios.map(s => ({
      ...s,
      testData: s.testData ? (typeof s.testData === 'string' ? JSON.parse(s.testData) : s.testData) : {}
    }));

    return NextResponse.json({ scenarios: parsed });
  } catch (error: any) {
    console.error('[test-automation/scenarios] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 시나리오 생성
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const {
      usecaseId,
      name,
      testCode,
      testData = {},
      status = 'draft'
    } = body;

    if (!usecaseId || !name) {
      return NextResponse.json({ error: 'usecaseId와 name은 필수입니다' }, { status: 400 });
    }

    // 유스케이스 존재 확인
    const usecase = await getOne('SELECT usecase_id FROM test_usecase WHERE usecase_id = ?', [usecaseId]);
    if (!usecase) {
      return NextResponse.json({ error: '유스케이스를 찾을 수 없습니다' }, { status: 404 });
    }

    const result = await run(
      `INSERT INTO test_scenario
       (usecase_id, name, test_code, test_data, status)
       VALUES (?, ?, ?, ?, ?)`,
      [usecaseId, name, testCode || null, JSON.stringify(testData), status]
    );

    return NextResponse.json({
      success: true,
      scenarioId: result.insertId,
      message: '시나리오가 생성되었습니다'
    });
  } catch (error: any) {
    console.error('[test-automation/scenarios] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: 시나리오 수정
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { scenarioId, ...updateFields } = body;

    if (!scenarioId) {
      return NextResponse.json({ error: 'scenarioId는 필수입니다' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updateFields.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updateFields.name);
    }
    if (updateFields.testCode !== undefined) {
      setClauses.push('test_code = ?');
      params.push(updateFields.testCode);
    }
    if (updateFields.testData !== undefined) {
      setClauses.push('test_data = ?');
      params.push(JSON.stringify(updateFields.testData));
    }
    if (updateFields.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updateFields.status);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다' }, { status: 400 });
    }

    params.push(scenarioId);
    await run(`UPDATE test_scenario SET ${setClauses.join(', ')} WHERE scenario_id = ?`, params);

    return NextResponse.json({ success: true, message: '시나리오가 수정되었습니다' });
  } catch (error: any) {
    console.error('[test-automation/scenarios] PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 시나리오 삭제
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get('scenarioId');

    if (!scenarioId) {
      return NextResponse.json({ error: 'scenarioId는 필수입니다' }, { status: 400 });
    }

    await run('DELETE FROM test_scenario WHERE scenario_id = ?', [scenarioId]);

    return NextResponse.json({ success: true, message: '시나리오가 삭제되었습니다' });
  } catch (error: any) {
    console.error('[test-automation/scenarios] DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
