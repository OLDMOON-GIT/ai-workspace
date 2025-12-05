#!/usr/bin/env python3
"""
slog - Spawning Pool 로그 뷰어
워커별 로그 파일 조회 도구

사용법:
  slog                    # 전체 로그 내용 출력
  slog 3069               # BTS-3069 로그 보기
  slog BTS-3069           # BTS-3069 로그 보기 (같은 결과)
  slog --list             # 로그 파일 목록
  slog --tail 3069        # BTS-3069 로그 실시간 모니터링
  slog --last             # 가장 최근 로그 보기
"""

import os
import sys
import glob
import time
from datetime import datetime

LOGS_DIR = r'C:\Users\oldmoon\workspace\mcp-debugger\logs'


def get_log_files():
    """로그 파일 목록 반환 (최신순)"""
    pattern = os.path.join(LOGS_DIR, 'worker-*.log')
    files = glob.glob(pattern)
    # 수정 시간 기준 정렬 (최신 먼저)
    files.sort(key=os.path.getmtime, reverse=True)
    return files


def extract_bug_id(filename):
    """파일명에서 버그 ID 추출"""
    basename = os.path.basename(filename)
    # worker-3069.log -> 3069
    if basename.startswith('worker-') and basename.endswith('.log'):
        return basename[7:-4]
    return None


def show_log_list(limit=10):
    """로그 파일 목록 출력"""
    files = get_log_files()

    if not files:
        print('로그 파일이 없습니다.')
        print(f'로그 디렉토리: {LOGS_DIR}')
        return

    print(f'\n=== Spawning Pool 로그 ({len(files)}개) ===\n')
    print(f'{"BTS ID":<12} {"수정일시":<20} {"크기":<10}')
    print('-' * 45)

    for f in files[:limit]:
        bug_id = extract_bug_id(f)
        mtime = datetime.fromtimestamp(os.path.getmtime(f)).strftime('%Y-%m-%d %H:%M:%S')
        size = os.path.getsize(f)

        if size < 1024:
            size_str = f'{size} B'
        elif size < 1024 * 1024:
            size_str = f'{size/1024:.1f} KB'
        else:
            size_str = f'{size/1024/1024:.1f} MB'

        print(f'BTS-{bug_id:<8} {mtime:<20} {size_str:<10}')

    if len(files) > limit:
        print(f'\n... 외 {len(files) - limit}개 (slog --all 로 전체 보기)')

    print(f'\n사용법: slog <BTS-ID> 로 로그 내용 보기')


def show_log(bug_id: str):
    """특정 버그의 로그 출력"""
    # BTS- 접두사 제거
    bug_id = bug_id.replace('BTS-', '').replace('bts-', '')

    log_path = os.path.join(LOGS_DIR, f'worker-{bug_id}.log')

    if not os.path.exists(log_path):
        print(f'로그 파일이 없습니다: {log_path}')
        return

    print(f'\n=== BTS-{bug_id} 로그 ===\n')

    with open(log_path, 'r', encoding='utf-8') as f:
        content = f.read()
        print(content)

    print(f'\n=== 로그 끝 ({os.path.getsize(log_path)} bytes) ===')


def tail_log(bug_id: str):
    """로그 실시간 모니터링"""
    bug_id = bug_id.replace('BTS-', '').replace('bts-', '')
    log_path = os.path.join(LOGS_DIR, f'worker-{bug_id}.log')

    if not os.path.exists(log_path):
        print(f'로그 파일이 없습니다: {log_path}')
        print('파일이 생성되면 자동으로 모니터링을 시작합니다...')

    print(f'\n=== BTS-{bug_id} 실시간 로그 (Ctrl+C로 종료) ===\n')

    last_size = 0
    try:
        while True:
            if os.path.exists(log_path):
                current_size = os.path.getsize(log_path)
                if current_size > last_size:
                    with open(log_path, 'r', encoding='utf-8') as f:
                        f.seek(last_size)
                        new_content = f.read()
                        print(new_content, end='')
                    last_size = current_size
            time.sleep(1)
    except KeyboardInterrupt:
        print('\n\n모니터링 종료')


def show_last_log():
    """가장 최근 로그 보기"""
    files = get_log_files()
    if not files:
        print('로그 파일이 없습니다.')
        return

    bug_id = extract_bug_id(files[0])
    show_log(bug_id)


def show_all_logs():
    """모든 로그 파일 내용 출력"""
    files = get_log_files()

    if not files:
        print('로그 파일이 없습니다.')
        print(f'로그 디렉토리: {LOGS_DIR}')
        return

    print(f'\n=== Spawning Pool 전체 로그 ({len(files)}개 파일) ===\n')

    for f in files:
        bug_id = extract_bug_id(f)
        mtime = datetime.fromtimestamp(os.path.getmtime(f)).strftime('%Y-%m-%d %H:%M:%S')
        size = os.path.getsize(f)

        print(f'\n{"="*60}')
        print(f'BTS-{bug_id} ({mtime}, {size} bytes)')
        print(f'{"="*60}\n')

        with open(f, 'r', encoding='utf-8') as fp:
            content = fp.read()
            print(content)

    print(f'\n=== 전체 로그 끝 ({len(files)}개 파일) ===')


def main():
    args = sys.argv[1:]

    if not args:
        show_all_logs()
        return

    arg = args[0]

    if arg == '--list':
        show_log_list()
    elif arg == '--all':
        show_log_list(limit=100)
    elif arg == '--last':
        show_last_log()
    elif arg == '--tail':
        if len(args) > 1:
            tail_log(args[1])
        else:
            print('사용법: slog --tail <BTS-ID>')
    elif arg == '--help' or arg == '-h':
        print(__doc__)
    else:
        # 버그 ID로 로그 보기
        show_log(arg)


if __name__ == '__main__':
    main()
