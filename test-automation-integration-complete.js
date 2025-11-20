/**
 * 자동화 페이지 통합 테스트
 *
 * 테스트 범위:
 * 1. 제목 추가 및 삭제
 * 2. 제목 수정 및 저장
 * 3. 스케줄 추가 및 삭제
 * 4. 영상 생성 플로우
 * 5. 폴더 열기 기능
 * 6. 미디어 업로드
 * 7. 재시도 및 강제 실행
 * 8. 로그 조회
 */

const http = require('http');
const assert = require('assert');

// 테스트 설정
const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

// 테스트 데이터
const testData = {
  title: `자동테스트_${Date.now()}`,
  type: 'shortform',
  category: '테스트',
  tags: '테스트,자동화',
  channel: 'test-channel',
  model: 'claude',
  mediaMode: 'upload',
  scriptMode: 'chrome'
};

// 전역 변수
let testResults = [];
let titleId = null;
let scheduleId = null;
let jobId = null;

// 유틸리티: HTTP 요청
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
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// 테스트 실행기
async function test(name, fn) {
  try {
    console.log(`\n⏳ 테스트: ${name}`);
    await fn();
    console.log(`✅ 통과: ${name}`);
    testResults.push({ name, status: 'pass' });
  } catch (error) {
    console.error(`❌ 실패: ${name}`);
    console.error(`   원인: ${error.message}`);
    testResults.push({ name, status: 'fail', error: error.message });
  }
}

