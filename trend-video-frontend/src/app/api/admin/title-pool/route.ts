import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'all';
    const minScore = parseInt(searchParams.get('minScore') || '90');
    const limit = parseInt(searchParams.get('limit') || '100');

    // MySQL: using imported db

    let query = `
      SELECT
        title_id as titleId,
        title,
        category,
        score,
        ai_model as aiModel,
        used,
        created_at as createdAt
      FROM title_pool
      WHERE score >= ?
    `;
    const params: any[] = [minScore];

    if (category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY score DESC, created_at DESC LIMIT ?';
    params.push(limit);

    const titles = await db.prepare(query).all(...params);
    // MySQL: pool manages connections

    return NextResponse.json({ titles });

  } catch (error: any) {
    console.error('제목 풀 조회 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch title pool' },
      { status: 500 }
    );
  }
}
