import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

async function loadUserSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

function generateCoupangSignature(method: string, path: string, secretKey: string) {
  // Datetime format: yymmddTHHMMSSZ (GMT+0)
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  // Message format: datetime + method + path (no spaces)
  const message = datetime + method + path;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');

  return { datetime, signature };
}

// 쿠팡 카테고리를 사용자 정의 카테고리로 매핑
function mapCategory(coupangCategory: string): string {
  if (!coupangCategory) return '기타';

  const categoryMap: Record<string, string> = {
    // 패션/의류
    '패션의류': '패션',
    '남성패션': '패션',
    '여성패션': '패션',
    '신발': '패션',
    '가방': '패션',
    '잡화': '패션',
    '시계': '패션',
    '쥬얼리': '패션',

    // 뷰티
    '뷰티': '뷰티',
    '화장품': '뷰티',
    '향수': '뷰티',
    '헤어': '뷰티',
    '바디': '뷰티',

    // 식품
    '식품': '식품',
    '건강식품': '식품',
    '신선식품': '식품',
    '음료': '식품',
    '커피': '식품',

    // 생활용품
    '생활': '생활용품',
    '주방': '생활용품',
    '욕실': '생활용품',
    '청소': '생활용품',
    '세탁': '생활용품',
    '수납': '생활용품',

    // 디지털/가전
    '가전': '가전',
    '디지털': '디지털',
    '컴퓨터': '디지털',
    '노트북': '디지털',
    '태블릿': '디지털',
    '스마트폰': '디지털',
    '카메라': '디지털',
    '게임': '디지털',

    // 스포츠/레저
    '스포츠': '스포츠',
    '운동': '스포츠',
    '자전거': '스포츠',
    '캠핑': '스포츠',
    '등산': '스포츠',

    // 완구/취미
    '완구': '완구',
    '장난감': '완구',
    '취미': '완구',
    '악기': '완구',

    // 도서
    '도서': '도서',
    '책': '도서',

    // 반려동물
    '반려동물': '반려동물',
    '애완': '반려동물',
    '펫': '반려동물',

    // 자동차
    '자동차': '자동차',
    '카': '자동차',
    '오토': '자동차'
  };

  // 부분 매칭으로 카테고리 찾기
  const lowerCategory = coupangCategory.toLowerCase();
  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (lowerCategory.includes(keyword.toLowerCase())) {
      return category;
    }
  }

  return '기타';
}

