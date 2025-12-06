import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

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
    // MySQL: using imported db

    await db.prepare('DELETE FROM title_pool WHERE title_id = ?').run(id);
    // MySQL: pool manages connections

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('제목 삭제 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete title' },
      { status: 500 }
    );
  }
}

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
    const { used, title, category, score } = body;

    // MySQL: using imported db

    // 업데이트할 필드 동적 구성
    const updates: string[] = [];
    const values: any[] = [];

    if (used !== undefined) {
      updates.push('used = ?');
      values.push(used);
    }
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (score !== undefined) {
      updates.push('score = ?');
      values.push(score);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    const sql = `UPDATE title_pool SET ${updates.join(', ')} WHERE title_id = ?`;

    console.log(`📝 [PATCH /api/admin/title-pool/${id}] 수정:`, { title, category, score, used });

    await db.prepare(sql).run(...values);
    // MySQL: pool manages connections

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('제목 수정 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update title' },
      { status: 500 }
    );
  }
}
