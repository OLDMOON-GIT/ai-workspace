#!/usr/bin/env python3
"""
Spawning Pool v2.4 - 지능형 라우팅 시스템 + 행(Hang) 감지

[!] 이 파일 수정 금지! 회귀 감지용 버전: 2.4-20251206
[!] BTS-3463: 설정 회귀 방지를 위해 버전 명시
[!] SHA256: (Code Guardian 모니터링 중)

구조:
1. Dispatcher (Claude): 작업 분류 및 라우팅 결정
2. Worker Pool: Claude 4개, Gemini 2개, Codex 2개 (총 8개)
3. 작업 유형별 할당:
   - Claude: 롱폼, 긴 프롬프트, 복잡한 버그
   - Gemini: 숏폼, 상품 관련
   - Codex: 플래닝, 코드 리뷰, 아키텍처
4. Hang Detector (BTS-3411): 행 감지 및 자동 제거

BTS-3080: AI 에이전트별 특성에 맞는 작업 라우팅
BTS-3463: Claude 6->4, 리미트 표시, (X) 실패 표시 추가
BTS-3403: 워커별 리미트 처리 누락 수정 - acquire_worker 반환값 체크
BTS-14769: Rate limit 시 Dispatcher 호출 생략으로 비용 절약
BTS-14826: Gemini rate limit 에러 패턴 추가 (RESOURCE_EXHAUSTED, check quota 등)
BTS-3411: 워커 행(Hang) 감지 및 자동 제거
  - 30초 간격으로 워커 상태 체크
  - 5분 이상 로그 무응답 시 행으로 판단
  - 행 감지 시 워커 제거 및 버그 open으로 롤백
  - Case 1: 가용 워커 1개 → 바로 할당
  - Case 2: P0 긴급 버그 → Claude 직접 할당
  - Case 3: 확실한 키워드 매칭 → Dispatcher 생략
BTS-14819: 좀비 워커 자동 감지 및 정리 시스템
  - 30초 주기 좀비 감지 스레드
  - 죽은 PID 발견 시 bugs.status=open 롤백
  - 10분 이상 작업 경고
  - slog --follow에서 좀비 감지 로그 표시
"""

import subprocess
import mysql.connector
import time
import json
import re
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional, Dict, Any, List, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum

# ============================================================
# 설정
# ============================================================

