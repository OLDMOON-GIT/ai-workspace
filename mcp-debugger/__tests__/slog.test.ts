/**
 * BTS-3069: slog CLI 테스트
 *
 * slog - Spawning Pool Worker Log Viewer
 * 워커별 로그 파일 확인 도구
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const SLOG_PATH = path.join(__dirname, '..', 'slog.cjs');
const LOGS_DIR = path.join(__dirname, '..', 'logs');

describe('BTS-3069: slog CLI', () => {
  beforeAll(() => {
    // logs 디렉토리 생성
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  });

  describe('기본 명령어', () => {
    it('--help 플래그가 사용법을 출력해야 함', () => {
      const result = execSync(`node "${SLOG_PATH}" --help`, { encoding: 'utf8' });
      expect(result).toContain('slog - Spawning Pool Worker Log Viewer');
      expect(result).toContain('사용법');
      expect(result).toContain('--all');
      expect(result).toContain('--recent');
      expect(result).toContain('--tail');
    });

    it('인자 없이 실행하면 사용법을 출력해야 함', () => {
      const result = execSync(`node "${SLOG_PATH}"`, { encoding: 'utf8' });
      expect(result).toContain('사용법');
    });
  });

  describe('--all 플래그', () => {
    it('로그 파일 목록을 출력해야 함', () => {
      const result = execSync(`node "${SLOG_PATH}" --all`, { encoding: 'utf8' });
      // 로그 파일이 있거나 없거나 에러 없이 실행되어야 함
      expect(result).toBeDefined();
    });
  });

  describe('--recent 플래그', () => {
    it('최근 로그를 출력해야 함', () => {
      const result = execSync(`node "${SLOG_PATH}" --recent 5`, { encoding: 'utf8' });
      expect(result).toBeDefined();
    });
  });

  describe('버그 ID 파싱', () => {
    it('존재하지 않는 버그 ID도 에러 없이 처리해야 함', () => {
      const result = execSync(`node "${SLOG_PATH}" 99999`, { encoding: 'utf8' });
      expect(result).toContain('로그 파일이 없습니다');
    });

    it('BTS- 접두사가 있는 ID도 처리해야 함', () => {
      const result = execSync(`node "${SLOG_PATH}" BTS-99999`, { encoding: 'utf8' });
      expect(result).toContain('로그 파일이 없습니다');
    });
  });

  describe('로그 파일 읽기', () => {
    const TEST_BUG_ID = '99998';
    const testLogPath = path.join(LOGS_DIR, `worker-${TEST_BUG_ID}.log`);

    beforeAll(() => {
      // 테스트용 로그 파일 생성
      const testContent = `[2024-12-05 10:00:00] [INFO] 테스트 로그
============================================================
BTS-99998 작업 시작
제목: 테스트 버그
============================================================
[2024-12-05 10:00:01] [INFO] Claude CLI 호출
[2024-12-05 10:00:10] [INFO] SUCCESS: 작업 완료
`;
      fs.writeFileSync(testLogPath, testContent, 'utf8');
    });

    afterAll(() => {
      // 테스트 로그 파일 삭제
      if (fs.existsSync(testLogPath)) {
        fs.unlinkSync(testLogPath);
      }
    });

    it('특정 버그 로그를 읽을 수 있어야 함', () => {
      const result = execSync(`node "${SLOG_PATH}" ${TEST_BUG_ID}`, { encoding: 'utf8' });
      expect(result).toContain('BTS-99998');
      expect(result).toContain('테스트 로그');
      expect(result).toContain('작업 완료');
    });

    it('로그 파일 정보를 포함해야 함', () => {
      const result = execSync(`node "${SLOG_PATH}" ${TEST_BUG_ID}`, { encoding: 'utf8' });
      expect(result).toContain('파일:');
      expect(result).toContain('크기:');
      expect(result).toContain('수정:');
    });
  });
});
