#!/usr/bin/env node
/**
 * Google Sites 설정을 백업 DB에서 복원하는 스크립트
 */

const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const CURRENT_DB = path.join(DATA_DIR, 'database.sqlite');
const BACKUP_DB = path.join(DATA_DIR, 'database.backup.1764103850589.sqlite');

function restoreGoogleSitesData() {
  console.log('🔄 Google Sites 설정 복원 시작...\n');

  // 백업 DB에서 데이터 읽기
  const backupDb = new Database(BACKUP_DB, { readonly: true });
  const userData = backupDb.prepare(`
    SELECT id, email, google_sites_url, google_sites_edit_url, google_sites_home_url
    FROM user
    WHERE google_sites_edit_url IS NOT NULL OR google_sites_home_url IS NOT NULL
  `).all();
  backupDb.close();

  if (userData.length === 0) {
    console.log('⚠️  백업 DB에 Google Sites 데이터가 없습니다.');
    return;
  }

  console.log(`📊 백업 DB에서 ${userData.length}명의 Google Sites 데이터를 찾았습니다.\n`);

  // 현재 DB에 업데이트
  const currentDb = new Database(CURRENT_DB);
  const updateStmt = currentDb.prepare(`
    UPDATE user
    SET google_sites_url = ?,
        google_sites_edit_url = ?,
        google_sites_home_url = ?
    WHERE id = ?
  `);

  let updatedCount = 0;
  userData.forEach(user => {
    const result = updateStmt.run(
      user.google_sites_url,
      user.google_sites_edit_url,
      user.google_sites_home_url,
      user.id
    );

    if (result.changes > 0) {
      console.log(`✅ ${user.email}`);
      console.log(`   - 편집 URL: ${user.google_sites_edit_url || '(없음)'}`);
      console.log(`   - 홈 URL: ${user.google_sites_home_url || '(없음)'}\n`);
      updatedCount++;
    }
  });

  currentDb.close();

  console.log('=' .repeat(60));
  console.log(`✅ 복원 완료! ${updatedCount}명의 Google Sites 설정이 복원되었습니다.`);
}

try {
  restoreGoogleSitesData();
} catch (error) {
  console.error('❌ 오류 발생:', error.message);
  process.exit(1);
}
