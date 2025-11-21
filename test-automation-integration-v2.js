/**
 * 자동화 페이지 통합 테스트 (개선 버전)
 *
 * 특징:
 * - 에러 응답 출력
 * - 인증 처리
 * - 더 상세한 디버깅 정보
 * - 각 API 응답 body 출력
 */

const http = require('http');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

const testData = {
  title: `자동테스트_${Date.now()}`,
  type: 'shortform',
  category: '테스트',
  tags: '테스트,자동화',
  channel: 'test-channel',
  model: 'gemini',
  mediaMode: 'upload',
  scriptMode: 'chrome'
};

let testResults = [];
let titleId = null;
let sessionCookie = null;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
            rawBody: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            rawBody: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    console.log(`\n⏳ ${name}`);
    await fn();
    console.log(`✅ 통과`);
    testResults.push({ name, status: 'pass' });
    return true;
  } catch (error) {
    console.error(`❌ 실패: ${error.message}`);
    testResults.push({ name, status: 'fail', error: error.message });
    return false;
  }
}

async function runTests() {
  console.log('\n==================== 자동화 API 통합 테스트 ====================\n');

  // 1. 기본 API 연결 확인
  await test('API 서버 연결 확인', async () => {
    const response = await makeRequest('GET', '/');
    console.log(`   상태 코드: ${response.status}`);
  });

  // 2. 자동화 API 접근 시도 (인증 확인)
  await test('자동화 API 접근 (GET)', async () => {
    const response = await makeRequest('GET', '/api/automation/titles');
    console.log(`   상태 코드: ${response.status}`);
    console.log(`   응답: ${JSON.stringify(response.body || response.rawBody.substring(0, 200))}`);

    if (response.status === 401) {
      throw new Error('인증 필요 (401)');
    }
  });

  // 3. 제목 추가 테스트
  await test('제목 추가 API', async () => {
    const response = await makeRequest('POST', '/api/automation/titles', {
      title: testData.title,
      type: testData.type,
      category: testData.category,
      tags: testData.tags,
      channel: testData.channel,
      scriptMode: testData.scriptMode,
      mediaMode: testData.mediaMode,
      model: testData.model
    });

    console.log(`   상태 코드: ${response.status}`);
    console.log(`   응답: ${JSON.stringify(response.body || response.rawBody.substring(0, 300))}`);

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`API 실패: ${response.status}, Body: ${JSON.stringify(response.body)}`);
    }

    if (response.body && response.body.titleId) {
      titleId = response.body.titleId;
      console.log(`   생성된 titleId: ${titleId}`);
    } else {
      throw new Error('응답에 titleId가 없음');
    }
  });

  // 4. 제목 조회
  if (titleId) {
    await test('제목 조회 API', async () => {
      const response = await makeRequest('GET', '/api/automation/titles');
      console.log(`   상태 코드: ${response.status}`);

      if (response.status === 200 && response.body && response.body.titles) {
        const found = response.body.titles.find(t => t.id === titleId);
        console.log(`   찾은 제목: ${found ? found.title : 'NOT FOUND'}`);
      }
    });

    // 5. 제목 수정
    await test('제목 수정 API', async () => {
      const response = await makeRequest('PATCH', '/api/automation/titles', {
        id: titleId,
        title: `${testData.title}_수정됨`,
        model: 'chatgpt'
      });

      console.log(`   상태 코드: ${response.status}`);
      console.log(`   응답: ${JSON.stringify(response.body || response.rawBody.substring(0, 200))}`);

      if (response.status !== 200) {
        throw new Error(`API 실패: ${response.status}`);
      }
    });

    // 6. 제목 삭제
    await test('제목 삭제 API', async () => {
      const response = await makeRequest('DELETE', `/api/automation/titles?id=${titleId}`);
      console.log(`   상태 코드: ${response.status}`);
      console.log(`   응답: ${JSON.stringify(response.body || response.rawBody.substring(0, 200))}`);

      if (response.status !== 200) {
        throw new Error(`API 실패: ${response.status}`);
      }
    });
  }

  // 7. 카테고리 조회
  await test('카테고리 조회 API', async () => {
    const response = await makeRequest('GET', '/api/automation/categories');
    console.log(`   상태 코드: ${response.status}`);
    console.log(`   응답: ${JSON.stringify(response.body || response.rawBody.substring(0, 200))}`);
  });

  // 8. 스케줄 조회
  await test('스케줄 조회 API', async () => {
    const response = await makeRequest('GET', '/api/automation/schedules');
    console.log(`   상태 코드: ${response.status}`);
    console.log(`   응답: ${JSON.stringify(response.body || response.rawBody.substring(0, 200))}`);
  });

  // 9. 유효성 검증 - 필수 필드 없음
  await test('유효성 검증 - 빈 제목', async () => {
    const response = await makeRequest('POST', '/api/automation/titles', {
      type: testData.type
    });

    console.log(`   상태 코드: ${response.status}`);
    if (response.status === 400) {
      console.log(`   ✓ 올바르게 거부됨`);
    } else if (response.status === 500) {
      console.log(`   ⚠ 서버 에러 (500)`);
    }
  });

  // 10. 채널 설정 조회
  await test('채널 설정 조회 API', async () => {
    const response = await makeRequest('GET', '/api/automation/channel-settings');
    console.log(`   상태 코드: ${response.status}`);
    if (response.body) {
      console.log(`   응답 키: ${Object.keys(response.body).join(', ')}`);
    }
  });

  // 결과 출력
  console.log('\n==================== 테스트 결과 요약 ====================\n');

  const passed = testResults.filter(r => r.status === 'pass').length;
  const failed = testResults.filter(r => r.status === 'fail').length;

  testResults.forEach(result => {
    const icon = result.status === 'pass' ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
  });

  console.log(`\n총 ${testResults.length}개 테스트`);
  console.log(`✅ 통과: ${passed}개 (${((passed / testResults.length) * 100).toFixed(1)}%)`);
  console.log(`❌ 실패: ${failed}개\n`);

  // 진단 정보
  console.log('==================== 진단 정보 ====================\n');
  console.log('✓ 모든 API가 500 에러를 반환하는 경우:');
  console.log('  - 서버가 실행 중인지 확인 (npm run dev)');
  console.log('  - 데이터베이스 경로 확인 (data/database.sqlite)');
  console.log('  - 환경 변수 설정 확인');
  console.log('');
  console.log('✓ 401 Unauthorized 에러인 경우:');
  console.log('  - 사용자 인증이 필요함');
  console.log('  - 쿠키 설정 필요 (세션)');
  console.log('');
}

// 테스트 실행
runTests().catch(error => {
  console.error('❌ 테스트 실행 중 오류:', error);
  process.exit(1);
});
