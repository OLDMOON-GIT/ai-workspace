"""
이미지 크롤링 자동화 스크립트 (리팩토링 버전)
Whisk 또는 ImageFX + Whisk 조합으로 이미지를 생성합니다.
공통 함수 모듈을 활용하여 코드 중복을 최소화했습니다.
"""

import sys
import time
import json
import pyperclip
import io
import os
import glob
import argparse

# Windows 인코딩 문제 해결
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True, write_through=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True, write_through=True)

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

# 공통 함수 import
from whisk_common import (
    select_aspect_ratio,
    detect_policy_violation,
    convert_blob_to_base64,
    download_http_image,
    save_image_from_blob,
    process_whisk_images,
    initialize_whisk,
    handle_policy_violation,
    collect_page_images
)


def sanitize_prompt_for_google(prompt):
    """
    Google 이미지 정책 위반을 방지하기 위해 프롬프트를 안전하게 변환합니다.
    (기존 코드 유지)
    """
    replacements = {
        '피': '빨간 액체',
        '살인': '사고',
        '죽': '쓰러진',
        '시체': '인형',
        '총': '도구',
        '칼': '도구',
        '마약': '약품',
        '폭발': '연기',
        '테러': '사건',
        '자살': '위험한 행동'
    }

    safe_prompt = prompt
    for key, value in replacements.items():
        safe_prompt = safe_prompt.replace(key, value)

    return safe_prompt


def setup_chrome_driver():
    """Chrome 드라이버 설정 - 실행 중인 Chrome에 연결 (기존 코드 유지)"""
    import subprocess
    import requests

    service = Service(ChromeDriverManager().install())

    # 실행 중인 Chrome의 디버깅 포트에 연결 시도
    print("🔍 실행 중인 Chrome 찾는 중...", flush=True)

    try:
        response = requests.get("http://127.0.0.1:9222/json/version", timeout=2)
        if response.status_code == 200:
            print("✅ 실행 중인 Chrome 발견! (디버깅 포트 활성화)", flush=True)

            chrome_options = Options()
            chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

            driver = webdriver.Chrome(service=service, options=chrome_options)
            print("✅ 기존 Chrome에 연결 완료 (로그인 세션 유지)", flush=True)

            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            return driver

    except (requests.exceptions.RequestException, Exception):
        pass

    # Chrome이 디버깅 모드로 실행되지 않음 → 자동으로 시작
    print("⚠️ Chrome이 디버깅 모드로 실행되지 않았습니다.", flush=True)
    print("🚀 Chrome을 디버깅 모드로 자동 실행합니다...", flush=True)

    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe")
    ]

    chrome_exe = None
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_exe = path
            break

    if not chrome_exe:
        raise Exception("❌ Chrome 실행 파일을 찾을 수 없습니다.")

    import tempfile
    profile_dir = os.path.join(tempfile.gettempdir(), 'chrome_debug_profile')

    subprocess.Popen([
        chrome_exe,
        "--remote-debugging-port=9222",
        f"--user-data-dir={profile_dir}"
    ])

    print("⏳ Chrome 시작 대기 중...", flush=True)
    time.sleep(8)

    max_retries = 10
    for i in range(max_retries):
        try:
            response = requests.get("http://127.0.0.1:9222/json/version", timeout=1)
            if response.status_code == 200:
                print(f"✅ Chrome 디버깅 포트 응답 확인!", flush=True)
                break
        except:
            pass

        if i < max_retries - 1:
            print(f"⏳ 재시도 {i+1}/{max_retries}...", flush=True)
            time.sleep(2)
        else:
            raise Exception("❌ Chrome 디버깅 포트 연결 실패")

    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    driver = webdriver.Chrome(service=service, options=chrome_options)
    print("✅ Chrome 연결 완료!", flush=True)

    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver


def generate_image_with_imagefx(driver, prompt):
    """
    ImageFX로 이미지 생성 (간소화된 버전)
    정책 위반 처리를 공통 함수로 위임
    """
    print("\n" + "="*80, flush=True)
    print("1️⃣ ImageFX - 이미지 생성", flush=True)
    print("="*80, flush=True)

    driver.get('https://labs.google/fx/tools/image-fx')
    time.sleep(5)

    # 입력창 찾기 및 프롬프트 입력
    try:
        input_elem = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'div[contenteditable="true"]'))
        )

        # 프롬프트 입력
        input_elem.click()
        time.sleep(1)

        # 기존 내용 삭제
        actions = ActionChains(driver)
        actions.key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL).perform()
        time.sleep(0.5)
        actions.send_keys(Keys.DELETE).perform()
        time.sleep(0.5)

        # 새 프롬프트 입력
        actions.send_keys(prompt).perform()
        time.sleep(1)

        # 생성 버튼 클릭 또는 엔터
        actions.send_keys(Keys.RETURN).perform()

    except Exception as e:
        print(f"❌ 프롬프트 입력 실패: {e}", flush=True)
        return None, "FAILED"

    # 이미지 생성 대기
    print("⏳ 이미지 생성 대기 중...", flush=True)
    for i in range(120):
        # 정책 위반 체크
        violation = detect_policy_violation(driver)
        if violation.get('violated'):
            print(f"⚠️ 정책 위반 감지: {violation.get('message')}", flush=True)
            return None, "POLICY_VIOLATION"

        # 이미지 생성 확인
        images = collect_page_images(driver, min_size=300)
        if images:
            print(f"✅ 이미지 생성 완료! ({i+1}초)", flush=True)

            # 첫 번째 이미지 다운로드
            download_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
            output_path = os.path.join(download_dir, f'imagefx_{int(time.time())}')

            img = images[0]
            if img.get('isBlob'):
                saved_path = save_image_from_blob(driver, img['src'], output_path)
            else:
                ext = '.jpg' if 'jpg' in img['src'].lower() else '.png'
                saved_path = output_path + ext
                if download_http_image(img['src'], saved_path):
                    return saved_path, "SUCCESS"

            if saved_path:
                return saved_path, "SUCCESS"

        if i % 10 == 0 and i > 0:
            print(f"   대기 중... ({i}초)", flush=True)
        time.sleep(1)

    return None, "TIMEOUT"


def upload_image_to_whisk(driver, image_path, aspect_ratio=None):
    """
    Whisk에 이미지 업로드 (간소화된 버전)
    공통 함수 활용
    """
    print("\n" + "="*80, flush=True)
    print("2️⃣ Whisk - 피사체 이미지 업로드", flush=True)
    print("="*80, flush=True)

    driver.get('https://labs.google/fx/ko/tools/whisk/project')
    time.sleep(3)

    # 비율 선택 (공통 함수 사용)
    if aspect_ratio:
        select_aspect_ratio(driver, aspect_ratio)

    # 피사체 업로드 영역 클릭
    print("🔍 피사체 업로드 영역 찾는 중...", flush=True)

    try:
        # 업로드 버튼 찾기 및 클릭
        upload_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), '이미지') and contains(text(), '업로드')]"))
        )
        upload_button.click()
        time.sleep(2)
    except:
        print("⚠️ 업로드 버튼을 못 찾음, 대체 방법 시도", flush=True)

    # file input 찾기 및 파일 업로드
    try:
        file_input = driver.find_element(By.CSS_SELECTOR, 'input[type="file"]')
        abs_path = os.path.abspath(image_path)
        file_input.send_keys(abs_path)
        print(f"✅ 파일 업로드: {os.path.basename(abs_path)}", flush=True)
        time.sleep(3)
        return True
    except Exception as e:
        print(f"❌ 업로드 실패: {e}", flush=True)
        return False