function extractProductId(affiliateUrl: string): string | null {
  try {
    const url = new URL(affiliateUrl);

    // 1. pageKey 파라미터에서 추출 (affiliate 링크)
    const pageKey = url.searchParams.get('pageKey');
    if (pageKey) return pageKey;

    // 2. itemId 파라미터에서 추출
    const itemId = url.searchParams.get('itemId');
    if (itemId) return itemId;

    // 3. productId 파라미터에서 추출
    const productId = url.searchParams.get('productId');
    if (productId) return productId;

    // 4. URL 경로에서 추출 (/vp/products/{productId})
    const pathMatch = affiliateUrl.match(/\/vp\/products\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    console.error('상품 ID 추출 실패, URL:', affiliateUrl);
    return null;
  } catch (error) {
    console.error('URL 파싱 실패:', error);
    return null;
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨 딥링크 생성 함수 - 절대 수정 금지!                                     ║
 * ║                                                                           ║
 * ║  이 함수는 쿠팡 파트너스 API를 호출하여 딥링크를 생성합니다.              ║
 * ║  생성된 딥링크가 없으면 상품을 저장하면 안 됩니다!                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
async function generateDeeplink(affiliateUrl: string, accessKey: string, secretKey: string): Promise<string> {
  // affiliate URL에서 상품 ID 추출
  const productId = extractProductId(affiliateUrl);
  if (!productId) {
    console.error('❌ 상품 ID 추출 실패:', affiliateUrl);
    throw new Error(`상품 ID를 추출할 수 없습니다: ${affiliateUrl}`);
  }

  console.log('🔍 추출된 상품 ID (pageKey):', productId);

  // 일반 상품 URL 생성 (파트너스 태그 없는 순수 상품 URL)
  const productUrl = `https://www.coupang.com/vp/products/${productId}`;
  console.log('📦 일반 상품 URL:', productUrl);

  const REQUEST_METHOD = 'POST';
  const DOMAIN = 'https://api-gateway.coupang.com';
  const PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

  const { datetime, signature } = generateCoupangSignature(REQUEST_METHOD, PATH, secretKey);
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  console.log('🔑 딥링크 요청:', {
    url: DOMAIN + PATH,
    productUrl,
    datetime,
    signature: signature.substring(0, 10) + '...'
  });

  try {
    const response = await fetch(DOMAIN + PATH, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        coupangUrls: [productUrl]
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('📡 딥링크 API 응답:', JSON.stringify(data, null, 2));

      if (data.rCode === '0' && data.data && data.data[0]?.shortenUrl) {
        const deeplink = data.data[0].shortenUrl;
        console.log('✅ 사용자 딥링크 생성 성공:', deeplink);
        return deeplink;
      } else {
        console.error('❌ 딥링크 API 응답 오류:', data);
        throw new Error(`딥링크 생성 실패: ${data.rMessage || '알 수 없음'}`);
      }
    } else {
      const errorText = await response.text();
      console.error('❌ 딥링크 API HTTP 오류:', response.status, errorText);
      throw new Error(`딥링크 API 호출 실패 (${response.status}): ${errorText}`);
    }
  } catch (error: any) {
    console.error('❌ 딥링크 생성 중 오류:', error);
    throw new Error(`딥링크 생성 실패: ${error.message}`);
  }
}

interface Product {
  productId: string | number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  isRocket: boolean;
  rank?: number;
}

/**
 * POST /api/coupang/products/add
 * 베스트셀러 상품을 크롤링 없이 바로 상품관리에 등록
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨🚨🚨 절대 삭제 금지! DO NOT DELETE! 🚨🚨🚨                              ║
 * ║                                                                           ║
 * ║  딥링크 필수 규칙:                                                        ║
 * ║  1. 딥링크가 생성되지 않으면 내 목록에 절대 추가할 수 없음                ║
 * ║  2. 딥링크 생성 실패 시 해당 상품은 반드시 스킵해야 함                    ║
 * ║  3. 원본 URL(coupang.com/vp/products/...)은 딥링크가 아님!               ║
 * ║  4. 이 규칙을 무시하면 파트너스 수익이 발생하지 않음                      ║
 * ║                                                                           ║
 * ║  이 주석과 관련 로직을 절대 삭제하지 마세요!                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();

    // 단일 상품 또는 배열 처리
    let products: Product[];
    if (body.products) {
      products = body.products;
    } else if (body.productId) {
      // 단일 상품
      products = [body as Product];
    } else {
      return NextResponse.json({ error: '상품 정보가 없습니다.' }, { status: 400 });
    }

    if (products.length === 0) {
      return NextResponse.json({ error: '상품을 선택하세요.' }, { status: 400 });
    }

    // 사용자 설정 로드 (딥링크 생성용)
    const settings = await loadUserSettings(user.userId);
    if (!settings || !settings.accessKey || !settings.secretKey) {
      return NextResponse.json({ error: 'API 키를 먼저 설정하세요.' }, { status: 400 });
    }

    // MySQL: using imported db
    db.pragma('journal_mode = WAL');

    let addedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      for (const product of products) {
        try {
          // ⭐ 제목으로 중복 체크 먼저! (딥링크 생성 전에 확인)
          const existingByTitle = await db.prepare(`
            SELECT coupang_id FROM coupang_product
            WHERE title = ? AND user_id = ?
          `).get(product.productName, user.userId);

          if (existingByTitle) {
            console.log('⏭️  중복 상품 (제목):', product.productName);
            skippedCount++;
            continue; // 딥링크 생성 안하고 바로 스킵
          }

          // 제목 중복 아닐 때만 딥링크 생성
          console.log('🔗 딥링크 생성 중:', product.productUrl);
          let shortUrl: string;

          try {
            shortUrl = await generateDeeplink(product.productUrl, settings.accessKey, settings.secretKey);

            /**
             * ╔═══════════════════════════════════════════════════════════════════════════╗
             * ║  🚨🚨🚨 딥링크 검증 규칙 - 절대 삭제/수정 금지! 🚨🚨🚨                    ║
             * ║                                                                           ║
             * ║  ✅ 유효한 딥링크 형식 (단축 URL, 50자 이하):                             ║
             * ║     link.coupang.com/{1-2글자}/XXXXX                                      ║
             * ║     예: /a/, /b/, /ab/, /cL/ 등                                          ║
             * ║                                                                           ║
             * ║  ❌ 무효한 딥링크 형식 (모두 거부!):                                      ║
             * ║     - link.coupang.com/re/AFFSDP?... (긴 형식 - 딥링크 아님!)            ║
             * ║     - coupang.com/vp/products/... (일반 상품 URL)                        ║
             * ║     - 50자 초과 URL (딥링크가 아님!)                                     ║
             * ║                                                                           ║
             * ║  이 검증을 통과하지 못하면 상품 등록 불가!                                ║
             * ╚═══════════════════════════════════════════════════════════════════════════╝
             */
            const isValidDeepLink = shortUrl &&
              shortUrl.length <= 50 && // ⭐ 50자 제한 (단축 URL만 허용)
              shortUrl.includes('link.coupang.com/') &&
              !shortUrl.includes('/re/AFFSDP') &&
              !shortUrl.includes('?lptag=') &&
              !shortUrl.includes('?pageKey=');

            if (!isValidDeepLink) {
              console.error('❌ 딥링크 형식 오류 - 단축 URL(50자 이하)만 허용:', shortUrl, `(${shortUrl?.length}자)`);
              throw new Error(`유효하지 않은 딥링크: ${shortUrl}\n\n/re/AFFSDP 긴 형식은 딥링크가 아닙니다. 50자 이하 단축 URL만 허용.`);
            }

            console.log('✅ 사용자 딥링크:', shortUrl);
          } catch (deeplinkError: any) {
            const errorMsg = deeplinkError.message || '알 수 없는 오류';
            console.error(`❌ 딥링크 생성 실패 (${product.productName}):`, errorMsg);
            failedCount++;
            errors.push(`${product.productName}: 딥링크 생성 실패 - ${errorMsg}`);
            continue;
          }

          // 딥링크로도 중복 체크
          const existingByDeeplink = await db.prepare(`
            SELECT coupang_id FROM coupang_product
            WHERE deep_link = ? AND user_id = ?
          `).get(shortUrl, user.userId);

          if (existingByDeeplink) {
            console.log('⏭️  중복 상품 (딥링크):', product.productName);
            skippedCount++;
            continue;
          }

        // 고유 ID 생성
        const productId = `coupang_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

        // 카테고리 분류
        const mappedCategory = mapCategory(product.categoryName);
        console.log(`📂 카테고리: ${product.categoryName} → ${mappedCategory}`);

        // 상품 등록
        await db.prepare(`
          INSERT INTO coupang_product (
            coupang_id,
            user_id,
            product_url,
            deep_link,
            title,
            description,
            category,
            original_price,
            discount_price,
            thumbnail_url,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `).run(
          productId,
          user.userId,
          product.productUrl, // 원본 affiliate link
          shortUrl, // 딥링크 API로 생성한 사용자 딥링크
          product.productName,
          `${product.productName} - ${product.categoryName}`,
          mappedCategory, // 매핑된 카테고리
          product.productPrice,
          product.productPrice,
          product.productImage,
          'active'
        );

          console.log('✅ 상품 등록 완료:', product.productName);
          addedCount++;
        } catch (productError: any) {
          console.error(`❌ 상품 처리 실패 (${product.productName}):`, productError.message);
          failedCount++;
          errors.push(`${product.productName}: ${productError.message}`);
        }
      }

      // MySQL: pool manages connections

      return NextResponse.json({
        success: addedCount > 0,
        message: `${addedCount}개 상품이 등록되었습니다.${skippedCount > 0 ? ` (${skippedCount}개 중복 제외)` : ''}${failedCount > 0 ? ` (${failedCount}개 실패)` : ''}`,
        added: addedCount,
        skipped: skippedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      // MySQL: pool manages connections
      throw error;
    }

  } catch (error: any) {
    console.error('상품 등록 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '상품 등록 중 오류 발생'
    }, { status: 500 });
  }
}
