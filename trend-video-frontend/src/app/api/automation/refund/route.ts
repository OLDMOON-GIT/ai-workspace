import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * GET /api/automation/refund
 * 환불 가능한 실패 작업 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // MySQL: using imported db

    // 실패한 큐 중 환불되지 않은 목록 조회 (task_schedule 제거됨)
    const failedJobs = await db.prepare(`
      SELECT
        t.task_id,
        t.created_at,
        t.updated_at,
        c.title,
        c.prompt_format,
        q.status as title_state,
        q.error as error_message
      FROM task t
      JOIN content c ON t.task_id = c.content_id
      LEFT JOIN task_queue q ON t.task_id = q.task_id
      WHERE q.status = 'failed'
      ORDER BY t.updated_at DESC
    `).all();

    // MySQL: pool manages connections

    return NextResponse.json({
      failedJobs,
      count: failedJobs.length
    });

  } catch (error: any) {
    console.error('GET /api/automation/refund error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/automation/refund
 * 수동 환불 처리
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, userId, amount, reason } = body;

    if (!taskId || !userId || !amount) {
      return NextResponse.json({
        error: 'Task ID, User ID, and amount are required'
      }, { status: 400 });
    }

    // MySQL: using imported db

    // 태스크 정보 확인 (v6: content 테이블에서 title, prompt_format 조회)
    const task = await db.prepare(`
      SELECT t.*, c.title, c.prompt_format, q.status
      FROM task t
      JOIN content c ON t.task_id = c.content_id
      LEFT JOIN task_queue q ON t.task_id = q.task_id
      WHERE t.task_id = ?
    `).get(taskId) as any;

    if (!task) {
      // MySQL: pool manages connections
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.status !== 'failed') {
      // MySQL: pool manages connections
      return NextResponse.json({
        error: 'Only failed tasks can be refunded'
      }, { status: 400 });
    }

    // 사용자 크레딧 증가
    await db.prepare(`
      UPDATE user
      SET credits = credits + ?
      WHERE user_id = ?
    `).run(amount, userId);

    // 환불 기록 저장
    await db.prepare(`
      INSERT INTO credit_transactions (
        user_id,
        amount,
        type,
        description,
        created_at
      ) VALUES (?, ?, 'refund', ?, CURRENT_TIMESTAMP)
    `).run(
      userId,
      amount,
      reason || `자동화 작업 실패 환불: ${task.title} (${task.prompt_format})`
    );

    // task_queue 상태를 cancelled로 변경
    await db.prepare(`
      UPDATE task_queue SET status = 'cancelled', error = NULL WHERE task_id = ?
    `).run(taskId);

    // MySQL: pool manages connections

    console.log(`💰 [Refund] ${amount} credits refunded to user ${userId} for task ${taskId}`);

    return NextResponse.json({
      success: true,
      message: 'Refund processed successfully',
      refundedAmount: amount
    });

  } catch (error: any) {
    console.error('POST /api/automation/refund error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
