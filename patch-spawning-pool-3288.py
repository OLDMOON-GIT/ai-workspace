#!/usr/bin/env python3
"""
BTS-3288: Claude CLI 절대경로 사용하도록 spawning-pool.py 패치
문제: 새 셸에서 PATH에 claude.exe가 없어서 '명령어를 찾을 수 없음' 에러 발생
해결: claude -> 절대경로(CLAUDE_CLI_PATH)로 변경
"""
import re

FILE_PATH = r'C:\Users\oldmoon\workspace\mcp-debugger\spawning-pool.py'

# 파일 읽기
with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

modified = False

# 1. CLAUDE_CLI_PATH 상수 추가 (이미 없는 경우만)
if 'CLAUDE_CLI_PATH' not in content:
    old_block = "LOGS_DIR = os.path.join(WORKSPACE_DIR, 'mcp-debugger', 'logs')\nDISPATCHER_PROMPT_FILE"
    new_block = "LOGS_DIR = os.path.join(WORKSPACE_DIR, 'mcp-debugger', 'logs')\n# BTS-3288: Claude CLI 절대경로 (새 셸에서 PATH 문제 방지)\nCLAUDE_CLI_PATH = r'C:\\Users\\USER\\.local\\bin\\claude.exe'\nDISPATCHER_PROMPT_FILE"
    if old_block in content:
        content = content.replace(old_block, new_block)
        print('[1] CLAUDE_CLI_PATH 상수 추가됨')
        modified = True
    else:
        print('[1] old_block을 찾을 수 없음')

# 2. wrapper_cmd 내 claude 호출 부분 수정 (SHOW_CLI_WINDOW 모드)
# 기존: '| claude --dangerously-skip-permissions -p >'
# 변경: '| "{CLAUDE_CLI_PATH}" --dangerously-skip-permissions -p >'
old_wrapper = '''wrapper_cmd = f'chcp 65001 >nul && type "{prompt_file}" | claude --dangerously-skip-permissions -p > "{output_file}" 2>&1\''''
new_wrapper = '''wrapper_cmd = f'chcp 65001 >nul && type "{prompt_file}" | "{CLAUDE_CLI_PATH}" --dangerously-skip-permissions -p > "{output_file}" 2>&1\''''
if old_wrapper in content:
    content = content.replace(old_wrapper, new_wrapper)
    print('[2] wrapper_cmd 내 claude 경로 수정됨')
    modified = True
else:
    print('[2] wrapper_cmd 패턴을 찾을 수 없음 (이미 수정됨?)')

# 3. cmd 내 claude 호출 부분 수정 (숨김 모드)
# 기존: '| claude --dangerously-skip-permissions -p'
# 변경: '| "{CLAUDE_CLI_PATH}" --dangerously-skip-permissions -p'
old_cmd = '''cmd = f'chcp 65001 >nul && type "{prompt_file}" | claude --dangerously-skip-permissions -p\''''
new_cmd = '''cmd = f'chcp 65001 >nul && type "{prompt_file}" | "{CLAUDE_CLI_PATH}" --dangerously-skip-permissions -p\''''
if old_cmd in content:
    content = content.replace(old_cmd, new_cmd)
    print('[3] cmd 내 claude 경로 수정됨')
    modified = True
else:
    print('[3] cmd 패턴을 찾을 수 없음 (이미 수정됨?)')

# 파일 쓰기
if modified:
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print('\n✅ spawning-pool.py 패치 완료!')
else:
    print('\n⚠️ 변경 사항 없음 (이미 패치됨?)')
