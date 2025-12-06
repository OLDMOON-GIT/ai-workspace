import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'all';
    const minScore = parseInt(searchParams.get('minScore') || '0');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // MySQL: using imported db

    // 통계 조회
    const stats = await db.prepare(`
      SELECT
        category,
        COUNT(*) as total,
        SUM(CASE WHEN used = 0 THEN 1 ELSE 0 END) as unused,
        AVG(score) as avg_score,
        MAX(score) as max_score
      FROM title_pool
      GROUP BY category
      ORDER BY category
    `).all();

    // 전체 개수 조회
    let countQuery = `SELECT COUNT(*) as total FROM title_pool WHERE score >= ?`;
    const countParams: any[] = [minScore];
    if (category !== 'all') {
      countQuery += ` AND category = ?`;
      countParams.push(category);
    }
    const totalCount = (await db.prepare(countQuery).get(...countParams) as any).total;

    // 제목 목록 조회 (페이지네이션)
    // ✅ 개발 가이드: SQL SELECT 시 AS alias로 camelCase 변환
    let titlesQuery = `
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
      titlesQuery += ` AND category = ?`;
      params.push(category);
    }

    titlesQuery += ` ORDER BY score DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const titles = await db.prepare(titlesQuery).all(...params);

    // MySQL: pool manages connections

    return NextResponse.json({
      stats,
      titles,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + titles.length < totalCount
      }
    });
  } catch (error: any) {
    console.error('제목 풀 조회 실패:', error);
    return NextResponse.json(
      { error: '제목 풀 조회 실패', details: error.message },
      { status: 500 }
    );
  }
}