def input_prompt_to_whisk(driver, prompt):
    """
    Whisk 입력창에 프롬프트 입력 (간소화된 버전)
    """
    try:
        # 클립보드에 복사
        pyperclip.copy(prompt)
        print(f"📋 프롬프트 입력: {prompt[:50]}...", flush=True)
        time.sleep(0.3)

        # 입력창 찾기
        input_box = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'textarea, [contenteditable="true"], div[role="textbox"]'))
        )
        input_box.click()
        time.sleep(0.3)

        # Ctrl+V로 붙여넣기
        actions = ActionChains(driver)
        actions.key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
        time.sleep(0.5)

        # 엔터 입력
        actions.send_keys(Keys.RETURN).perform()
        print("✅ 프롬프트 입력 완료", flush=True)
        return True

    except Exception as e:
        print(f"❌ 입력 오류: {e}", flush=True)
        return False


def download_generated_images(driver, scenes, output_folder):
    """
    생성된 이미지 다운로드 (공통 함수 활용)
    """
    print("\n" + "="*80, flush=True)
    print("📥 이미지 다운로드", flush=True)
    print("="*80, flush=True)

    # 페이지에서 이미지 수집
    images = collect_page_images(driver, min_size=100)

    if not images:
        print("⚠️ 다운로드할 이미지가 없습니다.", flush=True)
        return 0

    # Whisk 이미지 처리 (2개→1개 선택)
    selected_images = process_whisk_images(images, scenes)

    # 선택된 이미지 다운로드
    downloaded_count = 0
    for scene_idx, img_data in selected_images.items():
        if scene_idx >= len(scenes):
            break

        scene = scenes[scene_idx]
        scene_number = scene.get('scene_number') or f"scene_{str(scene_idx).zfill(2)}"
        output_path = os.path.join(output_folder, str(scene_number))

        try:
            if img_data.get('isBlob'):
                saved = save_image_from_blob(driver, img_data['src'], output_path)
                if saved:
                    downloaded_count += 1
            else:
                ext = '.jpg' if 'jpg' in img_data['src'].lower() else '.png'
                if download_http_image(img_data['src'], output_path + ext):
                    downloaded_count += 1
        except Exception as e:
            print(f"   ❌ {scene_number}: {e}", flush=True)

    print(f"\n✅ 다운로드 완료: {downloaded_count}/{len(scenes)}", flush=True)
    return downloaded_count


