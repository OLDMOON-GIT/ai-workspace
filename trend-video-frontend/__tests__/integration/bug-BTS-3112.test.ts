/**
 * BTS-3112: spawn-task API에서 title_pool 조회 제거
 *
 * 검증 항목:
 * 1. spawn-task API가 title_pool 테이블을 조회하지 않음
 * 2. 프론트에서 전달받은 title만 사용
 */

import { readFileSync } from 'fs';
import path from 'path';

describe('BTS-3112: spawn-task API에서 title_pool 조회 제거', () => {
  const frontendDir = 'C:/Users/oldmoon/workspace/trend-video-frontend';

  describe('spawn-task API 검증', () => {
    let spawnTaskCode: string;

    beforeAll(() => {
      spawnTaskCode = readFileSync(
        path.join(frontendDir, 'src/app/api/automation/spawn-task/route.ts'),
        'utf-8'
      );
    });

    it('title_pool 테이블을 조회하지 않아야 함', () => {
      // title_pool 관련 SQL 쿼리 없어야 함
      expect(spawnTaskCode).not.toMatch(/SELECT.*FROM\s+title_pool/i);
      expect(spawnTaskCode).not.toMatch(/INSERT\s+INTO\s+title_pool/i);
      expect(spawnTaskCode).not.toMatch(/UPDATE\s+title_pool/i);
      // 실제 title_pool 조회 코드가 없어야 함 (주석은 제외)
      const codeWithoutComments = spawnTaskCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      expect(codeWithoutComments).not.toMatch(/title_pool/i);
    });

    it('title_pool import가 없어야 함', () => {
      expect(spawnTaskCode).not.toMatch(/import.*title.?pool/i);
      expect(spawnTaskCode).not.toMatch(/from.*title.?pool/i);
    });

    it('프론트에서 전달받은 title 파라미터를 사용해야 함', () => {
      // request.json()에서 title 추출
      expect(spawnTaskCode).toMatch(/const\s*{\s*.*title.*}\s*=\s*await\s+request\.json\(\)/);
    });

    it('title이 없으면 400 에러를 반환해야 함', () => {
      expect(spawnTaskCode).toMatch(/if\s*\(\s*!title\s*\)/);
      expect(spawnTaskCode).toMatch(/status:\s*400/);
    });

    it('BTS-3112 관련 주석이 있어야 함', () => {
      expect(spawnTaskCode).toMatch(/BTS-3112/);
      expect(spawnTaskCode).toMatch(/title_pool.*조회.*없음/);
    });
  });
});
