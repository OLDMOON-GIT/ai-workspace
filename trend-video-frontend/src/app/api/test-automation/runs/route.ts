import { NextRequest, NextResponse } from 'next/server';
import { getAll, getOne, run } from '@/lib/mysql';
import { requireAuth } from '@/lib/auth-helper';

// GET: 테스트 실행 기록 조회
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const scenarioId = searchParams.get('scenarioId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    // 단일 실행 상세 조회
    if (runId) {
      const testRun = await getOne(`
        SELECT
          r.run_id as runId,
          r.scenario_id as scenarioId,
          r.run_type as runType,
          r.status,
          r.total_count as totalCount,
          r.passed_count as passedCount,
          r.failed_count as failedCount,
          r.skipped_count as skippedCount,
          r.duration_ms as durationMs,
          r.started_at as startedAt,
          r.completed_at as completedAt,
          r.log_path as logPath,
          r.screenshot_path as screenshotPath,
          r.video_path as videoPath,
          r.trace_path as tracePath,
          r.error_summary as errorSummary,
          r.metadata,
          r.created_at as createdAt,
          s.name as scenarioName
        FROM test_run r
        LEFT JOIN test_scenario s ON r.scenario_id = s.scenario_id
        WHERE r.run_id = ?
      `, [runId]);

      if (!testRun) {
        return NextResponse.json({ error: '테스트 실행 기록을 찾을 수 없습니다' }, { status: 404 });
      }

      // 상세 결과 조회
      const details = await getAll(`
        SELECT
          d.detail_id as detailId,
          d.scenario_id as scenarioId,
          d.status,
          d.duration_ms as durationMs,
          d.error_message as errorMessage,
          d.screenshot_path as screenshotPath,
          d.created_at as createdAt,
          s.name as scenarioName
        FROM test_run_detail d
        LEFT JOIN test_scenario s ON d.scenario_id = s.scenario_id
        WHERE d.run_id = ?
        ORDER BY d.created_at ASC
      `, [runId]);

      return NextResponse.json({
        run: {
          ...testRun,
          metadata: testRun.metadata ? (typeof testRun.metadata === 'string' ? JSON.parse(testRun.metadata) : testRun.metadata) : {}
        },
        details
      });
    }

    // 목록 조회
    let sql = `
      SELECT
        r.run_id as runId,
        r.scenario_id as scenarioId,
        r.run_type as runType,
        r.status,
        r.total_count as totalCount,
        r.passed_count as passedCount,
        r.failed_count as failedCount,
        r.skipped_count as skippedCount,
        r.duration_ms as durationMs,
        r.started_at as startedAt,
        r.completed_at as completedAt,
        r.error_summary as errorSummary,
        r.created_at as createdAt,
        s.name as scenarioName
      FROM test_run r
      LEFT JOIN test_scenario s ON r.scenario_id = s.scenario_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (scenarioId) {
      sql += ' AND r.scenario_id = ?';
      params.push(scenarioId);
    }
    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT ?';
    params.push(limit);

    const runs = await getAll(sql, params);

    return NextResponse.json({ runs });
  } catch (error: any) {
    console.error('[test-automation/runs] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 테스트 실행 시작
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const {
      scenarioId,
      runType = 'single',
      category,  // runType이 'category'일 때
      metadata = {}
    } = body;

    // 실행할 시나리오 목록 결정
    let scenarios: any[] = [];

    if (runType === 'single' && scenarioId) {
      const scenario = await getOne('SELECT * FROM test_scenario WHERE scenario_id = ?', [scenarioId]);
      if (!scenario) {
        return NextResponse.json({ error: '시나리오를 찾을 수 없습니다' }, { status: 404 });
      }
      scenarios = [scenario];
    } else if (runType === 'category' && category) {
      scenarios = await getAll(`
        SELECT s.* FROM test_scenario s
        JOIN test_usecase u ON s.usecase_id = u.usecase_id
        WHERE u.category = ? AND u.is_active = 1 AND s.status = 'ready'
      `, [category]);
    } else if (runType === 'all') {
      scenarios = await getAll(`
        SELECT s.* FROM test_scenario s
        JOIN test_usecase u ON s.usecase_id = u.usecase_id
        WHERE u.is_active = 1 AND s.status = 'ready'
      `);
    } else {
      return NextResponse.json({ error: '유효하지 않은 실행 유형입니다' }, { status: 400 });
    }

    if (scenarios.length === 0) {
      return NextResponse.json({ error: '실행할 시나리오가 없습니다' }, { status: 400 });
    }

    // 테스트 실행 레코드 생성
    const result = await run(
      `INSERT INTO test_run
       (scenario_id, run_type, status, total_count, started_at, metadata)
       VALUES (?, ?, 'pending', ?, NOW(), ?)`,
      [
        runType === 'single' ? scenarioId : null,
        runType,
        scenarios.length,
        JSON.stringify(metadata)
      ]
    );

    const runId = result.insertId;

    // 실제 테스트 실행은 별도 워커에서 처리
    // 여기서는 pending 상태로만 등록
    // TODO: WebSocket 또는 Polling으로 실행 상태 모니터링

    return NextResponse.json({
      success: true,
      runId,
      totalScenarios: scenarios.length,
      message: '테스트 실행이 예약되었습니다'
    });
  } catch (error: any) {
    console.error('[test-automation/runs] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: 테스트 실행 상태 업데이트 (내부용)
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { runId, ...updateFields } = body;

    if (!runId) {
      return NextResponse.json({ error: 'runId는 필수입니다' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updateFields.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updateFields.status);
    }
    if (updateFields.passedCount !== undefined) {
      setClauses.push('passed_count = ?');
      params.push(updateFields.passedCount);
    }
    if (updateFields.failedCount !== undefined) {
      setClauses.push('failed_count = ?');
      params.push(updateFields.failedCount);
    }
    if (updateFields.skippedCount !== undefined) {
      setClauses.push('skipped_count = ?');
      params.push(updateFields.skippedCount);
    }
    if (updateFields.durationMs !== undefined) {
      setClauses.push('duration_ms = ?');
      params.push(updateFields.durationMs);
    }
    if (updateFields.completedAt !== undefined) {
      setClauses.push('completed_at = ?');
      params.push(updateFields.completedAt);
    }
    if (updateFields.errorSummary !== undefined) {
      setClauses.push('error_summary = ?');
      params.push(updateFields.errorSummary);
    }
    if (updateFields.logPath !== undefined) {
      setClauses.push('log_path = ?');
      params.push(updateFields.logPath);
    }
    if (updateFields.screenshotPath !== undefined) {
      setClauses.push('screenshot_path = ?');
      params.push(updateFields.screenshotPath);
    }
    if (updateFields.videoPath !== undefined) {
      setClauses.push('video_path = ?');
      params.push(updateFields.videoPath);
    }
    if (updateFields.tracePath !== undefined) {
      setClauses.push('trace_path = ?');
      params.push(updateFields.tracePath);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다' }, { status: 400 });
    }

    params.push(runId);
    await run(`UPDATE test_run SET ${setClauses.join(', ')} WHERE run_id = ?`, params);

    return NextResponse.json({ success: true, message: '테스트 실행 상태가 업데이트되었습니다' });
  } catch (error: any) {
    console.error('[test-automation/runs] PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
