const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  console.log('=== bugs 테이블 마이그레이션 시작 ===\n');

  try {
    // 0. 비정상 ID 데이터 정리
    console.log('0. 비정상 ID 데이터 정리...');
    const [abnormal] = await conn.execute("SELECT id FROM bugs WHERE id NOT LIKE 'BTS-0%'");
    if (abnormal.length > 0) {
      console.log('   삭제 대상:', abnormal.length, '개');
      abnormal.forEach(r => console.log('     -', r.id));
      await conn.execute("DELETE FROM bugs WHERE id NOT LIKE 'BTS-0%'");
      console.log('   삭제 완료\n');
    } else {
      console.log('   정리할 데이터 없음\n');
    }

    // 1. 백업 테이블 생성
    console.log('1. 백업 테이블 생성...');
    await conn.execute('DROP TABLE IF EXISTS bugs_backup');
    await conn.execute('CREATE TABLE bugs_backup AS SELECT * FROM bugs');
    const [backupCount] = await conn.execute('SELECT COUNT(*) as cnt FROM bugs_backup');
    console.log('   백업 완료:', backupCount[0].cnt, '건\n');

    // 2. 새 테이블 생성 (INT id)
    console.log('2. 새 테이블 생성 (bugs_new)...');
    await conn.execute('DROP TABLE IF EXISTS bugs_new');
    await conn.execute(`
      CREATE TABLE bugs_new (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('bug', 'spec') DEFAULT 'bug',
        priority ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P2',
        title TEXT NOT NULL,
        summary TEXT,
        status VARCHAR(32) NOT NULL,
        log_path TEXT,
        screenshot_path TEXT,
        video_path TEXT,
        trace_path TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        assigned_to VARCHAR(64),
        metadata JSON,
        resolution_note TEXT,
        INDEX idx_status (status)
      )
    `);
    console.log('   완료\n');

    // 3. 데이터 마이그레이션 (BTS-0000XXX에서 숫자만 추출)
    console.log('3. 데이터 마이그레이션...');
    await conn.execute(`
      INSERT INTO bugs_new (id, type, priority, title, summary, status, log_path, screenshot_path, video_path, trace_path, created_at, updated_at, assigned_to, metadata, resolution_note)
      SELECT
        CAST(SUBSTRING(id, 5) AS UNSIGNED) as id,
        type, priority, title, summary, status, log_path, screenshot_path, video_path, trace_path, created_at, updated_at, assigned_to, metadata, resolution_note
      FROM bugs
      WHERE id REGEXP '^BTS-[0-9]+$'
      ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED)
    `);
    const [newCount] = await conn.execute('SELECT COUNT(*) as cnt FROM bugs_new');
    console.log('   마이그레이션 완료:', newCount[0].cnt, '건\n');

    // 4. AUTO_INCREMENT 값 설정
    const [maxId] = await conn.execute('SELECT MAX(id) as maxId FROM bugs_new');
    const nextId = (maxId[0].maxId || 0) + 1;
    console.log('4. AUTO_INCREMENT 설정:', nextId);
    await conn.execute(`ALTER TABLE bugs_new AUTO_INCREMENT = ${nextId}`);
    console.log('   완료\n');

    // 5. 테이블 교체
    console.log('5. 테이블 교체...');
    await conn.execute('DROP TABLE bugs');
    await conn.execute('RENAME TABLE bugs_new TO bugs');
    console.log('   완료\n');

    // 6. 결과 확인
    console.log('=== 마이그레이션 완료 ===\n');
    const [columns] = await conn.execute('DESCRIBE bugs');
    console.log('새 테이블 구조:');
    columns.slice(0, 3).forEach(col => {
      console.log('  ', col.Field, '-', col.Type, col.Extra ? '(' + col.Extra + ')' : '');
    });

    const [sample] = await conn.execute('SELECT id, title, status FROM bugs ORDER BY id LIMIT 5');
    console.log('\n샘플 데이터:');
    sample.forEach(row => {
      console.log('  ', row.id, '-', row.title.substring(0, 30));
    });

    const [autoInc] = await conn.execute("SHOW TABLE STATUS WHERE Name = 'bugs'");
    console.log('\nAuto_increment:', autoInc[0].Auto_increment);

  } catch (error) {
    console.error('에러 발생:', error.message);
    console.log('\n롤백 시도...');
    try {
      await conn.execute('DROP TABLE IF EXISTS bugs_new');
      console.log('bugs_new 테이블 삭제 완료');
    } catch (e) {}
  }

  await conn.end();
})();
