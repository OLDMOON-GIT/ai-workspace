#!/usr/bin/env python3
"""
BTS-2975: Chrome lockfile 충돌 문제 패치
잠금 파일 제거 실패 시 Chrome 프로세스 강제 종료 후 재시도
"""

import os
import re

files_to_patch = [
    'trend-video-backend/src/ai_aggregator/main.py',
    'trend-video-backend/src/ai_aggregator/setup_login.py',
    'trend-video-backend/src/ai_aggregator/open_claude_auto.py',
    'trend-video-backend/src/ai_aggregator/refine_and_send.py',
]

# 기존 코드 패턴
old_pattern = r'''        for lock_file in lock_files:
            try:
                if os\.path\.exists\(lock_file\):
                    os\.remove\(lock_file\)
                    print\(f"\{Fore\.GREEN\}\[INFO\] 잠금 파일 제거: \{os\.path\.basename\(lock_file\)\}\{Style\.RESET_ALL\}"\)
            except Exception as e:
                print\(f"\{Fore\.YELLOW\}\[WARN\] 잠금 파일 제거 실패: \{lock_file\} - \{e\}\{Style\.RESET_ALL\}"\)'''

# 새 코드
new_code = '''        # BTS-2975: 잠금 파일 제거 실패 시 Chrome 프로세스 강제 종료 후 재시도
        lock_remove_failed = False
        for lock_file in lock_files:
            try:
                if os.path.exists(lock_file):
                    os.remove(lock_file)
                    print(f"{Fore.GREEN}[INFO] 잠금 파일 제거: {os.path.basename(lock_file)}{Style.RESET_ALL}")
            except Exception as e:
                print(f"{Fore.YELLOW}[WARN] 잠금 파일 제거 실패: {lock_file} - {e}{Style.RESET_ALL}")
                lock_remove_failed = True

        if lock_remove_failed:
            print(f"{Fore.YELLOW}[INFO] Chrome 프로필 잠금 해제를 위해 관련 프로세스 종료 시도...{Style.RESET_ALL}")
            try:
                import subprocess
                subprocess.run(
                    ['powershell', '-Command',
                     "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like '*chrome-automation-profile*'} | Stop-Process -Force -ErrorAction SilentlyContinue"],
                    capture_output=True, timeout=10
                )
                import time
                time.sleep(2)
                for lock_file in lock_files:
                    try:
                        if os.path.exists(lock_file):
                            os.remove(lock_file)
                            print(f"{Fore.GREEN}[INFO] 잠금 파일 제거 (재시도 성공): {os.path.basename(lock_file)}{Style.RESET_ALL}")
                    except:
                        print(f"{Fore.RED}[ERROR] 잠금 파일 제거 재시도 실패: {lock_file}{Style.RESET_ALL}")
            except Exception as kill_error:
                print(f"{Fore.YELLOW}[WARN] 프로세스 종료 시도 실패: {kill_error}{Style.RESET_ALL}")'''

for file_path in files_to_patch:
    full_path = os.path.join(os.path.dirname(__file__), file_path)
    if not os.path.exists(full_path):
        print(f"[SKIP] {file_path} - 파일 없음")
        continue

    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'BTS-2975' in content:
        print(f"[SKIP] {file_path} - 이미 패치됨")
        continue

    # 간단한 문자열 치환으로 패치
    old_str = '''        for lock_file in lock_files:
            try:
                if os.path.exists(lock_file):
                    os.remove(lock_file)
                    print(f"{Fore.GREEN}[INFO] 잠금 파일 제거: {os.path.basename(lock_file)}{Style.RESET_ALL}")
            except Exception as e:
                print(f"{Fore.YELLOW}[WARN] 잠금 파일 제거 실패: {lock_file} - {e}{Style.RESET_ALL}")'''

    if old_str in content:
        content = content.replace(old_str, new_code)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[OK] {file_path} - 패치 완료")
    else:
        print(f"[WARN] {file_path} - 패턴 매칭 실패, 수동 확인 필요")

print("\n패치 완료!")
