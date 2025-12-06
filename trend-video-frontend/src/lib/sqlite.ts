// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SQLite → MySQL 마이그레이션 호환 레이어                                  ║
// ║                                                                           ║
// ║  이 파일은 기존 SQLite 코드와의 호환성을 위한 wrapper입니다.              ║
// ║  실제 DB 연결은 mysql.ts에서 처리합니다.                                  ║
// ║                                                                           ║
// ║  사용법:                                                                  ║
// ║  - import db from '@/lib/sqlite' → MySQL pool 반환                        ║
// ║  - await db.prepare(sql).get(...) → await로 변경 필요!                          ║
// ║                                                                           ║
// ║  ⚠️ 주의: better-sqlite3는 동기식, mysql2는 비동기식!                     ║
// ║  모든 DB 호출에 await 추가 필요!                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import pool, {
  getOne,
  getAll,
  run,
  exec,
  prepare,
  transaction,
  initDb,
  closeDb,
  getPool,
} from './mysql';

// better-sqlite3 호환 인터페이스
// 기존 코드: await db.prepare(sql).get(params)
// 새 코드: await db.prepare(sql).get(params)

interface PreparedStatement {
  get<T = any>(...params: any[]): Promise<T | null>;
  all<T = any>(...params: any[]): Promise<T[]>;
  run(...params: any[]): Promise<{ insertId: number; affectedRows: number; changedRows: number; changes: number }>;
}

interface DatabaseWrapper {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): Promise<void>;
  pragma(pragma: string): void; // MySQL에서는 무시
}

const db: DatabaseWrapper = {
  prepare(sql: string): PreparedStatement {
    // SQLite의 ? placeholder는 MySQL과 동일
    return prepare(sql);
  },
  async exec(sql: string): Promise<void> {
    return exec(sql);
  },
  pragma(_pragma: string): void {
    // MySQL에서는 pragma 무시 (WAL, foreign_keys 등 SQLite 전용)
    console.log('⚠️ SQLite pragma 무시됨 (MySQL 사용 중)');
  },
};

// Named exports (기존 코드 호환)
export { getOne, getAll, run, exec, prepare, transaction, initDb, closeDb, getPool };

// getDb 함수 (기존 SQLite 코드 호환)
export const getDb = () => db;

// Default export (기존 코드에서 import db from '@/lib/sqlite' 사용)
export default db;
