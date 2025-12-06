import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * DELETE /api/automation/titles/[id]
 * task 삭제 (FK cascade로 task_schedule, task_queue도 함께 삭제)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const taskId = id;

    // MySQL: using imported db

    // 1. task_schedule 삭제
    // 1. task_queue 삭제
    const queueResult = await db.prepare('DELETE FROM task_queue WHERE task_id = ?').run(taskId);

    // 2. task 삭제
    const result = await db.prepare('DELETE FROM task WHERE task_id = ?').run(taskId);

    // MySQL: pool manages connections

    console.log(`🗑️ [Task Delete] ${taskId} deleted (task: ${result.changes}, queue: ${queueResult.changes})`);

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error: any) {
    console.error('DELETE /api/automation/titles/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/automation/titles/[id]
 * 제목 상태 업데이트
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const titleId = id;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // MySQL: using imported db

    // content 상태 업데이트 (task_id = content_id)
    await db.prepare(`
      UPDATE content
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE content_id = ?
    `).run(status, titleId);

    // MySQL: pool manages connections

    console.log(`✅ [Title Status Update] ${titleId} → ${status}`);

    return NextResponse.json({
      success: true,
      message: 'Title status updated'
    });

  } catch (error: any) {
    console.error('PATCH /api/automation/titles/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
