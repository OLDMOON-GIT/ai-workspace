/**
 * BTS-3103: Spawn 버튼이 task_queue를 건드리면 안됨
 *
 * 검증 항목:
 * 1. spawn-task API가 task_queue를 건드리지 않고 Claude CLI를 직접 호출
 * 2. spawnExecute 함수가 force-execute를 호출하지 않음
 */

import { readFileSync } from 'fs';
import path from 'path';

describe('BTS-3103: Spawn 버튼이 task_queue를 건드리면 안됨', () => {
  const frontendDir = 'C:/Users/oldmoon/workspace/trend-video-frontend';

  describe('spawn-task API 검증', () => {
    let spawnTaskCode: string;

    beforeAll(() => {
      spawnTaskCode = readFileSync(
        path.join(frontendDir, 'src/app/api/automation/spawn-task/route.ts'),
        'utf-8'
      );
    });

    it('task_queue를 import하지 않아야 함', () => {
      expect(spawnTaskCode).not.toMatch(/import.*task.?queue/i);
      expect(spawnTaskCode).not.toMatch(/from.*task.?queue/i);
    });

    it('task_queue INSERT/UPDATE 쿼리가 없어야 함', () => {
      expect(spawnTaskCode).not.toMatch(/INSERT\s+INTO\s+task_queue/i);
      expect(spawnTaskCode).not.toMatch(/UPDATE\s+task_queue/i);
    });

    it('force-execute API를 호출하지 않아야 함', () => {
      expect(spawnTaskCode).not.toMatch(/force-execute/);
    });

    it('Claude CLI를 직접 호출해야 함', () => {
      // spawn 함수 사용
      expect(spawnTaskCode).toMatch(/import\s*{\s*spawn\s*}/);
      // claude CLI 명령어
      expect(spawnTaskCode).toMatch(/claude/);
    });
  });

  describe('spawnExecute 함수 검증', () => {
    let automationPageCode: string;

    beforeAll(() => {
      automationPageCode = readFileSync(
        path.join(frontendDir, 'src/app/automation/page.tsx'),
        'utf-8'
      );
    });

    it('spawnExecute 함수가 존재해야 함', () => {
      expect(automationPageCode).toMatch(/async\s+function\s+spawnExecute/);
    });

    it('spawnExecute가 spawn-task API만 호출해야 함', () => {
      // spawnExecute 함수 부분 추출
      const match = automationPageCode.match(
        /async\s+function\s+spawnExecute[\s\S]*?(?=\n\s{2}(?:async\s+)?function|\n\s{2}\/\/\s+[A-Z]|\n\s{2}return\s+\()/
      );

      expect(match).toBeTruthy();

      if (match) {
        const spawnExecuteFunc = match[0];

        // spawn-task API 호출 확인
        expect(spawnExecuteFunc).toMatch(/\/api\/automation\/spawn-task/);

        // force-execute API 호출하지 않음 확인
        expect(spawnExecuteFunc).not.toMatch(/\/api\/automation\/force-execute/);
      }
    });

    it('BTS-3103 주석이 있어야 함', () => {
      expect(automationPageCode).toMatch(/BTS-3103.*task_queue/);
    });
  });
});