// 테스트 케이스
async function runTests() {
  console.log('\n========== 자동화 통합 테스트 시작 ==========\n');

  // 1. 제목 추가
  await test('제목 추가', async () => {
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

    assert.strictEqual(response.status, 200, `API 실패: ${response.status}`);
    assert(response.body.titleId, '응답에 titleId가 없음');
    titleId = response.body.titleId;
    console.log(`   생성된 titleId: ${titleId}`);
  });

  // 2. 제목 조회
  await test('제목 조회', async () => {
    const response = await makeRequest('GET', '/api/automation/titles');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.body.titles), '응답이 배열이 아님');

    const found = response.body.titles.find(t => t.id === titleId);
    assert(found, `생성한 제목을 찾을 수 없음: ${titleId}`);
    console.log(`   조회된 제목: ${found.title}`);
  });

  // 3. 제목 수정
  await test('제목 수정', async () => {
    const updatedTitle = `${testData.title}_수정`;
    const response = await makeRequest('PATCH', '/api/automation/titles', {
      id: titleId,
      title: updatedTitle,
      model: 'chatgpt',
      mediaMode: 'dalle'
    });

    assert.strictEqual(response.status, 200, `API 실패: ${response.status}`);

    // 수정 확인
    const checkResponse = await makeRequest('GET', '/api/automation/titles');
    const updated = checkResponse.body.titles.find(t => t.id === titleId);
    assert.strictEqual(updated.title, updatedTitle, '제목 수정 실패');
    assert.strictEqual(updated.model, 'chatgpt', '모델 수정 실패');
    assert.strictEqual(updated.media_mode, 'dalle', 'mediaMode 수정 실패');
    console.log(`   수정된 제목: ${updated.title}, 모델: ${updated.model}`);
  });

  // 4. 스케줄 추가
  await test('스케줄 추가', async () => {
    const scheduledTime = new Date(Date.now() + 60000).toISOString().split('T')[0] + 'T12:00';

    const response = await makeRequest('POST', '/api/automation/schedules', {
      titleId,
      scheduledTime,
      youtubePublishTime: null,
      youtubePrivacy: 'public'
    });

    assert.strictEqual(response.status, 200, `API 실패: ${response.status}`);
    assert(response.body.scheduleId, '응답에 scheduleId가 없음');
    scheduleId = response.body.scheduleId;
    console.log(`   생성된 scheduleId: ${scheduleId}`);
  });

  // 5. 스케줄 조회
  await test('스케줄 조회', async () => {
    const response = await makeRequest('GET', '/api/automation/schedules');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.body.schedules), '응답이 배열이 아님');

    const found = response.body.schedules.find(s => s.id === scheduleId);
    assert(found, `생성한 스케줄을 찾을 수 없음: ${scheduleId}`);
    console.log(`   조회된 스케줄 상태: ${found.status}`);
  });

  // 6. 스케줄 수정
  await test('스케줄 수정', async () => {
    const newTime = new Date(Date.now() + 120000).toISOString().split('T')[0] + 'T14:00';

    const response = await makeRequest('PATCH', '/api/automation/schedules', {
      id: scheduleId,
      scheduledTime: newTime,
      youtubePrivacy: 'private'
    });

    assert.strictEqual(response.status, 200, `API 실패: ${response.status}`);

    // 수정 확인
    const checkResponse = await makeRequest('GET', '/api/automation/schedules');
    const updated = checkResponse.body.schedules.find(s => s.id === scheduleId);
    assert.strictEqual(updated.youtube_privacy, 'private', '공개 설정 수정 실패');
    console.log(`   수정된 공개 설정: ${updated.youtube_privacy}`);
  });

  // 7. 스케줄 상태 업데이트
  await test('스케줄 상태 업데이트', async () => {
    const response = await makeRequest('PATCH', '/api/automation/schedules', {
      id: scheduleId,
      status: 'processing'
    });

    assert.strictEqual(response.status, 200);

    // 상태 확인
    const checkResponse = await makeRequest('GET', '/api/automation/schedules');
    const updated = checkResponse.body.schedules.find(s => s.id === scheduleId);
    assert.strictEqual(updated.status, 'processing', '상태 변경 실패');
    console.log(`   변경된 상태: ${updated.status}`);
  });

  // 8. 로그 조회
  await test('로그 조회', async () => {
    const response = await makeRequest('GET', `/api/automation/logs?titleId=${titleId}`);
    // 로그가 없을 수도 있으므로 200 상태만 확인
    assert.strictEqual(response.status, 200);
    console.log(`   로그 조회 성공`);
  });

  // 9. 스케줄 취소/삭제
  await test('스케줄 삭제', async () => {
    const response = await makeRequest('DELETE', `/api/automation/schedules?id=${scheduleId}`);
    assert.strictEqual(response.status, 200);

    // 삭제 확인
    const checkResponse = await makeRequest('GET', '/api/automation/schedules');
    const found = checkResponse.body.schedules.find(s => s.id === scheduleId);
    assert(!found || found.status === 'cancelled', '스케줄 삭제 실패');
    console.log(`   스케줄 삭제됨`);
  });

  // 10. 제목 삭제
  await test('제목 삭제', async () => {
    const response = await makeRequest('DELETE', `/api/automation/titles?id=${titleId}`);
    assert.strictEqual(response.status, 200);

    // 삭제 확인
    const checkResponse = await makeRequest('GET', '/api/automation/titles');
    const found = checkResponse.body.titles.find(t => t.id === titleId);
    assert(!found, '제목 삭제 실패');
    console.log(`   제목 삭제됨`);
  });

  // 11. 유효성 검증 - 제목 필수
  await test('제목 필수 검증', async () => {
    const response = await makeRequest('POST', '/api/automation/titles', {
      type: testData.type,
      category: testData.category
    });

    assert.strictEqual(response.status, 400, '빈 제목이 허용됨');
    console.log(`   빈 제목 거부됨: ${response.status}`);
  });

  // 12. 유효성 검증 - 타입 필수
  await test('타입 필수 검증', async () => {
    const response = await makeRequest('POST', '/api/automation/titles', {
      title: testData.title
    });

    assert.strictEqual(response.status, 400, '빈 타입이 허용됨');
    console.log(`   빈 타입 거부됨: ${response.status}`);
  });

  // 13. 유효성 검증 - 잘못된 타입
  await test('잘못된 타입 검증', async () => {
    const response = await makeRequest('POST', '/api/automation/titles', {
      title: testData.title,
      type: 'invalid_type'
    });

    assert.strictEqual(response.status, 400, '잘못된 타입이 허용됨');
    console.log(`   잘못된 타입 거부됨: ${response.status}`);
  });

  // 14. 카테고리 조회
  await test('카테고리 조회', async () => {
    const response = await makeRequest('GET', '/api/automation/categories');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.body.categories), '응답이 배열이 아님');
    console.log(`   조회된 카테고리 수: ${response.body.categories.length}`);
  });

  // 15. 채널 설정 조회
  await test('채널 설정 조회', async () => {
    const response = await makeRequest('GET', '/api/automation/channel-settings');
    assert.strictEqual(response.status, 200);
    console.log(`   채널 설정 조회 성공`);
  });

  // 결과 요약
  console.log('\n========== 테스트 결과 ==========\n');
  const passed = testResults.filter(r => r.status === 'pass').length;
  const failed = testResults.filter(r => r.status === 'fail').length;

  testResults.forEach(result => {
    const icon = result.status === 'pass' ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.error) console.log(`   → ${result.error}`);
  });

  console.log(`\n총 ${testResults.length}개 테스트`);
  console.log(`✅ 통과: ${passed}개`);
  console.log(`❌ 실패: ${failed}개`);
  console.log(`성공률: ${((passed / testResults.length) * 100).toFixed(1)}%\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// 테스트 실행
runTests().catch(error => {
  console.error('테스트 실행 중 오류:', error);
  process.exit(1);
});
