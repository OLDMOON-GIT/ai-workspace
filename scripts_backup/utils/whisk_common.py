"""
Whisk 및 ImageFX 자동화를 위한 공통 함수 모듈
재사용 가능한 로직들을 모아놓은 유틸리티 함수들
"""

import time
import os
import requests
import base64
import random
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def select_aspect_ratio(driver, aspect_ratio):
    """
    Whisk에서 이미지 비율 선택

    Args:
        driver: Selenium WebDriver
        aspect_ratio: '16:9', '9:16', '1:1' 중 하나

    Returns:
        bool: 성공 여부
    """
    if not aspect_ratio:
        return True

    print(f"📐 비율 선택 시도: {aspect_ratio}", flush=True)

    # 비율에 따른 버튼 텍스트 매핑
    button_mapping = {
        '9:16': '세로 모드',
        '16:9': '가로 모드',
        '1:1': '정사각형'
    }

    button_to_click = button_mapping.get(aspect_ratio, aspect_ratio)
    print(f"   → {aspect_ratio} 비율: '{button_to_click}' 선택", flush=True)

    # Step 1: 비율 선택 드롭다운/버튼 열기
    menu_open_result = driver.execute_script("""
        const allElements = Array.from(document.querySelectorAll('button, div[role="button"], div[role="combobox"]'));

        const ratioSelectorElements = allElements.filter(elem => {
            const text = (elem.textContent || '').toLowerCase();
            const ariaLabel = (elem.getAttribute('aria-label') || '').toLowerCase();
            return text.includes('비율') || text.includes('aspect') || text.includes('ratio') ||
                   ariaLabel.includes('비율') || ariaLabel.includes('aspect') || ariaLabel.includes('ratio');
        });

        if (ratioSelectorElements.length > 0) {
            ratioSelectorElements[0].click();
            return {
                opened: true,
                element: ratioSelectorElements[0].tagName,
                text: ratioSelectorElements[0].textContent.substring(0, 50)
            };
        }

        return {opened: false, totalElements: allElements.length};
    """)

    if menu_open_result.get('opened'):
        print(f"✅ 비율 선택 메뉴 열림", flush=True)
        time.sleep(1)
    else:
        print(f"⚠️ 비율 선택 메뉴를 찾지 못함", flush=True)
        return False

    # Step 2: 원하는 옵션 선택
    aspect_ratio_result = driver.execute_script("""
        const buttonText = arguments[0];
        const ratioText = arguments[1];

        const allButtons = Array.from(document.querySelectorAll('button'));

        const targetButtons = allButtons.filter(button => {
            const text = button.textContent.trim().replace(/\\s+/g, ' ');
            return text.includes(buttonText) || text.includes(ratioText);
        });

        if (targetButtons.length > 0) {
            targetButtons[0].click();
            return {
                success: true,
                text: targetButtons[0].textContent.trim().substring(0, 50)
            };
        }

        // aria-label/title로 폴백
        for (const button of allButtons) {
            const ariaLabel = button.getAttribute('aria-label') || '';
            const title = button.getAttribute('title') || '';

            if (ariaLabel.includes(buttonText) || ariaLabel.includes(ratioText) ||
                title.includes(buttonText) || title.includes(ratioText)) {
                button.click();
                return {success: true, method: 'aria-label-or-title'};
            }
        }

        return {success: false, totalButtons: allButtons.length};
    """, button_to_click, aspect_ratio)

    if aspect_ratio_result.get('success'):
        print(f"✅ 비율 선택 성공: {aspect_ratio}", flush=True)
        time.sleep(2)
        return True
    else:
        print(f"⚠️ 비율 선택 실패: {button_to_click}", flush=True)
        return False


