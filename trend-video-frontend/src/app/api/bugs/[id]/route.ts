import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { run } from '@/lib/mysql';

// PATCH: 버그 상태 업데이트
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
    const body = await request.json();
    const { status, resolutionNote, title, summary, type, priority, metadata } = body;

    // 허용된 상태 값 검증
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    // 허용된 타입 값 검증
    const validTypes = ['bug', 'spec'];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type value' },
        { status: 400 }
      );
    }

    // 허용된 우선순위 값 검증
    const validPriorities = ['P0', 'P1', 'P2', 'P3', null];
    if (priority !== undefined && priority !== null && !validPriorities.includes(priority)) {
      return NextResponse.json(
        { error: 'Invalid priority value' },
        { status: 400 }
      );
    }

    // 업데이트할 필드 구성
    const updates: string[] = [];
    const values: any[] = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }

    if (resolutionNote !== undefined) {
      updates.push('resolution_note = ?');
      values.push(resolutionNote);
    }

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }

    if (summary !== undefined) {
      updates.push('summary = ?');
      values.push(summary);
    }

    if (type !== undefined) {
      updates.push('type = ?');
      values.push(type);
    }

    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }

    // SPEC-3251: metadata 업데이트 지원 (재등록 횟수 등)
    if (metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    const query = `UPDATE bugs SET ${updates.join(', ')} WHERE id = ?`;

    await run(query, values);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/bugs/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 버그 삭제
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

    await run('DELETE FROM bugs WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/bugs/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
