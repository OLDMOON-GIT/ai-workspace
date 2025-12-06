/**
 * BTS-3132: task-images API paths[5] undefined 에러 수정
 *
 * 에러: The "paths[5]" argument must be of type string. Received undefined
 * 원인: taskId 또는 filename이 undefined일 때 path.resolve()에서 에러 발생
 * 수정: path.resolve() 호출 전 파라미터 검증 추가
 */

import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';

describe('BTS-3132: task-images API undefined parameter handling', () => {
  const taskImagesDir = path.join(process.cwd(), 'src/app/api/task-images');

  describe('[taskId]/[filename]/route.ts', () => {
    const routePath = path.join(taskImagesDir, '[taskId]/[filename]/route.ts');

    it('파일이 존재해야 함', () => {
      expect(fs.existsSync(routePath)).toBe(true);
    });

    it('BTS-3132 수정 내용이 포함되어야 함', () => {
      const content = fs.readFileSync(routePath, 'utf-8');

      // taskId/filename undefined 검증 코드가 포함되어야 함
      expect(content).toContain('BTS-3132');
      expect(content).toContain("if (!taskId || !filename)");
      expect(content).toContain('Invalid parameters');
    });

    it('path.resolve 호출 전 파라미터 검증이 있어야 함', () => {
      const content = fs.readFileSync(routePath, 'utf-8');

      // path.resolve 호출 위치 찾기
      const pathResolveIndex = content.indexOf('path.resolve');
      // undefined 검증 위치 찾기
      const validationIndex = content.indexOf('if (!taskId || !filename)');

      // 검증이 path.resolve보다 먼저 와야 함
      expect(validationIndex).toBeLessThan(pathResolveIndex);
    });
  });

  describe('[taskId]/route.ts', () => {
    const routePath = path.join(taskImagesDir, '[taskId]/route.ts');

    it('파일이 존재해야 함', () => {
      expect(fs.existsSync(routePath)).toBe(true);
    });

    it('BTS-3132 수정 내용이 포함되어야 함', () => {
      const content = fs.readFileSync(routePath, 'utf-8');

      // taskId undefined 검증 코드가 포함되어야 함
      expect(content).toContain('BTS-3132');
      expect(content).toContain("if (!taskId)");
      expect(content).toContain('Invalid parameters');
    });

    it('path.resolve 호출 전 파라미터 검증이 있어야 함', () => {
      const content = fs.readFileSync(routePath, 'utf-8');

      // path.resolve 호출 위치 찾기
      const pathResolveIndex = content.indexOf('path.resolve');
      // undefined 검증 위치 찾기
      const validationIndex = content.indexOf('if (!taskId)');

      // 검증이 path.resolve보다 먼저 와야 함
      expect(validationIndex).toBeLessThan(pathResolveIndex);
    });
  });
});
