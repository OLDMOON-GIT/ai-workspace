import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';

/**
 * 공개 API - 개별 상품 조회
 * 인증 불필요 (Vercel 빌드 시 호출)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const product = await db.prepare(`
      SELECT
        coupang_id as coupangId, title, description, category, thumbnail_url, deep_link as deepLink,
        original_price as originalPrice, discount_price as discountPrice, view_count as viewCount, click_count as clickCount,
        created_at as createdAt
      FROM coupang_product
      WHERE coupang_id = ? AND status = 'active'
    `).get(id);

    if (!product) {
      return NextResponse.json(
        { error: '상품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ product });

  } catch (error: any) {
    console.error('❌ [공개 API] 상품 조회 오류:', error);
    return NextResponse.json(
      { error: '상품 조회 실패', details: error?.message },
      { status: 500 }
    );
  }
}

// CORS 허용
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