DB_CONFIG = {
    'host': os.environ.get('TREND_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('TREND_DB_PORT', '3306')),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'trend2024'),
    'database': os.environ.get('DB_NAME', 'trend_video'),
    'use_pure': True
}

# Worker 설정 - Claude 4, Gemini 2, Codex 2 = 총 8개 (BTS-3463)
WORKER_CONFIG = {
    'claude': {'count': 4, 'timeout': 600},
    'gemini': {'count': 2, 'timeout': 300},
    'codex': {'count': 2, 'timeout': 300}
}

MAX_WORKERS = sum(cfg['count'] for cfg in WORKER_CONFIG.values())  # 8 (BTS-3463)
POLL_INTERVAL = 5
DISPATCHER_TIMEOUT = 30  # Dispatcher 판단 타임아웃

# BTS-3411 + BTS-14819: 행(Hang)/좀비 감지 설정
HANG_CHECK_INTERVAL = 30  # 30초 주기 (BTS-3411)
HANG_TIMEOUT = 300  # 5분 (300초) 이상 무응답 시 행으로 판단 및 강제 제거 (BTS-3411)
HANG_TIMEOUT_WARNING = 600  # 10분 (600초) 이상 작업 시 경고 (BTS-14819)

# 하위 호환성 유지
ZOMBIE_CHECK_INTERVAL = HANG_CHECK_INTERVAL
ZOMBIE_TIMEOUT_WARNING = HANG_TIMEOUT_WARNING

WORKSPACE_DIR = r'C:\Users\oldmoon\workspace'
LOGS_DIR = os.path.join(WORKSPACE_DIR, 'mcp-debugger', 'logs')
DISPATCHER_PROMPT_FILE = os.path.join(WORKSPACE_DIR, 'trend-video-frontend', 'prompts', 'prompt_dispatcher.txt')

# 워커 타입별 현재 활성 수 추적
worker_counts: Dict[str, int] = {k: 0 for k in WORKER_CONFIG.keys()}
worker_counts_lock = threading.Lock()

# API rate limit 상태 추적 (BTS-3473)
rate_limited: Dict[str, bool] = {k: False for k in WORKER_CONFIG.keys()}
rate_limited_lock = threading.Lock()

# 처리 중인 버그 ID
processing_bugs: Set[int] = set()
processing_lock = threading.Lock()

# 통계
stats = {'processed': 0, 'success': 0, 'failed': 0, 'by_worker': {k: 0 for k in WORKER_CONFIG.keys()}}
stats_lock = threading.Lock()

# BTS-14819: 좀비 감지 통계
zombie_stats = {'detected': 0, 'cleaned': 0, 'timeouts': 0}
zombie_stats_lock = threading.Lock()

# BTS-14819: 좀비 감지 스레드 중단 플래그
zombie_monitor_stop = threading.Event()


# ============================================================
# 데이터 클래스
# ============================================================

class WorkerType(Enum):
    CLAUDE = 'claude'
    GEMINI = 'gemini'
    CODEX = 'codex'


@dataclass
class Bug:
    id: int
    type: str
    priority: str
    title: str
    summary: Optional[str]
    status: str
    assigned_to: Optional[str]
    worker_pid: Optional[int]


@dataclass
class RoutingDecision:
    worker_type: WorkerType
    reason: str
    confidence: float = 1.0



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
    """행/좀비 감지 로그 기록 (slog --follow에서 표시됨)"""
    os.makedirs(LOGS_DIR, exist_ok=True)
    log_path = os.path.join(LOGS_DIR, 'hang-detector.log')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(f'[{timestamp}] {content}\n')


def get_worker_log_last_activity(bug_id: int) -> Optional[float]:
    """워커 로그 파일의 마지막 수정 시간으로부터 경과 시간 반환 (BTS-3411)

    Returns:
        마지막 로그 기록으로부터 경과한 시간(초), 로그 파일 없으면 None
    """
    log_path = os.path.join(LOGS_DIR, f'worker-{bug_id}.log')
    try:
        if os.path.exists(log_path):
            mtime = os.path.getmtime(log_path)
            elapsed = time.time() - mtime
            return elapsed
    except Exception:
        pass
    return None


def zombie_monitor_thread():
    """30초 주기로 행(Hang)/좀비 워커 감지 및 정리 (BTS-3411 + BTS-14819)

    감지 기준:
    1. 죽은 PID 감지 (좀비) - 즉시 정리
    2. 5분 이상 로그 무응답 (행) - 강제 정리 (BTS-3411)
    3. 10분 이상 작업 중 - 경고만 (BTS-14819)
    """
    print(f'  [HANG] 행/좀비 모니터링 시작 ({HANG_CHECK_INTERVAL}초 주기)')
    print(f'  [HANG] 행 판단: {HANG_TIMEOUT}초 로그 무응답, 경고: {HANG_TIMEOUT_WARNING}초')
    write_zombie_log(f'[START] 행/좀비 모니터 시작 (행 타임아웃: {HANG_TIMEOUT}s, 경고: {HANG_TIMEOUT_WARNING}s)')

    while not zombie_monitor_stop.is_set():
        try:
            in_progress_bugs = get_in_progress_bugs()

            for bug in in_progress_bugs:
                bug_id = bug['id']
                worker_pid = bug['worker_pid']
                updated_at = bug['updated_at']
                title = bug.get('title', '')[:40]

                # 1. 죽은 PID 감지 (좀비)
                if worker_pid and not is_process_running(worker_pid):
                    reason = f'죽은 PID: {worker_pid}'
                    print(f'  [HANG] 좀비 감지! BTS-{bug_id} ({title}...) - {reason}')
                    write_zombie_log(f'[ZOMBIE] BTS-{bug_id} - {reason}')

                    if rollback_zombie_bug(bug_id, worker_pid, reason):
                        print(f'  [HANG] 좀비 정리 완료! BTS-{bug_id} -> open')
                        write_zombie_log(f'[CLEANED] BTS-{bug_id} -> status=open (좀비)')
                        with zombie_stats_lock:
                            zombie_stats['detected'] += 1
                            zombie_stats['cleaned'] += 1
                    continue  # 이미 정리됨, 다음 버그로

                # 2. 5분 이상 로그 무응답 시 행으로 판단 및 강제 정리 (BTS-3411)
                log_inactivity = get_worker_log_last_activity(bug_id)
                if log_inactivity is not None and log_inactivity > HANG_TIMEOUT:
                    elapsed_min = int(log_inactivity / 60)
                    reason = f'로그 무응답 {elapsed_min}분 (행 감지)'
                    print(f'  [HANG] 행 감지! BTS-{bug_id} ({title}...) - {reason}')
                    write_zombie_log(f'[HANG_DETECTED] BTS-{bug_id} - {reason}')

                    if rollback_zombie_bug(bug_id, worker_pid, reason):
                        print(f'  [HANG] 행 정리 완료! BTS-{bug_id} -> open')
                        write_zombie_log(f'[CLEANED] BTS-{bug_id} -> status=open (행)')
                        with zombie_stats_lock:
                            zombie_stats['detected'] += 1
                            zombie_stats['cleaned'] += 1
                    continue  # 이미 정리됨, 다음 버그로

                # 3. 10분 이상 작업 중 경고만 (로그는 있지만 오래 걸림)
                if updated_at:
                    elapsed = (datetime.now() - updated_at).total_seconds()
                    if elapsed > HANG_TIMEOUT_WARNING:
                        elapsed_min = int(elapsed / 60)
                        log_info = f', 마지막 로그: {int(log_inactivity)}초 전' if log_inactivity else ''
                        warning_msg = f'BTS-{bug_id} ({title}...) - {elapsed_min}분 경과 (PID: {worker_pid}{log_info})'
                        print(f'  [HANG] [!] 장시간 작업 경고! {warning_msg}')
                        write_zombie_log(f'[TIMEOUT_WARNING] {warning_msg}')
                        with zombie_stats_lock:
                            zombie_stats['timeouts'] += 1

        except Exception as e:
            print(f'  [HANG] 모니터링 오류: {e}')
            write_zombie_log(f'[ERROR] {e}')

        # 30초 대기 (중단 요청 시 즉시 종료)
        zombie_monitor_stop.wait(HANG_CHECK_INTERVAL)

    print('  [HANG] 행/좀비 모니터링 종료')
    write_zombie_log('[STOP] 행/좀비 모니터 종료')


# ============================================================
# CLI 호출 함수
# ============================================================

def check_rate_limit(output: str, worker_type: str) -> bool:
    """API rate limit 에러 감지 (BTS-3473, BTS-3738, BTS-14826)"""
    rate_limit_patterns = [
        'rate limit', 'rate_limit', 'ratelimit',
        'quota exceeded', 'quota_exceeded',
        '429', 'too many requests',
        'limit exceeded', 'api limit',
        'resource exhausted', 'RESOURCE_EXHAUSTED',
        'hit your usage limit',  # BTS-3738: Codex 에러 패턴
        'usage limit',
        'try again at',  # BTS-3738: 리미트 해제 시간 힌트
        # BTS-14826: Gemini 전용 에러 패턴
        'has been exhausted',  # "Resource has been exhausted"
        'check quota',  # "(e.g. check quota)"
        'hit the api rate limit',  # Gemini CLI 메시지
        'free tier limit',  # "due to free tier limits"
        'quota metric',  # "Quota exceeded for quota metric"
        'requests per day',  # "Requests per day per user"
        'requests per minute',  # RPM 제한
        'tokens per minute',  # TPM 제한
    ]
    output_lower = output.lower()
    for pattern in rate_limit_patterns:
        if pattern.lower() in output_lower:
            with rate_limited_lock:
                rate_limited[worker_type] = True

            # BTS-3738: 리미트 해제 시간 파싱 시도
            reset_time = parse_rate_limit_reset_time(output)
            if reset_time:
                print(f'  [!] {worker_type.upper()} API RATE LIMIT! 해제 예정: {reset_time}')
            else:
                print(f'  [!] {worker_type.upper()} API RATE LIMIT 감지!')
            return True
    return False


def parse_rate_limit_reset_time(output: str) -> Optional[str]:
    """리미트 해제 시간 파싱 (BTS-3738)
    예: 'try again at Dec 10th, 2025 7:29 AM'
    """
    import re
    # 패턴: try again at [날짜/시간]
    patterns = [
        r'try again at\s+([A-Za-z]+\s+\d+[a-z]*,?\s+\d+\s+\d+:\d+\s*[AP]M)',  # Dec 10th, 2025 7:29 AM
        r'try again at\s+(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2})',  # 2025-12-10T07:29
        r'reset[s]?\s+(?:at|in)\s+(\d+\s*(?:hour|minute|second|min|sec|hr)s?)',  # resets in 2 hours
    ]
    for pattern in patterns:
        match = re.search(pattern, output, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def clear_rate_limit(worker_type: str):
    """rate limit 해제"""
    with rate_limited_lock:
        rate_limited[worker_type] = False


def call_claude_cli(prompt: str, timeout: int = 60) -> Tuple[bool, str]:
    """Claude CLI 호출 - pipe 방식"""
    prompt_file = os.path.join(WORKSPACE_DIR, f'.prompt-dispatch-{os.getpid()}.txt')
    try:
        with open(prompt_file, 'w', encoding='utf-8') as f:
            f.write(prompt)

        cmd = f'type "{prompt_file}" | claude --dangerously-skip-permissions -p'
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=WORKSPACE_DIR,
            encoding='utf-8', errors='replace'
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)
    finally:
        try:
            os.remove(prompt_file)
        except:
            pass


def call_gemini_cli(prompt: str, timeout: int = 300) -> Tuple[bool, str]:
    """Gemini CLI 호출"""
    cmd = ['gemini', '--yolo', prompt]
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=WORKSPACE_DIR,
            encoding='utf-8', errors='replace'
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def call_codex_cli(prompt: str, timeout: int = 300) -> Tuple[bool, str]:
    """Codex CLI 호출 - exec 모드"""
    cmd = ['codex', 'exec', '--dangerously-bypass-approvals-and-sandbox', prompt]
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=WORKSPACE_DIR,
            encoding='utf-8', errors='replace'
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


# ============================================================
# Dispatcher - 작업 분류
# ============================================================

# Dispatcher 프롬프트 캐시
_dispatcher_prompt_cache: Optional[str] = None
_dispatcher_prompt_mtime: float = 0


def load_dispatcher_prompt() -> str:
    """Dispatcher 프롬프트 파일 로드 (캐시 사용)"""
    global _dispatcher_prompt_cache, _dispatcher_prompt_mtime

    try:
        mtime = os.path.getmtime(DISPATCHER_PROMPT_FILE)
        if _dispatcher_prompt_cache and mtime == _dispatcher_prompt_mtime:
            return _dispatcher_prompt_cache

        with open(DISPATCHER_PROMPT_FILE, 'r', encoding='utf-8') as f:
            _dispatcher_prompt_cache = f.read()
            _dispatcher_prompt_mtime = mtime
            print(f'  [DISPATCHER] 프롬프트 파일 로드: {DISPATCHER_PROMPT_FILE}')
            return _dispatcher_prompt_cache
    except Exception as e:
        print(f'  [DISPATCHER] 프롬프트 파일 로드 실패: {e}')
        return ""


def dispatch_task(bug: Bug) -> RoutingDecision:
    """
    Claude를 사용해 버그/SPEC을 어떤 워커에게 할당할지 결정
    빠른 판단을 위해 간단한 프롬프트 사용
    """

    # 키워드 기반 빠른 라우팅 (Dispatcher 호출 없이)
    title_lower = bug.title.lower()
    summary_lower = (bug.summary or '').lower()
    combined = title_lower + ' ' + summary_lower

    # Codex 키워드: 플래닝, 아키텍처, 리뷰
    codex_keywords = ['plan', '플랜', '아키텍처', 'architecture', 'review', '리뷰',
                      'design', '설계', 'refactor', '리팩토링']
    for kw in codex_keywords:
        if kw in combined:
            return RoutingDecision(WorkerType.CODEX, f"Keyword match: {kw}", 0.9)

    # Gemini 키워드: 숏폼, 상품, 간단한 작업
    gemini_keywords = ['숏폼', 'shortform', '상품', 'product', 'coupang', '쿠팡',
                       'thumbnail', '썸네일', 'simple', '간단', 'quick', '빠른']
    for kw in gemini_keywords:
        if kw in combined:
            return RoutingDecision(WorkerType.GEMINI, f"Keyword match: {kw}", 0.9)

    # Claude 키워드: 롱폼, 복잡한 버그, 대본
    claude_keywords = ['롱폼', 'longform', '대본', 'script', 'complex', '복잡',
                       'error', '에러', 'bug', '버그', 'fix', '수정']
    for kw in claude_keywords:
        if kw in combined:
            return RoutingDecision(WorkerType.CLAUDE, f"Keyword match: {kw}", 0.9)

    # 키워드 매칭 안 되면 Claude Dispatcher 호출
    # 프롬프트 파일에서 템플릿 로드
    prompt_template = load_dispatcher_prompt()

    if prompt_template:
        # 플레이스홀더 치환
        dispatch_prompt = prompt_template
        dispatch_prompt = dispatch_prompt.replace('{bug_id}', str(bug.id))
        dispatch_prompt = dispatch_prompt.replace('{title}', bug.title)
        dispatch_prompt = dispatch_prompt.replace('{summary}', (bug.summary or '')[:300])
        dispatch_prompt = dispatch_prompt.replace('{type}', bug.type)
        dispatch_prompt = dispatch_prompt.replace('{priority}', bug.priority)
    else:
        # 폴백: 하드코딩된 프롬프트
        dispatch_prompt = f"""다음 작업을 어떤 AI 워커에게 할당해야 할지 판단해주세요.

작업: BTS-{bug.id}
제목: {bug.title}
설명: {(bug.summary or '')[:300]}
타입: {bug.type}

워커 특성:
- CLAUDE: 롱폼 영상, 긴 대본, 복잡한 버그 수정, 다단계 작업
- GEMINI: 숏폼 영상, 상품 관련, 썸네일, 간단한 작업
- CODEX: 플래닝, 아키텍처 설계, 코드 리뷰, 리팩토링

답변 형식 (한 줄만):
WORKER: [CLAUDE|GEMINI|CODEX] REASON: [간단한 이유]
"""

    success, output = call_claude_cli(dispatch_prompt, timeout=DISPATCHER_TIMEOUT)

    if success and output:
        output_upper = output.upper()
        if 'WORKER: GEMINI' in output_upper or 'GEMINI' in output_upper.split('\n')[0]:
            return RoutingDecision(WorkerType.GEMINI, "Dispatcher decision", 0.8)
        elif 'WORKER: CODEX' in output_upper or 'CODEX' in output_upper.split('\n')[0]:
            return RoutingDecision(WorkerType.CODEX, "Dispatcher decision", 0.8)

    # 기본값: Claude
    return RoutingDecision(WorkerType.CLAUDE, "Default fallback", 0.5)


def acquire_worker(worker_type: WorkerType) -> bool:
    """워커 슬롯 획득"""
    with worker_counts_lock:
        config = WORKER_CONFIG[worker_type.value]
        if worker_counts[worker_type.value] < config['count']:
            worker_counts[worker_type.value] += 1
            return True
    return False


def release_worker(worker_type: WorkerType):
    """워커 슬롯 해제"""
    with worker_counts_lock:
        worker_counts[worker_type.value] = max(0, worker_counts[worker_type.value] - 1)


# ============================================================
# 데이터베이스 함수
# ============================================================

def get_connection():
    return mysql.connector.connect(**DB_CONFIG)


def get_open_bugs(limit: int = 5) -> List[Bug]:
    """open 상태 버그 조회"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id, type, priority, title, summary, status, assigned_to, worker_pid
            FROM bugs
            WHERE status = 'open' AND assigned_to IS NULL
            ORDER BY
                CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
                created_at ASC
            LIMIT %s
        """, (limit,))

        bugs = []
        for row in cursor.fetchall():
            with processing_lock:
                if row['id'] not in processing_bugs:
                    bugs.append(Bug(**row))
        return bugs
    finally:
        if conn:
            conn.close()


