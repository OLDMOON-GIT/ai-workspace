#!/usr/bin/env python3
"""
Spawning Pool v2 - 지능형 라우팅 시스템

구조:
1. Dispatcher (Claude): 작업 분류 및 라우팅 결정
2. Worker Pool: Claude 6개, Gemini 2개, Codex 2개
3. 작업 유형별 할당:
   - Claude: 롱폼, 긴 프롬프트, 복잡한 버그
   - Gemini: 숏폼, 상품 관련
   - Codex: 플래닝, 코드 리뷰, 아키텍처

BTS-3080: AI 에이전트별 특성에 맞는 작업 라우팅
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
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum

# ============================================================
# 설정
# ============================================================

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'trend2024'),
    'database': os.environ.get('DB_NAME', 'trend_video')
}

# Worker 설정 - Claude 6, Gemini 2, Codex 2 = 총 10개
WORKER_CONFIG = {
    'claude': {'count': 6, 'timeout': 600},
    'gemini': {'count': 2, 'timeout': 300},
    'codex': {'count': 2, 'timeout': 300}
}

MAX_WORKERS = sum(cfg['count'] for cfg in WORKER_CONFIG.values())  # 10
POLL_INTERVAL = 5
DISPATCHER_TIMEOUT = 30  # Dispatcher 판단 타임아웃

WORKSPACE_DIR = r'C:\Users\oldmoon\workspace'
LOGS_DIR = os.path.join(WORKSPACE_DIR, 'mcp-debugger', 'logs')
DISPATCHER_PROMPT_FILE = os.path.join(WORKSPACE_DIR, 'trend-video-frontend', 'prompts', 'prompt_dispatcher.txt')

# 워커 타입별 현재 활성 수 추적
worker_counts: Dict[str, int] = {k: 0 for k in WORKER_CONFIG.keys()}
worker_counts_lock = threading.Lock()

# 처리 중인 버그 ID
processing_bugs: Set[int] = set()
processing_lock = threading.Lock()

# 통계
stats = {'processed': 0, 'success': 0, 'failed': 0, 'by_worker': {k: 0 for k in WORKER_CONFIG.keys()}}
stats_lock = threading.Lock()

# BTS-3188: 워커 타입별 usage limit 비활성화 시간 추적
# 형식: {'codex': datetime_until_available, ...}
worker_disabled_until: Dict[str, Optional[datetime]] = {k: None for k in WORKER_CONFIG.keys()}
worker_disabled_lock = threading.Lock()


# ============================================================
# 로그 기록 함수 (BTS-3109)
# ============================================================

def get_log_path(bug_id: int) -> str:
    """버그별 로그 파일 경로 반환"""
    os.makedirs(LOGS_DIR, exist_ok=True)
    return os.path.join(LOGS_DIR, f'worker-{bug_id}.log')


def write_log(bug_id: int, message: str, level: str = 'INFO'):
    """로그 파일에 기록"""
    log_path = get_log_path(bug_id)
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_line = f'[{timestamp}] [{level}] {message}\n'
    try:
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(log_line)
    except Exception as e:
        print(f'  [LOG ERROR] {e}')


def log_section(bug_id: int, title: str, content: str):
    """섹션 구분자와 함께 내용 기록 (전체 내용 출력 - 잘림 없음)"""
    log_path = get_log_path(bug_id)
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(f'\n{"="*70}\n')
            f.write(f'[{timestamp}] {title}\n')
            f.write(f'{"="*70}\n')
            f.write(content)  # 전체 내용 출력 (잘림 없음)
            f.write(f'\n{"="*70}\n\n')
    except Exception as e:
        print(f'  [LOG ERROR] {e}')


def extract_file_changes(output: str) -> List[str]:
    """출력에서 파일 변경 내역 추출"""
    changes = []
    patterns = [
        # Claude Code 도구 패턴
        (r'(Edit|Write|Read|Create|Delete|Bash|Glob|Grep)\s+([^\n]+)', 'Tool'),
        # 파일 경로 패턴
        (r'(?:saved|created|updated|modified|deleted|edited|wrote).*?([A-Za-z]:[\\/][\w\\/.\-]+|[\\/][\w\\/.\-]+\.\w+)', 'File'),
        # Git diff 패턴
        (r'^\+\+\+ b/(.+)$', 'Modified'),
    ]

    for pattern, prefix in patterns:
        matches = re.findall(pattern, output, re.MULTILINE | re.IGNORECASE)
        for match in matches:
            if isinstance(match, tuple):
                changes.append(f'[{prefix}] {" ".join(match)}')
            else:
                changes.append(f'[{prefix}] {match}')

    return list(dict.fromkeys(changes))  # 순서 유지하면서 중복 제거


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
# BTS-3188: Usage Limit 감지 및 워커 비활성화
# ============================================================

def parse_usage_limit_time(output: str) -> Optional[datetime]:
    """
    출력에서 usage limit 만료 시간 파싱
    예시: "try again at Dec 10th 7:29 AM" -> datetime 객체 반환
    """
    # 패턴들: "try again at ...", "rate limit...", "usage limit..."
    patterns = [
        # "Dec 10th 7:29 AM" 형식
        r'try again (?:at\s+)?([A-Z][a-z]{2})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2}):(\d{2})\s*(AM|PM)',
        # "2024-12-10 07:29" 형식
        r'try again (?:at\s+)?(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})',
        # "in X hours" 형식
        r'try again in\s+(\d+)\s*hours?',
        # "in X minutes" 형식
        r'try again in\s+(\d+)\s*minutes?',
    ]

    import calendar

    for i, pattern in enumerate(patterns):
        match = re.search(pattern, output, re.IGNORECASE)
        if match:
            try:
                if i == 0:
                    # "Dec 10th 7:29 AM" 형식
                    month_str, day, hour, minute, ampm = match.groups()
                    month_abbr = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                                  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12}
                    month = month_abbr.get(month_str.lower(), 1)
                    hour = int(hour)
                    if ampm.upper() == 'PM' and hour != 12:
                        hour += 12
                    elif ampm.upper() == 'AM' and hour == 12:
                        hour = 0
                    year = datetime.now().year
                    return datetime(year, month, int(day), hour, int(minute))
                elif i == 1:
                    # "2024-12-10 07:29" 형식
                    date_str, time_str = match.groups()
                    return datetime.strptime(f'{date_str} {time_str}', '%Y-%m-%d %H:%M')
                elif i == 2:
                    # "in X hours" 형식
                    hours = int(match.group(1))
                    return datetime.now() + timedelta(hours=hours)
                elif i == 3:
                    # "in X minutes" 형식
                    minutes = int(match.group(1))
                    return datetime.now() + timedelta(minutes=minutes)
            except Exception as e:
                print(f'  [USAGE-LIMIT] 시간 파싱 실패: {e}')
                continue

    return None


def detect_usage_limit(output: str) -> bool:
    """출력에서 usage limit 에러 감지"""
    limit_patterns = [
        r'usage\s*limit',
        r'rate\s*limit',
        r'try\s*again\s*(at|in)',
        r'quota\s*exceeded',
        r'too\s*many\s*requests',
    ]

    for pattern in limit_patterns:
        if re.search(pattern, output, re.IGNORECASE):
            return True
    return False


def disable_worker_type(worker_type: str, until: Optional[datetime] = None):
    """
    워커 타입을 지정된 시간까지 비활성화
    until이 None이면 1시간 후로 설정
    """
    with worker_disabled_lock:
        if until is None:
            until = datetime.now() + timedelta(hours=1)
        worker_disabled_until[worker_type] = until
        print(f'  [USAGE-LIMIT] {worker_type.upper()} 비활성화 -> {until.strftime("%Y-%m-%d %H:%M")}')


def is_worker_disabled(worker_type: str) -> bool:
    """워커 타입이 비활성화 상태인지 확인"""
    with worker_disabled_lock:
        until = worker_disabled_until.get(worker_type)
        if until is None:
            return False
        if datetime.now() >= until:
            # 제한 시간 지남 -> 다시 활성화
            worker_disabled_until[worker_type] = None
            print(f'  [USAGE-LIMIT] {worker_type.upper()} 다시 활성화됨')
            return False
        return True


def get_alternative_worker(original_type: WorkerType) -> Optional[WorkerType]:
    """
    비활성화된 워커 대신 사용할 대체 워커 반환
    우선순위: Claude > Gemini > Codex (원래 타입 제외)
    """
    priority_order = [WorkerType.CLAUDE, WorkerType.GEMINI, WorkerType.CODEX]

    for wt in priority_order:
        if wt != original_type and not is_worker_disabled(wt.value):
            with worker_counts_lock:
                if worker_counts[wt.value] < WORKER_CONFIG[wt.value]['count']:
                    return wt
    return None


# ============================================================
# CLI 호출 함수
# ============================================================

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


def get_available_worker_type() -> Optional[WorkerType]:
    """사용 가능한 워커 타입 반환 (우선순위: Claude > Gemini > Codex)
       BTS-3188: 비활성화된 워커 타입은 건너뜀"""
    with worker_counts_lock:
        for worker_type, config in WORKER_CONFIG.items():
            # BTS-3188: 비활성화된 워커는 건너뜀
            if is_worker_disabled(worker_type):
                continue
            if worker_counts[worker_type] < config['count']:
                return WorkerType(worker_type)
    return None


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


def recover_stuck_bugs() -> int:
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
            conn.close()


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


def mark_bug_failed(bug_id: int, error_message: str) -> bool:
    """BTS-3110: 버그를 failed 상태로 처리하고 에러 상세 저장"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # resolution_note에 에러 상세 저장 (1500자까지)
        cursor.execute("""
            UPDATE bugs SET status = 'failed', worker_pid = NULL,
                   assigned_to = NULL, resolution_note = %s, updated_at = NOW()
            WHERE id = %s
        """, (error_message[:1500], bug_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        if conn:
            conn.close()


def release_bug(bug_id: int, error_message: Optional[str] = None) -> bool:
    """버그 open으로 롤백 (deprecated - use mark_bug_failed for failures)"""
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
    """지정된 워커로 작업 실행 (상세 로그 포함 - BTS-3109)"""
    prompt = build_work_prompt(bug)
    timeout = WORKER_CONFIG[worker_type.value]['timeout']
    start_time = time.time()

    # 작업 시작 로그
    write_log(bug.id, f'작업 시작 - {worker_type.value.upper()}')
    write_log(bug.id, f'BTS-{bug.id}: {bug.title}')
    write_log(bug.id, f'Type: {bug.type} | Priority: {bug.priority}')
    log_section(bug.id, 'BUG SUMMARY', bug.summary or '(요약 없음)')
    log_section(bug.id, 'PROMPT', prompt)
    write_log(bug.id, f'{worker_type.value.upper()} CLI 호출 시작 (timeout: {timeout}s)')

    # CLI 실행
    if worker_type == WorkerType.CLAUDE:
        success, output = call_claude_cli(prompt, timeout)
    elif worker_type == WorkerType.GEMINI:
        success, output = call_gemini_cli(prompt, timeout)
    elif worker_type == WorkerType.CODEX:
        success, output = call_codex_cli(prompt, timeout)
    else:
        return False, "Unknown worker type"

    # 실행 시간 계산
    elapsed = time.time() - start_time

    # 상세 결과 로그
    status = 'SUCCESS' if success else 'FAILED'
    write_log(bug.id, f'CLI 완료: {status}, elapsed={elapsed:.1f}s, output_len={len(output)} chars')

    # 응답 전체 기록 (잘림 없음)
    if output:
        log_section(bug.id, f'{worker_type.value.upper()} RESPONSE (FULL)', output)

    # 파일 변경 내역 추출
    file_changes = extract_file_changes(output)
    if file_changes:
        log_section(bug.id, 'FILE CHANGES DETECTED', '\n'.join(file_changes))

    # 작업 종료 로그
    write_log(bug.id, f'작업 완료: {status} (총 {elapsed:.1f}s)')

    return success, output


def process_bug(bug: Bug) -> Tuple[bool, WorkerType]:
    """버그 처리 - Dispatcher로 라우팅 후 실행
       BTS-3188: Usage limit 감지 시 워커 비활성화 및 재할당"""
    thread_name = threading.current_thread().name

    # 1. Dispatcher로 워커 결정
    print(f'  [{thread_name}] BTS-{bug.id} 라우팅 중...')
    decision = dispatch_task(bug)
    worker_type = decision.worker_type

    # BTS-3188: 결정된 워커가 비활성화 상태면 대체 워커 찾기
    if is_worker_disabled(worker_type.value):
        print(f'  [{thread_name}] {worker_type.value.upper()} usage limit - 대체 워커 탐색')
        alt_worker = get_alternative_worker(worker_type)
        if alt_worker:
            worker_type = alt_worker
            print(f'  [{thread_name}] BTS-{bug.id} -> {worker_type.value.upper()} (대체)')
        else:
            print(f'  [{thread_name}] BTS-{bug.id} 사용 가능한 대체 워커 없음')
            return False, worker_type

    # 2. 해당 워커 슬롯 확인 및 대체
    if not acquire_worker(worker_type):
        # 지정된 워커 슬롯 없으면 다른 워커 시도
        alt_worker = get_available_worker_type()
        if alt_worker:
            worker_type = alt_worker
            acquire_worker(worker_type)
        else:
            print(f'  [{thread_name}] BTS-{bug.id} 사용 가능한 워커 없음')
            return False, worker_type

    print(f'  [{thread_name}] BTS-{bug.id} -> {worker_type.value.upper()} ({decision.reason})')

    try:
        # 3. Claim
        with processing_lock:
            processing_bugs.add(bug.id)

        if not claim_bug(bug.id, worker_type.value):
            print(f'  [{thread_name}] BTS-{bug.id} claim 실패')
            return False, worker_type

        # 4. 실행
        success, output = execute_with_worker(bug, worker_type)

        # BTS-3188: Usage limit 감지 시 워커 비활성화 및 재할당
        if detect_usage_limit(output):
            print(f'  [{thread_name}] BTS-{bug.id} {worker_type.value.upper()} USAGE LIMIT 감지!')
            write_log(bug.id, f'USAGE LIMIT 감지 - {worker_type.value.upper()}', 'WARNING')

            # 만료 시간 파싱
            limit_until = parse_usage_limit_time(output)
            disable_worker_type(worker_type.value, limit_until)

            # 버그를 open으로 롤백하여 다른 워커가 처리하도록 함
            release_bug(bug.id, f"Usage limit: {worker_type.value}")
            print(f'  [{thread_name}] BTS-{bug.id} open으로 롤백 (다른 워커에게 재할당)')

            return False, worker_type

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
            # BTS-3110: 실패 시 failed 상태로 처리하고 에러 상세 저장
            mark_bug_failed(bug.id, f"[{worker_type.value}] {output[:1500]}")
            print(f'  [{thread_name}] BTS-{bug.id} FAILED: {output[:100]}')
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
        print(f'  [ERROR] BTS-{bug.id}: {e}')
        with processing_lock:
            processing_bugs.discard(bug.id)
        # BTS-3110: 예외 시에도 failed 상태로 처리
        mark_bug_failed(bug.id, f"[Exception] {str(e)}")
        return bug.id, False, 'error'


# ============================================================
# 메인 루프
# ============================================================

def main_loop():
    print('')
    print('=' * 64)
    print('       Spawning Pool v2 - Intelligent Routing')
    print('=' * 64)
    print(f'  Workers: Claude x{WORKER_CONFIG["claude"]["count"]}, '
          f'Gemini x{WORKER_CONFIG["gemini"]["count"]}, '
          f'Codex x{WORKER_CONFIG["codex"]["count"]} = {MAX_WORKERS}')
    print(f'  Workspace: {WORKSPACE_DIR}')
    print(f'  PID: {os.getpid()}')
    print('')

    # BTS-3135: 시작 시 stuck 버그 복구
    recover_stuck_bugs()

    print('-' * 64)
    print('  Dispatcher: Claude (keyword + AI routing)')
    print('  Ctrl+C to stop')
    print('-' * 64)
    print('')

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

            # 상태 출력 (BTS-3188: 비활성화된 워커 표시)
            time_str = datetime.now().strftime("%H:%M:%S")
            with stats_lock:
                with worker_counts_lock:
                    worker_status_parts = []
                    for k in WORKER_CONFIG.keys():
                        status_str = f'{k.upper()}: {worker_counts[k]}/{WORKER_CONFIG[k]["count"]}'
                        # 비활성화된 워커 표시
                        if is_worker_disabled(k):
                            until = worker_disabled_until.get(k)
                            if until:
                                status_str += f' [LIMIT {until.strftime("%H:%M")}]'
                            else:
                                status_str += ' [LIMIT]'
                        worker_status_parts.append(status_str)
                    worker_status = ' | '.join(worker_status_parts)
                print(f'  [{time_str}] {worker_status} | '
                      f'Processed: {stats["processed"]} | '
                      f'Success: {stats["success"]} | Failed: {stats["failed"]}')

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print('\n  Shutting down...')
        executor.shutdown(wait=False)
    finally:
        print(f'\n  Final stats: {stats}')


if __name__ == '__main__':
    main_loop()
