#!/usr/bin/env python3
"""
BTS-3135 패치: spawning-pool.py의 recover_stuck_bugs 함수 개선

이 스크립트는 spawning-pool.py를 패치하여 재시작 시 stuck 버그를 더 정확히 복구합니다.

개선 사항:
1. is_pid_running() 함수 추가 - 프로세스가 살아있는지 확인
2. recover_stuck_bugs() 함수 개선:
   - 30분 타임아웃뿐만 아니라 PID 기반으로도 복구
   - worker_pid가 NULL이거나 해당 프로세스가 죽었으면 즉시 복구

사용법:
python patch-spawning-pool-recovery.py
"""

import re

def main():
    # 원본 파일 읽기
    with open('spawning-pool.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # 기존 함수 찾기
    old_func = '''def recover_stuck_bugs() -> int:
    """
    시작 시 stuck된 버그들 복구 (BTS-3135)
    - spawning-pool이 담당했던 버그만 복구 (다른 Claude CLI 작업은 건드리지 않음)
    - in_progress 상태이면서 30분 이상 지난 버그들을 open으로 복구
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # spawning-pool이 담당했던 버그만 복구 (assigned_to가 spawning-pool로 시작)
        cursor.execute("""
            UPDATE bugs
            SET status = 'open', assigned_to = NULL, worker_pid = NULL, updated_at = NOW()
            WHERE status = 'in_progress'
              AND assigned_to LIKE 'spawning-pool%'
              AND updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        """)

        recovered = cursor.rowcount
        conn.commit()

        if recovered > 0:
            print(f'  [RECOVERY] {recovered}개의 spawning-pool stuck 버그를 open으로 복구')

        return recovered
    except Exception as e:
        print(f'  [RECOVERY] 복구 실패: {e}')
        return 0
    finally:
        if conn:
            conn.close()'''

    # 새 함수
    new_func = '''def is_pid_running(pid: int) -> bool:
    """
    주어진 PID가 현재 실행 중인지 확인 (Windows)
    BTS-3135: spawning-pool 재시작 시 이전 PID 프로세스 확인용
    """
    if pid is None or pid <= 0:
        return False
    try:
        # Windows: tasklist로 확인
        result = subprocess.run(
            ['tasklist', '/FI', f'PID eq {pid}', '/NH'],
            capture_output=True, text=True, timeout=5,
            encoding='utf-8', errors='replace'
        )
        return str(pid) in result.stdout
    except Exception:
        return False


def recover_stuck_bugs() -> int:
    """
    시작 시 stuck된 버그들 복구 (BTS-3135)

    복구 조건:
    1. spawning-pool이 담당했던 버그 (assigned_to LIKE 'spawning-pool%')
    2. in_progress 상태
    3. 다음 중 하나에 해당:
       - worker_pid가 NULL이거나
       - worker_pid 프로세스가 죽었거나
       - updated_at이 30분 이상 지남 (안전 장치)

    다른 Claude CLI 작업은 건드리지 않음 (assigned_to가 spawning-pool이 아닌 것)
    """
    conn = None
    recovered = 0
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # spawning-pool이 담당한 in_progress 버그들 조회
        cursor.execute("""
            SELECT id, worker_pid, assigned_to, updated_at
            FROM bugs
            WHERE status = 'in_progress'
              AND assigned_to LIKE 'spawning-pool%'
        """)

        stuck_bugs = cursor.fetchall()
        my_pid = os.getpid()

        for bug in stuck_bugs:
            bug_id = bug['id']
            worker_pid = bug['worker_pid']
            assigned_to = bug['assigned_to'] or ''
            updated_at = bug['updated_at']

            should_recover = False
            reason = ''

            # 조건 1: worker_pid가 없음
            if worker_pid is None or worker_pid <= 0:
                should_recover = True
                reason = 'worker_pid가 없음'

            # 조건 2: 내 PID가 아니고, 해당 프로세스가 죽음
            elif worker_pid != my_pid and not is_pid_running(worker_pid):
                should_recover = True
                reason = f'PID {worker_pid}가 죽음'

            # 조건 3: 30분 이상 지남 (안전 장치)
            elif updated_at and (datetime.now() - updated_at).total_seconds() > 1800:
                should_recover = True
                reason = '30분 타임아웃'

            if should_recover:
                cursor.execute("""
                    UPDATE bugs
                    SET status = 'open', assigned_to = NULL, worker_pid = NULL, updated_at = NOW()
                    WHERE id = %s AND status = 'in_progress'
                """, (bug_id,))
                if cursor.rowcount > 0:
                    recovered += 1
                    print(f'  [RECOVERY] BTS-{bug_id} 복구 ({reason})')

        conn.commit()

        if recovered > 0:
            print(f'  [RECOVERY] 총 {recovered}개의 stuck 버그를 open으로 복구')
        else:
            print(f'  [RECOVERY] 복구할 stuck 버그 없음')

        return recovered
    except Exception as e:
        print(f'  [RECOVERY] 복구 실패: {e}')
        return 0
    finally:
        if conn:
            conn.close()'''

    if old_func in content:
        new_content = content.replace(old_func, new_func)

        # 백업
        with open('spawning-pool.py.bak', 'w', encoding='utf-8') as f:
            f.write(content)

        # 패치 적용
        with open('spawning-pool.py', 'w', encoding='utf-8') as f:
            f.write(new_content)

        print('패치 적용 완료! spawning-pool.py가 업데이트되었습니다.')
        print('백업: spawning-pool.py.bak')
    else:
        print('기존 함수를 찾을 수 없습니다. 수동으로 패치해야 합니다.')
        print('\n=== 새 함수 ===')
        print(new_func)


if __name__ == '__main__':
    main()