def claim_bug(bug_id: int, worker_type: str) -> bool:
    """버그 claim"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        worker_label = f"spawning-pool-{worker_type}-{os.getpid()}"
        cursor.execute("""
            UPDATE bugs SET status = 'in_progress', assigned_to = %s,
                   worker_pid = %s, updated_at = NOW()
            WHERE id = %s AND status = 'open'
        """, (worker_label, os.getpid(), bug_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        if conn:
            conn.close()


def resolve_bug(bug_id: int, resolution_note: str) -> bool:
    """버그 resolved 처리"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE bugs SET status = 'resolved', worker_pid = NULL,
                   assigned_to = NULL, resolution_note = %s, updated_at = NOW()
            WHERE id = %s
        """, (resolution_note[:2000], bug_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        if conn:
            conn.close()


def release_bug(bug_id: int, error_message: Optional[str] = None) -> bool:
    """버그 open으로 롤백"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        if error_message:
            cursor.execute("SELECT metadata FROM bugs WHERE id = %s", (bug_id,))
            row = cursor.fetchone()
            metadata = {}
            if row and row[0]:
                try:
                    metadata = json.loads(row[0]) if isinstance(row[0], str) else row[0]
                except:
                    metadata = {}

            if 'failure_history' not in metadata:
                metadata['failure_history'] = []
            metadata['failure_history'].append({
                'timestamp': datetime.now().isoformat(),
                'error': error_message[:500]
            })

            cursor.execute("""
                UPDATE bugs SET status = 'open', worker_pid = NULL,
                       assigned_to = NULL, metadata = %s, updated_at = NOW()
                WHERE id = %s
            """, (json.dumps(metadata, ensure_ascii=False), bug_id))
        else:
            cursor.execute("""
                UPDATE bugs SET status = 'open', worker_pid = NULL,
                       assigned_to = NULL, updated_at = NOW()
                WHERE id = %s
            """, (bug_id,))

        conn.commit()
        return cursor.rowcount > 0
    finally:
        if conn:
            conn.close()


