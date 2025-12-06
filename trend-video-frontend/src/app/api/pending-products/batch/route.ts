import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getOne, run } from '@/lib/mysql';
import { v4 as uuidv4 } from 'uuid';
import { generateDeeplink, loadUserSettings } from '@/lib/coupang-deeplink';
import { addContentLog } from '@/lib/content';

/**
 * DELETE - 작업 중지
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 작업 중지 요청: ${taskId}`);

    // 소유자 확인 (jobs → contents 통합)
    const job = await getOne(`
      SELECT *, content_id as contentId FROM content WHERE content_id = ? AND user_id = ?
    `, [taskId, user.userId]) as any;

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없거나 권한이 없습니다.' },
        { status: 404 }
      );
    }

    // 이미 완료/실패된 작업은 중지할 수 없음
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json(
        { error: '이미 완료된 작업은 중지할 수 없습니다.' },
        { status: 400 }
      );
    }

    // status를 cancelled로 업데이트
    await run(`
      UPDATE content
      SET status = 'cancelled', updated_at = NOW()
      WHERE content_id = ?
    `, [taskId]);

    // 중지 로그 추가
    addContentLog(taskId, '🛑 사용자가 작업을 중지했습니다.');

    console.log(`✅ 작업 ${taskId} 중지됨`);

    return NextResponse.json({
      success: true,
      message: '작업이 중지되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 작업 중지 오류:', error);
    return NextResponse.json(
      { error: error?.message || '작업 중지 실패' },
      { status: 500 }
    );
  }
}

/**
 * 일괄 처리 API
 * - 여러 대기 상품을 한 번에 내 목록으로 이동
 * - 일괄 크롤링 + AI 처리
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: '처리할 상품을 선택해주세요.' },
        { status: 400 }
      );
    }

    console.log(`🚀 일괄 처리 시작: ${ids.length}개 상품, 액션: ${action}`);

    if (action === 'move-all-to-main') {
      // Job 생성 (jobs → contents 통합)
      const taskId = uuidv4();
      await run(`
        INSERT INTO content (
          content_id, user_id, status, step, title, prompt_format
        ) VALUES (?, ?, 'processing', '준비 중', '상품 일괄 이동', 'product_batch')
      `, [taskId, user.userId]);

      // 초기 로그
      addContentLog(taskId, `🚀 ${ids.length}개 상품 일괄 이동 시작`);

      // 즉시 taskId 반환
      const response = NextResponse.json({
        success: true,
        taskId,
        message: '백그라운드에서 처리 중입니다.'
      });

      // 백그라운드 작업 시작 (응답 후에도 계속 실행)
      processProductBatch(taskId, user.userId, ids).catch(error => {
        console.error('❌ 백그라운드 작업 실패:', error);
      });

      return response;
    }

    if (action === 'delete-all') {
      // 일괄 삭제
      const placeholders = ids.map(() => '?').join(',');
      const result = await run(`
        DELETE FROM product_crawl_link
        WHERE link_id IN (${placeholders}) AND user_id = ?
      `, [...ids, user.userId]);

      return NextResponse.json({
        success: true,
        deletedCount: result.affectedRows,
        message: `${result.affectedRows}개 상품이 삭제되었습니다.`
      });
    }

    return NextResponse.json(
      { error: '알 수 없는 액션' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('❌ 일괄 처리 오류:', error);
    return NextResponse.json(
      { error: error?.message || '일괄 처리 실패' },
      { status: 500 }
    );
  }
}

/**
 * 백그라운드 상품 일괄 처리
 */
