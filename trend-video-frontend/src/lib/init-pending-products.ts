import db from './sqlite';

/**
 * 대기 목록 테이블 생성
 * - 외부 사이트에서 크롤링한 상품들의 대기 목록
 * - 나중에 영상이 준비되면 coupang_product로 이동
 */
export async function initPendingProductsTable() {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS product_crawl_link_pending (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        source_url TEXT NOT NULL,
        product_url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        image_url TEXT,
        original_price INTEGER,
        discount_price INTEGER,
        category VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        crawl_status VARCHAR(50) DEFAULT 'not_crawled',
        notes TEXT,
        video_ready BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // crawl_status 필드가 없는 경우 추가 (기존 테이블 업데이트)
    try {
      await db.exec(`ALTER TABLE product_crawl_link_pending ADD COLUMN crawl_status VARCHAR(50) DEFAULT 'not_crawled'`);
      console.log('✅ crawl_status 필드 추가 완료');
    } catch (alterError) {
      // 이미 존재하면 무시
    }

    // 인덱스 생성 (MySQL: IF NOT EXISTS 미지원, 개별 try-catch)
    try {
      await db.exec(`CREATE INDEX idx_product_crawl_link_pending_user_id ON product_crawl_link_pending(user_id)`);
    } catch (e) { /* 이미 존재 */ }
    try {
      await db.exec(`CREATE INDEX idx_product_crawl_link_pending_status ON product_crawl_link_pending(status)`);
    } catch (e) { /* 이미 존재 */ }
    try {
      await db.exec(`CREATE INDEX idx_product_crawl_link_pending_crawl_status ON product_crawl_link_pending(crawl_status)`);
    } catch (e) { /* 이미 존재 */ }
    try {
      await db.exec(`CREATE INDEX idx_product_crawl_link_pending_video_ready ON product_crawl_link_pending(video_ready)`);
    } catch (e) { /* 이미 존재 */ }

    console.log('✅ product_crawl_link_pending 테이블 생성 완료');
  } catch (error) {
    console.error('❌ product_crawl_link_pending 테이블 생성 실패:', error);
    throw error;
  }
}

// 앱 시작 시 자동 실행
if (require.main === module) {
  initPendingProductsTable();
}
