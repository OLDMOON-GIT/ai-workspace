/**
 * 쿠팡 상품 관리 통합 테스트
 *
 * 테스트 범위:
 * 1. 베스트셀러 조회 (1시간 캐싱 확인)
 * 2. 상품 검색
 * 3. 내목록에 상품 추가 (딥링크 생성)
 * 4. 내목록 조회
 * 5. 상품 삭제
 *
 * 실행 방법: node test-coupang-integration.js
 */

const BASE_URL = 'http://localhost:3000';
let sessionId = null;

// 색상 출력 헬퍼
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 세션 로드
async function loadSession() {
  try {
    const fs = require('fs');
    const path = require('path');
    const sessionFile = path.join(__dirname, 'trend-video-frontend', 'data', 'sessions.json');

    if (fs.existsSync(sessionFile)) {
      const sessions = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      const sessionKeys = Object.keys(sessions);

      if (sessionKeys.length > 0) {
        sessionId = sessionKeys[0];
        log(`✅ 세션 로드: ${sessionId}`, 'green');
        return true;
      }
    }

    log('❌ 세션 파일을 찾을 수 없습니다', 'red');
    return false;
  } catch (error) {
    log(`❌ 세션 로드 실패: ${error.message}`, 'red');
    return false;
  }
}

// API 호출 헬퍼
async function apiCall(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `sessionId=${sessionId}`,
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    log(`❌ API 호출 실패 (${endpoint}): ${error.message}`, 'red');
    return { ok: false, error: error.message };
  }
}

// 1. 베스트셀러 조회 (캐싱 확인)
async function testBestsellers() {
  log('\n📋 [테스트 1] 베스트셀러 조회 및 캐싱', 'blue');

  // 첫 번째 호출
  log('  🔄 첫 번째 호출 (캐시 미사용)...', 'yellow');
  const start1 = Date.now();
  const result1 = await apiCall('/api/coupang/products?categoryId=1001');
  const time1 = Date.now() - start1;

  if (!result1.ok) {
    log(`  ❌ 실패: ${result1.data.error || result1.error}`, 'red');
    return false;
  }

  log(`  ✅ 성공: ${result1.data.products.length}개 상품 조회 (${time1}ms)`, 'green');
  log(`  📦 캐시 상태: ${result1.data.cached ? '사용' : '미사용'}`, 'yellow');

  // 두 번째 호출 (캐시 확인)
  log('  🔄 두 번째 호출 (캐시 사용 예상)...', 'yellow');
  const start2 = Date.now();
  const result2 = await apiCall('/api/coupang/products?categoryId=1001');
  const time2 = Date.now() - start2;

  if (!result2.ok) {
    log(`  ❌ 실패: ${result2.data.error}`, 'red');
    return false;
  }

  log(`  ✅ 성공: ${result2.data.products.length}개 상품 조회 (${time2}ms)`, 'green');
  log(`  📦 캐시 상태: ${result2.data.cached ? '사용' : '미사용'}`, result2.data.cached ? 'green' : 'red');
  log(`  ⚡ 속도 향상: ${Math.round((time1 - time2) / time1 * 100)}%`, result2.data.cached ? 'green' : 'yellow');

  if (result2.data.cached) {
    log(`  🕒 캐시 나이: ${result2.data.cacheAge}초`, 'yellow');
  }

  return result2.data.cached;
}

// 2. 상품 검색
async function testProductSearch() {
  log('\n📋 [테스트 2] 상품 검색', 'blue');

  const keyword = '시계';
  log(`  🔍 검색어: "${keyword}"`, 'yellow');

  const result = await apiCall(`/api/coupang/search?keyword=${encodeURIComponent(keyword)}`);

  if (!result.ok) {
    log(`  ❌ 실패: ${result.data.error || result.error}`, 'red');
    return null;
  }

  log(`  ✅ 성공: ${result.data.products.length}개 상품 검색됨`, 'green');

  if (result.data.products.length > 0) {
    const product = result.data.products[0];
    log(`  📦 첫 번째 상품: ${product.productName}`, 'yellow');
    log(`  💰 가격: ${product.productPrice}원`, 'yellow');
    return product;
  }

  return null;
}

