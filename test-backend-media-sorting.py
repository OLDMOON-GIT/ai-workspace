"""
백엔드 미디어 정렬 테스트

시나리오:
1. scene_0.jpg → thumbnail.jpg로 이동됨
2. 남은 파일: scene_1.mp4, scene_2.jpg, scene_3.jpg, scene_4.jpg

백엔드 정렬 결과:
- 씬 1: scene_1.mp4  ← 영상이 첫 번째!
- 씬 2: scene_2.jpg
- 씬 3: scene_3.jpg
- 씬 4: scene_4.jpg

실행: python test-backend-media-sorting.py
"""

import sys
import io

# UTF-8 출력 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import re
from pathlib import Path

def extract_sequence_unified(media_tuple):
    """시퀀스 번호 추출 (백엔드와 동일한 로직)"""
    media_type, filepath = media_tuple
    name = filepath.stem

    # 패턴 매칭 (image_01, video_02, scene_03, clip_01 등)
    match = re.match(r'^(image|video|scene|clip|img)[-_](\d+)$', name, re.IGNORECASE)
    if match:
        return (int(match.group(2)), 0)

    match = re.match(r'^(image|video|scene|clip|img)\((\d+)\)$', name, re.IGNORECASE)
    if match:
        return (int(match.group(2)), 0)

    match = re.match(r'^\((\d+)\)$', name)
    if match:
        return (int(match.group(1)), 0)

    match = re.match(r'^(\d+)$', name)
    if match:
        return (int(match.group(1)), 0)

    # 파일명 어디든 숫자가 있으면 추출 (영상01, 한글01, abc123 등)
    match = re.search(r'(\d+)', name)
    if match:
        return (int(match.group(1)), 0)

    # 숫자가 없으면 파일 시간
    return (None, 0)

# 테스트 1: scene_N 패턴
print("="*70)
print("🧪 테스트 1: scene_N 패턴 (스케줄러)")
print("="*70)

# 시뮬레이션: scene_0.jpg는 thumbnail.jpg로 이동됨
files_scene = [
    ('image', Path('scene_2.jpg')),
    ('image', Path('scene_3.jpg')),
    ('image', Path('scene_4.jpg')),
    ('video', Path('scene_1.mp4'))
]

print("\n정렬 전 (이미지 먼저, 비디오 나중):")
for media_type, filepath in files_scene:
    print(f"  {filepath.name} ({media_type})")

# 정렬
files_scene.sort(key=lambda f: (
    extract_sequence_unified(f)[0] is None,
    extract_sequence_unified(f)[0] if extract_sequence_unified(f)[0] is not None else 0,
    extract_sequence_unified(f)[1]
))

print("\n정렬 후:")
for idx, (media_type, filepath) in enumerate(files_scene, start=1):
    seq = extract_sequence_unified((media_type, filepath))[0]
    icon = "🎬" if media_type == "video" else "🖼️"
    print(f"  씬 {idx}: {icon} {filepath.name} (시퀀스: {seq})")

# 검증
expected_order = ['scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg', 'scene_4.jpg']
actual_order = [filepath.name for _, filepath in files_scene]

if actual_order == expected_order:
    print(f"\n✅ 테스트 1 통과: 영상(scene_1.mp4)이 첫 번째 씬!")
    test1_pass = True
else:
    print(f"\n❌ 테스트 1 실패!")
    print(f"  예상: {expected_order}")
    print(f"  실제: {actual_order}")
    test1_pass = False

# 테스트 2: 숫자 패턴 (API 업로드)
print("\n" + "="*70)
print("🧪 테스트 2: 숫자 패턴 (일반 업로드)")
print("="*70)

# 시뮬레이션: 02.jpg → thumbnail.jpg로 이동됨 (첫 이미지)
files_numeric = [
    ('image', Path('03.jpg')),
    ('image', Path('04.jpg')),
    ('image', Path('05.jpg')),
    ('video', Path('01.mp4'))
]

print("\n정렬 전 (이미지 먼저, 비디오 나중):")
for media_type, filepath in files_numeric:
    print(f"  {filepath.name} ({media_type})")

# 정렬
files_numeric.sort(key=lambda f: (
    extract_sequence_unified(f)[0] is None,
    extract_sequence_unified(f)[0] if extract_sequence_unified(f)[0] is not None else 0,
    extract_sequence_unified(f)[1]
))

print("\n정렬 후:")
for idx, (media_type, filepath) in enumerate(files_numeric, start=1):
    seq = extract_sequence_unified((media_type, filepath))[0]
    icon = "🎬" if media_type == "video" else "🖼️"
    print(f"  씬 {idx}: {icon} {filepath.name} (시퀀스: {seq})")

# 검증
expected_order = ['01.mp4', '03.jpg', '04.jpg', '05.jpg']
actual_order = [filepath.name for _, filepath in files_numeric]

if actual_order == expected_order:
    print(f"\n✅ 테스트 2 통과: 영상(01.mp4)이 첫 번째 씬!")
    test2_pass = True
else:
    print(f"\n❌ 테스트 2 실패!")
    print(f"  예상: {expected_order}")
    print(f"  실제: {actual_order}")
    test2_pass = False

# 테스트 3: 혼합 패턴
print("\n" + "="*70)
print("🧪 테스트 3: 혼합 패턴")
print("="*70)

files_mixed = [
    ('image', Path('image_03.jpg')),
    ('image', Path('scene_04.jpg')),
    ('video', Path('video_01.mp4')),
    ('video', Path('clip_02.mp4'))
]

print("\n정렬 전:")
for media_type, filepath in files_mixed:
    print(f"  {filepath.name} ({media_type})")

# 정렬
files_mixed.sort(key=lambda f: (
    extract_sequence_unified(f)[0] is None,
    extract_sequence_unified(f)[0] if extract_sequence_unified(f)[0] is not None else 0,
    extract_sequence_unified(f)[1]
))

print("\n정렬 후:")
for idx, (media_type, filepath) in enumerate(files_mixed, start=1):
    seq = extract_sequence_unified((media_type, filepath))[0]
    icon = "🎬" if media_type == "video" else "🖼️"
    print(f"  씬 {idx}: {icon} {filepath.name} (시퀀스: {seq})")

# 검증
expected_order = ['video_01.mp4', 'clip_02.mp4', 'image_03.jpg', 'scene_04.jpg']
actual_order = [filepath.name for _, filepath in files_mixed]

if actual_order == expected_order:
    print(f"\n✅ 테스트 3 통과: 시퀀스 번호 순서대로 정렬!")
    test3_pass = True
else:
    print(f"\n❌ 테스트 3 실패!")
    print(f"  예상: {expected_order}")
    print(f"  실제: {actual_order}")
    test3_pass = False

# 결과 요약
print("\n" + "="*70)
print("📊 테스트 결과")
print("="*70)

total = 3
passed = sum([test1_pass, test2_pass, test3_pass])
failed = total - passed

print(f"총 테스트: {total}")
print(f"통과: {passed}")
print(f"실패: {failed}")

if failed == 0:
    print("\n✅ 모든 테스트 통과!")
    print("\n📌 핵심: 백엔드 정렬 로직은 정상 작동")
    print("   - 이미지를 먼저 추가하고 비디오를 나중에 추가해도")
    print("   - 정렬 후에는 시퀀스 번호 순서대로 배치됨")
    print("   - scene_1.mp4가 첫 번째 씬에 배치됨 ✅")
else:
    print(f"\n⚠️  {failed}개 테스트 실패")
    exit(1)
