#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ImageFX + Whisk 이미지 크롤링 통합 테스트

테스트 항목:
1. story.json 파싱
2. ImageFX 첫 이미지 생성
3. Whisk 피사체 업로드
4. Whisk 프롬프트 입력
5. 이미지 다운로드
6. 파일 저장 확인
"""

import os
import sys
import json
import subprocess
import time
from pathlib import Path

# 색상 출력
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(message):
    print(f"{Colors.BLUE}[TEST]{Colors.END} {message}")

def print_pass(message):
    print(f"{Colors.GREEN}[PASS]{Colors.END} {message}")

def print_fail(message):
    print(f"{Colors.RED}[FAIL]{Colors.END} {message}")

def print_warn(message):
    print(f"{Colors.YELLOW}[WARN]{Colors.END} {message}")

def run_integration_test(story_json_path):
    """통합 테스트 실행"""
    print("="*80)
    print("[TEST] ImageFX + Whisk Integration Test")
    print("="*80)
    print()

    # 1. story.json 파일 존재 확인
    print_test("1. story.json 파일 존재 확인")
    if not os.path.exists(story_json_path):
        print_fail(f"파일을 찾을 수 없습니다: {story_json_path}")
        return False
    print_pass(f"파일 존재: {story_json_path}")

    # 2. JSON 파싱 확인
    print_test("2. JSON 파싱 확인")
    try:
        with open(story_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if isinstance(data, list):
            scenes = data
        elif isinstance(data, dict) and 'scenes' in data:
            scenes = data['scenes']
        else:
            print_fail("scenes 배열을 찾을 수 없습니다")
            return False

        print_pass(f"씬 개수: {len(scenes)}")

        # 첫 씬 프롬프트 확인
        first_scene = scenes[0]
        first_prompt = first_scene.get('image_prompt') or first_scene.get('sora_prompt')
        if not first_prompt:
            print_fail("첫 씬에 프롬프트가 없습니다")
            return False
        print_pass(f"첫 씬 프롬프트 길이: {len(first_prompt)}자")
    except Exception as e:
        print_fail(f"JSON 파싱 실패: {e}")
        return False

    # 3. images 폴더 초기화
    print_test("3. images 폴더 초기화")
    json_dir = os.path.dirname(os.path.abspath(story_json_path))
    images_dir = os.path.join(json_dir, 'images')

    # 기존 이미지 삭제
    if os.path.exists(images_dir):
        for file in os.listdir(images_dir):
            if file.endswith(('.png', '.jpg', '.jpeg')):
                os.remove(os.path.join(images_dir, file))
                print(f"   삭제: {file}")
    else:
        os.makedirs(images_dir)

    print_pass(f"images 폴더 준비 완료: {images_dir}")

    # 4. image_crawler.py 실행
    print_test("4. image_crawler.py 실행 (--use-imagefx)")
    script_path = os.path.join(
        os.path.dirname(__file__),
        "trend-video-backend",
        "src",
        "image_crawler",
        "image_crawler.py"
    )

    if not os.path.exists(script_path):
        print_fail(f"스크립트를 찾을 수 없습니다: {script_path}")
        return False

    try:
        # UTF-8 환경 설정 (Windows에서 이모지 처리)
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        env['PYTHONUTF8'] = '1'  # Python 3.7+ UTF-8 mode

        # Windows에서 stdout/stderr을 파일로 리다이렉트하여 인코딩 문제 해결
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.log') as stdout_file, \
             tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.log') as stderr_file:

            stdout_path = stdout_file.name
            stderr_path = stderr_file.name

        result = subprocess.run(
            ["python", script_path, "--use-imagefx", story_json_path],
            stdout=open(stdout_path, 'w', encoding='utf-8', errors='replace'),
            stderr=open(stderr_path, 'w', encoding='utf-8', errors='replace'),
            timeout=300,  # 5분 타임아웃
            env=env
        )

        # 로그 파일 읽기
        with open(stdout_path, 'r', encoding='utf-8', errors='replace') as f:
            stdout_content = f.read()
        with open(stderr_path, 'r', encoding='utf-8', errors='replace') as f:
            stderr_content = f.read()

        print("--- 실행 로그 ---")
        print(stdout_content)
        if stderr_content:
            print("--- 에러 로그 ---")
            print(stderr_content)

        # 임시 파일 삭제
        try:
            os.unlink(stdout_path)
            os.unlink(stderr_path)
        except:
            pass

        if result.returncode != 0:
            print_fail(f"스크립트 실행 실패 (exit code: {result.returncode})")
            return False

        print_pass("스크립트 실행 성공")
    except subprocess.TimeoutExpired:
        print_fail("스크립트 실행 타임아웃 (5분)")
        return False
    except Exception as e:
        print_fail(f"스크립트 실행 오류: {e}")
        return False

    # 5. 다운로드된 이미지 확인
    print_test("5. 다운로드된 이미지 확인")
    downloaded_images = []
    if os.path.exists(images_dir):
        downloaded_images = [
            f for f in os.listdir(images_dir)
            if f.endswith(('.png', '.jpg', '.jpeg'))
        ]

    if not downloaded_images:
        print_fail("다운로드된 이미지가 없습니다")
        return False

    print_pass(f"다운로드된 이미지: {len(downloaded_images)}개")
    for img in downloaded_images:
        file_path = os.path.join(images_dir, img)
        file_size = os.path.getsize(file_path)
        print(f"   - {img}: {file_size:,} bytes")

    # 6. 이미지 파일 유효성 확인
    print_test("6. 이미지 파일 유효성 확인")
    valid_count = 0
    for img in downloaded_images:
        file_path = os.path.join(images_dir, img)
        file_size = os.path.getsize(file_path)
        if file_size > 1000:  # 최소 1KB
            valid_count += 1

    if valid_count == len(downloaded_images):
        print_pass(f"모든 이미지 유효 ({valid_count}/{len(downloaded_images)})")
    else:
        print_warn(f"일부 이미지 크기 부족 ({valid_count}/{len(downloaded_images)})")

    # 7. 씬 개수와 이미지 개수 비교
    print_test("7. 씬 개수와 이미지 개수 비교")
    expected_count = len(scenes)
    actual_count = len(downloaded_images)

    if actual_count == expected_count:
        print_pass(f"이미지 개수 일치: {actual_count}/{expected_count}")
    elif actual_count > 0:
        print_warn(f"이미지 개수 불일치: {actual_count}/{expected_count}")
    else:
        print_fail(f"이미지가 다운로드되지 않음: 0/{expected_count}")
        return False

    return True

if __name__ == "__main__":
    # 기본 테스트 대본 경로
    if len(sys.argv) > 1:
        test_json_path = sys.argv[1]
    else:
        test_json_path = os.path.join(
            os.path.dirname(__file__),
            "trend-video-backend",
            "input",
            "project_66ac6079-1896-40a9-a805-74f0242572db",
            "story.json"
        )

    print(f"테스트 대본: {test_json_path}\n")

    success = run_integration_test(test_json_path)

    print()
    print("="*80)
    if success:
        print(f"{Colors.GREEN}[PASS] Integration Test Passed{Colors.END}")
        sys.exit(0)
    else:
        print(f"{Colors.RED}[FAIL] Integration Test Failed{Colors.END}")
        sys.exit(1)