def detect_policy_violation(driver):
    """
    정책 위반 여부 감지

    Args:
        driver: Selenium WebDriver

    Returns:
        dict: {violated: bool, message: str}
    """
    result = driver.execute_script("""
        const text = document.body.innerText || document.body.textContent || '';
        const textLower = text.toLowerCase();

        // 토스트/스낵바 요소 감지
        const alerts = document.querySelectorAll('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]');
        let alertText = '';
        alerts.forEach(alert => {
            if (alert.offsetParent !== null) {
                alertText += ' ' + (alert.innerText || alert.textContent || '');
            }
        });

        // 정책 위반 키워드
        const violationKeywords = [
            'policy', 'violation', 'violate', 'prohibited', 'not allowed',
            '정책', '위반', '금지', '허용되지 않음', '생성할 수 없습니다',
            'unable to generate', 'cannot create', 'rejected'
        ];

        const fullText = (text + ' ' + alertText).toLowerCase();
        const violated = violationKeywords.some(keyword => fullText.includes(keyword));

        return {
            violated: violated,
            message: alertText.substring(0, 200),
            bodySnippet: text.substring(0, 500)
        };
    """)

    return result


def convert_blob_to_base64(driver, blob_url):
    """
    Blob URL을 base64 데이터로 변환

    Args:
        driver: Selenium WebDriver
        blob_url: blob:// URL

    Returns:
        tuple: (base64_data, extension)
    """
    try:
        base64_data = driver.execute_script("""
            const url = arguments[0];
            return new Promise((resolve, reject) => {
                fetch(url)
                    .then(res => res.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    })
                    .catch(reject);
            });
        """, blob_url)

        if base64_data and base64_data.startswith('data:image'):
            header, base64_str = base64_data.split(',', 1)
            ext = '.' + header.split(';')[0].split('/')[-1] if 'image' in header else '.png'
            return base64_str, ext

    except Exception as e:
        print(f"⚠️ Blob 변환 실패: {e}", flush=True)

    return None, None


def download_http_image(url, output_path, timeout=30):
    """
    HTTP/HTTPS 이미지 다운로드

    Args:
        url: 이미지 URL
        output_path: 저장할 경로
        timeout: 타임아웃 (초)

    Returns:
        bool: 성공 여부
    """
    try:
        headers = {'Referer': 'https://labs.google/'}
        response = requests.get(url, timeout=timeout, headers=headers)

        if response.status_code == 200:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            with open(output_path, 'wb') as f:
                f.write(response.content)

            if os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                print(f"     ✅ 다운로드 성공: {os.path.basename(output_path)} ({file_size} bytes)", flush=True)
                return True
        else:
            print(f"     ❌ HTTP 오류: {response.status_code}", flush=True)

    except Exception as e:
        print(f"     ❌ 다운로드 실패: {e}", flush=True)

    return False


def save_image_from_blob(driver, blob_url, output_path):
    """
    Blob URL 이미지 저장

    Args:
        driver: Selenium WebDriver
        blob_url: blob:// URL
        output_path: 저장할 경로 (확장자 제외)

    Returns:
        str: 저장된 파일 경로 또는 None
    """
    base64_str, ext = convert_blob_to_base64(driver, blob_url)

    if base64_str:
        full_path = output_path + ext
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        image_bytes = base64.b64decode(base64_str)
        with open(full_path, 'wb') as f:
            f.write(image_bytes)

        if os.path.exists(full_path):
            file_size = os.path.getsize(full_path)
            print(f"     ✅ Blob 저장 성공: {os.path.basename(full_path)} ({file_size} bytes)", flush=True)
            return full_path

    return None


