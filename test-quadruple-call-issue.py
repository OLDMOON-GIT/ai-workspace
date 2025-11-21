#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
씬이 4번씩 호출되는 문제 분석
input_prompt_to_whisk와 download_images 부분에서 문제 가능성
"""

import json
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

story_path = r"C:\Users\oldmoon\workspace\trend-video-backend\input\project_0b47a3cc-da7c-4b6b-9ca8-ebb411f7e88d\story.json"

try:
    with open(story_path, 'r', encoding='utf-8') as f:
        story = json.load(f)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

print("=" * 80)
print("[분석] 씬이 4번씩 호출되는 원인 찾기")
print("=" * 80)

scenes = story.get('scenes', [])
print(f"\n전체 씬: {len(scenes)}개")
print("예상: 각 씬당 1회 호출 = 8회 총 호출")
print("실제: 각 씬당 4회 호출 = 32회 총 호출")

print("\n" + "=" * 80)
print("가능성 1: 이미지 크롤러가 각 씬을 4번 처리")
print("=" * 80)

call_log = []

for i in range(len(scenes)):
    scene = scenes[i]
    scene_id = scene.get('scene_id')

    print(f"\n씬 {i} ({scene_id})")

    # 시나리오: 각 씬마다 4번씩 input_prompt_to_whisk 호출
    # 왜 4번?
    # - 1회: 첫 시도
    # - 2회: 정책 위반 - 재시도
    # - 3회: 정책 위반 - 재시도
    # - 4회: 정책 위반 - 재시도 (또는 다른 이유)

    # OR
    # download_images 함수에서 같은 이미지를 여러 번 저장?

    for attempt in range(4):
        print(f"  호출 #{len(call_log)+1}: 시도 {attempt + 1}")
        call_log.append({
            'scene_index': i,
            'scene_id': scene_id,
            'attempt': attempt + 1
        })

print("\n" + "=" * 80)
print("호출 패턴 분석")
print("=" * 80)

scene_call_counts = {}
for call in call_log:
    scene_id = call['scene_id']
    if scene_id not in scene_call_counts:
        scene_call_counts[scene_id] = 0
    scene_call_counts[scene_id] += 1

print(f"\n총 호출 수: {len(call_log)}회")

print("\n씬별 호출 횟수:")
for scene_id in sorted(scene_call_counts.keys()):
    count = scene_call_counts[scene_id]
    print(f"  {scene_id}: {count}회")

print("\n" + "=" * 80)
print("가능성 분석")
print("=" * 80)

print("""
가능성 1: input_prompt_to_whisk가 여러 번 호출되는가?
-  라인 1495-1497: for attempt in range(max_retries) 루프
   - max_retries = 3이면 최대 3회
   - 하지만 success == True이면 break (라인 1531)
   - 정책 위반으로 계속 재시도되면 3회 모두 실행

가능성 2: download_images 함수에서 같은 이미지를 여러 번 처리하는가?
   - 라인 1111-?: download_images 함수
   - 이미지 목록을 여러 번 순회?
   - 또는 씬을 여러 번 순회?

가능성 3: API 엔드포인트에서 같은 body를 여러 번 처리하는가?
   - route.ts에서 같은 요청을 여러 번 처리?
   - 또는 브라우저 재시도?

가능성 4: 이미지 생성 대기 부분에서 문제?
   - 라인 1548-?: 이미지 생성 대기
   - Whisk 페이지에서 이미지를 4번 생성?
""")

print("\n" + "=" * 80)
print("확인 사항")
print("=" * 80)

print("""
1. 실행 로그에서 '프롬프트 입력 함수 호출' 메시지가 몇 번 나타나는가?
   - 씬당 1회? 3회? 4회?

2. 각 씬의 이미지 파일이 몇 개 생성되는가?
   - scene_00_bomb.jpeg 1개인가?
   - 아니면 scene_00_bomb_01.jpeg, scene_00_bomb_02.jpeg 등으로 여러 개?

3. 이미지 다운로드 부분에서 scene 매개변수가 어떻게 사용되는가?
   - download_images(driver, images, output_folder, scenes)
   - scenes 매개변수가 사용되는가?
""")