def main(scenes_json_file, use_imagefx=False, output_dir=None, images_per_prompt=1):
    """메인 실행 함수 (리팩토링 버전)"""
    print("=" * 80, flush=True)
    mode = "ImageFX + Whisk" if use_imagefx else "Whisk"
    print(f"🚀 {mode} 자동화 시작 (리팩토링 버전)", flush=True)
    print("=" * 80, flush=True)

    # JSON 파일 읽기
    try:
        with open(scenes_json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if isinstance(data, list):
            scenes = data
        elif isinstance(data, dict) and 'scenes' in data:
            scenes = data['scenes']
            # 비율 정보 추출
            video_info = data.get('video_info', {})
            format_type = video_info.get('format', '')
            aspect_ratio = None
            if format_type in ['longform', 'sora1']:
                aspect_ratio = '16:9'
            elif format_type in ['shortform', 'product', 'sora2']:
                aspect_ratio = '9:16'
        else:
            print(f"❌ JSON 형식 오류", flush=True)
            return 1
    except Exception as e:
        print(f"❌ JSON 파일 읽기 실패: {e}", flush=True)
        return 1

    if not scenes:
        print("❌ 씬 데이터가 없습니다.", flush=True)
        return 1

    print(f"📝 총 {len(scenes)}개 씬 처리 예정\n", flush=True)

    # 출력 폴더 설정
    if not output_dir:
        json_dir = os.path.dirname(os.path.abspath(scenes_json_file))
        output_folder = os.path.join(json_dir, 'images')
    else:
        output_folder = output_dir
    os.makedirs(output_folder, exist_ok=True)

    driver = None
    try:
        driver = setup_chrome_driver()

        # ImageFX 사용 시
        if use_imagefx:
            first_scene = scenes[0]
            first_prompt = first_scene.get('image_prompt') or first_scene.get('sora_prompt') or ''

            if not first_prompt:
                raise Exception("첫 번째 씬에 프롬프트가 없습니다")

            # ImageFX로 첫 이미지 생성 (정책 위반 처리 포함)
            max_retries = 3
            image_path = None

            for retry in range(max_retries):
                if retry > 0:
                    print(f"\n🔄 재시도 {retry}/{max_retries-1}", flush=True)
                    first_prompt = sanitize_prompt_for_google(first_prompt)

                result, status = generate_image_with_imagefx(driver, first_prompt)

                if status == "SUCCESS":
                    image_path = result
                    break
                elif status == "POLICY_VIOLATION":
                    if retry < max_retries - 1:
                        continue
                    else:
                        raise Exception("정책 위반: 최대 재시도 초과")

            if not image_path:
                raise Exception("ImageFX 이미지 생성 실패")

            # Whisk에 업로드
            upload_image_to_whisk(driver, image_path, aspect_ratio)

        else:
            # Whisk 초기화 (공통 함수 사용)
            initialize_whisk(driver, aspect_ratio)

        # 프롬프트 입력
        print("\n" + "="*80, flush=True)
        print("3️⃣ Whisk - 프롬프트 입력", flush=True)
        print("="*80, flush=True)

        for i, scene in enumerate(scenes):
            scene_number = scene.get('scene_number') or f"scene_{str(i).zfill(2)}"
            prompt = scene.get('image_prompt') or scene.get('sora_prompt') or ''

            if not prompt:
                print(f"⏭️ {scene_number} - 프롬프트 없음", flush=True)
                continue

            # 타이밍 제어
            if i >= 3:
                time.sleep(15)
            elif i == 2:
                time.sleep(2)
            elif i == 1:
                time.sleep(0.5)

            print(f"📝 {scene_number} 입력 중...", flush=True)
            input_prompt_to_whisk(driver, prompt)
            time.sleep(2)

        # 이미지 생성 대기
        print("\n⏳ 이미지 생성 대기 중... (최대 120초)", flush=True)
        for i in range(120):
            images = collect_page_images(driver, min_size=100)
            if images and len(images) >= len(scenes):
                print(f"✅ 생성 완료! ({i+1}초)", flush=True)
                break
            if i % 10 == 0 and i > 0:
                print(f"   대기 중... ({i}초)", flush=True)
            time.sleep(1)

        time.sleep(5)

        # 이미지 다운로드
        download_generated_images(driver, scenes, output_folder)

        print(f"\n{'='*80}", flush=True)
        print("🎉 전체 워크플로우 완료!", flush=True)
        print(f"📁 저장 위치: {output_folder}", flush=True)
        print(f"{'='*80}", flush=True)

        return 0

    except Exception as e:
        print(f"❌ 오류 발생: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return 1

    finally:
        print("\n⚠️ 브라우저를 열어둡니다.", flush=True)
        # driver를 닫지 않음


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='이미지 크롤링 자동화 (리팩토링 버전)')
    parser.add_argument('scenes_file', help='씬 데이터 JSON 파일')
    parser.add_argument('--use-imagefx', action='store_true', help='ImageFX로 첫 이미지 생성')
    parser.add_argument('--output-dir', help='이미지 저장 디렉토리')
    parser.add_argument('--images-per-prompt', type=int, default=1, help='프롬프트당 이미지 개수')

    args = parser.parse_args()

    sys.exit(main(
        args.scenes_file,
        use_imagefx=args.use_imagefx,
        output_dir=args.output_dir,
        images_per_prompt=args.images_per_prompt
    ))