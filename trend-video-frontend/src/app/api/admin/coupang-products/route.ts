import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAll } from '@/lib/mysql';

/**
 * GET - 모든 쿠팡 상품 조회
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨🚨🚨 절대 삭제 금지! DO NOT DELETE! 🚨🚨🚨                              ║
 * ║                                                                           ║
 * ║  딥링크 필터링 규칙 (WHERE 조건):                                         ║
 * ║  - deep_link IS NOT NULL                                                  ║
 * ║  - deep_link != ''                                                        ║
 * ║  - deep_link NOT LIKE '%coupang.com/vp/products%'                        ║
 * ║                                                                           ║
 * ║  이 조건들을 절대 삭제하지 마세요!                                        ║
 * ║  딥링크 없는 상품은 파트너스 수익이 발생하지 않음                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    /**
     * ╔═══════════════════════════════════════════════════════════════════════════╗
     * ║  🚨🚨🚨 딥링크 필터링 - 절대 삭제/수정 금지! 🚨🚨🚨                        ║
     * ║                                                                           ║
     * ║  ✅ 유효: link.coupang.com/{1-2글자}/XXXXX (단축 URL)                    ║
     * ║  ❌ 무효: link.coupang.com/re/AFFSDP?... (긴 형식 - 딥링크 아님!)        ║
     * ╚═══════════════════════════════════════════════════════════════════════════╝
     */
    const products = await getAll(`
      SELECT
        coupang_id as product_id,
        title as product_name,
        deep_link,
        product_url,
        thumbnail_url,
        category as category_id,
        category as category_name,
        original_price,
        discount_price,
        status,
        view_count,
        click_count,
        created_at
      FROM coupang_product
      WHERE status = 'active'
        AND deep_link IS NOT NULL
        AND deep_link != ''
        AND deep_link LIKE '%link.coupang.com/%'
        AND deep_link NOT LIKE '%/re/AFFSDP%'
        AND deep_link NOT LIKE '%?lptag=%'
      ORDER BY created_at DESC
    `);

    return NextResponse.json({
      success: true,
      products: products || []
    });

  } catch (error: any) {
    console.error('상품 조회 실패:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return NextResponse.json({
      success: false,
      error: error.message || '상품 조회 실패'
    }, { status: 500 });
  }
}
