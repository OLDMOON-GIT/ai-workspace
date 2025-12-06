import { NextRequest, NextResponse } from 'next/server';
import { getUnusedTitleCandidates, getTitlePoolStats, markTitleAsUsed } from '@/lib/automation';

/**
 * GET: 미사용 제목 후보 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const minScore = parseInt(searchParams.get('minScore') || '0');

    // 통계 조회
    const stats = await getTitlePoolStats();

    // 미사용 제목 조회
    let titles: any[] = [];
    if (category && category !== 'all') {
      titles = await getUnusedTitleCandidates(category, limit, minScore);
    } else {
      // 전체 카테고리에서 조회
      for (const stat of stats) {
        const categoryTitles = await getUnusedTitleCandidates(stat.category, Math.ceil(limit / stats.length), minScore);
        titles.push(...categoryTitles);
      }
      // 점수순 정렬 후 limit 적용
      titles.sort((a, b) => b.score - a.score);
      titles = titles.slice(0, limit);
    }

    return NextResponse.json({
      titles,
      stats,
      total: titles.length
    });
  } catch (error: any) {
    console.error('Failed to get unused titles:', error);
    return NextResponse.json(
      { error: '미사용 제목 조회 실패', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST: 제목 사용 처리
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title } = body;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const success = await markTitleAsUsed(title);

    return NextResponse.json({
      success,
      message: success ? '제목이 사용 처리되었습니다' : '제목을 찾을 수 없습니다'
    });
  } catch (error: any) {
    console.error('Failed to mark title as used:', error);
    return NextResponse.json(
      { error: '제목 사용 처리 실패', details: error.message },
      { status: 500 }
    );
  }
}
