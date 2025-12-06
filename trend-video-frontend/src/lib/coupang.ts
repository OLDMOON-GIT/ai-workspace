import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { CoupangClient } from './coupang-client';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

interface CacheEntry {
  data: any;
  timestamp: number;
}

const bestsellerCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 60 * 60 * 1000;
const ERROR_CACHE_DURATION = 5 * 60 * 1000; // 에러 시 5분간 재시도 안 함

// 에러 캐시 (API 제한 등)
const errorCache = new Map<string, number>();

// 캐시 클리어 함수
export function clearBestsellerCache() {
  bestsellerCache.clear();
  errorCache.clear();
  console.log('[Coupang] 캐시 클리어 완료');
}

export async function loadUserCoupangSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

function generateHMAC(method: string, url: string, accessKey: string, secretKey: string): { datetime: string; authorization: string } {
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

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { datetime, authorization };
}

async function callCoupangAPI(accessKey: string, secretKey: string, method: string, fullUrl: string) {
  const [path, query] = fullUrl.split('?');
  const { authorization } = generateHMAC(method, path, accessKey, secretKey);

  const DOMAIN = 'https://api-gateway.coupang.com';
  const response = await fetch(DOMAIN + fullUrl, {
    method,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json'
    }
  });

  return response;
}

export async function getCoupangBestsellers(userId: string, categoryId: string = '1001') {
  try {
    const settings = await loadUserCoupangSettings(userId);
    if (!settings || !settings.accessKey || !settings.secretKey) {
      throw new Error('Coupang API settings not configured');
    }

    const cacheKey = `${userId}_${categoryId}`;
    const now = Date.now();

    // ⚠️ 에러 캐시 체크 (API 제한 등으로 실패한 경우 5분간 재시도 안 함)
    const lastError = errorCache.get(cacheKey);
    if (lastError && (now - lastError) < ERROR_CACHE_DURATION) {
      const remainSec = Math.ceil((ERROR_CACHE_DURATION - (now - lastError)) / 1000);
      console.log(`[Coupang] ⏸️ 에러 캐시 - ${remainSec}초 후 재시도`);
      return { success: true, products: [], cached: true };
    }

    const cached = bestsellerCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log('Cache hit for bestsellers:', cacheKey);
      return {
        success: true,
        products: cached.data,
        cached: true
      };
    }

    const url = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/${categoryId}`;
    const response = await callCoupangAPI(settings.accessKey, settings.secretKey, 'GET', url);

    if (response.ok) {
      const data = await response.json();

      // 403 에러가 JSON으로 올 수도 있음
      if (data.rCode === '403') {
        console.log('[Coupang] ⚠️ API 제한 - 5분간 재시도 안 함');
        errorCache.set(cacheKey, now);
        return { success: true, products: [], cached: false };
      }

      const products = data.data?.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        productPrice: item.productPrice,
        productImage: item.productImage,
        productUrl: item.productUrl,
        categoryName: item.categoryName,
        isRocket: item.isRocket || false,
        rank: item.rank
      })) || [];

      if (products.length > 0) {
        bestsellerCache.set(cacheKey, {
          data: products,
          timestamp: now
        });
        errorCache.delete(cacheKey); // 성공 시 에러 캐시 삭제
      } else {
        console.log('[Coupang] ⚠️ 빈 결과 - 5분간 재시도 안 함');
        errorCache.set(cacheKey, now);
      }

      return {
        success: true,
        products,
        cached: false
      };
    } else {
      const errorText = await response.text();
      console.log('[Coupang] ⚠️ API 실패 - 5분간 재시도 안 함:', response.status);
      errorCache.set(cacheKey, now);
      return { success: true, products: [], cached: false };
    }

  } catch (error: any) {
    console.error('Failed to fetch Coupang bestsellers:', error);
    // 에러 캐시 설정
    errorCache.set(`${userId}_${categoryId}`, Date.now());
    return { success: true, products: [], cached: false };
  }
}

/**
 * 🚨🚨🚨 절대 수정 금지! 🚨🚨🚨
 * 딥링크 생성 실패 시 빈 문자열 반환 (productUrl 반환 금지!)
 * productUrl은 딥링크가 아님!
 */
export async function generateAffiliateDeepLink(userId: string, productUrl: string): Promise<string> {
  try {
    const settings = await loadUserCoupangSettings(userId);
    if (!settings?.accessKey || !settings?.secretKey) {
      console.error('[Coupang] ❌ No API settings - 딥링크 생성 불가');
      return ''; // ⭐ 빈 문자열 반환 (productUrl 반환 금지!)
    }

    const client = new CoupangClient({
      accessKey: settings.accessKey,
      secretKey: settings.secretKey
    });

    const deepLink = await client.generateDeepLink(productUrl);
    console.log('[Coupang] Generated deep link:', deepLink);
    return deepLink;
  } catch (error: any) {
    console.error('[Coupang] ❌ Deep link generation failed:', error?.message || error);
    return ''; // ⭐ 빈 문자열 반환 (productUrl 반환 금지!)
  }
}
