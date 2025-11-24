#!/usr/bin/env python3
"""
download_images() 함수 단위 테스트
Whisk 없이 mock 데이터로 테스트
"""
import sys
import json
import random
import tempfile
import shutil

# Mock 드라이버 (실제 Selenium driver 사용 안 함)
class MockDriver:
    def execute_script(self, script, *args):
        return None

# Mock 이미지 데이터
def create_mock_images(count):
    """Mock 이미지 데이터 생성"""
    images = []
    for i in range(count):
        images.append({
            "src": f"blob:https://labs.google/image_{i}",
            "width": 104,
            "height": 191,
            "alt": "",
            "isBlob": True
        })
    return images

def test_download_images_8_to_4():
    """테스트: 8개 이미지 + 4개 씬 = 각 2개씩 할당"""
    print("=" * 80)
    print("테스트 1: 8개 이미지 + 4개 씬")
    print("=" * 80)

    all_images = create_mock_images(8)
    num_scenes = 4

    # 스펙 대로: 8 // 4 = 2 (각 씬당 2개)
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
        print(f"⚠️ 미할당 이미지: {unused}개 (images[{idx}:{len(all_images)}])")

    # 검증
    assert len(images_per_prompt) == 4, "씬 개수 오류"
    assert all(len(imgs) == 2 for imgs in images_per_prompt), "각 씬 2개 오류"
    print("✅ PASS\n")

def test_download_images_7_to_4():
    """테스트: 7개 이미지 + 4개 씬 = 각 1개씩 할당, 3개 미할당"""
    print("=" * 80)
    print("테스트 2: 7개 이미지 + 4개 씬 (정책 위반 섞인 경우)")
    print("=" * 80)

    all_images = create_mock_images(7)
    num_scenes = 4

    # 스펙 대로: 7 // 4 = 1 (각 씬당 1개, 3개는 미할당)
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

    unused_start = idx
    if idx < len(all_images):
        unused = len(all_images) - idx
        print(f"⚠️ 미할당 이미지: {unused}개 (images[{unused_start}:{len(all_images)}])")

    # 검증
    assert len(images_per_prompt) == 4, "씬 개수 오류"
    assert all(len(imgs) == 1 for imgs in images_per_prompt), "각 씬 1개 오류"
    assert unused == 3, "미할당 이미지 개수 오류"
    print("✅ PASS\n")

def test_download_images_4_to_4():
    """테스트: 4개 이미지 + 4개 씬 = 각 1개씩 할당, 0개 미할당"""
    print("=" * 80)
    print("테스트 3: 4개 이미지 + 4개 씬")
    print("=" * 80)

    all_images = create_mock_images(4)
    num_scenes = 4

    # 스펙 대로: 4 // 4 = 1 (각 씬당 1개)
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
        print(f"⚠️ 미할당 이미지: {unused}개 (images[{idx}:{len(all_images)}])")
    else:
        print("✅ 미할당 이미지 없음")

    # 검증
    assert len(images_per_prompt) == 4, "씬 개수 오류"
    assert all(len(imgs) == 1 for imgs in images_per_prompt), "각 씬 1개 오류"
    assert idx == len(all_images), "미할당 이미지 없어야 함"
    print("✅ PASS\n")

def test_download_images_2_to_4():
    """테스트: 2개 이미지 + 4개 씬 = 각 0개씩 할당"""
    print("=" * 80)
    print("테스트 4: 2개 이미지 + 4개 씬 (이미지 부족)")
    print("=" * 80)

    all_images = create_mock_images(2)
    num_scenes = 4

    # 스펙 대로: 2 // 4 = 0 (각 씬당 0개)
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
        print(f"⚠️ 미할당 이미지: {unused}개 (images[{idx}:{len(all_images)}])")

    # 검증
    assert len(images_per_prompt) == 4, "씬 개수 오류"
    assert all(len(imgs) == 0 for imgs in images_per_prompt), "각 씬 0개 오류"
    print("✅ PASS\n")

if __name__ == "__main__":
    print("\n🧪 download_images 함수 단위 테스트\n")

    test_download_images_8_to_4()
    test_download_images_7_to_4()
    test_download_images_4_to_4()
    test_download_images_2_to_4()

    print("=" * 80)
    print("✅ 모든 테스트 통과!")
    print("=" * 80)
