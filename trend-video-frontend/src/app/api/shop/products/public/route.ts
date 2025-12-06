import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/mysql';

type SnapshotProduct = {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  category: string;
  original_price?: number;
  discount_price?: number;
  thumbnail_url?: string;
  deep_link?: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const category = searchParams.get('category');
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.max(1, Math.min(limitParam, 200));

    const products = await getProducts();

    const filtered = products
      .filter((product) => {
        if (userId && product.user_id !== userId) return false;
        if (category && product.category !== category) return false;
        return true;
      })
      .slice(0, limit);

    // 사용자 닉네임 가져오기
    let nickname: string | undefined;
    if (userId) {
      const [rows] = await db.query('SELECT nickname FROM user WHERE user_id = ?', [userId]) as any[];
      const userInfo = rows[0] as { nickname?: string } | undefined;
      nickname = userInfo?.nickname;
    } else if (filtered.length > 0 && filtered[0].user_id) {
      // userId가 없으면 첫 번째 상품의 user_id로 조회
      const [rows] = await db.query('SELECT nickname FROM user WHERE user_id = ?', [filtered[0].user_id]) as any[];
      const userInfo = rows[0] as { nickname?: string } | undefined;
      nickname = userInfo?.nickname;
    }

    return NextResponse.json(
      {
        success: true,
        products: filtered,
        count: filtered.length,
        nickname: nickname,
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error: any) {
    console.error('공개 상품 목록 조회 실패:', error);
    return NextResponse.json(
      { error: error?.message || '상품 목록 조회 실패' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}

async function getProducts(): Promise<SnapshotProduct[]> {
  // 실시간 published 상품 반환
  const [rows] = await db.query(`
    SELECT
      coupang_id as coupangId,
      user_id as userId,
      title,
      description,
      category,
      original_price as originalPrice,
      discount_price as discountPrice,
      thumbnail_url as imageUrl,
      deep_link as deepLink,
      created_at as createdAt
    FROM coupang_product
    WHERE status IN ('active', 'published')
    ORDER BY created_at DESC
  `);

  const products = rows as SnapshotProduct[];

  // snake_case → camelCase 변환 (shop-html.ts 호환)
  return products.map((p: any) => ({
    ...p,
    coupangId: p.id,
    imageUrl: p.thumbnail_url || p.imageUrl,
    deepLink: p.deep_link,
    originalPrice: p.original_price,
    discountPrice: p.discount_price,
  }));
}
