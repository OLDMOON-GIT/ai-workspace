/**
 * BTS-0000438: bug.claim 레이스 컨디션 해결 - 원자적 처리 구현
 *
 * 검증 내용:
 * - claimBug 함수가 트랜잭션을 사용하는지 확인
 * - SELECT ... FOR UPDATE로 row-level locking을 사용하는지 확인
 * - UPDATE 시 status 조건을 확인하여 이중 보호하는지 확인
 * - affectedRows 체크로 동시 할당 방지하는지 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000438: bug.claim 레이스 컨디션 해결', () => {
  const bugDbPath = path.join(
    __dirname,
    '../../../automation/bug-db.js'
  );

  let bugDbContent: string;

  beforeAll(() => {
    bugDbContent = fs.readFileSync(bugDbPath, 'utf-8');
  });

  describe('트랜잭션 처리 검증', () => {
    it('withTx 함수가 정의되어야 함', () => {
      expect(bugDbContent).toContain('async function withTx');
    });

    it('withTx에서 beginTransaction을 호출해야 함', () => {
      expect(bugDbContent).toContain('beginTransaction');
    });

    it('withTx에서 commit을 호출해야 함', () => {
      expect(bugDbContent).toContain('await conn.commit()');
    });

    it('withTx에서 에러 시 rollback을 호출해야 함', () => {
      expect(bugDbContent).toContain('await conn.rollback()');
    });

    it('claimBug가 withTx를 사용해야 함', () => {
      expect(bugDbContent).toMatch(/claimBug[\s\S]*?withTx/);
    });
  });

  describe('Row-Level Locking 검증', () => {
    it('claimBug에서 SELECT ... FOR UPDATE를 사용해야 함', () => {
      // claimBug 함수 내에서 FOR UPDATE 사용 확인
      const claimBugMatch = bugDbContent.match(/async function claimBug[\s\S]*?(?=async function|module\.exports)/);
      expect(claimBugMatch).toBeTruthy();

      const claimBugFn = claimBugMatch![0];
      expect(claimBugFn).toContain('FOR UPDATE');
    });

    it('SELECT 시 status = \'open\' 조건이 있어야 함', () => {
      const claimBugMatch = bugDbContent.match(/async function claimBug[\s\S]*?(?=async function|module\.exports)/);
      expect(claimBugMatch).toBeTruthy();

      const claimBugFn = claimBugMatch![0];
      expect(claimBugFn).toContain("status = 'open'");
    });

    it('ORDER BY created_at ASC로 가장 오래된 버그를 선택해야 함', () => {
      expect(bugDbContent).toContain('ORDER BY created_at ASC');
    });

    it('LIMIT 1로 하나만 선택해야 함', () => {
      const claimBugMatch = bugDbContent.match(/async function claimBug[\s\S]*?(?=async function|module\.exports)/);
      expect(claimBugMatch).toBeTruthy();

      const claimBugFn = claimBugMatch![0];
      expect(claimBugFn).toContain('LIMIT 1');
    });
  });

  describe('이중 보호 검증', () => {
    it('UPDATE 시 WHERE id = ? AND status = \'open\' 조건이 있어야 함', () => {
      // UPDATE 문에서 status = 'open' 조건 확인
      const claimBugMatch = bugDbContent.match(/async function claimBug[\s\S]*?(?=async function|module\.exports)/);
      expect(claimBugMatch).toBeTruthy();

      const claimBugFn = claimBugMatch![0];
      expect(claimBugFn).toMatch(/UPDATE[\s\S]*?WHERE[\s\S]*?status\s*=\s*['"]open['"]/);
    });

    it('affectedRows === 0 체크가 있어야 함', () => {
      expect(bugDbContent).toContain('affectedRows === 0');
    });

    it('affectedRows가 0이면 null을 반환해야 함', () => {
      expect(bugDbContent).toMatch(/if\s*\(\s*result\.affectedRows\s*===\s*0\s*\)\s*return\s*null/);
    });
  });

  describe('Connection Pool 설정 검증', () => {
    it('connectionLimit이 설정되어야 함', () => {
      expect(bugDbContent).toContain('connectionLimit');
    });

    it('getConnection으로 연결을 가져와야 함', () => {
      expect(bugDbContent).toContain('pool.getConnection()');
    });

    it('finally에서 conn.release()를 호출해야 함', () => {
      expect(bugDbContent).toContain('conn.release()');
    });
  });
});
