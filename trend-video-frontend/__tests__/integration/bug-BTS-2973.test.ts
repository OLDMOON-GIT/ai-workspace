/**
 * BTS-2973: unified-worker.js 409 에러 처리 수정
 *
 * 검증 내용:
 * - unified-worker.js에서 409 에러(다른 대본 생성 중) 발생 시 특별 처리 로직 존재 확인
 * - 기존 대본 생성 완료 대기 로직 확인
 * - 충돌 해결 후 재시도 로직 확인
 * - 대기 시간 초과 시 적절한 에러 반환 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-2973: unified-worker.js 409 에러 처리', () => {
  const workerPath = path.join(
    __dirname,
    '../../src/workers/unified-worker.js'
  );

  let workerContent: string;

  beforeAll(() => {
    workerContent = fs.readFileSync(workerPath, 'utf-8');
  });

  describe('409 에러 처리 로직 검증', () => {
    it('BTS-2973 주석이 코드에 포함되어 있어야 함', () => {
      expect(workerContent).toContain('BTS-2973');
    });

    it('409 에러 상태 코드 체크 로직이 있어야 함', () => {
      expect(workerContent).toContain('response.status === 409');
    });

    it('409 에러 발생 시 대기 로직이 있어야 함', () => {
      // 충돌 대기 시간 변수
      expect(workerContent).toContain('conflictWaitTime');
      // 충돌 시작 시간 변수
      expect(workerContent).toContain('conflictStartTime');
      // 충돌 해결 플래그
      expect(workerContent).toContain('conflictResolved');
    });

    it('기존 작업 상태 체크 로직이 있어야 함', () => {
      // 상태 체크 API 호출
      expect(workerContent).toContain('api/scripts/status');
      // completed 또는 failed 상태 체크
      expect(workerContent).toContain("statusData.status === 'completed'");
      expect(workerContent).toContain("statusData.status === 'failed'");
    });

    it('충돌 해결 후 재시도 로직이 있어야 함', () => {
      // continue를 사용한 재시도
      expect(workerContent).toContain('충돌 해결됨 - 재시도');
      expect(workerContent).toMatch(/conflictResolved[\s\S]*?continue/);
    });

    it('대기 시간 초과 시 적절한 에러 반환이 있어야 함', () => {
      // 대기 시간 초과 처리
      expect(workerContent).toContain('대기 시간 초과');
      // Error throw
      expect(workerContent).toContain('다른 대본 생성 대기 중 시간 초과');
    });

    it('10초 간격으로 상태를 체크해야 함', () => {
      // 대기 간격 확인 (10000ms = 10초)
      expect(workerContent).toContain('setTimeout(r, 10000)');
    });

    it('최대 15분 대기 시간이 설정되어야 함', () => {
      // 15분 = 15 * 60 * 1000
      expect(workerContent).toContain('15 * 60 * 1000');
    });
  });

  describe('로깅 검증', () => {
    it('409 에러 발생 시 로그가 기록되어야 함', () => {
      expect(workerContent).toContain('409 Conflict');
    });

    it('대기 중 경과 시간 로그가 있어야 함', () => {
      expect(workerContent).toContain('초 경과');
    });

    it('충돌 해결 시 재시도 로그가 있어야 함', () => {
      expect(workerContent).toContain('충돌 해결됨');
    });

    it('사용자에게 대기 상태 표시 로그가 있어야 함', () => {
      expect(workerContent).toContain('다른 대본 생성 대기 중');
    });
  });

  describe('충돌 작업 정보 파싱', () => {
    it('충돌 taskId를 파싱하는 로직이 있어야 함', () => {
      expect(workerContent).toContain('conflictTaskId');
      expect(workerContent).toContain('conflictData.taskId');
    });

    it('JSON 파싱 에러 처리가 있어야 함', () => {
      // try-catch로 JSON 파싱 에러 처리
      expect(workerContent).toContain('JSON.parse(errorText)');
    });
  });
});