# ============================================================
# 로그 기록 (BTS-14817)
# ============================================================

# 워커별 현재 작업 추적
active_workers: Dict[str, Dict] = {}  # {worker_key: {bug_id, start_time, pid}}
active_workers_lock = threading.Lock()

def write_worker_log(bug_id: int, content: str):
    """워커 로그 파일에 기록"""
    os.makedirs(LOGS_DIR, exist_ok=True)
    log_path = os.path.join(LOGS_DIR, f'worker-{bug_id}.log')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(f'[{timestamp}] {content}\n')


def track_worker_start(worker_type: str, bug_id: int):
    """워커 작업 시작 추적"""
    with active_workers_lock:
        key = f'{worker_type}-{threading.current_thread().name}'
        active_workers[key] = {
            'bug_id': bug_id,
            'start_time': datetime.now(),
            'pid': os.getpid()
        }


def track_worker_end(worker_type: str):
    """워커 작업 종료 추적"""
    with active_workers_lock:
        key = f'{worker_type}-{threading.current_thread().name}'
        active_workers.pop(key, None)


def get_active_workers_info() -> str:
    """현재 활성 워커 정보 문자열 반환"""
    with active_workers_lock:
        if not active_workers:
            return "없음"
        info = []
        for key, data in active_workers.items():
            elapsed = (datetime.now() - data['start_time']).seconds
            info.append(f"BTS-{data['bug_id']}({elapsed}s)")
        return ', '.join(info)


