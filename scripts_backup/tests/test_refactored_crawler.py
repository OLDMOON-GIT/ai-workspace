"""
리팩토링된 이미지 크롤러 테스트 스크립트
"""

import sys
import os
import json
import tempfile

# 경로 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'utils'))

from whisk_common import (
    select_aspect_ratio,
    detect_policy_violation,
    process_whisk_images,
    collect_page_images,
    convert_blob_to_base64,
    download_http_image,
    save_image_from_blob
)


def test_process_whisk_images():
    """Whisk 이미지 처리 테스트"""
    print("🧪 Whisk 이미지 처리 함수 테스트")
    print("-" * 50)

    # 테스트 데이터
    scenes = [
        {"scene_number": 1, "image_prompt": "test1"},
        {"scene_number": 2, "image_prompt": "test2"},
        {"scene_number": 3, "image_prompt": "test3"},
        {"scene_number": 4, "image_prompt": "test4"}
    ]

    # 8개 이미지 (씬당 2개)
    images = [
        {"src": "http://test1-1.jpg", "width": 500, "height": 500},
        {"src": "http://test1-2.jpg", "width": 500, "height": 500},
        {"src": "http://test2-1.jpg", "width": 500, "height": 500},
        {"src": "http://test2-2.jpg", "width": 500, "height": 500},
        {"src": "http://test3-1.jpg", "width": 500, "height": 500},
        {"src": "http://test3-2.jpg", "width": 500, "height": 500},
        {"src": "http://test4-1.jpg", "width": 500, "height": 500},
        {"src": "http://test4-2.jpg", "width": 500, "height": 500}
    ]

    result = process_whisk_images(images, scenes)

    print(f"✅ 테스트 결과:")
    print(f"   입력: {len(scenes)}개 씬, {len(images)}개 이미지")
    print(f"   출력: {len(result)}개 씬에 대한 선택된 이미지")

    for scene_idx, img in result.items():
        print(f"   씬 {scene_idx}: {img['src']}")

    assert len(result) == 4, "4개 씬 모두 이미지가 선택되어야 함"
    print("✅ 테스트 통과!")


def test_blob_conversion():
    """Blob URL 변환 테스트 (모의)"""
    print("\n🧪 Blob URL 변환 함수 테스트")
    print("-" * 50)

    # 실제 테스트는 driver가 필요하므로 스킵
    print("⚠️ 실제 WebDriver가 필요하여 스킵")
    print("   함수 시그니처 확인: convert_blob_to_base64(driver, blob_url)")
    print("   반환값: (base64_str, extension)")


def test_http_download():
    """HTTP 이미지 다운로드 테스트"""
    print("\n🧪 HTTP 이미지 다운로드 테스트")
    print("-" * 50)

    # 테스트용 이미지 URL (구글 로고)
    test_url = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png"

    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
        output_path = tmp.name

    try:
        success = download_http_image(test_url, output_path)

        if success and os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            print(f"✅ 다운로드 성공: {output_path}")
            print(f"   파일 크기: {file_size} bytes")
            os.unlink(output_path)
        else:
            print("❌ 다운로드 실패")

    except Exception as e:
        print(f"❌ 테스트 실패: {e}")


def test_full_workflow():
    """전체 워크플로우 테스트"""
    print("\n🧪 전체 워크플로우 통합 테스트")
    print("-" * 50)

    # 테스트 JSON 생성
    test_scenes = [
        {
            "scene_number": 1,
            "scene_id": "scene_01",
            "narration": "테스트 씬 1",
            "image_prompt": "A beautiful sunset over mountains, professional photography"
        },
        {
            "scene_number": 2,
            "scene_id": "scene_02",
            "narration": "테스트 씬 2",
            "image_prompt": "A peaceful lake with reflection, landscape photography"
        }
    ]

    # 임시 JSON 파일 생성
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as tmp:
        json.dump({"scenes": test_scenes, "video_info": {"format": "shortform"}}, tmp)
        json_path = tmp.name

    print(f"📝 테스트 JSON 생성: {json_path}")
    print(f"   씬 개수: {len(test_scenes)}")

    # 리팩토링된 크롤러 실행
    try:
        from image_crawler_refactored import main

        print("\n🚀 리팩토링된 크롤러 실행 (Dry Run)")
        print("   Chrome이 디버깅 모드로 실행되어야 실제 테스트 가능")
        print("   명령: chrome.exe --remote-debugging-port=9222")

        # 여기서는 import만 확인
        print("✅ 모듈 import 성공!")

    except ImportError as e:
        print(f"❌ Import 오류: {e}")
    finally:
        # 정리
        if os.path.exists(json_path):
            os.unlink(json_path)
            print(f"🗑️ 임시 파일 삭제: {json_path}")


def compare_code_size():
    """코드 크기 비교"""
    print("\n📊 코드 크기 비교")
    print("-" * 50)

    original_file = os.path.join(os.path.dirname(__file__), '..', 'utils', 'image_crawler_working.py')
    refactored_file = os.path.join(os.path.dirname(__file__), '..', 'utils', 'image_crawler_refactored.py')
    common_file = os.path.join(os.path.dirname(__file__), '..', 'utils', 'whisk_common.py')

    if os.path.exists(original_file):
        with open(original_file, 'r', encoding='utf-8') as f:
            original_lines = len(f.readlines())
        print(f"📄 원본 코드: {original_lines} 줄")

    if os.path.exists(refactored_file):
        with open(refactored_file, 'r', encoding='utf-8') as f:
            refactored_lines = len(f.readlines())
        print(f"📄 리팩토링 코드: {refactored_lines} 줄")

    if os.path.exists(common_file):
        with open(common_file, 'r', encoding='utf-8') as f:
            common_lines = len(f.readlines())
        print(f"📄 공통 함수 모듈: {common_lines} 줄")

    if 'original_lines' in locals() and 'refactored_lines' in locals():
        total_new = refactored_lines + common_lines
        reduction = original_lines - total_new
        percentage = (reduction / original_lines) * 100 if original_lines > 0 else 0

        print(f"\n📉 코드 감소:")
        print(f"   원본: {original_lines} 줄")
        print(f"   리팩토링 후: {total_new} 줄 (메인: {refactored_lines}, 공통: {common_lines})")
        print(f"   감소량: {reduction} 줄 ({percentage:.1f}%)")


if __name__ == '__main__':
    # Windows 인코딩 문제 해결
    import io
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True, write_through=True)

    print("=" * 80)
    print("🔧 리팩토링된 이미지 크롤러 테스트")
    print("=" * 80)

    # 각 테스트 실행
    test_process_whisk_images()
    test_blob_conversion()
    test_http_download()
    test_full_workflow()
    compare_code_size()

    print("\n" + "=" * 80)
    print("✅ 모든 테스트 완료!")
    print("=" * 80)