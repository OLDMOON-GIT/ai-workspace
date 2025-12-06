import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { generateDeeplink, loadUserSettings } from '@/lib/coupang-deeplink';

/**
 * 대기 목록 개별 상품 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { id } = await params;

    await db.prepare(`
      DELETE FROM product_crawl_link
      WHERE link_id = ? AND user_id = ?
    `).run(id, user.userId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ 대기 목록 삭제 오류:', error);
    return NextResponse.json(
      { error: error?.message || '삭제 실패' },
      { status: 500 }
    );
  }
}

/**
 * 대기 목록 → 내 목록 이동
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'move-to-main') {
      // 대기 목록에서 상품 조회
      const pending = await db.prepare(`
        SELECT * FROM product_crawl_link
        WHERE link_id = ? AND user_id = ?
      `).get(id, user.userId) as any;

      if (!pending) {
        return NextResponse.json(
          { error: '상품을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 딥링크 생성
      const settings = await loadUserSettings(user.userId);
      let deepLink: string | null = null;

      if (settings && settings.accessKey && settings.secretKey) {
        try {
          deepLink = await generateDeeplink(pending.product_url, settings.accessKey, settings.secretKey);
          console.log('✅ 딥링크 생성 성공:', deepLink);
        } catch (error: any) {
          console.warn('❌ 딥링크 생성안됨:', error.message);
        }
      } else {
        console.warn('❌ 쿠팡 API 설정 없음 - 딥링크 생성 불가');
      }

      /**
       * 🚨🚨🚨 딥링크 검증 - 절대 삭제/수정 금지! 🚨🚨🚨
       * ✅ 유효: link.coupang.com/{1-2글자}/XXXXX (단축 URL)
       * ❌ 무효: link.coupang.com/re/AFFSDP?... (긴 형식)
       */
      const isValidDeepLink = deepLink &&
        deepLink.includes('link.coupang.com/') &&
        !deepLink.includes('/re/AFFSDP') &&
        !deepLink.includes('?lptag=') &&
        !deepLink.includes('?pageKey=');

      if (!isValidDeepLink) {
        console.error('❌ 딥링크 형식 오류 - 단축 URL만 허용:', deepLink);
        return NextResponse.json({
          success: false,
          error: `딥링크 형식 오류: ${deepLink}\n\n/re/AFFSDP 긴 형식은 딥링크가 아닙니다.`
        }, { status: 400 });
      }

      // 중복체크: 제목으로만 확인 (URL은 형식이 달라서 비교 불가)
      const productTitle = pending.title || '상품명';
      const existingByTitle = await db.prepare(`
        SELECT coupang_id FROM coupang_product WHERE user_id = ? AND title = ?
      `).get(user.userId, productTitle) as any;

      if (existingByTitle) {
        // 대기 목록에서 삭제 (중복이어도 대기 목록에서는 제거)
        await db.prepare(`DELETE FROM product_crawl_link WHERE link_id = ?`).run(id);
        return NextResponse.json({
          success: false,
          error: `이미 등록된 상품입니다 (제목 중복): ${productTitle}`
        }, { status: 409 });
      }

      // coupang_product에 추가
      const { v4: uuidv4 } = await import('uuid');
      const productId = uuidv4();

      await db.prepare(`
        INSERT INTO coupang_product (
          coupang_id, user_id, product_url, deep_link, title, description,
          category, original_price, discount_price, thumbnail_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        productId,
        user.userId,
        pending.product_url,
        deepLink, // 생성된 딥링크 또는 원본 URL
        productTitle,
        pending.description || '',
        pending.category || '기타',
        pending.original_price || null,
        pending.discount_price || null,
        pending.thumbnail_url || ''
      );

      // 대기 목록에서 삭제
      await db.prepare(`
        DELETE FROM product_crawl_link WHERE link_id = ?
      `).run(id);

      console.log(`✅ 대기 목록 → 내 목록 이동: ${productId}`);

      return NextResponse.json({
        success: true,
        productId,
        message: '내 목록으로 이동되었습니다.'
      });
    }

    return NextResponse.json(
      { error: '알 수 없는 액션' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('❌ 대기 목록 처리 오류:', error);
    return NextResponse.json(
      { error: error?.message || '처리 실패' },
      { status: 500 }
    );
  }
}
