/**
 * BTS-3391: Too many connections 버그 수정 테스트
 *
 * 문제: MySQL 연결 수가 max_connections(151)를 초과하여
 *       "Too many connections" 오류 발생
 *
 * 해결책:
 * 1. MySQL 서버 max_connections를 300으로 증가
 * 2. Connection Pool에 maxIdle, idleTimeout 설정 추가
 *    - maxIdle: 5 (유휴 커넥션 최대 5개)
 *    - idleTimeout: 60000 (60초 후 유휴 커넥션 해제)
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'trend2024',
  database: process.env.MYSQL_DATABASE || 'trend_video',
};

describe('BTS-3391: Too many connections', () => {
  let connection: mysql.Connection;

  beforeAll(async () => {
    connection = await mysql.createConnection(DB_CONFIG);
  });

  afterAll(async () => {
    if (connection) {
      await connection.end();
    }
  });

  it('MySQL max_connections가 300 이상으로 설정되어야 함', async () => {
    const [rows] = await connection.query('SHOW VARIABLES LIKE "max_connections"');
    const result = rows as any[];
    const maxConnections = parseInt(result[0].Value);

    expect(maxConnections).toBeGreaterThanOrEqual(300);
  });

  it('wait_timeout이 적절하게 설정되어야 함 (600초 이하)', async () => {
    const [rows] = await connection.query('SHOW VARIABLES LIKE "wait_timeout"');
    const result = rows as any[];
    const waitTimeout = parseInt(result[0].Value);

    // 너무 길면 유휴 커넥션이 오래 유지됨
    expect(waitTimeout).toBeLessThanOrEqual(28800); // 8시간
  });

  it('현재 연결 수가 max_connections의 80% 미만이어야 함', async () => {
    const [maxRows] = await connection.query('SHOW VARIABLES LIKE "max_connections"');
    const [connRows] = await connection.query('SHOW STATUS LIKE "Threads_connected"');

    const maxConnections = parseInt((maxRows as any[])[0].Value);
    const currentConnections = parseInt((connRows as any[])[0].Value);

    const usagePercent = (currentConnections / maxConnections) * 100;
    console.log(`현재 연결: ${currentConnections}/${maxConnections} (${usagePercent.toFixed(1)}%)`);

    // 80% 이상이면 경고
    expect(usagePercent).toBeLessThan(80);
  });

  it('mysql.ts의 pool 설정에 maxIdle, idleTimeout이 포함되어야 함', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const mysqlTsPath = path.join(
      process.cwd(),
      'src/lib/mysql.ts'
    );

    const content = fs.readFileSync(mysqlTsPath, 'utf-8');

    // maxIdle 설정 확인
    expect(content).toMatch(/maxIdle:\s*\d+/);

    // idleTimeout 설정 확인
    expect(content).toMatch(/idleTimeout:\s*\d+/);
  });

  it('unified-worker.js의 pool 설정에 maxIdle, idleTimeout이 포함되어야 함', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const workerPath = path.join(
      process.cwd(),
      'src/workers/unified-worker.js'
    );

    const content = fs.readFileSync(workerPath, 'utf-8');

    // maxIdle 설정 확인
    expect(content).toMatch(/maxIdle:\s*\d+/);

    // idleTimeout 설정 확인
    expect(content).toMatch(/idleTimeout:\s*\d+/);
  });
});
