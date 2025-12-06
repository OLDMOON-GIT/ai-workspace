/**
 * user_category 테이블 생성 스크립트
 * 각 사용자가 자신만의 카테고리를 관리할 수 있도록 함
 *
 * 기본 카테고리: 상품, 시니어사연
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(DB_PATH);

try {
  // user_category 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      display_name TEXT NOT NULL,
      keywords TEXT,
      description TEXT,
      is_default BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, category),
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ user_category 테이블 생성 완료');

  // 기본 카테고리 추가를 위한 모든 사용자 조회
  const users = db.prepare('SELECT id FROM user').all();

  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO user_category (user_id, category, display_name, keywords, description, is_default)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const defaultCategories = [
    {
      category: '상품',
      displayName: '상품 광고',
      keywords: JSON.stringify(['상품 리뷰', '제품 소개', '쿠팡 추천', '가성비 상품', '인기 상품', '베스트 상품', '필수템']),
      description: '상품 소개 및 광고'
    },
    {
      category: '시니어사연',
      displayName: '시니어 실화·사연',
      keywords: JSON.stringify(['시어머니 며느리', '고부갈등', '시어머니 사연', '며느리 실화', '시댁 사연', '노후 사연', '할머니 사연']),
      description: '시니어 세대의 실화와 가족 사연'
    }
  ];

  let addedCount = 0;
  users.forEach(user => {
    defaultCategories.forEach(cat => {
      insertCategory.run(
        user.id,
        cat.category,
        cat.displayName,
        cat.keywords,
        cat.description
      );
      addedCount++;
    });
  });

  console.log(`✅ 기본 카테고리 추가 완료: ${users.length}명의 사용자에게 ${defaultCategories.length}개씩, 총 ${addedCount}개`);

  // 결과 확인
  const categories = db.prepare('SELECT * FROM user_category LIMIT 10').all();
  console.log('\n📋 추가된 카테고리 예시:');
  categories.forEach(cat => {
    console.log(`  ${cat.user_id} - ${cat.display_name} (${cat.category})`);
  });

} catch (error) {
  console.error('❌ 오류 발생:', error);
} finally {
  db.close();
}
