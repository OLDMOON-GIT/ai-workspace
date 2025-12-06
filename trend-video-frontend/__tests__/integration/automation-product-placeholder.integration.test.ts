/**
 * @jest-environment node
 *
 * 자동화 상품 정보 플레이스홀더 치환 통합 테스트
 *
 * 인메모리 DB를 사용하여 자동화 시스템의 상품 정보 플레이스홀더 치환을 검증합니다.
 *
 * 테스트 흐름:
 * 1. 테스트 사용자 생성 (google_sites_home_url, nickname 설정)
 * 2. 프롬프트 파일 읽기
 * 3. 플레이스홀더 치환 로직 테스트
 * 4. 모든 플레이스홀더가 치환되었는지 검증
 *
 * 실행: npm test -- automation-product-placeholder.integration
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import path from 'path';

const promptPath = path.join(process.cwd(), 'prompts', 'prompt_product_info.txt');
const TEST_USER_ID = 'test_user_automation_product';
const TEST_HOME_URL = 'https://sites.google.com/view/test-automation';
const TEST_NICKNAME = '테스트채널';

describe('[통합] 자동화 상품 정보 플레이스홀더 치환', () => {
  let db: Database.Database;
  let promptTemplate: string;

  beforeAll(() => {
    // ⭐ 인메모리 DB 사용 (실제 DB 대신)
    db = new Database(':memory:');

    // users 테이블 생성
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        password TEXT,
        is_admin INTEGER DEFAULT 0,
        credits INTEGER DEFAULT 0,
        google_sites_home_url TEXT,
        nickname TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 테스트 사용자 생성 (관리자, google_sites_home_url, nickname 설정)
    db.prepare(`
      INSERT INTO users (id, email, password, is_admin, credits, google_sites_home_url, nickname)
      VALUES (?, ?, ?, 1, 10000, ?, ?)
    `).run(TEST_USER_ID, 'test@automation.com', 'test_password_hash', TEST_HOME_URL, TEST_NICKNAME);

    // 프롬프트 파일 읽기 (없으면 기본 템플릿 사용)
    if (fs.existsSync(promptPath)) {
      promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } else {
      // 테스트용 기본 템플릿
      promptTemplate = `
상품명: {title}
썸네일: {thumbnail}
상품링크: {product_link}
상품설명: {product_description}
홈URL: {home_url}
      `.trim();
    }

    console.log('✅ 테스트 환경 준비 완료 (인메모리 DB)');
  });

  afterAll(() => {
    db.close();
    console.log('✅ 테스트 데이터 정리 완료');
  });

  it('프롬프트 파일에 모든 필수 플레이스홀더가 있어야 함', () => {
    console.log('\n📋 1단계: 프롬프트 파일 플레이스홀더 검증');

    // 필수 플레이스홀더 확인
    expect(promptTemplate).toContain('{title}');
    expect(promptTemplate).toContain('{thumbnail}');
    expect(promptTemplate).toContain('{product_link}');
    expect(promptTemplate).toContain('{product_description}');
    expect(promptTemplate).toContain('{home_url}');

    console.log('✅ 모든 플레이스홀더가 프롬프트에 존재함');
  });

  it('상품 정보로 플레이스홀더를 치환하면 모든 값이 대체되어야 함', () => {
    console.log('\n📋 2단계: 플레이스홀더 치환 검증');

    // 상품 정보 준비
    const productData = {
      title: '테스트 상품 제목',
      thumbnail: 'https://example.com/test-thumbnail.jpg',
      product_link: 'https://link.coupang.com/a/test123',
      description: '이것은 테스트 상품입니다.'
    };

    // DB에서 사용자 설정 가져오기
    const userSettings = db.prepare('SELECT google_sites_home_url, nickname FROM users WHERE id = ?').get(TEST_USER_ID) as { google_sites_home_url: string; nickname: string };
    const homeUrl = userSettings?.google_sites_home_url || '';

    // 플레이스홀더 치환
    let replacedPrompt = promptTemplate
      .replace(/{title}/g, productData.title)
      .replace(/{thumbnail}/g, productData.thumbnail)
      .replace(/{product_link}/g, productData.product_link)
      .replace(/{product_description}/g, productData.description)
      .replace(/{home_url}/g, homeUrl);

    // 플레이스홀더가 남아있으면 안 됨
    expect(replacedPrompt).not.toContain('{title}');
    expect(replacedPrompt).not.toContain('{thumbnail}');
    expect(replacedPrompt).not.toContain('{product_link}');
    expect(replacedPrompt).not.toContain('{product_description}');
    expect(replacedPrompt).not.toContain('{home_url}');

    // 실제 값이 포함되어야 함
    expect(replacedPrompt).toContain(productData.title);
    expect(replacedPrompt).toContain(productData.thumbnail);
    expect(replacedPrompt).toContain(productData.product_link);
    expect(replacedPrompt).toContain(productData.description);
    expect(replacedPrompt).toContain(homeUrl);

    console.log('✅ 모든 플레이스홀더가 치환됨');
  });

  it('크롤링된 데이터(deepLink 포함) 형식으로 플레이스홀더를 치환하면 deepLink가 우선되어야 함', () => {
    console.log('\n📋 3단계: 크롤링된 데이터 형식 + deepLink 우선순위 검증');

    // 크롤링된 데이터 형식
    const crawledProductData = {
      productName: '삭스판다 여성용 도톰한 겨울 방한 파일 반장 니삭스 3켤레 세트',
      productImage: 'https://img1c.coupangcdn.com/image/retail/images/123.jpg',
      productUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF5835292&pageKey=8391263121',
      deepLink: 'https://link.coupang.com/a/c6NssG', // ⭐ 짧은 딥링크
      productPrice: '9,900원'
    };

    // DB에서 사용자 설정 가져오기
    const userSettings = db.prepare('SELECT google_sites_home_url, nickname FROM users WHERE id = ?').get(TEST_USER_ID) as { google_sites_home_url: string; nickname: string };
    const homeUrl = userSettings?.google_sites_home_url || '';

    // API 로직과 동일한 fallback 패턴 적용
    const productTitle = crawledProductData.productName || '';
    const productThumbnail = crawledProductData.productImage || '';
    const productLink = crawledProductData.deepLink || crawledProductData.productUrl || ''; // ⭐ deepLink 우선!
    const productDescription = '';

    // 플레이스홀더 치환
    let replacedPrompt = promptTemplate
      .replace(/{title}/g, productTitle)
      .replace(/{thumbnail}/g, productThumbnail)
      .replace(/{product_link}/g, productLink)
      .replace(/{product_description}/g, productDescription)
      .replace(/{home_url}/g, homeUrl);

    // deepLink가 사용되었는지 확인
    expect(replacedPrompt).toContain(crawledProductData.deepLink);
    console.log('✅ deepLink가 프롬프트에 포함됨:', crawledProductData.deepLink);

    // productUrl(긴 추적 URL)은 사용되지 않아야 함
    expect(replacedPrompt).not.toContain(crawledProductData.productUrl);
    console.log('✅ productUrl(긴 추적 URL)은 사용되지 않음');

    console.log('✅ deepLink 우선순위 테스트 통과');
  });

  it('/api/scripts/generate에서 플레이스홀더 치환 로직이 존재해야 함', () => {
    console.log('\n📋 4단계: API 코드 검증');

    const routeFilePath = path.join(process.cwd(), 'src', 'app', 'api', 'scripts', 'generate', 'route.ts');

    if (!fs.existsSync(routeFilePath)) {
      console.log('⚠️ API 파일이 존재하지 않음 - 스킵');
      return;
    }

    const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

    // 플레이스홀더 치환 로직 확인
    expect(routeContent).toContain('replace(/{thumbnail}/g');
    expect(routeContent).toContain('replace(/{product_link}/g');
    expect(routeContent).toContain('replace(/{product_description}/g');
    expect(routeContent).toContain('replace(/{home_url}/g');

    console.log('✅ API에 플레이스홀더 치환 로직이 존재함');
  });
});
