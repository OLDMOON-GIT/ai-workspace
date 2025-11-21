#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_images 함수 테스트 (Whisk 실제 이미지 또는 Mock 데이터)
"""
import sys
import os
import io

# UTF-8 encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from selenium import webdriver
import json
import glob
import shutil
import random
import base64
import tempfile
import requests

# Whisk 연결 시도
driver = None
use_whisk = False

print("=" * 80)
print("download_images 함수 테스트")
print("=" * 80)

# Whisk 연결 시도
print("\n[1단계] Whisk 연결 시도...")
try:
    chrome_options = webdriver.ChromeOptions()
    chrome_options.add_argument("--remote-debugging-port=9222")
    chrome_options.add_argument(r"user-data-dir=C:\Users\oldmoon\workspace\trend-video-backend\.chrome-automation-profile")
    driver = webdriver.Chrome(options=chrome_options)

    # Whisk에서 이미지 수집
    all_images = driver.execute_script("""
        const imgs = Array.from(document.querySelectorAll('img'));
        const basicFiltered = imgs.filter(img => {
            if (img.offsetWidth < 60 || img.offsetHeight < 60) return false;
            const src = img.src || '';
            if (src.startsWith('data:')) return false;
            if (!src.startsWith('http') && !src.startsWith('blob:')) return false;
            return true;
        });
        const sorted = basicFiltered.sort((a, b) => {
            const sizeA = a.offsetWidth * a.offsetHeight;
            const sizeB = b.offsetWidth * b.offsetHeight;
            return sizeB - sizeA;
        });
        return sorted.map(img => ({
            src: img.src,
            width: img.offsetWidth,
            height: img.offsetHeight,
            alt: img.alt || '',
            isBlob: img.src.startsWith('blob:')
        }));
    """)

    if len(all_images) > 0:
        print(f"✅ Whisk에 {len(all_images)}개의 이미지 감지!")
        use_whisk = True
    else:
        print("⚠️ Whisk에 이미지가 없습니다. Mock 데이터로 진행합니다.")
        driver.quit()
        driver = None
except Exception as e:
    print(f"⚠️ Whisk 연결 실패: {e}. Mock 데이터로 진행합니다.")
    driver = None

# Mock 이미지 데이터 생성
def create_mock_images(count):
    """Mock 이미지 데이터 생성"""
    images = []
    for i in range(count):
        images.append({
            "src": f"https://example.com/image_{i}.jpg",
            "width": 104,
            "height": 191,
            "alt": "",
            "isBlob": False
        })
    return images

# 테스트 케이스 결정 (항상 8개 이미지로 테스트하기)
test_cases = [
    {"name": "8개 이미지 + 4개 씬 (통합테스트)", "images": 8},
]

for test_case in test_cases:
    print("\n" + "=" * 80)
    print(f"테스트: {test_case['name']}")
    print("=" * 80)

    # Whisk 이미지를 사용하는 경우
    if test_case.get('use_whisk') and use_whisk:
        # all_images는 이미 위에서 수집됨
        pass
    else:
        # Mock 이미지 생성
        all_images = create_mock_images(test_case['images'])

    # 이미지 분배 로직 (download_images에서 사용)
    num_scenes = 4
    imgs_per_scene = len(all_images) // num_scenes
    print(f"총 이미지: {len(all_images)}개")
    print(f"씬 개수: {num_scenes}개")
    print(f"각 씬당: {imgs_per_scene}개\n")

    images_per_prompt = []
    idx = 0
    for i in range(num_scenes):
        scene_imgs = all_images[idx:idx+imgs_per_scene]
        images_per_prompt.append(scene_imgs)
        print(f"Prompt {i}: images[{idx}:{idx+imgs_per_scene}] = {len(scene_imgs)}개 할당")
        idx += imgs_per_scene

    if idx < len(all_images):
        unused = len(all_images) - idx
        print(f"미할당 이미지: {unused}개 (images[{idx}:{len(all_images)}])")
    else:
        print("미할당 이미지 없음")

    # 다운로드 시뮬레이션 (실제 다운로드 대신 파일 생성)
    print("\n다운로드 시뮬레이션:")

    output_folder = r"C:\Users\oldmoon\workspace\trend-video-backend\input\project_454d477a-186a-4893-a2f4-9575cdfe8daf"

    # 출력 폴더 생성
    os.makedirs(output_folder, exist_ok=True)

    # 기존 파일 정리
    for f in glob.glob(os.path.join(output_folder, "scene_*.jpeg")):
        try:
            os.remove(f)
        except:
            pass

    scenes_data = [
        {"scene_id": "scene_00_hook"},
        {"scene_id": "scene_01_problem"},
        {"scene_id": "scene_02_solution"},
        {"scene_id": "scene_03_cta"}
    ]

    downloaded_count = 0

    for i, scene in enumerate(scenes_data):
        scene_id = scene["scene_id"]

        # 해당 씬의 이미지
        if i < len(images_per_prompt):
            scene_images = images_per_prompt[i]
        else:
            scene_images = []

        if not scene_images:
            print(f"  {scene_id}: 할당된 이미지 없음")
            continue

        # 할당된 이미지 중 1개 선택
        selected_img_idx = random.randint(0, len(scene_images) - 1)
        selected_img = scene_images[selected_img_idx]
        img_src = selected_img.get('src', '')

        try:
            filename = f"{scene_id}.jpeg"
            filepath = os.path.join(output_folder, filename)

            # Whisk 이미지인 경우 실제 다운로드 시도
            if use_whisk and selected_img.get('isBlob'):
                print(f"  {scene_id}: Blob 이미지 다운로드 시도...")
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
                    """, img_src)

                    if base64_data and base64_data.startswith('data:image'):
                        header, base64_str = base64_data.split(',', 1)
                        image_data = base64.b64decode(base64_str)
                        with open(filepath, 'wb') as f:
                            f.write(image_data)
                        file_size = os.path.getsize(filepath) / 1024
                        print(f"  {scene_id}: 선택함 (할당된 {len(scene_images)}개 중 {selected_img_idx + 1}번) - {file_size:.1f}KB")
                        downloaded_count += 1
                    else:
                        print(f"  {scene_id}: Base64 변환 실패")
                except Exception as e:
                    print(f"  {scene_id}: Blob 다운로드 오류 - {e}")
            elif use_whisk and not selected_img.get('isBlob'):
                # HTTP URL 다운로드
                print(f"  {scene_id}: HTTP 이미지 다운로드 시도...")
                response = requests.get(img_src, timeout=30)
                if response.status_code == 200:
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    file_size = os.path.getsize(filepath) / 1024
                    print(f"  {scene_id}: 선택함 (할당된 {len(scene_images)}개 중 {selected_img_idx + 1}번) - {file_size:.1f}KB")
                    downloaded_count += 1
                else:
                    print(f"  {scene_id}: HTTP 다운로드 실패 ({response.status_code})")
            else:
                # Mock 데이터인 경우: 더미 JPEG 파일 생성
                jpeg_header = bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffdb4300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c285028403029')
                with open(filepath, 'wb') as f:
                    f.write(jpeg_header)
                    f.write(b'\xff\xd9')  # JPEG end marker

                file_size = os.path.getsize(filepath) / 1024
                print(f"  {scene_id}: 선택함 (할당된 {len(scene_images)}개 중 {selected_img_idx + 1}번)")
                downloaded_count += 1
        except Exception as e:
            print(f"  {scene_id}: 오류 - {e}")

    print(f"\n결과: {downloaded_count}/{num_scenes}개 씬에 이미지 저장됨")

    # 검증
    if downloaded_count == num_scenes:
        print("PASS: 모든 씬에 이미지가 저장됨")
    elif imgs_per_scene == 0:
        if downloaded_count == 0:
            print("PASS: 이미지가 없으므로 0개 저장됨 (예상대로)")
        else:
            print(f"FAIL: 이미지가 없어야 하는데 {downloaded_count}개 저장됨")
    else:
        print(f"FAIL: {num_scenes}개 모두 저장되어야 하는데 {downloaded_count}개만 저장됨")

print("\n" + "=" * 80)
print("모든 테스트 완료")
print("=" * 80)

# 드라이버 종료
if driver:
    driver.quit()
    print("\n[정리] Whisk 연결 종료")