async function processProductBatch(taskId: string, userId: string, ids: string[]) {
  let successCount = 0;
  let failCount = 0;
  const totalCount = ids.length;

  try {
    for (let i = 0; i < ids.length; i++) {
      const pendingId = ids[i];
      const currentIndex = i + 1;

      // 중지 요청 확인 (jobs → contents 통합)
      const jobStatus = await getOne('SELECT status FROM content WHERE content_id = ?', [taskId]) as { status: string } | undefined;
      if (jobStatus?.status === 'cancelled') {
        console.log(`🛑 작업 ${taskId} 중지 요청됨`);
        addContentLog(taskId, `🛑 사용자 요청으로 작업 중지됨 (${currentIndex - 1}/${totalCount} 완료)`);
        return; // 루프 종료
      }

      try {
        // 진행 상태 업데이트 (step만 업데이트, progress 컬럼 제거됨)
        await run(`
          UPDATE content
          SET step = ?, updated_at = NOW()
          WHERE content_id = ?
        `, [`🖼️ [${currentIndex}/${totalCount}] 상품 정보 크롤링 중...`, taskId]);

        // 로그 추가
        addContentLog(taskId, `🖼️ [${currentIndex}/${totalCount}] 상품 정보 크롤링 중...`);

        // 대기 목록에서 조회
        const pending = await getOne(`
          SELECT * FROM product_crawl_link
          WHERE link_id = ? AND user_id = ?
        `, [pendingId, userId]) as any;

        if (!pending) {
          failCount++;
          addContentLog(taskId, `❌ [${currentIndex}/${totalCount}] 실패: 상품을 찾을 수 없음`);
          continue;
        }

        // 상품 정보 크롤링 (기본 정보만)
        let productInfo = {
          title: pending.title || '상품명',
          description: pending.description || '',
          imageUrl: pending.thumbnail_url || '',
          originalPrice: pending.original_price,
          discountPrice: pending.discount_price
        };

        // 상품 URL에서 정보 추출 시도
        if (!pending.title) {
          try {
            const scrapeResult = await scrapeBasicInfo(pending.product_url);
            productInfo = { ...productInfo, ...scrapeResult };
          } catch (error) {
            console.warn('⚠️ 크롤링 실패, 기본값 사용:', pendingId);
            addContentLog(taskId, `⚠️ [${currentIndex}/${totalCount}] 크롤링 실패, 기본값 사용`);
          }
        }

        // 딥링크 생성
        const settings = await loadUserSettings(userId);
        let deepLink: string | null = null;
        let deeplinkFailed = false;

        if (settings && settings.accessKey && settings.secretKey) {
          try {
            deepLink = await generateDeeplink(pending.product_url, settings.accessKey, settings.secretKey);
            console.log(`✅ [${currentIndex}/${totalCount}] 딥링크 생성 성공`);
          } catch (error: any) {
            console.warn(`❌ [${currentIndex}/${totalCount}] 딥링크 생성안됨:`, error.message);
            deeplinkFailed = true;
            addContentLog(taskId, `❌ [${currentIndex}/${totalCount}] 딥링크 생성안됨 (등록 스킵): ${error.message}`);
          }
        } else {
          console.warn(`❌ [${currentIndex}/${totalCount}] 쿠팡 API 설정 없음 - 딥링크 생성 불가`);
          deeplinkFailed = true;
          addContentLog(taskId, `❌ [${currentIndex}/${totalCount}] 쿠팡 API 설정 없음 (등록 스킵)`);
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

        if (deeplinkFailed || !isValidDeepLink) {
          console.log(`🚫 [${currentIndex}/${totalCount}] 딥링크 검증 실패 - 등록 스킵: ${productInfo.title}`);
          console.log(`   딥링크: ${deepLink}`);
          addContentLog(taskId, `❌ [${currentIndex}/${totalCount}] 딥링크 형식 오류 (단축 URL만 허용)`);
          // 대기 목록에서는 삭제 (다시 처리 안 함)
          await run(`DELETE FROM product_crawl_link WHERE link_id = ?`, [pendingId]);
          failCount++;
          continue;
        }

        // 중복체크: 제목으로만 확인 (URL은 형식이 달라서 비교 불가)
        const existingByTitle = await getOne(`
          SELECT coupang_id FROM coupang_product WHERE user_id = ? AND title = ?
        `, [userId, productInfo.title]) as any;

        if (existingByTitle) {
          addContentLog(taskId, `⏸️ [${currentIndex}/${totalCount}] 이미 등록된 상품 (제목 중복): ${productInfo.title}`);
          // 대기 목록에서 삭제 (중복이어도 대기 목록에서는 제거)
          await run(`DELETE FROM product_crawl_link WHERE link_id = ?`, [pendingId]);
          continue;
        }

        // 내 목록에 추가
        const productId = uuidv4();
        await run(`
          INSERT INTO coupang_product (
            coupang_id, user_id, product_url, deep_link, title, description,
            category, original_price, discount_price, thumbnail_url, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
          productId,
          userId,
          pending.product_url,
          deepLink, // 생성된 딥링크 또는 원본 URL
          productInfo.title,
          productInfo.description,
          pending.category || '기타',
          productInfo.originalPrice || null,
          productInfo.discountPrice || null,
          productInfo.imageUrl
        ]);

        // 대기 목록에서 삭제
        await run(`
          DELETE FROM product_crawl_link WHERE link_id = ?
        `, [pendingId]);

        successCount++;
        addContentLog(taskId, `✅ [${currentIndex}/${totalCount}] 성공: ${productInfo.title}`);

      } catch (error: any) {
        console.error(`❌ 상품 ${pendingId} 처리 실패:`, error);
        failCount++;
        addContentLog(taskId, `❌ [${currentIndex}/${totalCount}] 실패: ${error.message}`);
      }
    }

    // 작업 완료 (progress 컬럼 제거됨)
    await run(`
      UPDATE content
      SET status = 'completed', step = '완료', updated_at = NOW()
      WHERE content_id = ?
    `, [taskId]);

    addContentLog(taskId, `✅ 일괄 처리 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    console.log(`✅ Job ${taskId} 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

  } catch (error: any) {
    console.error(`❌ Job ${taskId} 실패:`, error);
    await run(`
      UPDATE content
      SET status = 'failed', error = ?, updated_at = NOW()
      WHERE content_id = ?
    `, [error.message, taskId]);

    addContentLog(taskId, `❌ 작업 실패: ${error.message}`);
  }
}

/**
 * 기본 정보 크롤링 (간단히)
 */
async function scrapeBasicInfo(productUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 제한 (쿠팡 파트너스 링크는 느림)

    const response = await fetch(productUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    const html = await response.text();

    // Open Graph 태그에서 정보 추출
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

    return {
      title: titleMatch ? titleMatch[1] : '상품명',
      description: descMatch ? descMatch[1] : '',
      imageUrl: imageMatch ? imageMatch[1] : ''
    };
  } catch (error) {
    return {
      title: '상품명',
      description: '',
      imageUrl: ''
    };
  }
}