def process_whisk_images(images, scenes):
    """
    Whisk 이미지 처리 (프롬프트당 2개 → 1개 선택)

    Args:
        images: 수집된 이미지 리스트
        scenes: 씬 데이터 리스트

    Returns:
        dict: {scene_idx: selected_image}
    """
    num_scenes = len(scenes)
    num_images = len(images)

    print(f"📊 Whisk 이미지 분배:", flush=True)
    print(f"   씬 개수: {num_scenes}", flush=True)
    print(f"   이미지 개수: {num_images}", flush=True)

    # 씬당 이미지 개수 계산 (보통 2개, 정책위반시 1개)
    images_per_scene = max(1, num_images // num_scenes) if num_scenes > 0 else 2
    print(f"   씬당 이미지: {images_per_scene}개", flush=True)

    scene_images = {}

    # 이미지를 씬별로 분배
    for i, img_data in enumerate(images):
        scene_idx = i // images_per_scene

        if scene_idx >= num_scenes:
            break

        if scene_idx not in scene_images:
            scene_images[scene_idx] = []
        scene_images[scene_idx].append(img_data)

    # 각 씬에서 최적 이미지 선택
    selected_images = {}
    for scene_idx, img_list in scene_images.items():
        if len(img_list) > 1:
            # 여러 개면 랜덤 선택 (또는 품질 기반 선택 로직 추가 가능)
            selected_images[scene_idx] = random.choice(img_list)
            print(f"   씬 {scene_idx}: {len(img_list)}개 중 1개 선택", flush=True)
        elif len(img_list) == 1:
            selected_images[scene_idx] = img_list[0]
            print(f"   씬 {scene_idx}: 1개만 있음 (정책위반 가능성)", flush=True)

    return selected_images


def initialize_whisk(driver, aspect_ratio=None):
    """
    Whisk 페이지 초기화 및 설정

    Args:
        driver: Selenium WebDriver
        aspect_ratio: 비율 설정 (선택)

    Returns:
        bool: 성공 여부
    """
    print("\n" + "="*80, flush=True)
    print("📌 Whisk 초기화", flush=True)
    print("="*80, flush=True)

    driver.get('https://labs.google/fx/ko/tools/whisk/project')
    time.sleep(3)

    # 페이지 로드 확인
    page_loaded = driver.execute_script("return document.readyState") == "complete"
    if not page_loaded:
        print("⚠️ 페이지 로드 실패", flush=True)
        return False

    print("✅ Whisk 페이지 로드 완료", flush=True)

    # 비율 선택 (있는 경우)
    if aspect_ratio:
        success = select_aspect_ratio(driver, aspect_ratio)
        if not success:
            print("⚠️ 비율 선택 실패, 기본값으로 계속", flush=True)

    return True


def handle_policy_violation(driver, prompt, max_retries=3):
    """
    정책 위반 처리 및 재시도

    Args:
        driver: Selenium WebDriver
        prompt: 원본 프롬프트
        max_retries: 최대 재시도 횟수

    Returns:
        tuple: (safe_prompt, retry_count)
    """
    from .image_crawler_working import sanitize_prompt_for_google

    for retry in range(max_retries):
        violation = detect_policy_violation(driver)

        if not violation.get('violated'):
            return prompt, retry

        print(f"⚠️ 정책 위반 감지 (시도 {retry + 1}/{max_retries})", flush=True)
        print(f"   메시지: {violation.get('message', 'N/A')}", flush=True)

        # 프롬프트 안전화
        prompt = sanitize_prompt_for_google(prompt)
        print(f"   🛡️ 프롬프트 수정: {prompt[:100]}...", flush=True)

        time.sleep(3)

    return prompt, max_retries


def collect_page_images(driver, min_size=100):
    """
    페이지에서 이미지 수집

    Args:
        driver: Selenium WebDriver
        min_size: 최소 크기 (픽셀)

    Returns:
        list: 이미지 정보 리스트
    """
    images = driver.execute_script("""
        const minSize = arguments[0];
        const imgs = Array.from(document.querySelectorAll('img'));

        const filtered = imgs.filter(img => {
            // 크기 확인
            if (img.offsetWidth < minSize || img.offsetHeight < minSize) return false;

            // base64는 제외, blob/http는 포함
            const src = img.src || '';
            if (src.startsWith('data:')) return false;
            if (!src.startsWith('http') && !src.startsWith('blob:')) return false;

            return true;
        });

        return filtered.map(img => ({
            src: img.src,
            width: img.offsetWidth,
            height: img.offsetHeight,
            alt: img.alt || '',
            isBlob: img.src.startsWith('blob:')
        }));
    """, min_size)

    print(f"🔍 이미지 수집 완료: {len(images)}개", flush=True)
    return images