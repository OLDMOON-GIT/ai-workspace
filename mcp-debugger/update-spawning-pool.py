#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BTS-14819: spawning-pool.py에 좀비 감지 기능 추가"""

import re

# 파일 읽기
with open('spawning-pool.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 헤더 docstring 업데이트 (v2.2 -> v2.4, BTS-14819 추가)
old_header = '''"""
Spawning Pool v2.2 - 지능형 라우팅 시스템

⚠️ 이 파일 수정 금지! 회귀 감지용 버전: 2.2-20251206'''

new_header = '''"""
Spawning Pool v2.4 - 지능형 라우팅 시스템 + 좀비 감지

⚠️ 이 파일 수정 금지! 회귀 감지용 버전: 2.4-20251206'''

content = content.replace(old_header, new_header)

# 2. BTS-14819 항목 추가 (docstring 내)
old_docstring_end = '''  - Case 3: 확실한 키워드 매칭 → Dispatcher 생략
"""'''

new_docstring_end = '''  - Case 3: 확실한 키워드 매칭 → Dispatcher 생략
BTS-14819: 좀비 워커 자동 감지 및 정리 시스템
  - 30초 주기 좀비 감지 스레드
  - 죽은 PID 발견 시 bugs.status=open 롤백
  - 10분 이상 작업 경고
  - slog --follow에서 좀비 감지 로그 표시
"""'''

content = content.replace(old_docstring_end, new_docstring_end)

# 3. 좀비 감지 설정 추가 (DISPATCHER_TIMEOUT 뒤에)
old_settings = '''DISPATCHER_TIMEOUT = 30  # Dispatcher 판단 타임아웃

WORKSPACE_DIR'''

new_settings = '''DISPATCHER_TIMEOUT = 30  # Dispatcher 판단 타임아웃

# BTS-14819: 좀비 감지 설정
ZOMBIE_CHECK_INTERVAL = 30  # 30초 주기
ZOMBIE_TIMEOUT_WARNING = 600  # 10분 (600초) 이상 작업 시 경고

WORKSPACE_DIR'''

content = content.replace(old_settings, new_settings)

# 4. 좀비 통계 및 플래그 추가 (stats_lock 뒤에)
old_stats = '''stats_lock = threading.Lock()


# ============================================================
# 데이터 클래스'''

new_stats = '''stats_lock = threading.Lock()

# BTS-14819: 좀비 감지 통계
zombie_stats = {'detected': 0, 'cleaned': 0, 'timeouts': 0}
zombie_stats_lock = threading.Lock()

# BTS-14819: 좀비 감지 스레드 중단 플래그
zombie_monitor_stop = threading.Event()


# ============================================================
# 데이터 클래스'''

content = content.replace(old_stats, new_stats)

# 5. 좀비 감지 함수들 추가 (RoutingDecision 클래스 뒤에)
zombie_functions = '''

# ============================================================
# BTS-14819: 좀비 워커 감지 및 정리 시스템
# ============================================================

def is_process_running(pid: int) -> bool:
    """Windows에서 PID가 살아있는지 확인"""
    if pid is None or pid <= 0:
        return False
    try:
        result = subprocess.run(
            f'tasklist /FI "PID eq {pid}" /NH',
            shell=True, capture_output=True, text=True,
            encoding='utf-8', errors='replace', timeout=5
        )
        return str(pid) in result.stdout
    except Exception:
        return False


def get_in_progress_bugs() -> List[Dict]:
    """in_progress 상태의 버그들을 조회 (좀비 감지용)"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id, title, worker_pid, assigned_to, updated_at
            FROM bugs
            WHERE status = 'in_progress'
        """)
        return cursor.fetchall()
    except Exception as e:
        print(f'  [ZOMBIE] DB 조회 오류: {e}')
        return []
    finally:
        if conn:
            conn.close()


def rollback_zombie_bug(bug_id: int, worker_pid: int, reason: str) -> bool:
    """좀비 버그를 open 상태로 롤백"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # metadata에 좀비 정리 이력 추가
        cursor.execute("SELECT metadata FROM bugs WHERE id = %s", (bug_id,))
        row = cursor.fetchone()
        metadata = {}
        if row and row[0]:
            try:
                metadata = json.loads(row[0]) if isinstance(row[0], str) else row[0]
            except:
                metadata = {}

        if 'zombie_cleanup' not in metadata:
            metadata['zombie_cleanup'] = []
        metadata['zombie_cleanup'].append({
            'timestamp': datetime.now().isoformat(),
            'dead_pid': worker_pid,
            'reason': reason
        })

        cursor.execute("""
            UPDATE bugs SET status = 'open', worker_pid = NULL,
                   assigned_to = NULL, metadata = %s, updated_at = NOW()
            WHERE id = %s AND status = 'in_progress'
        """, (json.dumps(metadata, ensure_ascii=False), bug_id))
        conn.commit()

        return cursor.rowcount > 0
    except Exception as e:
        print(f'  [ZOMBIE] 롤백 오류 BTS-{bug_id}: {e}')
        return False
    finally:
        if conn:
            conn.close()


def write_zombie_log(content: str):
    """좀비 감지 로그 기록 (slog --follow에서 표시됨)"""
    os.makedirs(LOGS_DIR, exist_ok=True)
    log_path = os.path.join(LOGS_DIR, 'zombie-monitor.log')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(f'[{timestamp}] {content}\\n')


def zombie_monitor_thread():
    """30초 주기로 좀비 워커 감지 및 정리 (BTS-14819)"""
    print('  [ZOMBIE] 좀비 모니터링 시작 (30초 주기)')
    write_zombie_log('[START] 좀비 모니터 시작')

    while not zombie_monitor_stop.is_set():
        try:
            in_progress_bugs = get_in_progress_bugs()

            for bug in in_progress_bugs:
                bug_id = bug['id']
                worker_pid = bug['worker_pid']
                updated_at = bug['updated_at']
                title = bug.get('title', '')[:40]

                # 1. 죽은 PID 감지
                if worker_pid and not is_process_running(worker_pid):
                    reason = f'죽은 PID: {worker_pid}'
                    print(f'  [ZOMBIE] 감지! BTS-{bug_id} ({title}...) - {reason}')
                    write_zombie_log(f'[DETECTED] BTS-{bug_id} - {reason}')

                    if rollback_zombie_bug(bug_id, worker_pid, reason):
                        print(f'  [ZOMBIE] 정리 완료! BTS-{bug_id} -> open')
                        write_zombie_log(f'[CLEANED] BTS-{bug_id} -> status=open')
                        with zombie_stats_lock:
                            zombie_stats['detected'] += 1
                            zombie_stats['cleaned'] += 1

                # 2. 10분 이상 작업 중 경고
                if updated_at:
                    elapsed = (datetime.now() - updated_at).total_seconds()
                    if elapsed > ZOMBIE_TIMEOUT_WARNING:
                        elapsed_min = int(elapsed / 60)
                        warning_msg = f'BTS-{bug_id} ({title}...) - {elapsed_min}분 경과 (PID: {worker_pid})'
                        print(f'  [ZOMBIE] ⚠️ 장시간 작업 경고! {warning_msg}')
                        write_zombie_log(f'[TIMEOUT_WARNING] {warning_msg}')
                        with zombie_stats_lock:
                            zombie_stats['timeouts'] += 1

        except Exception as e:
            print(f'  [ZOMBIE] 모니터링 오류: {e}')
            write_zombie_log(f'[ERROR] {e}')

        # 30초 대기 (중단 요청 시 즉시 종료)
        zombie_monitor_stop.wait(ZOMBIE_CHECK_INTERVAL)

    print('  [ZOMBIE] 좀비 모니터링 종료')
    write_zombie_log('[STOP] 좀비 모니터 종료')

'''

# RoutingDecision 클래스 바로 뒤에 삽입
old_routing_end = '''@dataclass
class RoutingDecision:
    worker_type: WorkerType
    reason: str
    confidence: float = 1.0


# ============================================================
# CLI 호출 함수'''

new_routing_end = '''@dataclass
class RoutingDecision:
    worker_type: WorkerType
    reason: str
    confidence: float = 1.0

''' + zombie_functions + '''
# ============================================================
# CLI 호출 함수'''

content = content.replace(old_routing_end, new_routing_end)

# 6. main_loop 헤더 업데이트
old_main_header = '''def main_loop():
    print('')
    print('=' * 64)
    print('       Spawning Pool v2.3 - Intelligent Routing')
    print('       ⚠️ Version 2.3-20251206 (BTS-14817)')
    print('=' * 64)'''

new_main_header = '''def main_loop():
    print('')
    print('=' * 64)
    print('       Spawning Pool v2.4 - Intelligent Routing + Zombie Detection')
    print('       ⚠️ Version 2.4-20251206 (BTS-14819)')
    print('=' * 64)'''

content = content.replace(old_main_header, new_main_header)

# 7. PID 출력 뒤에 좀비 체크 정보 추가
old_pid_print = '''    print(f'  PID: {os.getpid()}')
    print('')
    print('-' * 64)
    print('  Dispatcher: Claude (keyword + AI routing)')
    print('  Ctrl+C to stop')'''

new_pid_print = '''    print(f'  PID: {os.getpid()}')
    print(f'  Zombie Check: {ZOMBIE_CHECK_INTERVAL}s interval, {ZOMBIE_TIMEOUT_WARNING}s timeout warning')
    print('')
    print('-' * 64)
    print('  Dispatcher: Claude (keyword + AI routing)')
    print('  Zombie Monitor: Active (30s interval)')
    print('  Ctrl+C to stop')'''

content = content.replace(old_pid_print, new_pid_print)

# 8. 좀비 모니터 스레드 시작 추가
old_executor_start = '''    print('')

    executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix='Worker')
    futures = {}'''

new_executor_start = '''    print('')

    # BTS-14819: 좀비 모니터 스레드 시작
    zombie_thread = threading.Thread(target=zombie_monitor_thread, daemon=True, name='ZombieMonitor')
    zombie_thread.start()

    executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix='Worker')
    futures = {}'''

content = content.replace(old_executor_start, new_executor_start)

# 9. 상태 출력에 좀비 통계 추가
old_status_print = '''                active_info = get_active_workers_info()
                print(f'  [{time_str}] {worker_status} | '
                      f'P:{stats["processed"]} S:{stats["success"]} F:{stats["failed"]} | '
                      f'Active: {active_info}')'''

new_status_print = '''                active_info = get_active_workers_info()
                # BTS-14819: 좀비 통계 추가
                with zombie_stats_lock:
                    zombie_info = f'Z:{zombie_stats["detected"]}/{zombie_stats["cleaned"]}'
                print(f'  [{time_str}] {worker_status} | '
                      f'P:{stats["processed"]} S:{stats["success"]} F:{stats["failed"]} {zombie_info} | '
                      f'Active: {active_info}')'''

content = content.replace(old_status_print, new_status_print)

# 10. 종료 처리에 좀비 모니터 중단 추가
old_shutdown = '''    except KeyboardInterrupt:
        print('\\n  Shutting down...')
        executor.shutdown(wait=False)
    finally:
        print(f'\\n  Final stats: {stats}')'''

new_shutdown = '''    except KeyboardInterrupt:
        print('\\n  Shutting down...')
        # BTS-14819: 좀비 모니터 중단
        zombie_monitor_stop.set()
        zombie_thread.join(timeout=5)
        executor.shutdown(wait=False)
    finally:
        print(f'\\n  Final stats: {stats}')
        with zombie_stats_lock:
            print(f'  Zombie stats: {zombie_stats}')'''

content = content.replace(old_shutdown, new_shutdown)

# 파일 쓰기
with open('spawning-pool.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('spawning-pool.py 업데이트 완료 (BTS-14819)')
