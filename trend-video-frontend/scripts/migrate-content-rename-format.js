/**
 * content 테이블 format → prompt_format 변경
 *
 * 컬럼명 명확화: format → prompt_format
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function renameFormatColumn() {
  const db = new Database(dbPath);

  try {
    // FK 제약 조건 비활성화
    db.pragma('foreign_keys = OFF');

    console.log('🚀 content 테이블 format → prompt_format 변경 시작');

    // 현재 스키마 확인
    const columns = db.prepare('PRAGMA table_info(content)').all();
    const hasFormat = columns.some(c => c.name === 'format');
    const hasPromptFormat = columns.some(c => c.name === 'prompt_format');

    if (hasPromptFormat) {
      console.log('✅ prompt_format 컬럼이 이미 존재합니다.');
      db.pragma('foreign_keys = ON');
      return;
    }

    if (!hasFormat) {
      console.log('⚠️ format 컬럼이 존재하지 않습니다.');
      db.pragma('foreign_keys = ON');
      return;
    }

    console.log('📋 현재 컬럼:', columns.map(c => c.name).join(', '));

    // 새 테이블 생성 (format → prompt_format)
    console.log('\n➕ prompt_format 사용하는 새 테이블 생성 중...');
    db.exec(`
      CREATE TABLE content_new (
        content_id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        prompt_format TEXT CHECK(prompt_format IN ('longform', 'shortform', 'sora2', 'product', 'product-info')),
        title TEXT NOT NULL,
        original_title TEXT,
        script_content TEXT,
        video_path TEXT,
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
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );
    `);

    // 데이터 복사 (format → prompt_format)
    console.log('🔄 데이터 복사 중...');
    db.exec(`
      INSERT INTO content_new (
        content_id, user_id, prompt_format, title, original_title,
        script_content, video_path,
        status, progress, error, pid, youtube_url, published, published_at,
        input_tokens, output_tokens, use_claude_local,
        source_content_id, conversion_type, is_regenerated,
        model, tts_voice, product_info, category,
        created_at, updated_at
      )
      SELECT
        content_id, user_id, format, title, original_title,
        script_content, video_path,
        status, progress, error, pid, youtube_url, published, published_at,
        input_tokens, output_tokens, use_claude_local,
        source_content_id, conversion_type, is_regenerated,
        model, tts_voice, product_info, category,
        created_at, updated_at
      FROM content;
    `);

    // 테이블 교체
    console.log('🔄 테이블 교체 중...');
    db.exec(`
      DROP TABLE content;
      ALTER TABLE content_new RENAME TO content;
    `);

    // 인덱스 재생성
    console.log('📊 인덱스 생성 중...');
    db.exec(`
      CREATE INDEX idx_content_user_id ON content(user_id);
      CREATE INDEX idx_content_prompt_format ON content(prompt_format);
      CREATE INDEX idx_content_status ON content(status);
      CREATE INDEX idx_content_youtube_url ON content(youtube_url);
      CREATE INDEX idx_content_published ON content(published);
    `);

    // 최종 확인
    const finalColumns = db.prepare('PRAGMA table_info(content)').all();
    console.log('\n📋 최종 컬럼:', finalColumns.map(c => c.name).join(', '));

    const rowCount = db.prepare('SELECT COUNT(*) as cnt FROM content').get().cnt;
    console.log(`✅ ${rowCount}개 행 마이그레이션 완료`);

    console.log('\n✅ format → prompt_format 변경 완료!');

    // FK 제약 조건 다시 활성화
    db.pragma('foreign_keys = ON');

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    db.pragma('foreign_keys = ON');
    throw error;
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  renameFormatColumn();
}

module.exports = { renameFormatColumn };