# ============================================================
# 작업 실행
# ============================================================

def build_work_prompt(bug: Bug) -> str:
    """작업 프롬프트 생성"""
    bug_type = 'SPEC' if bug.type == 'spec' else 'BUG'
    return f"""BTS-{bug.id} {bug_type} 해결 요청

제목: {bug.title}
우선순위: {bug.priority}
설명: {(bug.summary or '')[:1000]}

작업 완료 후 반드시 실행:
node bug.js resolve {bug.id} "해결 내용"
"""


def execute_with_worker(bug: Bug, worker_type: WorkerType) -> Tuple[bool, str]:
    """지정된 워커로 작업 실행 (BTS-14817: 로그 기록 추가)"""
    prompt = build_work_prompt(bug)
    timeout = WORKER_CONFIG[worker_type.value]['timeout']

    # 로그 기록 시작
    write_worker_log(bug.id, f'[INFO] 작업 시작 - {worker_type.value.upper()}')
    write_worker_log(bug.id, f'[INFO] 제목: {bug.title[:80]}')
    write_worker_log(bug.id, f'[INFO] 타임아웃: {timeout}s')
    track_worker_start(worker_type.value, bug.id)

    try:
        if worker_type == WorkerType.CLAUDE:
            success, output = call_claude_cli(prompt, timeout)
        elif worker_type == WorkerType.GEMINI:
            success, output = call_gemini_cli(prompt, timeout)
        elif worker_type == WorkerType.CODEX:
            success, output = call_codex_cli(prompt, timeout)
        else:
            return False, "Unknown worker type"

        # BTS-3473: rate limit 체크
        if not success:
            check_rate_limit(output, worker_type.value)
            write_worker_log(bug.id, f'[ERROR] 실패: {output[:200]}')
        else:
            clear_rate_limit(worker_type.value)
            write_worker_log(bug.id, f'[SUCCESS] 완료 (출력 {len(output)} chars)')

        return success, output
    finally:
        track_worker_end(worker_type.value)


