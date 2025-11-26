/**
 * 불필요한 테이블의 데이터를 필수 테이블로 마이그레이션
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, '../../trend-video-frontend');
const Database = require(path.join(FRONTEND_PATH, 'node_modules/better-sqlite3'));
const DB_PATH = path.join(FRONTEND_PATH, 'data/database.sqlite');

function migrateTableData() {
  console.log('🔄 데이터 마이그레이션 시작...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 데이터베이스 파일을 찾을 수 없습니다:', DB_PATH);
    process.exit(1);
  }

  // 백업 생성
  const backupPath = DB_PATH.replace('.sqlite', `.backup-migrate.${Date.now()}.sqlite`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ 백업 생성: ${backupPath}\n`);

  const db = new Database(DB_PATH);

  try {
    // 1. automation_settings 데이터 확인
    console.log('📋 1. automation_settings 데이터 확인:');
    const automationSettings = db.prepare(`SELECT * FROM automation_settings`).all();
    console.log(`   레코드 개수: ${automationSettings.length}`);
    automationSettings.forEach(row => {
      console.log(`   - ${row.key}: ${row.value}`);
    });
    console.log();

    // 2. video_categories 데이터 확인
    console.log('📋 2. video_categories 데이터 확인:');
    try {
      const videoCategories = db.prepare(`SELECT * FROM video_categories`).all();
      console.log(`   레코드 개수: ${videoCategories.length}`);
      videoCategories.slice(0, 5).forEach(row => {
        console.log(`   - ${JSON.stringify(row)}`);
      });
      if (videoCategories.length > 5) {
        console.log(`   ... 외 ${videoCategories.length - 5}개`);
      }
    } catch (e) {
      console.log(`   오류: ${e.message}`);
    }
    console.log();

    // 3. settings 데이터 확인
    console.log('📋 3. settings 데이터 확인:');
    try {
      const settings = db.prepare(`SELECT * FROM settings`).all();
      console.log(`   레코드 개수: ${settings.length}`);
      settings.forEach(row => {
        console.log(`   - ${JSON.stringify(row)}`);
      });
    } catch (e) {
      console.log(`   오류: ${e.message}`);
    }
    console.log();

    // 4. tasks 데이터 확인
    console.log('📋 4. tasks 데이터 확인:');
    try {
      const tasks = db.prepare(`SELECT * FROM tasks`).all();
      console.log(`   레코드 개수: ${tasks.length}`);
      tasks.forEach(row => {
        console.log(`   - ${JSON.stringify(row)}`);
      });
    } catch (e) {
      console.log(`   오류: ${e.message}`);
    }
    console.log();

    // 5. tasks_locks 데이터 확인
    console.log('📋 5. tasks_locks 데이터 확인:');
    try {
      const tasksLocks = db.prepare(`SELECT * FROM tasks_locks`).all();
      console.log(`   레코드 개수: ${tasksLocks.length}`);
      tasksLocks.forEach(row => {
        console.log(`   - ${JSON.stringify(row)}`);
      });
    } catch (e) {
      console.log(`   오류: ${e.message}`);
    }
    console.log();

    console.log('='.repeat(60));
    console.log('마이그레이션 시작...\n');

    let migratedCount = 0;

    // 마이그레이션 1: automation_settings → automation_setting
    console.log('🔄 1. automation_settings → automation_setting');
    if (automationSettings.length > 0) {
      const insert = db.prepare(`
        INSERT OR REPLACE INTO automation_setting (key, value, description, updated_at)
        VALUES (?, ?, ?, ?)
      `);

      const transaction = db.transaction((rows) => {
        for (const row of rows) {
          insert.run(
            row.key,
            row.value,
            row.description || null,
            row.updated_at || new Date().toISOString()
          );
        }
      });

      transaction(automationSettings);
      console.log(`   ✅ ${automationSettings.length}개 레코드 이동 완료`);
      migratedCount += automationSettings.length;
    } else {
      console.log(`   ⚠️ 데이터 없음`);
    }
    console.log();

    // 마이그레이션 2: video_categories → user_content_category
    console.log('🔄 2. video_categories → user_content_category (해당되는 경우)');
    try {
      const videoCategories = db.prepare(`SELECT * FROM video_categories`).all();

      if (videoCategories.length > 0) {
        // video_categories의 스키마 확인 후 적절히 변환
        const insert = db.prepare(`
          INSERT OR IGNORE INTO user_content_category (id, user_id, category, created_at)
          VALUES (?, ?, ?, ?)
        `);

        const transaction = db.transaction((rows) => {
          for (const row of rows) {
            // user_id가 있으면 사용, 없으면 스킵 또는 기본값 사용
            const userId = row.user_id || 'system';
            const category = row.category || row.name || row.title;
            const id = row.id || `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const createdAt = row.created_at || new Date().toISOString();

            if (category) {
              insert.run(id, userId, category, createdAt);
            }
          }
        });

        transaction(videoCategories);
        console.log(`   ✅ ${videoCategories.length}개 레코드 처리 완료`);
        migratedCount += videoCategories.length;
      } else {
        console.log(`   ⚠️ 데이터 없음`);
      }
    } catch (e) {
      console.log(`   ⚠️ 마이그레이션 스킵: ${e.message}`);
    }
    console.log();

    // 마이그레이션 3: settings → automation_setting
    console.log('🔄 3. settings → automation_setting');
    try {
      const settings = db.prepare(`SELECT * FROM settings`).all();

      if (settings.length > 0) {
        const insert = db.prepare(`
          INSERT OR REPLACE INTO automation_setting (key, value, description, updated_at)
          VALUES (?, ?, ?, ?)
        `);

        const transaction = db.transaction((rows) => {
          for (const row of rows) {
            const key = row.key || row.name || row.setting_key;
            const value = row.value || row.setting_value;
            const description = row.description || `Migrated from settings table`;
            const updatedAt = row.updated_at || new Date().toISOString();

            if (key && value) {
              insert.run(key, value, description, updatedAt);
            }
          }
        });

        transaction(settings);
        console.log(`   ✅ ${settings.length}개 레코드 이동 완료`);
        migratedCount += settings.length;
      } else {
        console.log(`   ⚠️ 데이터 없음`);
      }
    } catch (e) {
      console.log(`   ⚠️ 마이그레이션 스킵: ${e.message}`);
    }
    console.log();

    // 마이그레이션 4: tasks → task
    console.log('🔄 4. tasks → task');
    try {
      const tasks = db.prepare(`SELECT * FROM tasks`).all();

      if (tasks.length > 0) {
        const insert = db.prepare(`
          INSERT OR REPLACE INTO task (id, user_id, title, type, category, tags, product_url, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const transaction = db.transaction((rows) => {
          for (const row of rows) {
            insert.run(
              row.id,
              row.user_id,
              row.title,
              row.type || 'longform',
              row.category || null,
              row.tags || null,
              row.product_url || null,
              row.status || 'active',
              row.created_at || new Date().toISOString(),
              row.updated_at || new Date().toISOString()
            );
          }
        });

        transaction(tasks);
        console.log(`   ✅ ${tasks.length}개 레코드 이동 완료`);
        migratedCount += tasks.length;
      } else {
        console.log(`   ⚠️ 데이터 없음`);
      }
    } catch (e) {
      console.log(`   ⚠️ 마이그레이션 스킵: ${e.message}`);
    }
    console.log();

    // 마이그레이션 5: tasks_locks → task_lock
    console.log('🔄 5. tasks_locks → task_lock');
    try {
      const tasksLocks = db.prepare(`SELECT * FROM tasks_locks`).all();

      if (tasksLocks.length > 0) {
        const insert = db.prepare(`
          INSERT OR REPLACE INTO task_lock (task_type, locked_by, locked_at, worker_pid)
          VALUES (?, ?, ?, ?)
        `);

        const transaction = db.transaction((rows) => {
          for (const row of rows) {
            insert.run(
              row.task_type,
              row.locked_by || null,
              row.locked_at || null,
              row.worker_pid || null
            );
          }
        });

        transaction(tasksLocks);
        console.log(`   ✅ ${tasksLocks.length}개 레코드 이동 완료`);
        migratedCount += tasksLocks.length;
      } else {
        console.log(`   ⚠️ 데이터 없음`);
      }
    } catch (e) {
      console.log(`   ⚠️ 마이그레이션 스킵: ${e.message}`);
    }
    console.log();

    console.log('='.repeat(60));
    console.log('✅ 마이그레이션 완료!');
    console.log(`   총 마이그레이션: ${migratedCount}개 레코드`);
    console.log(`   백업: ${backupPath}`);

  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    console.error('\n🔄 백업에서 복구하려면:');
    console.error(`   copy "${backupPath}" "${DB_PATH}"`);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  migrateTableData();
}

module.exports = { migrateTableData };
