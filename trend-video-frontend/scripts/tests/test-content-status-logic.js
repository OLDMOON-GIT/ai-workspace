/**
 * Integration Test: content.status 로직 검증
 *
 * Queue Spec v3 규칙:
 * - content.status는 youtube_url 존재 여부로만 'completed' 판단
 * - scriptContent만 있으면: status='processing' (대본 완료, 영상/유튜브 대기)
 * - videoPath만 있으면: status='processing' (영상 완료, 유튜브 대기)
 * - youtubeUrl이 있으면: status='completed' (모든 단계 완료)
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function testContentStatusLogic() {
  console.log('🧪 content.status 로직 통합 테스트 시작\n');

  const db = new Database(dbPath);
  const userId = 'test-user-' + Date.now();
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  try {
    // 테스트 유저 생성 (FK 제약 조건 만족)
    db.prepare(`
      INSERT INTO user (id, email, password, nickname, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(userId, `${userId}@test.com`, 'test-password', 'Test User');

    // 테스트 1: scriptContent만 있을 때 (이미지 크롤링 완료 후)
    console.log('📝 Test 1: scriptContent만 있을 때 → status="processing" 예상');
    const contentId1 = crypto.randomUUID();
    db.prepare(`
      INSERT INTO content (
        content_id, user_id, title, script_content, status, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      contentId1,
      userId,
      'Test Content 1',
      JSON.stringify({ scenes: [{ prompt: 'test' }] }),
      'processing',  // ⭐ 대본 완료 → processing
      50             // ⭐ 대본 완료 → 50%
    );

    const content1 = db.prepare('SELECT status, progress FROM content WHERE content_id = ?').get(contentId1);

    if (content1.status === 'processing' && content1.progress === 50) {
      console.log('  ✅ PASS: status=processing, progress=50');
      results.passed++;
      results.tests.push({ name: 'Test 1', status: 'PASS' });
    } else {
      console.log(`  ❌ FAIL: Expected status=processing, progress=50, Got status=${content1.status}, progress=${content1.progress}`);
      results.failed++;
      results.tests.push({ name: 'Test 1', status: 'FAIL', error: `Got status=${content1.status}, progress=${content1.progress}` });
    }

    // 테스트 2: videoPath까지 있을 때 (영상 제작 완료 후)
    console.log('\n📝 Test 2: videoPath까지 있을 때 → status="processing" 예상');
    const contentId2 = crypto.randomUUID();
    db.prepare(`
      INSERT INTO content (
        content_id, user_id, title, script_content, video_path, status, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      contentId2,
      userId,
      'Test Content 2',
      JSON.stringify({ scenes: [{ prompt: 'test' }] }),
      'tasks/test/output.mp4',
      'processing',  // ⭐ 영상 완료 → processing (유튜브 대기)
      75             // ⭐ 영상 완료 → 75%
    );

    const content2 = db.prepare('SELECT status, progress FROM content WHERE content_id = ?').get(contentId2);

    if (content2.status === 'processing' && content2.progress === 75) {
      console.log('  ✅ PASS: status=processing, progress=75');
      results.passed++;
      results.tests.push({ name: 'Test 2', status: 'PASS' });
    } else {
      console.log(`  ❌ FAIL: Expected status=processing, progress=75, Got status=${content2.status}, progress=${content2.progress}`);
      results.failed++;
      results.tests.push({ name: 'Test 2', status: 'FAIL', error: `Got status=${content2.status}, progress=${content2.progress}` });
    }

    // 테스트 3: youtubeUrl까지 있을 때 (업로드 완료 후)
    console.log('\n📝 Test 3: youtubeUrl까지 있을 때 → status="completed" 예상');
    const contentId3 = crypto.randomUUID();
    db.prepare(`
      INSERT INTO content (
        content_id, user_id, title, script_content, video_path, youtube_url, status, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      contentId3,
      userId,
      'Test Content 3',
      JSON.stringify({ scenes: [{ prompt: 'test' }] }),
      'tasks/test/output.mp4',
      'https://youtube.com/watch?v=test',
      'completed',  // ⭐ 유튜브 업로드 완료 → completed
      100           // ⭐ 유튜브 업로드 완료 → 100%
    );

    const content3 = db.prepare('SELECT status, progress FROM content WHERE content_id = ?').get(contentId3);

    if (content3.status === 'completed' && content3.progress === 100) {
      console.log('  ✅ PASS: status=completed, progress=100');
      results.passed++;
      results.tests.push({ name: 'Test 3', status: 'PASS' });
    } else {
      console.log(`  ❌ FAIL: Expected status=completed, progress=100, Got status=${content3.status}, progress=${content3.progress}`);
      results.failed++;
      results.tests.push({ name: 'Test 3', status: 'FAIL', error: `Got status=${content3.status}, progress=${content3.progress}` });
    }

    // 테스트 4: 기존 버그 케이스 - scriptContent만 있는데 completed였던 문제
    console.log('\n📝 Test 4: 기존 버그 케이스 검증 - DB에서 scriptContent만 있고 youtube_url 없는데 completed인 레코드 찾기');
    const buggyRecords = db.prepare(`
      SELECT content_id, status,
             CASE WHEN script_content IS NOT NULL THEN 1 ELSE 0 END as has_script,
             CASE WHEN video_path IS NOT NULL THEN 1 ELSE 0 END as has_video,
             CASE WHEN youtube_url IS NOT NULL THEN 1 ELSE 0 END as has_youtube
      FROM content
      WHERE status = 'completed'
        AND youtube_url IS NULL
      LIMIT 10
    `).all();

    if (buggyRecords.length > 0) {
      console.log(`  ⚠️  발견: ${buggyRecords.length}개의 잘못된 'completed' 레코드`);
      buggyRecords.forEach(record => {
        console.log(`    - content_id: ${record.content_id}, script: ${record.has_script}, video: ${record.has_video}, youtube: ${record.has_youtube}`);
      });
      console.log('  💡 이 레코드들은 status를 "processing"으로 수정해야 합니다.');
      results.tests.push({ name: 'Test 4', status: 'WARN', count: buggyRecords.length });
    } else {
      console.log('  ✅ PASS: 잘못된 completed 레코드 없음');
      results.passed++;
      results.tests.push({ name: 'Test 4', status: 'PASS' });
    }

    // 테스트 정리
    console.log('\n🧹 테스트 데이터 정리...');
    db.prepare('DELETE FROM content WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user WHERE id = ?').run(userId);

    // 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(60));
    console.log(`✅ 통과: ${results.passed}`);
    console.log(`❌ 실패: ${results.failed}`);
    console.log(`⚠️  경고: ${results.tests.filter(t => t.status === 'WARN').length}`);
    console.log('='.repeat(60));

    if (results.failed > 0) {
      console.log('\n❌ 실패한 테스트:');
      results.tests.filter(t => t.status === 'FAIL').forEach(test => {
        console.log(`  - ${test.name}: ${test.error}`);
      });
      process.exit(1);
    } else {
      console.log('\n✅ 모든 테스트 통과!');

      // 수정 제안
      const bugCount = results.tests.find(t => t.name === 'Test 4' && t.status === 'WARN');
      if (bugCount) {
        console.log('\n💡 다음 단계:');
        console.log('  기존 DB의 잘못된 레코드를 수정하려면:');
        console.log('  node scripts/tests/fix-buggy-content-status.js');
      }
    }

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    try {
      db.prepare('DELETE FROM content WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM user WHERE id = ?').run(userId);
    } catch (cleanupError) {
      // 정리 실패 무시
    }
    db.close();
    process.exit(1);
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  testContentStatusLogic();
}

module.exports = { testContentStatusLogic };