def get_available_workers() -> List[WorkerType]:
    """Rate limit 안 걸리고 슬롯 여유 있는 워커 목록 반환 (BTS-14769)

    조건:
    1. Rate limit 안 걸림
    2. 슬롯에 여유 있음 (current < max)
    """
    available = []
    with rate_limited_lock:
        with worker_counts_lock:
            for wt in WorkerType:
                # Rate limit 체크
                if rate_limited.get(wt.value, False):
                    continue
                # 슬롯 가용성 체크
                config = WORKER_CONFIG[wt.value]
                if worker_counts[wt.value] < config['count']:
                    available.append(wt)
    return available


def process_bug(bug: Bug) -> Tuple[bool, WorkerType]:
    """버그 처리 - Dispatcher로 라우팅 후 실행"""
    thread_name = threading.current_thread().name

    # BTS-14769: Rate limit 체크 후 가용 워커 확인
    available_workers = get_available_workers()
    routing_reason = ""

    if len(available_workers) == 0:
        print(f'  [{thread_name}] BTS-{bug.id} 모든 워커 rate limit! 대기 필요')
        return False, WorkerType.CLAUDE

    # BTS-14769: Dispatcher 호출 생략 케이스들 (비용 절약!)
    skip_dispatcher = False

    # Case 1: 가용 워커가 1개뿐
    if len(available_workers) == 1:
        worker_type = available_workers[0]
        routing_reason = "only available"
        skip_dispatcher = True

    # Case 2: P0 긴급 버그 → Claude 직접 할당 (가장 신뢰성 높음)
    elif bug.priority == 'P0' and WorkerType.CLAUDE in available_workers:
        worker_type = WorkerType.CLAUDE
        routing_reason = "P0 critical -> Claude"
        skip_dispatcher = True

    # Case 3: 키워드 매칭으로 확실한 경우 (dispatch_task 내부 로직 선행 적용)
    else:
        title_lower = bug.title.lower()
        summary_lower = (bug.summary or '').lower()
        combined = title_lower + ' ' + summary_lower

        # 확실한 Codex 키워드
        if any(kw in combined for kw in ['plan', '플랜', 'architecture', '아키텍처']) and WorkerType.CODEX in available_workers:
            worker_type = WorkerType.CODEX
            routing_reason = "keyword -> Codex"
            skip_dispatcher = True
        # 확실한 Gemini 키워드
        elif any(kw in combined for kw in ['숏폼', 'shortform', '썸네일', 'thumbnail']) and WorkerType.GEMINI in available_workers:
            worker_type = WorkerType.GEMINI
            routing_reason = "keyword -> Gemini"
            skip_dispatcher = True
        # 확실한 Claude 키워드
        elif any(kw in combined for kw in ['롱폼', 'longform', '대본', 'script', 'complex']) and WorkerType.CLAUDE in available_workers:
            worker_type = WorkerType.CLAUDE
            routing_reason = "keyword -> Claude"
            skip_dispatcher = True

    if skip_dispatcher:
        print(f'  [{thread_name}] BTS-{bug.id} -> {worker_type.value.upper()} ({routing_reason}, skip dispatcher)')
    else:
        # 키워드 매칭 안 되고 여러 워커 가용 시만 Dispatcher 호출
        print(f'  [{thread_name}] BTS-{bug.id} 라우팅 중...')
        decision = dispatch_task(bug)
        worker_type = decision.worker_type
        routing_reason = decision.reason

        # 선택된 워커가 rate limit 걸렸으면 다른 가용 워커로 대체
        if worker_type not in available_workers:
            worker_type = available_workers[0]
            routing_reason = f"{decision.worker_type.value} rate limited -> {worker_type.value}"

    # 2. 해당 워커 슬롯 확인 및 대체 (BTS-3403: 리미트 체크 수정)
    if not acquire_worker(worker_type):
        # 지정된 워커 슬롯 없으면 다른 가용 워커 시도
        acquired = False
        for alt_type in available_workers:
            if alt_type != worker_type and acquire_worker(alt_type):
                print(f'  [{thread_name}] BTS-{bug.id} {worker_type.value} -> {alt_type.value} (slot fallback)')
                worker_type = alt_type
                acquired = True
                break
        if not acquired:
            print(f'  [{thread_name}] BTS-{bug.id} 사용 가능한 워커 없음 (all full)')
            return False, worker_type

    try:
        # 3. Claim
        with processing_lock:
            processing_bugs.add(bug.id)

        if not claim_bug(bug.id, worker_type.value):
            print(f'  [{thread_name}] BTS-{bug.id} claim 실패')
            release_worker(worker_type)  # BTS-3403: claim 실패 시 워커 슬롯 반환
            return False, worker_type

        # 4. 실행
        success, output = execute_with_worker(bug, worker_type)

        # 5. 결과 처리
        if success:
            # 출력에서 성공 여부 확인
            if 'resolved' in output.lower() or 'complete' in output.lower():
                resolve_bug(bug.id, f"[{worker_type.value}] {output[:500]}")
                print(f'  [{thread_name}] BTS-{bug.id} RESOLVED by {worker_type.value}')
                return True, worker_type
            else:
                # 명시적 성공 표시 없으면 resolved 처리
                resolve_bug(bug.id, f"[{worker_type.value}] Completed")
                print(f'  [{thread_name}] BTS-{bug.id} RESOLVED by {worker_type.value}')
                return True, worker_type
        else:
            release_bug(bug.id, f"[{worker_type.value}] {output[:300]}")
            print(f'  [{thread_name}] (X) BTS-{bug.id} FAILED: {output[:50]}')
            return False, worker_type

    finally:
        release_worker(worker_type)
        with processing_lock:
            processing_bugs.discard(bug.id)


