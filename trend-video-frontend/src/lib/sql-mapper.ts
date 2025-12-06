/**
 * SQL Mapper - iBatis 스타일 SQL 관리 시스템
 *
 * SQL을 코드에서 분리하여 /sql 디렉토리에서 관리
 * SQL ID로 쿼리를 호출하여 유지보수성 향상
 */

import fs from 'fs';
import path from 'path';

interface SqlMap {
  [namespace: string]: {
    [sqlId: string]: string;
  };
}

class SqlMapper {
  private sqlMap: SqlMap = {};
  private sqlDir: string;
  private initialized: boolean = false;

  constructor() {
    this.sqlDir = path.join(process.cwd(), 'sql');
  }

  /**
   * SQL 파일들을 로드하여 메모리에 캐싱
   */
  initialize() {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(this.sqlDir)) {
        console.warn(`⚠️ SQL 디렉토리가 없습니다: ${this.sqlDir}`);
        return;
      }

      const files = fs.readdirSync(this.sqlDir);

      for (const file of files) {
        if (file.endsWith('.sql')) {
          const namespace = file.replace('.sql', '');
          this.loadSqlFile(namespace, path.join(this.sqlDir, file));
        }
      }

      console.log(`✅ SQL Mapper initialized: ${Object.keys(this.sqlMap).length} namespaces loaded`);
      this.initialized = true;
    } catch (error) {
      console.error('❌ SQL Mapper initialization failed:', error);
    }
  }

  /**
   * SQL 파일 로드
   *
   * 파일 형식:
   * -- @sqlId: getSomething
   * SELECT * FROM table WHERE id = ?
   *
   * -- @sqlId: updateSomething
   * UPDATE table SET status = ? WHERE id = ?
   */
  private loadSqlFile(namespace: string, filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let currentSqlId: string | null = null;
    let currentSql: string[] = [];

    this.sqlMap[namespace] = {};

    for (const line of lines) {
      const trimmed = line.trim();

      // SQL ID 주석 파싱: -- @sqlId: xxxxx
      if (trimmed.startsWith('-- @sqlId:')) {
        // 이전 SQL 저장
        if (currentSqlId && currentSql.length > 0) {
          this.sqlMap[namespace][currentSqlId] = currentSql.join('\n').trim();
        }

        // 새 SQL 시작
        currentSqlId = trimmed.replace('-- @sqlId:', '').trim();
        currentSql = [];
      }
      // 주석이나 빈 줄은 스킵 (SQL ID 주석 제외)
      else if (trimmed.startsWith('--') || trimmed === '') {
        continue;
      }
      // SQL 라인 수집
      else if (currentSqlId) {
        currentSql.push(line);
      }
    }

    // 마지막 SQL 저장
    if (currentSqlId && currentSql.length > 0) {
      this.sqlMap[namespace][currentSqlId] = currentSql.join('\n').trim();
    }

    console.log(`📄 Loaded ${namespace}.sql: ${Object.keys(this.sqlMap[namespace]).length} queries`);
  }

  /**
   * SQL 조회
   * @param namespace SQL 파일명 (확장자 제외)
   * @param sqlId SQL ID
   * @param params 파라미터 객체 (선택적, Named Parameter용)
   */
  getSql(namespace: string, sqlId: string, params?: Record<string, any>): string {
    if (!this.initialized) {
      this.initialize();
    }

    const sql = this.sqlMap[namespace]?.[sqlId];

    if (!sql) {
      throw new Error(`❌ SQL not found: ${namespace}.${sqlId}`);
    }

    // Named Parameter 지원 (선택적)
    if (params) {
      return this.bindNamedParameters(sql, params);
    }

    return sql;
  }

  /**
   * Named Parameter 바인딩
   * :paramName 형식을 ? 로 변환하고 값 배열 반환
   */
  bindNamedParameters(sql: string, params: Record<string, any>): string {
    let result = sql;

    // :paramName 패턴을 ?로 변경
    for (const [key, value] of Object.entries(params)) {
      const pattern = new RegExp(`:${key}\\b`, 'g');
      result = result.replace(pattern, '?');
    }

    return result;
  }

  /**
   * 네임스페이스의 모든 SQL ID 목록 조회
   */
  getSqlIds(namespace: string): string[] {
    if (!this.initialized) {
      this.initialize();
    }

    return Object.keys(this.sqlMap[namespace] || {});
  }

  /**
   * 모든 네임스페이스 목록 조회
   */
  getNamespaces(): string[] {
    if (!this.initialized) {
      this.initialize();
    }

    return Object.keys(this.sqlMap);
  }

  /**
   * SQL 맵 전체 조회 (디버깅용)
   */
  getAll(): SqlMap {
    if (!this.initialized) {
      this.initialize();
    }

    return this.sqlMap;
  }

  /**
   * SQL 재로드 (개발 중 SQL 변경 시)
   */
  reload() {
    this.sqlMap = {};
    this.initialized = false;
    this.initialize();
  }
}

// 싱글톤 인스턴스
const sqlMapper = new SqlMapper();

// 편의 함수들
export function getSql(namespace: string, sqlId: string, params?: Record<string, any>): string {
  return sqlMapper.getSql(namespace, sqlId, params);
}

export function reloadSql() {
  sqlMapper.reload();
}

export function getSqlMapper() {
  return sqlMapper;
}

export default sqlMapper;
