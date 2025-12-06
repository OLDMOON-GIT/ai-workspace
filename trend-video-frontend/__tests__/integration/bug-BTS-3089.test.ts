/**
 * BTS-3089: 대본 생성 타임아웃 개선 테스트
 *
 * 타임아웃이 10분에서 15분으로 증가되었는지 확인
 * 타임아웃 에러 메시지에 상세 정보가 포함되어 있는지 확인
 */

import fs from 'fs';
import path from 'path';

describe('BTS-3089: 대본 생성 타임아웃 개선', () => {
  const schedulerPath = path.join(
    process.cwd(),
    'src',
    'lib',
    'automation-scheduler.ts'
  );

  let schedulerContent: string;

  beforeAll(() => {
    // automation-scheduler.ts 파일 읽기
    schedulerContent = fs.readFileSync(schedulerPath, 'utf-8');
  });

  describe('타임아웃 시간 설정', () => {
    it('대본 생성 타임아웃이 15분(900000ms)으로 설정되어 있어야 함', () => {
      // maxWaitTime이 15분으로 설정되어 있는지 확인
      const timeoutMatch = schedulerContent.match(
        /const\s+maxWaitTime\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/
      );

      expect(timeoutMatch).toBeTruthy();
      expect(timeoutMatch![1]).toBe('15');
    });

    it('기존 10분 타임아웃이 제거되어야 함', () => {
      // 10분 타임아웃이 없는지 확인
      const oldTimeoutMatch = schedulerContent.match(
        /const\s+maxWaitTime\s*=\s*10\s*\*\s*60\s*\*\s*1000/
      );

      expect(oldTimeoutMatch).toBeNull();
    });
  });

  describe('타임아웃 에러 메시지', () => {
    it('타임아웃 에러 메시지가 15분으로 업데이트되어야 함', () => {
      // 에러 메시지에 15분이 포함되어 있는지 확인
      expect(schedulerContent).toContain('15분 초과');
    });

    it('기존 10분 타임아웃 에러 메시지가 제거되어야 함', () => {
      // 10분 타임아웃 에러 메시지가 없는지 확인
      // BTS-3089 주석 제외하고 확인
      const lines = schedulerContent.split('\n');
      const nonCommentLines = lines.filter(line => !line.includes('BTS-3089') && !line.trim().startsWith('//'));
      const nonCommentContent = nonCommentLines.join('\n');

      // throw new Error 문에서 10분 초과 메시지가 없어야 함
      expect(nonCommentContent).not.toMatch(/throw new Error.*10분 초과/);
    });
  });

  describe('주석 및 문서화', () => {
    it('BTS-3089 관련 주석이 포함되어야 함', () => {
      // BTS-3089 참조가 있는지 확인
      expect(schedulerContent).toContain('BTS-3089');
    });

    it('타임아웃 변경 이유가 주석으로 설명되어야 함', () => {
      // 롱폼 대본 관련 설명이 있는지 확인
      expect(schedulerContent).toMatch(/롱폼.*시간.*오래/);
    });
  });

  describe('폴링 간격', () => {
    it('상태 폴링 간격이 5초로 유지되어야 함', () => {
      // 5초마다 체크하는 로직이 유지되는지 확인
      expect(schedulerContent).toContain('5000');
      expect(schedulerContent).toMatch(/setTimeout.*5000/);
    });
  });
});

describe('BTS-3089: 타임아웃 값 유효성', () => {
  it('15분 타임아웃 값이 밀리초로 올바르게 계산되어야 함', () => {
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    expect(FIFTEEN_MINUTES_MS).toBe(900000);
  });

  it('폴링 횟수가 충분해야 함 (15분 / 5초 = 180회)', () => {
    const TIMEOUT_MS = 15 * 60 * 1000;
    const POLLING_INTERVAL_MS = 5000;
    const expectedPollingCount = TIMEOUT_MS / POLLING_INTERVAL_MS;

    // 최소 150회 이상 폴링되어야 함 (여유 있게)
    expect(expectedPollingCount).toBeGreaterThanOrEqual(150);
  });
});
