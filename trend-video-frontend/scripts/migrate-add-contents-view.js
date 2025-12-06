/**
 * BTS-3366: 'contents' 호환성 뷰 추가 마이그레이션
 *
 * 문제: Table 'trend_video.contents' doesn't exist
 * 원인: MySQL 스키마는 'content' (단수형) 테이블을 사용하지만,
 *       일부 구형 코드가 'contents' (복수형) 테이블을 참조
 *
 * 해결: 'contents' 뷰를 생성하여 'content' 테이블을 가리키도록 함
 */

const mysql = require('mysql2/promise');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getConnection(maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await mysql.createConnection({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'trend2024!',
        database: process.env.MYSQL_DATABASE || 'trend_video',
        connectTimeout: 10000,
      });
    } catch (error) {
      if (error.code === 'ER_CON_COUNT_ERROR' && i < maxRetries - 1) {
        console.log(`⏳ MySQL 연결 대기 중... (${i + 1}/${maxRetries})`);
        await sleep(3000);
      } else {
        throw error;
      }
    }
  }
}

async function migrate() {
  console.log('🔄 BTS-3366: contents 호환성 뷰 마이그레이션 시작...');

  const connection = await getConnection();

  try {
    // 기존 contents 뷰가 있는지 확인
    const [rows] = await connection.query(`
      SELECT TABLE_NAME, TABLE_TYPE
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'contents'
    `);

    if (rows.length > 0) {
      const tableType = rows[0].TABLE_TYPE;
      if (tableType === 'VIEW') {
        console.log('✅ contents 뷰가 이미 존재합니다.');
        return;
      } else if (tableType === 'BASE TABLE') {
        console.log('⚠️ contents가 테이블로 존재합니다. 뷰로 대체하려면 먼저 테이블을 삭제하세요.');
        console.log('   (데이터 손실 방지를 위해 자동으로 삭제하지 않습니다)');
        return;
      }
    }

    // contents 뷰 생성
    console.log('📝 contents 뷰 생성 중...');
    await connection.query(`
      CREATE OR REPLACE VIEW contents AS
      SELECT
        content_id AS id,
        user_id,
        'script' AS type,
        prompt_format AS format,
        title,
        original_title,
        status,
        error,
        input_tokens,
        output_tokens,
        source_content_id,
        created_at,
        updated_at
      FROM content
    `);

    console.log('✅ contents 뷰 생성 완료!');

    // 뷰 확인
    const [viewCheck] = await connection.query(`
      SELECT COUNT(*) as count FROM contents
    `);
    console.log(`📊 contents 뷰 데이터 개수: ${viewCheck[0].count}`);

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate()
  .then(() => {
    console.log('\n✅ BTS-3366 마이그레이션 완료!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 마이그레이션 실패:', error.message);
    process.exit(1);
  });
