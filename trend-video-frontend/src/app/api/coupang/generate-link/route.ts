import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');
const COUPANG_LINKS_FILE = path.join(DATA_DIR, 'coupang-links.json');

async function loadUserSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

async function loadAllLinks() {
  try {
    const data = await fs.readFile(COUPANG_LINKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveLinks(links: any[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(COUPANG_LINKS_FILE, JSON.stringify(links, null, 2), 'utf-8');
}

/**
 * 🚨🚨🚨 쿠팡 API HMAC 서명 - datetime 형식 절대 수정 금지! 🚨🚨🚨
 * ✅ 올바른 형식: yymmddTHHMMSSZ (예: 241129T051204Z)
 * ❌ 잘못된 형식: 2024-11-29T05:12:04Z (ISO 형식 - 절대 사용 금지!)
 *
 * toISOString().slice() 사용하면 "HMAC format is invalid" 에러 발생!
 */
function generateCoupangSignature(method: string, url: string, secretKey: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  const message = datetime + method + url;
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return { datetime, signature };
}

// POST - 파트너스 링크 생성
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const settings = await loadUserSettings(user.userId);
    if (!settings || !settings.accessKey || !settings.secretKey || !settings.trackingId) {
      return NextResponse.json({ error: 'API 키와 Tracking ID를 먼저 설정하세요.' }, { status: 400 });
    }

    const body = await request.json();
    const { productId, productName, productUrl } = body;

    if (!productId || !productUrl) {
      return NextResponse.json({ error: '상품 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    // 쿠팡 파트너스 링크 생성 API 호출
    const REQUEST_METHOD = 'POST';
    const DOMAIN = 'https://api-gateway.coupang.com';
    const URL = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

    const { datetime, signature } = generateCoupangSignature(REQUEST_METHOD, URL, settings.secretKey);
    const authorization = `CEA algorithm=HmacSHA256, access-key=${settings.accessKey}, signed-date=${datetime}, signature=${signature}`;

    const requestBody = {
      coupangUrls: [productUrl]
    };

    const response = await fetch(DOMAIN + URL, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const data = await response.json();

      if (data.rCode === '0' && data.data && data.data.length > 0) {
        const shortUrl = data.data[0].shortenUrl;

        // 링크 정보 저장
        const allLinks = await loadAllLinks();
        const newLink = {
          id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: user.userId,
          productId,
          productName,
          originalUrl: productUrl,
          shortUrl,
          clicks: 0,
          createdAt: new Date().toISOString()
        };

        allLinks.push(newLink);
        await saveLinks(allLinks);

        return NextResponse.json({
          success: true,
          link: newLink
        });
      } else {
        return NextResponse.json({
          success: false,
          error: data.message || '링크 생성 실패'
        }, { status: 400 });
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: errorData.message || '링크 생성 실패'
      }, { status: response.status });
    }
  } catch (error: any) {
    console.error('링크 생성 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '링크 생성 중 오류 발생'
    }, { status: 500 });
  }
}
