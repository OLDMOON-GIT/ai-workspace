/**
 * content 테이블 통합 마이그레이션 (Queue Spec v3 패턴)
 *
 * 변경사항:
 * - PK: (content_id, type) → content_id only
 * - type 컬럼 삭제
 * - content → script_content, video_path 분리
 * - content_id = task_id (1:1 매핑)
 *
 * 진행도 추적:
 * - script_content 존재 → 대본 완료
 * - video_path 존재 → 영상 완료
 * - youtube_url 존재 → 퍼블리시 노출
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function migrateContentUnified() {
  const db = new Database(dbPath);

  try {
    // FK 제약 조건 비활성화
    db.pragma('foreign_keys = OFF');

    console.log('🚀 content 테이블 통합 마이그레이션 시작');

    // 1. 현재 스키마 확인
    const currentSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='content'").get();
    console.log('\n📋 현재 스키마:');
    console.log(currentSchema.sql);

    // 2. 데이터 백업 및 통계
    const totalRows = db.prepare('SELECT COUNT(*) as cnt FROM content').get().cnt;
    const uniqueContentIds = db.prepare('SELECT COUNT(DISTINCT content_id) as cnt FROM content').get().cnt;
    console.log(`\n📊 현재 데이터: ${totalRows}개 행, ${uniqueContentIds}개 고유 content_id`);

    // 3. 새 테이블 생성 (content_id만 PK)
    console.log('\n➕ 새 content 테이블 생성 중...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_new (
        content_id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        format TEXT CHECK(format IN ('longform', 'shortform', 'sora2', 'product', 'product-info')),
        title TEXT NOT NULL,
        original_title TEXT,

        -- ⭐ type 대신 각 단계별 컬럼으로 분리
        script_content TEXT,    -- 대본 JSON (기존 type='script'의 content)
        video_path TEXT,        -- 영상 경로 (기존 type='video'의 content)

        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        progress INTEGER DEFAULT 0,
        error TEXT,
        pid INTEGER,
        youtube_url TEXT,
        published INTEGER DEFAULT 0,
        published_at TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        use_claude_local INTEGER DEFAULT 0,
        source_content_id TEXT,
        conversion_type TEXT,
        is_regenerated INTEGER DEFAULT 0,
        model TEXT,
        tts_voice TEXT,
        product_info TEXT,
        category TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        task_id TEXT,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );
    `);

    // 4. 데이터 마이그레이션 (script + video 병합)
    console.log('\n🔄 데이터 마이그레이션 중...');

    // 각 content_id별로 script와 video를 하나의 행으로 병합
    const contentIds = db.prepare('SELECT DISTINCT content_id FROM content').all();

    let migratedCount = 0;
    const insertStmt = db.prepare(`
      INSERT INTO content_new (
        content_id, user_id, format, title, original_title,
        script_content, video_path,
        status, progress, error, pid, youtube_url, published, published_at,
        input_tokens, output_tokens, use_claude_local, model, tts_voice,
        source_content_id, conversion_type, is_regenerated,
        product_info, category, task_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const { content_id } of contentIds) {
      // script와 video 행 조회
      const scriptRow = db.prepare('SELECT * FROM content WHERE content_id = ? AND type = ?').get(content_id, 'script');
      const videoRow = db.prepare('SELECT * FROM content WHERE content_id = ? AND type = ?').get(content_id, 'video');

      // 기준 행 선택 (video가 있으면 video, 없으면 script)
      const baseRow = videoRow || scriptRow;

      if (!baseRow) {
        console.warn(`⚠️ content_id ${content_id}: 행을 찾을 수 없음 (스킵)`);
        continue;
      }

      // script_content: type='script'의 content
      const scriptContent = scriptRow ? scriptRow.content : null;

      // video_path: type='video'의 content
      const videoPath = videoRow ? videoRow.content : null;

      // 병합된 행 삽입
      insertStmt.run(
        content_id,
        baseRow.user_id,
        baseRow.format,
        baseRow.title,
        baseRow.original_title,
        scriptContent,
        videoPath,
        baseRow.status,
        baseRow.progress,
        baseRow.error,
        baseRow.pid,
        baseRow.youtube_url,
        baseRow.published,
        baseRow.published_at,
        baseRow.input_tokens,
        baseRow.output_tokens,
        baseRow.use_claude_local,
        baseRow.model,
        baseRow.tts_voice,
        baseRow.source_content_id,
        baseRow.conversion_type,
        baseRow.is_regenerated,
        baseRow.product_info,
        baseRow.category,
        baseRow.task_id || content_id,  // task_id가 없으면 content_id 사용
        baseRow.created_at,
        baseRow.updated_at
      );

      migratedCount++;
    }

    console.log(`✅ ${migratedCount}개 content_id 마이그레이션 완료`);

    // 5. content_log FK 업데이트 (type 제거)
    console.log('\n🔄 content_log FK 재구성 중...');

    // content_log 백업
    db.exec(`
      CREATE TABLE content_log_backup AS SELECT * FROM content_log;
    `);

    // content_log 재생성 (type 제거)
    db.exec(`
      DROP TABLE content_log;

      CREATE TABLE content_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id TEXT NOT NULL,
        log_message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (content_id) REFERENCES content(content_id) ON DELETE CASCADE
      );

      -- 기존 로그 복사 (중복 제거)
      INSERT INTO content_log (content_id, log_message, created_at)
      SELECT DISTINCT content_id, log_message, created_at
      FROM content_log_backup
      ORDER BY created_at;

      DROP TABLE content_log_backup;
    `);

    // 6. 기존 테이블 교체
    console.log('\n🔄 테이블 교체 중...');
    db.exec(`
      DROP TABLE content;
      ALTER TABLE content_new RENAME TO content;
    `);

    // 7. 인덱스 재생성
    console.log('\n📊 인덱스 생성 중...');
    db.exec(`
      CREATE INDEX idx_content_user_id ON content(user_id);
      CREATE INDEX idx_content_format ON content(format);
      CREATE INDEX idx_content_status ON content(status);
      CREATE INDEX idx_content_youtube_url ON content(youtube_url);
      CREATE INDEX idx_content_published ON content(published);
    `);

    // 8. 최종 검증
    console.log('\n🔍 마이그레이션 검증 중...');
    const newSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='content'").get();
    const newRowCount = db.prepare('SELECT COUNT(*) as cnt FROM content').get().cnt;
    const sampleRows = db.prepare(`
      SELECT content_id,
             script_content IS NOT NULL as has_script,
             video_path IS NOT NULL as has_video,
             youtube_url IS NOT NULL as has_youtube
      FROM content
      LIMIT 5
    `).all();

    console.log('\n📋 새 스키마:');
    console.log(newSchema.sql);
    console.log(`\n✅ 마이그레이션 후: ${newRowCount}개 행 (${uniqueContentIds}개 content_id)`);
    console.log('\n📊 샘플 데이터:');
    sampleRows.forEach(row => {
      console.log(`  - ${row.content_id}: script=${row.has_script}, video=${row.has_video}, youtube=${row.has_youtube}`);
    });

    console.log('\n✅ content 테이블 통합 마이그레이션 완료!');
    console.log('\n📝 다음 단계:');
    console.log('   1. src/types/content.ts 업데이트 (ContentType 제거)');
    console.log('   2. src/lib/content.ts 업데이트 (type 파라미터 제거)');
    console.log('   3. API 라우트 업데이트');

    // FK 제약 조건 다시 활성화
    db.pragma('foreign_keys = ON');

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    // FK 제약 조건 다시 활성화 (에러 발생 시에도)
    db.pragma('foreign_keys = ON');
    throw error;
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  migrateContentUnified();
}

module.exports = { migrateContentUnified };
