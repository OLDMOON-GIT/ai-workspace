import { NextRequest, NextResponse } from 'next/server';
import { getAll, run } from '@/lib/mysql';

interface AdminTask {
  id: string;
  content: string;
  status: 'todo' | 'ing' | 'done';
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  logs?: string;
}

// GET /api/tasks - 관리자 작업 목록 조회
export async function GET(request: NextRequest) {
  try {
    // admin_task 테이블이 없으면 빈 배열 반환
    // 테이블이 있으면 조회
    const tasks = await getAll<AdminTask>(`
      SELECT
        id,
        content,
        status,
        priority,
        created_at as createdAt,
        updated_at as updatedAt,
        completed_at as completedAt,
        logs
      FROM admin_task
      ORDER BY priority DESC, created_at DESC
    `).catch(() => []);

    // logs를 배열로 변환
    const tasksWithLogs = tasks.map(task => {
      let logs = [];
      try {
        if (task.logs) {
          logs = JSON.parse(task.logs);
        }
      } catch (e) {
        // ignore parse error and leave logs as empty array
      }
      return {
        ...task,
        logs,
      };
    });

    return NextResponse.json({ tasks: tasksWithLogs });
  } catch (error) {
    console.error('Error fetching admin tasks:', error);
    // 테이블이 없거나 에러 시 빈 배열 반환
    return NextResponse.json({ tasks: [] });
  }
}

// POST /api/tasks - 새 작업 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, priority = 0 } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: '작업 내용을 입력해주세요' }, { status: 400 });
    }

    const id = `TASK-${Date.now()}`;

    await run(`
      INSERT INTO admin_task (id, content, status, priority, created_at, updated_at)
      VALUES (?, ?, 'todo', ?, NOW(), NOW())
    `, [id, content.trim(), priority]);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error creating admin task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

// PUT /api/tasks - 작업 상태 업데이트
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, content, priority } = body;

    if (!id) {
      return NextResponse.json({ error: '작업 ID가 필요합니다' }, { status: 400 });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);

      if (status === 'done') {
        updates.push('completed_at = NOW()');
      }
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }

    params.push(id);

    await run(`
      UPDATE admin_task
      SET ${updates.join(', ')}
      WHERE id = ?
    `, params);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating admin task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks - 작업 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '작업 ID가 필요합니다' }, { status: 400 });
    }

    await run('DELETE FROM admin_task WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting admin task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
