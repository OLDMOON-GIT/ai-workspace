import mysql from 'mysql2/promise';

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  MySQL Database Connection (mysql2)                                       ║
// ║                                                                           ║
// ║  better-sqlite3에서 mysql2로 마이그레이션됨                               ║
// ║  Connection Pool 사용 - 동시 연결 관리                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// MySQL 연결 설정
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'trend2024',
  database: process.env.MYSQL_DATABASE || 'trend_video',
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,           // BTS-3391: 유휴 커넥션 최대 5개 유지
  idleTimeout: 60000,   // BTS-3391: 60초 후 유휴 커넥션 해제
  queueLimit: 0,
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci', // Add this line
  timezone: '+09:00',
};

// Connection Pool 생성
const pool = mysql.createPool(DB_CONFIG);

// ============================================================
// Query Helper Functions (better-sqlite3 API 유사하게)
// ============================================================

/**
 * 단일 행 조회 (better-sqlite3의 .get() 대응)
 * query() 사용 - execute()의 prepared statement는 LIMIT/OFFSET 타입 문제 발생
 */
export async function getOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const [rows] = await pool.query(sql, params);
  const result = rows as T[];
  return result.length > 0 ? result[0] : null;
}

/**
 * 다중 행 조회 (better-sqlite3의 .all() 대응)
 * query() 사용 - execute()의 prepared statement는 LIMIT/OFFSET 타입 문제 발생
 */
export async function getAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/**
 * INSERT/UPDATE/DELETE 실행 (better-sqlite3의 .run() 대응)
 * query() 사용 - execute()의 prepared statement는 타입 문제 발생 가능
 */
export async function run(sql: string, params: any[] = []): Promise<{
  insertId: number;
  affectedRows: number;
  changedRows: number;
  changes: number; // better-sqlite3 호환
}> {
  const [result] = await pool.query(sql, params) as any;
  return {
    insertId: result.insertId,
    affectedRows: result.affectedRows,
    changedRows: result.changedRows,
    changes: result.affectedRows, // better-sqlite3 호환 (changes = affectedRows)
  };
}

/**
 * 다중 SQL 실행 (트랜잭션 없이)
 */
export async function exec(sql: string): Promise<void> {
  const connection = await pool.getConnection();
  try {
    // 여러 문장 실행 가능하도록 분리
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await connection.execute(stmt);
      }
    }
  } finally {
    connection.release();
  }
}

/**
 * 트랜잭션 실행
 */
export async function transaction<T>(
  callback: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Prepared Statement 스타일 (better-sqlite3 호환)
 */
export function prepare(sql: string) {
  return {
    async get<T = any>(...params: any[]): Promise<T | null> {
      return getOne<T>(sql, params);
    },
    async all<T = any>(...params: any[]): Promise<T[]> {
      return getAll<T>(sql, params);
    },
    async run(...params: any[]) {
      return run(sql, params);
    },
  };
}

// ============================================================
// Schema Initialization - server.bat에서 처리 (Edge Runtime 경고 방지)
// ============================================================
// initializeSchema 함수는 server.bat의 INIT_MYSQL에서 처리하므로 제거됨
// path, fs 모듈 사용으로 인한 Edge Runtime 경고를 방지하기 위함

// ============================================================
// Migrations (schema-mysql.sql에서 관리 - 여기선 비워둠)
// ============================================================

async function runMigrations(): Promise<void> {
  // schema-mysql.sql에 모든 스키마가 정의되어 있으므로
  // 여기서는 추가 마이그레이션 불필요
  // 컬럼 추가가 필요하면 schema-mysql.sql 수정 후 재적용
}

// ============================================================
// Initialization (서버 시작 시 호출)
// ============================================================

let initialized = false;

export async function initDb(): Promise<void> {
  if (initialized) return;

  try {
    // 연결 테스트
    const connection = await pool.getConnection();
    console.log('✅ MySQL 연결 성공');
    connection.release();

    // 스키마 초기화는 server.bat에서 처리 (Edge Runtime 경고 방지)
    // await initializeSchema();

    // 마이그레이션 실행
    await runMigrations();

    initialized = true;
  } catch (error) {
    console.error('❌ MySQL 초기화 실패:', error);
    throw error;
  }
}

// Pool export (직접 접근용)
export const getPool = () => pool;

// 연결 종료 (graceful shutdown)
export async function closeDb(): Promise<void> {
  await pool.end();
  console.log('✅ MySQL 연결 종료');
}

// Default export
export default pool;