// 3. 내목록에 상품 추가 (딥링크 생성)
async function testAddToMyList(product) {
  log('\n📋 [테스트 3] 내목록에 상품 추가 (딥링크 생성)', 'blue');

  if (!product) {
    log('  ⚠️  테스트 스킵: 추가할 상품이 없습니다', 'yellow');
    return null;
  }

  log(`  ➕ 상품 추가: ${product.productName}`, 'yellow');

  const result = await apiCall('/api/coupang/products/add', {
    method: 'POST',
    body: JSON.stringify({
      productId: product.productId,
      productName: product.productName,
      productPrice: product.productPrice,
      productImage: product.productImage,
      productUrl: product.productUrl,
      categoryName: product.categoryName
    })
  });

  if (!result.ok) {
    log(`  ❌ 실패: ${result.data.error || result.error}`, 'red');
    if (result.data.errors) {
      result.data.errors.forEach(err => log(`     ${err}`, 'red'));
    }
    return null;
  }

  log(`  ✅ 성공: ${result.data.message}`, 'green');
  log(`  📊 추가: ${result.data.added}개 | 중복: ${result.data.skipped}개 | 실패: ${result.data.failed}개`, 'yellow');

  return result.data.success;
}

// 4. 내목록 조회
async function testMyList() {
  log('\n📋 [테스트 4] 내목록 조회', 'blue');

  const result = await apiCall('/api/coupang-products');

  if (!result.ok) {
    log(`  ❌ 실패: ${result.data.error || result.error}`, 'red');
    return null;
  }

  log(`  ✅ 성공: ${result.data.products.length}개 상품`, 'green');

  if (result.data.products.length > 0) {
    const recentProducts = result.data.products.slice(0, 3);
    log(`  📦 최근 상품 (최대 3개):`, 'yellow');

    recentProducts.forEach((p, i) => {
      log(`     ${i + 1}. ${p.title}`, 'yellow');
      log(`        딥링크: ${p.deep_link ? '✅ 생성됨' : '❌ 없음'}`, p.deep_link ? 'green' : 'red');
      log(`        카테고리: ${p.category}`, 'yellow');
    });

    return result.data.products[0];
  }

  return null;
}

// 5. 상품 삭제
async function testDeleteProduct(product) {
  log('\n📋 [테스트 5] 상품 삭제', 'blue');

  if (!product) {
    log('  ⚠️  테스트 스킵: 삭제할 상품이 없습니다', 'yellow');
    return false;
  }

  log(`  🗑️  삭제 대상: ${product.title}`, 'yellow');

  const result = await apiCall(`/api/coupang-products?id=${product.id}`, {
    method: 'DELETE'
  });

  if (!result.ok) {
    log(`  ❌ 실패: ${result.data.error || result.error}`, 'red');
    return false;
  }

  log(`  ✅ 성공: ${result.data.message}`, 'green');
  return true;
}

// 메인 테스트 실행
async function runTests() {
  log('='.repeat(60), 'blue');
  log('🧪 쿠팡 상품 관리 통합 테스트 시작', 'blue');
  log('='.repeat(60), 'blue');

  // 세션 로드
  const sessionLoaded = await loadSession();
  if (!sessionLoaded) {
    log('\n❌ 테스트 실패: 세션을 로드할 수 없습니다', 'red');
    process.exit(1);
  }

  const results = {
    total: 5,
    passed: 0,
    failed: 0
  };

  try {
    // 테스트 1: 베스트셀러 조회 및 캐싱
    const cached = await testBestsellers();
    if (cached) results.passed++;
    else results.failed++;

    // 테스트 2: 상품 검색
    const searchedProduct = await testProductSearch();
    if (searchedProduct) results.passed++;
    else results.failed++;

    // 테스트 3: 내목록에 상품 추가
    const added = await testAddToMyList(searchedProduct);
    if (added) results.passed++;
    else results.failed++;

    // 테스트 4: 내목록 조회
    const myProduct = await testMyList();
    if (myProduct) results.passed++;
    else results.failed++;

    // 테스트 5: 상품 삭제
    const deleted = await testDeleteProduct(myProduct);
    if (deleted) results.passed++;
    else results.failed++;

  } catch (error) {
    log(`\n❌ 테스트 중 오류 발생: ${error.message}`, 'red');
    console.error(error);
  }

  // 결과 출력
  log('\n' + '='.repeat(60), 'blue');
  log('📊 테스트 결과', 'blue');
  log('='.repeat(60), 'blue');
  log(`총 테스트: ${results.total}`, 'yellow');
  log(`통과: ${results.passed}`, 'green');
  log(`실패: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`성공률: ${Math.round(results.passed / results.total * 100)}%`, results.failed === 0 ? 'green' : 'yellow');
  log('='.repeat(60), 'blue');

  if (results.failed === 0) {
    log('\n✅ 모든 테스트 통과!', 'green');
    process.exit(0);
  } else {
    log(`\n⚠️  ${results.failed}개 테스트 실패`, 'red');
    process.exit(1);
  }
}

// 실행
runTests();
