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
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + method + path;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');

  return { datetime, signature };
}

function extractProductId(url: string): string | null {
  if (!url) return null;
  try {
    // coupang_id가 숫자면 그대로 사용
    if (/^\d+$/.test(url)) {
      return url;
    }

    const urlObj = new URL(url);

    // pageKey 파라미터
    const pageKey = urlObj.searchParams.get('pageKey');
    if (pageKey) return pageKey;

    // itemId 파라미터
    const itemId = urlObj.searchParams.get('itemId');
    if (itemId) return itemId;

    // productId 파라미터
    const productId = urlObj.searchParams.get('productId');
    if (productId) return productId;

    // URL 경로에서 추출 (/vp/products/{productId})
    const pathMatch = url.match(/\/vp\/products\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    return null;
  } catch {
    return null;
  }
}

async function generateDeeplink(productId: string, accessKey: string, secretKey: string): Promise<string> {
  const productUrl = `https://www.coupang.com/vp/products/${productId}`;

  const REQUEST_METHOD = 'POST';
  const DOMAIN = 'https://api-gateway.coupang.com';
  const PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

  const { datetime, signature } = generateCoupangSignature(REQUEST_METHOD, PATH, secretKey);
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

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
    if (data.rCode === '0' && data.data && data.data[0]?.shortenUrl) {
      return data.data[0].shortenUrl;
    }
    throw new Error(`딥링크 생성 실패: ${data.rMessage || '알 수 없음'}`);
  }

  const errorText = await response.text();
  throw new Error(`API 호출 실패 (${response.status}): ${errorText}`);
}

/**
 * POST /api/coupang/products/regenerate-deeplinks
 * deep_link가 없는 상품들의 딥링크를 재생성
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const settings = await loadUserSettings(user.userId);
    if (!settings || !settings.accessKey || !settings.secretKey) {
      return NextResponse.json({ error: 'API 키를 먼저 설정하세요.' }, { status: 400 });
    }

    // MySQL: using imported db
    db.pragma('journal_mode = WAL');

    // deep_link가 없는 상품 조회
    const products = await db.prepare(`
      SELECT coupang_id, product_url, title
      FROM coupang_product
      WHERE user_id = ? AND (deep_link IS NULL OR deep_link = '')
    `).all(user.userId) as { coupang_id: string; product_url: string; title: string }[];

    console.log(`🔄 딥링크 재생성 대상: ${products.length}개`);

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const product of products) {
      try {
        // product_url 또는 coupang_id에서 상품 ID 추출
        let productId = extractProductId(product.product_url);

        // product_url에서 추출 실패시 coupang_id 사용
        if (!productId && /^\d+$/.test(product.coupang_id)) {
          productId = product.coupang_id;
        }

        if (!productId) {
          console.error(`❌ 상품 ID 추출 실패: ${product.title}`);
          failCount++;
          errors.push(`${product.title}: 상품 ID 추출 실패`);
          continue;
        }

        console.log(`🔗 딥링크 생성 중: ${product.title} (${productId})`);

        const deepLink = await generateDeeplink(productId, settings.accessKey, settings.secretKey);

        await db.prepare(`
          UPDATE coupang_product
          SET deep_link = ?, updated_at = NOW()
          WHERE coupang_id = ? AND user_id = ?
        `).run(deepLink, product.coupang_id, user.userId);

        console.log(`✅ 딥링크 생성 완료: ${product.title} → ${deepLink}`);
        successCount++;

        // API 속도 제한 방지
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error: any) {
        console.error(`❌ 딥링크 생성 실패 (${product.title}):`, error.message);
        failCount++;
        errors.push(`${product.title}: ${error.message}`);
      }
    }

    // MySQL: pool manages connections

    return NextResponse.json({
      success: true,
      message: `${successCount}개 딥링크 생성 완료${failCount > 0 ? `, ${failCount}개 실패` : ''}`,
      total: products.length,
      successCount,
      failed: failCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('딥링크 재생성 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '딥링크 재생성 중 오류 발생'
    }, { status: 500 });
  }
}

/**
 * GET /api/coupang/products/regenerate-deeplinks
 * deep_link가 없는 상품 수 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // MySQL: using imported db

    const result = await db.prepare(`
      SELECT COUNT(*) as count
      FROM coupang_product
      WHERE user_id = ? AND (deep_link IS NULL OR deep_link = '')
    `).get(user.userId) as { count: number };

    // MySQL: pool manages connections

    return NextResponse.json({
      count: result.count,
      message: `딥링크 없는 상품: ${result.count}개`
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