def worker_thread(bug: Bug) -> Tuple[int, bool, str]:
    """워커 스레드"""
    try:
        success, worker_type = process_bug(bug)
        return bug.id, success, worker_type.value
    except Exception as e:
        print(f'  (X) [ERROR] BTS-{bug.id}: {e}')
        with processing_lock:
            processing_bugs.discard(bug.id)
        release_bug(bug.id, str(e))
        return bug.id, False, 'error'


# ============================================================
# 메인 루프
# ============================================================

def main_loop():
    print('')
    print('=' * 64)
    print('       Spawning Pool v2.4 - Intelligent Routing + Hang Detection')
    print('       [!] Version 2.4-20251206 (BTS-3411 + BTS-14819)')
    print('=' * 64)
    print(f'  Workers: Claude x{WORKER_CONFIG["claude"]["count"]}, '
          f'Gemini x{WORKER_CONFIG["gemini"]["count"]}, '
          f'Codex x{WORKER_CONFIG["codex"]["count"]} = {MAX_WORKERS}')
    print(f'  Workspace: {WORKSPACE_DIR}')
    print(f'  PID: {os.getpid()}')
    print(f'  Hang Detection: {HANG_CHECK_INTERVAL}s interval, {HANG_TIMEOUT}s hang timeout, {HANG_TIMEOUT_WARNING}s warning')
    print('')
    print('-' * 64)
    print('  Dispatcher: Claude (keyword + AI routing)')
    print('  Hang Monitor: Active (30s interval, 5min hang timeout)')
    print('  Ctrl+C to stop')
    print('-' * 64)
    print('')

    # BTS-3411 + BTS-14819: 행/좀비 모니터 스레드 시작
    zombie_thread = threading.Thread(target=zombie_monitor_thread, daemon=True, name='HangMonitor')
    zombie_thread.start()

    executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix='Worker')
    futures = {}

    try:
        while True:
            # 완료된 작업 처리
            done_futures = [f for f in futures if f.done()]
            for future in done_futures:
                bug_id = futures.pop(future)
                try:
                    _, success, worker_type = future.result()
                    with stats_lock:
                        stats['processed'] += 1
                        if success:
                            stats['success'] += 1
                        else:
                            stats['failed'] += 1
                        if worker_type in stats['by_worker']:
                            stats['by_worker'][worker_type] += 1
                except Exception as e:
                    print(f'  [ERROR] Future: {e}')
                    with stats_lock:
                        stats['processed'] += 1
                        stats['failed'] += 1

            # 새 작업 할당
            total_active = len(futures)
            if total_active < MAX_WORKERS:
                bugs = get_open_bugs(limit=MAX_WORKERS - total_active)

                for bug in bugs:
                    if bug.id not in [futures[f] for f in futures]:
                        future = executor.submit(worker_thread, bug)
                        futures[future] = bug.id
                        print(f'  [SPAWN] BTS-{bug.id} (active: {len(futures)}/{MAX_WORKERS})')

            # 상태 출력 (BTS-3473: API rate limit 시 (X) 표시)
            time_str = datetime.now().strftime("%H:%M:%S")
            with stats_lock:
                with worker_counts_lock:
                    with rate_limited_lock:
                        def format_worker_status(k):
                            current = worker_counts[k]
                            limit = WORKER_CONFIG[k]['count']
                            # API rate limit 상태면 (X) 표시
                            if rate_limited.get(k, False):
                                return f'{k.upper()}: (X)/{limit}'
                            return f'{k.upper()}: {current}/{limit}'
                        worker_status = ' | '.join([format_worker_status(k) for k in WORKER_CONFIG.keys()])
                # BTS-14817: 활성 워커 정보 추가
                active_info = get_active_workers_info()
                # BTS-14819: 좀비 통계 추가
                with zombie_stats_lock:
                    zombie_info = f'Z:{zombie_stats["detected"]}/{zombie_stats["cleaned"]}'
                print(f'  [{time_str}] {worker_status} | '
                      f'P:{stats["processed"]} S:{stats["success"]} F:{stats["failed"]} {zombie_info} | '
                      f'Active: {active_info}')

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print('\n  Shutting down...')
        # BTS-14819: 좀비 모니터 중단
        zombie_monitor_stop.set()
        zombie_thread.join(timeout=5)
        executor.shutdown(wait=False)
    finally:
        print(f'\n  Final stats: {stats}')
        with zombie_stats_lock:
            print(f'  Zombie stats: {zombie_stats}')


if __name__ == '__main__':
    main_loop()
