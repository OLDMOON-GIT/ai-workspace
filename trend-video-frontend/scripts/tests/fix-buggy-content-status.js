/**
 * Fix Buggy Content Status Records
 *
 * Queue Spec v3 규칙 적용:
 * - youtube_url이 없는데 status='completed'인 레코드를 'processing'으로 수정
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function fixBuggyContentStatus() {
  console.log('🔧 Buggy content.status 레코드 수정 시작\n');

  const db = new Database(dbPath);

  try {
    // 1. 수정할 레코드 찾기
    console.log('📋 수정할 레코드 검색 중...');
    const buggyRecords = db.prepare(`
      SELECT
        content_id,
        status,
        CASE WHEN script_content IS NOT NULL THEN 1 ELSE 0 END as has_script,
        CASE WHEN video_path IS NOT NULL THEN 1 ELSE 0 END as has_video,
        CASE WHEN youtube_url IS NOT NULL THEN 1 ELSE 0 END as has_youtube,
        title
      FROM content
      WHERE status = 'completed'
        AND youtube_url IS NULL
    `).all();

    if (buggyRecords.length === 0) {
      console.log('✅ 수정할 레코드가 없습니다. 모든 레코드가 올바릅니다.');
      db.close();
      return;
    }

    console.log(`\n⚠️  발견: ${buggyRecords.length}개의 잘못된 레코드\n`);
    buggyRecords.forEach((record, index) => {
      console.log(`${index + 1}. content_id: ${record.content_id}`);
      console.log(`   title: ${record.title || 'N/A'}`);
      console.log(`   script: ${record.has_script ? '✓' : '✗'}, video: ${record.has_video ? '✓' : '✗'}, youtube: ${record.has_youtube ? '✓' : '✗'}`);
      console.log();
    });

    // 2. 수정할 내용 계산
    console.log('💡 수정 계획:');
    buggyRecords.forEach((record, index) => {
      const newProgress = record.has_video ? 75 : (record.has_script ? 50 : 0);
      console.log(`${index + 1}. ${record.content_id}`);
      console.log(`   status: 'completed' → 'processing'`);
      console.log(`   progress: ${record.progress || 0} → ${newProgress}`);
      console.log();
    });

    // 3. 수정 실행
    console.log('🔄 레코드 수정 중...');
    const updateStmt = db.prepare(`
      UPDATE content
      SET
        status = 'processing',
        progress = CASE
          WHEN video_path IS NOT NULL THEN 75
          WHEN script_content IS NOT NULL THEN 50
          ELSE 0
        END,
        updated_at = datetime('now')
      WHERE content_id = ?
    `);

    let successCount = 0;
    let errorCount = 0;

    for (const record of buggyRecords) {
      try {
        const result = updateStmt.run(record.content_id);
        if (result.changes > 0) {
          successCount++;
          console.log(`  ✅ ${record.content_id} 수정 완료`);
        } else {
          errorCount++;
          console.log(`  ❌ ${record.content_id} 수정 실패 (변경 없음)`);
        }
      } catch (error) {
        errorCount++;
        console.log(`  ❌ ${record.content_id} 수정 실패:`, error.message);
      }
    }

    // 4. 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log('📊 수정 결과');
    console.log('='.repeat(60));
    console.log(`✅ 성공: ${successCount}/${buggyRecords.length}`);
    console.log(`❌ 실패: ${errorCount}/${buggyRecords.length}`);
    console.log('='.repeat(60));

    if (successCount > 0) {
      console.log('\n✅ 수정 완료! 다음 명령어로 확인하세요:');
      console.log('   node scripts/tests/test-content-status-logic.js');
    }

    if (errorCount > 0) {
      console.log('\n⚠️  일부 레코드 수정 실패. 로그를 확인하세요.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 수정 실패:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  fixBuggyContentStatus();
}

module.exports = { fixBuggyContentStatus };
