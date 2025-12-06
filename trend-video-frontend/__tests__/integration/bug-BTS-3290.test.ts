/**
 * BTS-3290: spawn-task API에서 Claude CLI 경로 문제 해결
 *
 * 문제:
 * - shell: true로 spawn 실행 시 PATH 환경변수가 제대로 상속되지 않음
 * - 'claude'은(는) 내부 또는 외부 명령을 찾을 수 없음 에러 발생
 * - 10분 타임아웃 후 500 에러 반환
 *
 * 해결:
 * - Claude CLI의 전체 경로를 사용 (CLAUDE_CLI_PATH 상수)
 * - shell: false로 변경 (전체 경로 사용 시 shell 불필요)
 * - 타임아웃 에러 메시지 개선
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';

describe('BTS-3290: spawn-task API에서 Claude CLI 경로 문제 해결', () => {
  const frontendDir = 'C:/Users/oldmoon/workspace/trend-video-frontend';
  let spawnTaskCode: string;

  beforeAll(() => {
    spawnTaskCode = readFileSync(
      path.join(frontendDir, 'src/app/api/automation/spawn-task/route.ts'),
      'utf-8'
    );
  });

  describe('Claude CLI 전체 경로 사용', () => {
    it('CLAUDE_CLI_PATH 상수가 정의되어 있어야 함', () => {
      expect(spawnTaskCode).toMatch(/const\s+CLAUDE_CLI_PATH\s*=/);
    });

    it('Claude CLI 전체 경로가 설정되어 있어야 함', () => {
      // .local/bin/claude.exe 또는 .local\bin\claude.exe 경로 포함
      expect(spawnTaskCode).toMatch(/\.local.*bin.*claude\.exe/i);
    });

    it('spawn 호출에서 CLAUDE_CLI_PATH를 사용해야 함', () => {
      // spawn('claude', [...]) 대신 spawn(CLAUDE_CLI_PATH, [...]) 사용
      expect(spawnTaskCode).toMatch(/spawn\s*\(\s*CLAUDE_CLI_PATH/);
    });

    it('spawn 호출에서 문자열 "claude"를 직접 사용하면 안 됨', () => {
      // spawn('claude', [...]) 패턴이 없어야 함
      expect(spawnTaskCode).not.toMatch(/spawn\s*\(\s*['"]claude['"]/);
    });
  });

  describe('shell 옵션 설정', () => {
    it('shell: false로 설정되어 있어야 함', () => {
      // 전체 경로 사용 시 shell: false가 권장됨
      expect(spawnTaskCode).toMatch(/shell\s*:\s*false/);
    });
  });

  describe('타임아웃 에러 메시지', () => {
    it('타임아웃 시 상세 에러 메시지를 제공해야 함', () => {
      // "Claude CLI 응답 없음" 메시지 포함
      expect(spawnTaskCode).toMatch(/Claude CLI.*응답 없음/);
    });
  });

  describe('BTS-3290 관련 주석', () => {
    it('BTS-3290 수정 주석이 있어야 함', () => {
      expect(spawnTaskCode).toMatch(/BTS-3290/);
    });
  });

  describe('Claude CLI 파일 존재 확인', () => {
    it('Claude CLI 실행 파일이 존재해야 함', () => {
      const claudePath = 'C:/Users/USER/.local/bin/claude.exe';
      expect(existsSync(claudePath)).toBe(true);
    });
  });
});
