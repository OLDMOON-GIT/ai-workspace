/**
 * @fileoverview 중단된 작업 수동 복구 API
 * @description 서버 재시작 없이 processing 상태로 멈춘 작업들을 복구
 */

import { NextRequest, NextResponse } from 'next/server';
import { recoverStaleProcessingJobs, recoverStaleJobsByTime } from '@/lib/startup-recovery';

/**
 * GET /api/admin/recover-stale-jobs
 * 모든 processing 상태 작업을 failed로 변경
 *
 * Query params:
 * - threshold: (선택) 분 단위, 이 시간 이상 멈춘 작업만 복구. 없으면 모든 processing 복구
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const threshold = searchParams.get('threshold');

    let result;

    if (threshold) {
      const minutes = parseInt(threshold, 10);
      if (isNaN(minutes) || minutes <= 0) {
        return NextResponse.json({ error: 'threshold must be a positive number' }, { status: 400 });
      }
      console.log(`🔧 [ADMIN] Stale job recovery triggered (threshold: ${minutes}분)`);
      result = await recoverStaleJobsByTime(minutes);
    } else {
      console.log('🔧 [ADMIN] Full processing job recovery triggered');
      result = await recoverStaleProcessingJobs();
    }

    return NextResponse.json({
      success: true,
      message: result.recoveredIds.length > 0
        ? `${result.recoveredIds.length}개의 작업이 복구되었습니다.`
        : '복구할 작업이 없습니다.',
      result
    });

  } catch (error: any) {
    console.error('❌ [ADMIN] Recovery error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Recovery failed'
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/recover-stale-jobs
 * 특정 작업 ID만 복구
 */
export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // 동적 임포트로 db 로드
    const db = (await import('@/lib/sqlite')).default;

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // content 테이블 업데이트 (BTS-3363: script/video 상태에서 복구)
    const contentResult = await db.prepare(`
      UPDATE content
      SET status = 'failed',
          error = '수동 복구됨',
          updated_at = ?
      WHERE content_id = ? AND status IN ('script', 'video')
    `).run(now, taskId);

    // task_queue 테이블 업데이트
    let queueResult = { changes: 0 };
    try {
      queueResult = await db.prepare(`
        UPDATE task_queue
        SET status = 'failed',
            error = '수동 복구됨',
            completed_at = ?
        WHERE task_id = ? AND status = 'processing'
      `).run(now, taskId);
    } catch (e) {}

    // task_schedule 테이블은 제거됨 (큐 스펙 v3)
    // task_queue만 업데이트하면 됨

    const totalChanges = contentResult.changes + queueResult.changes;

    console.log(`🔧 [ADMIN] Manual recovery for ${taskId}: ${totalChanges} rows updated`);

    return NextResponse.json({
      success: true,
      taskId,
      message: totalChanges > 0
        ? `작업 ${taskId}이(가) 복구되었습니다.`
        : `작업 ${taskId}은(는) 이미 복구되었거나 processing 상태가 아닙니다.`,
      changes: {
        content: contentResult.changes,
        queue: queueResult.changes
      }
    });

  } catch (error: any) {
    console.error('❌ [ADMIN] Manual recovery error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Recovery failed'
    }, { status: 500 });
  }
}
