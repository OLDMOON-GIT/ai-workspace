/**
 * content 테이블 불필요한 컬럼 제거
 *
 * 제거 컬럼:
 * - conversion_type: source_content_id로 충분
 * - is_regenerated: 사용 안 함
 * - published: youtube_url 존재 여부로 판단
 * - published_at: youtube_url로 충분
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function cleanupContentColumns() {
  const db = new Database(dbPath);

  try {
    // FK 제약 조건 비활성화
    db.pragma('foreign_keys = OFF');

    console.log('🚀 content 테이블 불필요한 컬럼 제거 시작');

    // 현재 스키마 확인
    const columns = db.prepare('PRAGMA table_info(content)').all();
    console.log('📋 현재 컬럼:', columns.map(c => c.name).join(', '));

    // 새 테이블 생성 (불필요한 컬럼 제외)
    console.log('\n➕ 정리된 테이블 생성 중...');
    db.exec(`
      CREATE TABLE content_new (
        content_id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        prompt_format TEXT CHECK(prompt_format IN ('longform', 'shortform', 'sora2', 'product', 'product-info')),
        title TEXT NOT NULL,
        original_title TEXT,

        -- ⭐ Queue Spec v3: 진행도 마킹
        script_content TEXT,
        video_path TEXT,
        youtube_url TEXT,

        -- 상태
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        progress INTEGER DEFAULT 0,
        error TEXT,
        pid INTEGER,

        -- AI 사용량
        input_tokens INTEGER,
        output_tokens INTEGER,
        use_claude_local INTEGER DEFAULT 0,
        model TEXT,

        -- 원본 추적 (변환 시)
        source_content_id TEXT,

        -- 음성/상품
        tts_voice TEXT,
        product_info TEXT,
        category TEXT,

        -- 시간
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),

        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      );
    `);

    // 데이터 복사
    console.log('🔄 데이터 복사 중...');
    db.exec(`
      INSERT INTO content_new (
        content_id, user_id, prompt_format, title, original_title,
        script_content, video_path, youtube_url,
        status, progress, error, pid,
        input_tokens, output_tokens, use_claude_local, model,
        source_content_id,
        tts_voice, product_info, category,
        created_at, updated_at
      )
      SELECT
        content_id, user_id, prompt_format, title, original_title,
        script_content, video_path, youtube_url,
        status, progress, error, pid,
        input_tokens, output_tokens, use_claude_local, model,
        source_content_id,
        tts_voice, product_info, category,
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
      CREATE INDEX idx_content_source ON content(source_content_id);
    `);

    // 최종 확인
    const finalColumns = db.prepare('PRAGMA table_info(content)').all();
    console.log('\n📋 최종 컬럼:', finalColumns.map(c => c.name).join(', '));

    const rowCount = db.prepare('SELECT COUNT(*) as cnt FROM content').get().cnt;
    console.log(`✅ ${rowCount}개 행 마이그레이션 완료`);

    console.log('\n✅ 제거된 컬럼:');
    console.log('   - conversion_type');
    console.log('   - is_regenerated');
    console.log('   - published');
    console.log('   - published_at');

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
  cleanupContentColumns();
}

module.exports = { cleanupContentColumns };
