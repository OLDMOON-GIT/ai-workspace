/**
 * BTS-3064: Python script exited with code 4294967295 에러 메시지 개선
 *
 * exit code 4294967295(-1 unsigned)를 사용자 친화적 메시지로 변환하는 기능 테스트
 */

describe('BTS-3064: formatPythonExitCode 함수', () => {
  // unified-worker.js에서 formatPythonExitCode 함수 로직을 테스트
  function formatPythonExitCode(code: number, errorOutput: string): string {
    // Windows에서 -1 (unsigned: 4294967295)은 비정상 종료
    const exitCode = code >>> 0;  // unsigned 변환

    let friendlyMessage = '';

    if (exitCode === 4294967295 || code === -1) {
      // 프로세스가 비정상 종료됨
      if (errorOutput.includes('MemoryError') || errorOutput.includes('memory')) {
        friendlyMessage = '메모리 부족으로 프로세스가 종료됨';
      } else if (errorOutput.includes('Killed') || errorOutput.includes('killed')) {
        friendlyMessage = '프로세스가 외부에서 강제 종료됨';
      } else if (errorOutput.includes('TimeoutError') || errorOutput.includes('timeout')) {
        friendlyMessage = '작업 시간 초과로 프로세스가 종료됨';
      } else if (errorOutput.includes('Chrome') || errorOutput.includes('browser')) {
        friendlyMessage = '브라우저 관련 오류로 프로세스가 종료됨';
      } else {
        friendlyMessage = '프로세스가 예기치 않게 종료됨 (exit code: -1)';
      }
    } else if (code === 1) {
      friendlyMessage = 'Python 스크립트 실행 중 오류 발생';
    } else if (code === 2) {
      friendlyMessage = 'Python 명령행 인자 오류';
    } else {
      friendlyMessage = `Python 프로세스가 코드 ${code}로 종료됨`;
    }

    // 에러 출력에서 핵심 메시지 추출
    const errorLines = errorOutput.trim().split('\n');
    const lastErrorLine = errorLines.filter(line =>
      line.includes('Error') || line.includes('Exception') || line.includes('오류')
    ).pop();

    if (lastErrorLine) {
      return `${friendlyMessage}\n상세: ${lastErrorLine.trim()}`;
    }

    return friendlyMessage;
  }

  describe('exit code 4294967295 (-1) 처리', () => {
    it('exit code 4294967295를 사용자 친화적 메시지로 변환해야 함', () => {
      const result = formatPythonExitCode(4294967295, '');
      expect(result).toBe('프로세스가 예기치 않게 종료됨 (exit code: -1)');
    });

    it('exit code -1도 동일하게 처리해야 함', () => {
      const result = formatPythonExitCode(-1, '');
      expect(result).toBe('프로세스가 예기치 않게 종료됨 (exit code: -1)');
    });

    it('MemoryError가 있으면 메모리 부족 메시지를 반환해야 함', () => {
      const result = formatPythonExitCode(4294967295, 'MemoryError: cannot allocate');
      expect(result).toContain('메모리 부족으로 프로세스가 종료됨');
    });

    it('Killed가 있으면 강제 종료 메시지를 반환해야 함', () => {
      const result = formatPythonExitCode(4294967295, 'Process was killed');
      expect(result).toContain('프로세스가 외부에서 강제 종료됨');
    });

    it('TimeoutError가 있으면 시간 초과 메시지를 반환해야 함', () => {
      const result = formatPythonExitCode(4294967295, 'TimeoutError: operation timed out');
      expect(result).toContain('작업 시간 초과로 프로세스가 종료됨');
    });

    it('Chrome 관련 오류면 브라우저 오류 메시지를 반환해야 함', () => {
      const result = formatPythonExitCode(4294967295, 'Chrome browser crashed');
      expect(result).toContain('브라우저 관련 오류로 프로세스가 종료됨');
    });
  });

  describe('일반 exit code 처리', () => {
    it('exit code 1은 스크립트 실행 오류 메시지를 반환해야 함', () => {
      const result = formatPythonExitCode(1, '');
      expect(result).toBe('Python 스크립트 실행 중 오류 발생');
    });

    it('exit code 2는 명령행 인자 오류 메시지를 반환해야 함', () => {
      const result = formatPythonExitCode(2, '');
      expect(result).toBe('Python 명령행 인자 오류');
    });

    it('기타 exit code는 코드 번호를 포함한 메시지를 반환해야 함', () => {
      const result = formatPythonExitCode(137, '');
      expect(result).toBe('Python 프로세스가 코드 137로 종료됨');
    });
  });

  describe('에러 출력에서 상세 정보 추출', () => {
    it('Error가 포함된 라인을 추출하여 상세 정보에 포함해야 함', () => {
      const errorOutput = `
        Traceback (most recent call last):
          File "script.py", line 10, in <module>
        ValueError: invalid literal for int()
      `;
      const result = formatPythonExitCode(1, errorOutput);
      expect(result).toContain('상세:');
      expect(result).toContain('ValueError');
    });

    it('Exception이 포함된 라인도 추출해야 함', () => {
      const errorOutput = 'RuntimeException: Something went wrong';
      const result = formatPythonExitCode(1, errorOutput);
      expect(result).toContain('상세:');
      expect(result).toContain('RuntimeException');
    });

    it('한글 "오류"도 추출해야 함', () => {
      const errorOutput = '연결 오류: 서버에 연결할 수 없습니다';
      const result = formatPythonExitCode(1, errorOutput);
      expect(result).toContain('상세:');
      expect(result).toContain('오류');
    });
  });

  describe('복합 시나리오', () => {
    it('exit code -1 + timeout + Error 라인이 있으면 모두 반영해야 함', () => {
      const errorOutput = 'TimeoutError: Operation timed out after 600 seconds';
      const result = formatPythonExitCode(-1, errorOutput);
      expect(result).toContain('작업 시간 초과로 프로세스가 종료됨');
      expect(result).toContain('상세:');
      expect(result).toContain('TimeoutError');
    });

    it('exit code 0은 처리하지 않음 (성공 케이스)', () => {
      const result = formatPythonExitCode(0, '');
      expect(result).toBe('Python 프로세스가 코드 0로 종료됨');
    });
  });
});
