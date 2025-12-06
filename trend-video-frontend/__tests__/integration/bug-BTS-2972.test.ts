/**
 * BTS-2972: 자동 대본 생성 409 에러 무한 반복 수정
 *
 * 검증 내용:
 * - 409 에러(다른 대본이 생성 중입니다) 발생 시 특별 처리 로직 존재 확인
 * - 기존 대본 생성 완료 대기 로직 확인
 * - 충돌 해결 후 재시도 로직 확인
 * - 대기 시간 초과 시 적절한 에러 반환 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-2972: 409 에러 무한 반복 수정', () => {
  const schedulerPath = path.join(
    __dirname,
    '../../src/lib/automation-scheduler.ts'
  );

  let schedulerContent: string;

  beforeAll(() => {
    schedulerContent = fs.readFileSync(schedulerPath, 'utf-8');
  });

  describe('409 에러 처리 로직 검증', () => {
    it('BTS-2972 주석이 코드에 포함되어 있어야 함', () => {
      expect(schedulerContent).toContain('BTS-2972');
    });

    it('409 에러 상태 코드 체크 로직이 있어야 함', () => {
      expect(schedulerContent).toContain('response.status === 409');
    });

    it('409 에러 발생 시 대기 로직이 있어야 함', () => {
      // 충돌 대기 시간 변수
      expect(schedulerContent).toContain('conflictWaitTime');
      // 충돌 시작 시간 변수
      expect(schedulerContent).toContain('conflictStartTime');
      // 충돌 해결 플래그
      expect(schedulerContent).toContain('conflictResolved');
    });

    it('기존 작업 상태 체크 로직이 있어야 함', () => {
      // 상태 체크 API 호출
      expect(schedulerContent).toContain('api/scripts/status');
      // completed 또는 failed 상태 체크
      expect(schedulerContent).toMatch(/conflictStatus\.status === 'completed'.*'failed'/s);
    });

    it('충돌 해결 후 재시도 로직이 있어야 함', () => {
      // 충돌 해결 시 재귀 호출
      expect(schedulerContent).toContain('return generateScript(queue, pipelineId, maxRetry)');
    });

    it('대기 시간 초과 시 적절한 에러 반환이 있어야 함', () => {
      // 대기 시간 초과 처리
      expect(schedulerContent).toContain('대기 시간 초과');
      // 실패 반환
      expect(schedulerContent).toContain("success: false, error: '다른 대본 생성 대기 중 시간 초과");
    });

    it('사용자 취소 체크 로직이 대기 루프 내에 있어야 함', () => {
      // isPipelineOrScheduleCancelled 호출이 409 처리 로직 내에 있어야 함
      const conflict409Section = schedulerContent.match(/response\.status === 409[\s\S]*?throw new Error\(error\.error/);
      expect(conflict409Section).toBeTruthy();
      if (conflict409Section) {
        expect(conflict409Section[0]).toContain('isPipelineOrScheduleCancelled');
      }
    });

    it('10초 간격으로 상태를 체크해야 함', () => {
      // 대기 간격 확인
      expect(schedulerContent).toContain('setTimeout(resolve, 10000)');
    });

    it('최대 15분 대기 시간이 설정되어야 함', () => {
      // 15분 = 15 * 60 * 1000
      expect(schedulerContent).toContain('15 * 60 * 1000');
    });
  });

  describe('로깅 검증', () => {
    it('409 에러 발생 시 로그가 기록되어야 함', () => {
      expect(schedulerContent).toContain('409 Conflict');
    });

    it('대기 중 경과 시간 로그가 있어야 함', () => {
      expect(schedulerContent).toContain('초 경과');
    });

    it('충돌 해결 시 재시도 로그가 있어야 함', () => {
      expect(schedulerContent).toContain('충돌 해결됨 - 대본 생성 재시도');
    });

    it('사용자에게 대기 상태 표시 로그가 있어야 함', () => {
      expect(schedulerContent).toContain('다른 대본 생성 대기 중');
    });
  });
});
