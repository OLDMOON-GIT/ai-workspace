import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

// 사용자 쿠팡 API 설정 로드
async function loadUserSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

// 쿠팡 API 서명 생성
function generateCoupangSignature(method: string, apiPath: string, accessKey: string, secretKey: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + method + apiPath;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { authorization };
}

// 딥링크 생성
async function generateDeepLink(productUrl: string, userId: string): Promise<string | null> {
  const settings = await loadUserSettings(userId);
  if (!settings || !settings.accessKey || !settings.secretKey) {
    console.error('❌ 쿠팡 API 키 미설정');
    return null;
  }

  const REQUEST_METHOD = 'POST';
  const DOMAIN = 'https://api-gateway.coupang.com';
  const PATH = '/v2/providers/affiliate_open_api/apis/openapi/deeplink';

  const { authorization } = generateCoupangSignature(REQUEST_METHOD, PATH, settings.accessKey, settings.secretKey);

  console.log('🔗 딥링크 생성 요청:', productUrl);

  const response = await fetch(DOMAIN + PATH, {
    method: REQUEST_METHOD,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ coupangUrls: [productUrl] })
  });

  if (response.ok) {
    const data = await response.json();
    if (data.rCode === '0' && data.data && data.data.length > 0) {
      const deepLink = data.data[0].shortenUrl;
      console.log('✅ 딥링크 생성 성공:', deepLink);
      return deepLink;
    }
  }

  console.error('❌ 딥링크 생성 실패');
  return null;
}

/**
 * PATCH /api/coupang-products/[id] - 상품 정보 수정
 * ⭐ product_url 변경 시 자동으로 새 딥링크 생성
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { id: productId } = await params;
    const body = await request.json();
    const { title, description, category, original_price, discount_price, thumbnail_url, product_url } = body;

    // 상품 소유권 확인
    const product = await db.prepare('SELECT * FROM coupang_product WHERE coupang_id = ?').get(productId) as any;

    if (!product) {
      return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });
    }

    if (product.user_id !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    // 업데이트할 필드 준비
    const updates: string[] = [];
    const values: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (original_price !== undefined) {
      updates.push('original_price = ?');
      values.push(original_price);
    }
    if (discount_price !== undefined) {
      updates.push('discount_price = ?');
      values.push(discount_price);
    }
    if (thumbnail_url !== undefined) {
      updates.push('thumbnail_url = ?');
      values.push(thumbnail_url);
    }

    // ⭐ 상품 URL 변경 시 새 딥링크 자동 생성
    if (product_url !== undefined && product_url !== product.product_url) {
      console.log('🔄 상품 URL 변경 감지:', product.product_url, '->', product_url);

      // 새 딥링크 생성
      const newDeepLink = await generateDeepLink(product_url, user.userId);

      if (newDeepLink) {
        updates.push('product_url = ?');
        values.push(product_url);
        updates.push('deep_link = ?');
        values.push(newDeepLink);
        console.log('✅ 딥링크 업데이트 완료:', newDeepLink);
      } else {
        return NextResponse.json({
          error: '딥링크 생성에 실패했습니다. 쿠팡 API 키를 확인해주세요.'
        }, { status: 400 });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: '수정할 내용이 없습니다' }, { status: 400 });
    }

    updates.push('updated_at = datetime("now")');
    values.push(productId);

    // 상품 정보 업데이트
    await db.prepare(`
      UPDATE coupang_product
      SET ${updates.join(', ')}
      WHERE coupang_id = ?
    `).run(...values);

    return NextResponse.json({ success: true, message: '상품이 수정되었습니다' });

  } catch (error: any) {
    console.error('상품 수정 실패:', error);
    return NextResponse.json({ error: '상품 수정에 실패했습니다' }, { status: 500 });
  }
}

/**
 * DELETE /api/coupang-products/[id] - 상품 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { id: productId } = await params;

    // 상품 소유권 확인
    const product = await db.prepare('SELECT * FROM coupang_product WHERE coupang_id = ?').get(productId) as any;

    if (!product) {
      return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });
    }

    if (product.user_id !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    // 상품 삭제
    await db.prepare('DELETE FROM coupang_product WHERE coupang_id = ?').run(productId);

    return NextResponse.json({ success: true, message: '상품이 삭제되었습니다' });

  } catch (error: any) {
    console.error('상품 삭제 실패:', error);
    return NextResponse.json({ error: '상품 삭제에 실패했습니다' }, { status: 500 });
  }
}
