/**
 * 자동화 페이지 완전 통합 테스트
 *
 * 다음 시나리오를 테스트합니다:
 * 1. 제목 CRUD 작업
 * 2. 스케줄 CRUD 작업
 * 3. 상태 변경 및 전환
 * 4. 에러 처리 및 유효성 검증
 * 5. 실제 필드명 매핑 (camelCase ↔ snake_case)
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const API_BASE = '/api/automation';

let tests = [];
let passed = 0;
let failed = 0;

// HTTP 요청 함수
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// 테스트 실행
async function test(description, fn) {
  try {
    process.stdout.write(`⏳ ${description}... `);
    await fn();
    console.log('✅');
    passed++;
    tests.push({ description, status: 'pass' });
  } catch (error) {
    console.log(`❌ ${error.message}`);
    failed++;
    tests.push({ description, status: 'fail', error: error.message });
  }
}

// 메인 테스트
async function runAllTests() {
  console.log('\n========================================');
  console.log('  자동화 페이지 통합 테스트');
  console.log('========================================\n');

  const timestamp = Date.now();
  let titleId = null;
  let scheduleId = null;

  // ============ 제목 관리 ============
  console.log('\n📚 제목 관리:\n');

  // 1. 제목 추가
  await test('제목 추가', async () => {
    const res = await request('POST', `${API_BASE}/titles`, {
      title: `테스트제목_${timestamp}`,
      type: 'shortform',
      category: '테스트',
      channel: 'test-channel',
      model: 'claude',
      mediaMode: 'upload',
      scriptMode: 'chrome'
    });

    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(res.data)}`);
    if (!res.data?.titleId) throw new Error('titleId 없음');
    titleId = res.data.titleId;
  });

  // 2. 제목 목록 조회
  await test('제목 목록 조회', async () => {
    const res = await request('GET', `${API_BASE}/titles`);
    if (!res.ok) throw new Error(`${res.status}`);
    if (!Array.isArray(res.data?.titles)) throw new Error('titles 배열 아님');
    const found = res.data.titles.find(t => t.id === titleId);
    if (!found) throw new Error(`생성한 제목 ${titleId}를 찾을 수 없음`);
  });

  // 3. 제목 필드 수정 (단일)
  await test('제목 수정 - 타입', async () => {
    const res = await request('PATCH', `${API_BASE}/titles`, {
      id: titleId,
      type: 'longform'
    });
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // 4. 제목 필드 수정 (다중)
  await test('제목 수정 - 다중 필드', async () => {
    const res = await request('PATCH', `${API_BASE}/titles`, {
      id: titleId,
      title: `수정됨_${timestamp}`,
      model: 'chatgpt',
      mediaMode: 'dalle'
    });
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // 5. 수정 확인
  await test('제목 수정 확인', async () => {
    const res = await request('GET', `${API_BASE}/titles`);
    if (!res.ok) throw new Error(`${res.status}`);
    const updated = res.data.titles.find(t => t.id === titleId);
    if (updated.model !== 'chatgpt') throw new Error(`model: ${updated.model}`);
    if (updated.media_mode !== 'dalle') throw new Error(`media_mode: ${updated.media_mode}`);
  });

  // ============ 스케줄 관리 ============
  console.log('\n📅 스케줄 관리:\n');

  // 6. 스케줄 추가
  await test('스케줄 추가', async () => {
    const tomorrow = new Date(Date.now() + 86400000);
    const scheduledTime = tomorrow.toISOString().split('T')[0] + 'T10:00';

    const res = await request('POST', `${API_BASE}/schedules`, {
      titleId,
      scheduledTime,
      youtubePublishTime: null,
      youtubePrivacy: 'public'
    });

    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(res.data)}`);
    if (!res.data?.scheduleId) throw new Error('scheduleId 없음');
    scheduleId = res.data.scheduleId;
  });

  // 7. 스케줄 목록 조회
  await test('스케줄 목록 조회', async () => {
    const res = await request('GET', `${API_BASE}/schedules`);
    if (!res.ok) throw new Error(`${res.status}`);
    if (!Array.isArray(res.data?.schedules)) throw new Error('schedules 배열 아님');
  });

  // 8. 스케줄 상태 변경
  await test('스케줄 상태 변경', async () => {
    const res = await request('PATCH', `${API_BASE}/schedules`, {
      id: scheduleId,
      status: 'processing'
    });
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // 9. 스케줄 필드 수정
  await test('스케줄 공개 설정 변경', async () => {
    const res = await request('PATCH', `${API_BASE}/schedules`, {
      id: scheduleId,
      youtubePrivacy: 'private'
    });
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // 10. 스케줄 상태 확인
  await test('스케줄 변경 확인', async () => {
    const res = await request('GET', `${API_BASE}/schedules`);
    if (!res.ok) throw new Error(`${res.status}`);
    const schedule = res.data.schedules.find(s => s.id === scheduleId);
    if (!schedule) throw new Error(`스케줄 ${scheduleId} 없음`);
    if (schedule.status !== 'processing') throw new Error(`status: ${schedule.status}`);
    if (schedule.youtube_privacy !== 'private') throw new Error(`youtube_privacy: ${schedule.youtube_privacy}`);
  });

  // ============ 유효성 검증 ============
  console.log('\n✔️ 유효성 검증:\n');

  // 11. 필수 필드 - 제목
  await test('제목 필수 필드 검증', async () => {
    const res = await request('POST', `${API_BASE}/titles`, {
      type: 'shortform'
    });
    if (res.ok) throw new Error('빈 제목이 허용됨');
    if (res.status !== 400) throw new Error(`예상 400, 실제 ${res.status}`);
  });

  // 12. 필수 필드 - 타입
  await test('타입 필수 필드 검증', async () => {
    const res = await request('POST', `${API_BASE}/titles`, {
      title: '테스트'
    });
    if (res.ok) throw new Error('빈 타입이 허용됨');
    if (res.status !== 400) throw new Error(`예상 400, 실제 ${res.status}`);
  });

  // 13. 유효한 타입만 허용
  await test('타입 유효성 검증', async () => {
    const res = await request('POST', `${API_BASE}/titles`, {
      title: '테스트',
      type: 'invalid_type'
    });
    if (res.ok) throw new Error('잘못된 타입이 허용됨');
    if (res.status !== 400) throw new Error(`예상 400, 실제 ${res.status}`);
  });

  // 14. ID 존재 확인 - 수정
  await test('존재하지 않는 제목 수정 거부', async () => {
    const res = await request('PATCH', `${API_BASE}/titles`, {
      id: 'invalid_id_' + timestamp,
      title: '테스트'
    });
    // 400 또는 404 중 하나 허용
    if (res.status < 400) throw new Error(`${res.status}: 수정되면 안됨`);
  });

  // ============ 기타 API ============
  console.log('\n⚙️ 기타 기능:\n');

  // 15. 카테고리 조회
  await test('카테고리 조회', async () => {
    const res = await request('GET', `${API_BASE}/categories`);
    if (!res.ok) throw new Error(`${res.status}`);
    if (!Array.isArray(res.data?.categories)) throw new Error('categories 배열 아님');
  });

  // 16. 채널 설정 조회
  await test('채널 설정 조회', async () => {
    const res = await request('GET', `${API_BASE}/channel-settings`);
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // 17. 로그 조회
  await test('로그 조회', async () => {
    const res = await request('GET', `${API_BASE}/logs?titleId=${titleId}`);
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // ============ 정리 ============
  console.log('\n🗑️ 정리:\n');

  // 18. 스케줄 삭제
  await test('스케줄 삭제', async () => {
    const res = await request('DELETE', `${API_BASE}/schedules?id=${scheduleId}`);
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // 19. 제목 삭제
  await test('제목 삭제', async () => {
    const res = await request('DELETE', `${API_BASE}/titles?id=${titleId}`);
    if (!res.ok) throw new Error(`${res.status}`);
  });

  // 20. 삭제 확인
  await test('제목 삭제 확인', async () => {
    const res = await request('GET', `${API_BASE}/titles`);
    if (!res.ok) throw new Error(`${res.status}`);
    const deleted = res.data.titles.find(t => t.id === titleId);
    if (deleted) throw new Error(`삭제된 제목이 남아있음`);
  });

  // ============ 결과 출력 ============
  console.log('\n========================================');
  console.log('  테스트 결과');
  console.log('========================================\n');

  tests.forEach(t => {
    const icon = t.status === 'pass' ? '✅' : '❌';
    console.log(`${icon} ${t.description}`);
    if (t.error) console.log(`   → ${t.error}`);
  });

  console.log(`\n총 ${tests.length}개 테스트`);
  console.log(`✅ 성공: ${passed}개`);
  console.log(`❌ 실패: ${failed}개`);
  console.log(`📊 성공률: ${((passed / tests.length) * 100).toFixed(1)}%\n`);

  if (failed === 0) {
    console.log('🎉 모든 테스트가 통과했습니다!\n');
  } else {
    console.log('⚠️  일부 테스트가 실패했습니다.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// 실행
runAllTests().catch(err => {
  console.error('❌ 테스트 실행 오류:', err.message);
  process.exit(1);
});
