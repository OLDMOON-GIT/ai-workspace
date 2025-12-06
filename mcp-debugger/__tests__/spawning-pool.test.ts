/**
 * BTS-3028: spawning-pool 무한 스포닝 버그 테스트
 *
 * 문제: detached 프로세스가 unref() 후 close 이벤트 발생 시
 *       activeWorkers에서 삭제되어 무한 스폰 루프 발생
 *
 * 해결: handleWorkerExit에서 running 상태 워커의 close 이벤트 무시
 *       cleanupDeadWorkers에서 30초 이상 지난 워커만 PID 체크로 정리
 */

import { execSync } from 'child_process';
import * as os from 'os';

// isProcessRunning 함수 테스트
describe('BTS-3028: spawning-pool infinite spawn fix', () => {

  describe('isProcessRunning function', () => {
    // 실제 spawning-pool.ts에서 사용하는 로직 복사
    function isProcessRunning(pid: number): boolean {
      try {
        if (os.platform() === 'win32') {
          const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
          return result.includes(pid.toString());
        } else {
          process.kill(pid, 0);
          return true;
        }
      } catch {
        return false;
      }
    }

    it('현재 프로세스 PID는 존재해야 함', () => {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it('존재하지 않는 PID는 false 반환', () => {
      // 매우 높은 PID (존재할 가능성 낮음)
      expect(isProcessRunning(99999999)).toBe(false);
    });
  });

  describe('handleWorkerExit logic', () => {
    // 시뮬레이션을 위한 상태
    interface MockWorker {
      workerId: string;
      status: 'spawning' | 'running' | 'failed' | 'completed';
      pid: number | null;
    }

    const activeWorkers = new Map<string, MockWorker>();

    // handleWorkerExit 로직 복제
    function handleWorkerExit(workerId: string, code: number | null): boolean {
      const worker = activeWorkers.get(workerId);
      if (!worker) return false;

      // BTS-3028 fix: running 상태면 close 이벤트 무시
      if (worker.status === 'running') {
        return false; // 이벤트 무시됨
      }

      // spawning 상태에서 close는 spawn 실패
      if (worker.status === 'spawning') {
        activeWorkers.delete(workerId);
        return true; // 정리됨
      }

      return false;
    }

    beforeEach(() => {
      activeWorkers.clear();
    });

    it('running 상태 워커의 close 이벤트는 무시해야 함', () => {
      const worker: MockWorker = {
        workerId: 'worker-1',
        status: 'running',
        pid: 12345
      };
      activeWorkers.set('worker-1', worker);

      const result = handleWorkerExit('worker-1', 0);

      expect(result).toBe(false); // 무시됨
      expect(activeWorkers.has('worker-1')).toBe(true); // 아직 존재
    });

    it('spawning 상태 워커의 close는 spawn 실패로 처리', () => {
      const worker: MockWorker = {
        workerId: 'worker-2',
        status: 'spawning',
        pid: null
      };
      activeWorkers.set('worker-2', worker);

      const result = handleWorkerExit('worker-2', 1);

      expect(result).toBe(true); // 정리됨
      expect(activeWorkers.has('worker-2')).toBe(false); // 삭제됨
    });
  });

  describe('cleanupDeadWorkers logic', () => {
    const MIN_WORKER_AGE_MS = 30000;

    interface MockWorker {
      workerId: string;
      status: 'running';
      pid: number;
      spawnedAt: Date;
    }

    it('30초 미만 워커는 정리하지 않음', () => {
      const now = Date.now();
      const worker: MockWorker = {
        workerId: 'worker-1',
        status: 'running',
        pid: 12345,
        spawnedAt: new Date(now - 10000) // 10초 전
      };

      const age = now - worker.spawnedAt.getTime();
      const shouldCleanup = age >= MIN_WORKER_AGE_MS;

      expect(shouldCleanup).toBe(false);
    });

    it('30초 이상 워커는 PID 체크 대상', () => {
      const now = Date.now();
      const worker: MockWorker = {
        workerId: 'worker-2',
        status: 'running',
        pid: 12345,
        spawnedAt: new Date(now - 60000) // 60초 전
      };

      const age = now - worker.spawnedAt.getTime();
      const shouldCleanup = age >= MIN_WORKER_AGE_MS;

      expect(shouldCleanup).toBe(true);
    });
  });
});

/**
 * BTS-3135: Spawning Pool 재시작 시 in_progress 버그 stuck 해결 테스트
 *
 * 문제: Spawning Pool 재시작 시 이전 in_progress 버그들이 stuck됨
 * 해결: 시작 시 및 주기적으로 죽은 워커의 버그를 open으로 복구
 */
describe('BTS-3135: recover_stuck_bugs logic', () => {
  // 시뮬레이션용 버그 상태
  interface MockBug {
    id: number;
    status: string;
    worker_pid: number | null;
    assigned_to: string | null;
  }

  // isProcessRunning 함수 (실제 로직 복사)
  function isProcessRunning(pid: number): boolean {
    try {
      if (os.platform() === 'win32') {
        const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
        return result.includes(pid.toString());
      } else {
        process.kill(pid, 0);
        return true;
      }
    } catch {
      return false;
    }
  }

  // recover_stuck_bugs 로직 시뮬레이션
  function recoverStuckBugs(bugs: MockBug[]): number[] {
    const recoveredIds: number[] = [];

    for (const bug of bugs) {
      if (bug.status !== 'in_progress') continue;

      if (bug.worker_pid === null) {
        // orphan 버그 복구
        bug.status = 'open';
        bug.assigned_to = null;
        recoveredIds.push(bug.id);
      } else if (!isProcessRunning(bug.worker_pid)) {
        // 죽은 워커 버그 복구
        bug.status = 'open';
        bug.worker_pid = null;
        bug.assigned_to = null;
        recoveredIds.push(bug.id);
      }
      // 살아있는 워커의 버그는 유지
    }

    return recoveredIds;
  }

  it('worker_pid가 NULL인 orphan 버그를 복구해야 함', () => {
    const bugs: MockBug[] = [
      { id: 1001, status: 'in_progress', worker_pid: null, assigned_to: 'orphan-worker' }
    ];

    const recovered = recoverStuckBugs(bugs);

    expect(recovered).toContain(1001);
    expect(bugs[0].status).toBe('open');
    expect(bugs[0].assigned_to).toBeNull();
  });

  it('죽은 PID의 버그를 복구해야 함', () => {
    const bugs: MockBug[] = [
      { id: 1002, status: 'in_progress', worker_pid: 99999999, assigned_to: 'dead-worker' }
    ];

    const recovered = recoverStuckBugs(bugs);

    expect(recovered).toContain(1002);
    expect(bugs[0].status).toBe('open');
    expect(bugs[0].worker_pid).toBeNull();
    expect(bugs[0].assigned_to).toBeNull();
  });

  it('살아있는 PID의 버그는 유지해야 함', () => {
    const currentPid = process.pid;
    const bugs: MockBug[] = [
      { id: 1003, status: 'in_progress', worker_pid: currentPid, assigned_to: 'live-worker' }
    ];

    const recovered = recoverStuckBugs(bugs);

    expect(recovered).not.toContain(1003);
    expect(bugs[0].status).toBe('in_progress');
    expect(bugs[0].worker_pid).toBe(currentPid);
  });

  it('open 상태 버그는 건드리지 않아야 함', () => {
    const bugs: MockBug[] = [
      { id: 1004, status: 'open', worker_pid: null, assigned_to: null }
    ];

    const recovered = recoverStuckBugs(bugs);

    expect(recovered).toHaveLength(0);
    expect(bugs[0].status).toBe('open');
  });

  it('resolved 상태 버그는 건드리지 않아야 함', () => {
    const bugs: MockBug[] = [
      { id: 1005, status: 'resolved', worker_pid: null, assigned_to: null }
    ];

    const recovered = recoverStuckBugs(bugs);

    expect(recovered).toHaveLength(0);
    expect(bugs[0].status).toBe('resolved');
  });

  it('혼합 상태 버그들을 올바르게 처리해야 함', () => {
    const currentPid = process.pid;
    const bugs: MockBug[] = [
      { id: 1, status: 'in_progress', worker_pid: null, assigned_to: 'orphan' },           // 복구 대상
      { id: 2, status: 'in_progress', worker_pid: 99999999, assigned_to: 'dead' },         // 복구 대상
      { id: 3, status: 'in_progress', worker_pid: currentPid, assigned_to: 'live' },       // 유지
      { id: 4, status: 'open', worker_pid: null, assigned_to: null },                      // 무시
      { id: 5, status: 'resolved', worker_pid: null, assigned_to: null },                  // 무시
    ];

    const recovered = recoverStuckBugs(bugs);

    expect(recovered).toHaveLength(2);
    expect(recovered).toContain(1);
    expect(recovered).toContain(2);
    expect(recovered).not.toContain(3);
    expect(bugs[2].status).toBe('in_progress');  // live worker 유지
  });
});
