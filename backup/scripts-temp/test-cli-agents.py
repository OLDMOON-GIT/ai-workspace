#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI CLI 에이전트 테스트 스크립트
Claude, Codex, Gemini CLI를 호출하고 결과값을 받아옴
"""

import subprocess
import json
import time
import sys
import io
from datetime import datetime

# Windows 콘솔 인코딩 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def test_claude_cli():
    """Claude CLI 테스트"""
    print("\n" + "="*60)
    print("[Claude CLI 테스트]")
    print("="*60)

    prompt = "1+1은 얼마야? 숫자만 답해줘"
    cmd = ["claude", "--dangerously-skip-permissions", "-p", prompt]

    try:
        start = time.time()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            shell=True,
            encoding='utf-8',
            errors='replace'
        )
        elapsed = time.time() - start

        print(f"[TIME] {elapsed:.2f}sec")
        print(f"[EXIT] {result.returncode}")
        print(f"[STDOUT]\n{result.stdout[:500] if result.stdout else '(empty)'}")
        if result.stderr:
            print(f"[STDERR]\n{result.stderr[:200]}")

        return {
            "cli": "claude",
            "success": result.returncode == 0,
            "elapsed": elapsed,
            "output": result.stdout,
            "error": result.stderr
        }
    except subprocess.TimeoutExpired:
        print("[ERROR] Timeout (60s)")
        return {"cli": "claude", "success": False, "error": "timeout"}
    except Exception as e:
        print(f"[ERROR] {e}")
        return {"cli": "claude", "success": False, "error": str(e)}


def test_codex_cli():
    """Codex CLI 테스트 - exec 모드 사용"""
    print("\n" + "="*60)
    print("[Codex CLI 테스트]")
    print("="*60)

    prompt = "1+1은 얼마야? 숫자만 답해줘"
    # exec 모드: non-interactive 실행
    cmd = ["codex", "exec", "--dangerously-bypass-approvals-and-sandbox", prompt]

    try:
        start = time.time()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            shell=True,
            encoding='utf-8',
            errors='replace'
        )
        elapsed = time.time() - start

        print(f"[TIME] {elapsed:.2f}sec")
        print(f"[EXIT] {result.returncode}")
        print(f"[STDOUT]\n{result.stdout[:500] if result.stdout else '(empty)'}")
        if result.stderr:
            print(f"[STDERR]\n{result.stderr[:200]}")

        return {
            "cli": "codex",
            "success": result.returncode == 0,
            "elapsed": elapsed,
            "output": result.stdout,
            "error": result.stderr
        }
    except subprocess.TimeoutExpired:
        print("[ERROR] Timeout (120s)")
        return {"cli": "codex", "success": False, "error": "timeout"}
    except Exception as e:
        print(f"[ERROR] {e}")
        return {"cli": "codex", "success": False, "error": str(e)}


def test_gemini_cli():
    """Gemini CLI 테스트"""
    print("\n" + "="*60)
    print("[Gemini CLI 테스트]")
    print("="*60)

    prompt = "1+1은 얼마야? 숫자만 답해줘"
    cmd = ["gemini", "--yolo", prompt]

    try:
        start = time.time()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            shell=True,
            encoding='utf-8',
            errors='replace'
        )
        elapsed = time.time() - start

        print(f"[TIME] {elapsed:.2f}sec")
        print(f"[EXIT] {result.returncode}")
        print(f"[STDOUT]\n{result.stdout[:500] if result.stdout else '(empty)'}")
        if result.stderr:
            print(f"[STDERR]\n{result.stderr[:200]}")

        return {
            "cli": "gemini",
            "success": result.returncode == 0,
            "elapsed": elapsed,
            "output": result.stdout,
            "error": result.stderr
        }
    except subprocess.TimeoutExpired:
        print("[ERROR] Timeout (60s)")
        return {"cli": "gemini", "success": False, "error": "timeout"}
    except Exception as e:
        print(f"[ERROR] {e}")
        return {"cli": "gemini", "success": False, "error": str(e)}


def main():
    print("\n" + "#"*60)
    print("# AI CLI Agent Test")
    print(f"# Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("#"*60)

    results = []

    # Claude 테스트
    results.append(test_claude_cli())

    # Codex 테스트
    results.append(test_codex_cli())

    # Gemini 테스트
    results.append(test_gemini_cli())

    # 결과 요약
    print("\n" + "="*60)
    print("[TEST RESULTS SUMMARY]")
    print("="*60)

    for r in results:
        status = "OK" if r.get("success") else "FAIL"
        elapsed = f"{r.get('elapsed', 0):.2f}s" if r.get("elapsed") else "N/A"
        print(f"  {r['cli']:10} : {status} ({elapsed})")

    # JSON 결과 저장
    output_file = "test-cli-results.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n[SAVED] {output_file}")

    return results


if __name__ == "__main__":
    main()
