/**
 * BTS-0000437: MCP Debugger Server 실시간 대시보드 구현
 *
 * 검증 내용:
 * - 대시보드 모듈이 구현되어 있는지 확인
 * - 10초 자동 갱신 로직이 있는지 확인
 * - 버그 현황, 에러 큐, MCP 도구 통계 표시 기능이 있는지 확인
 * - --dashboard 또는 -d 옵션 지원 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000437: MCP Debugger Server 실시간 대시보드', () => {
  const mcpDebuggerPath = path.join(
    __dirname,
    '../../../mcp-debugger/src'
  );

  describe('대시보드 모듈 검증', () => {
    const dashboardPath = path.join(mcpDebuggerPath, 'dashboard.ts');
    let dashboardContent: string;

    beforeAll(() => {
      dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    });

    it('dashboard.ts 파일이 존재해야 함', () => {
      expect(fs.existsSync(dashboardPath)).toBe(true);
    });

    it('startDashboard 함수가 export되어야 함', () => {
      expect(dashboardContent).toContain('export function startDashboard');
    });

    it('stopDashboard 함수가 export되어야 함', () => {
      expect(dashboardContent).toContain('export function stopDashboard');
    });

    it('recordToolCall 함수가 export되어야 함', () => {
      expect(dashboardContent).toContain('export function recordToolCall');
    });

    it('10초(10000ms) 자동 갱신 인터벌이 설정되어야 함', () => {
      expect(dashboardContent).toContain('10000');
      expect(dashboardContent).toContain('setInterval');
    });

    it('clearInterval로 정리하는 로직이 있어야 함', () => {
      expect(dashboardContent).toContain('clearInterval');
    });
  });

  describe('대시보드 표시 내용 검증', () => {
    const dashboardPath = path.join(mcpDebuggerPath, 'dashboard.ts');
    let dashboardContent: string;

    beforeAll(() => {
      dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    });

    it('버그 상태별 현황을 표시해야 함 (Open/In Progress/Resolved/Closed)', () => {
      expect(dashboardContent).toContain('Open');
      expect(dashboardContent).toContain('In Progress');
      expect(dashboardContent).toContain('Resolved');
      expect(dashboardContent).toContain('Closed');
    });

    it('에러 큐 현황을 표시해야 함 (Pending/Processing)', () => {
      expect(dashboardContent).toContain('Pending');
      expect(dashboardContent).toContain('Processing');
    });

    it('MCP 도구 통계를 표시해야 함', () => {
      expect(dashboardContent).toContain('TOOL STATS');
      expect(dashboardContent).toContain('Total Calls');
    });

    it('최근 버그 목록을 표시해야 함', () => {
      expect(dashboardContent).toContain('RECENT BUGS');
    });

    it('콘솔 clear 후 다시 그리기 방식이어야 함', () => {
      // ANSI escape code for clear screen
      expect(dashboardContent).toMatch(/\\x1b\[2J|clear/);
    });
  });

  describe('index.ts 통합 검증', () => {
    const indexPath = path.join(mcpDebuggerPath, 'index.ts');
    let indexContent: string;

    beforeAll(() => {
      indexContent = fs.readFileSync(indexPath, 'utf-8');
    });

    it('renderDashboard 함수가 정의되어야 함', () => {
      expect(indexContent).toContain('renderDashboard');
    });

    it('10초(10000ms) 자동 갱신 인터벌이 설정되어야 함', () => {
      expect(indexContent).toContain('10000');
      expect(indexContent).toContain('setInterval');
    });

    it('recordToolCall 함수로 도구 통계를 기록해야 함', () => {
      expect(indexContent).toContain('recordToolCall');
      expect(indexContent).toContain('toolCallStats');
    });

    it('dashboardInterval 변수가 있어야 함', () => {
      expect(indexContent).toContain('dashboardInterval');
    });
  });

  describe('도구 통계 기능 검증', () => {
    const dashboardPath = path.join(mcpDebuggerPath, 'dashboard.ts');
    let dashboardContent: string;

    beforeAll(() => {
      dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    });

    it('ToolStats 인터페이스가 정의되어야 함', () => {
      expect(dashboardContent).toContain('interface ToolStats');
    });

    it('totalCalls 필드가 있어야 함', () => {
      expect(dashboardContent).toContain('totalCalls');
    });

    it('byTool 필드로 도구별 호출 횟수를 기록해야 함', () => {
      expect(dashboardContent).toContain('byTool');
    });

    it('lastCall 필드로 마지막 호출 시간을 기록해야 함', () => {
      expect(dashboardContent).toContain('lastCall');
    });
  });
});
