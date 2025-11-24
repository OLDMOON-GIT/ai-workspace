#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
현실적인 시나리오: 정책 위반으로 인한 반복 호출
첫 번째 씬이 계속 정책 위반을 일으키는 경우
"""

import json
import sys
import io

# Windows UTF-8 출력 지원
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

story_path = r"C:\Users\oldmoon\workspace\trend-video-backend\input\project_0b47a3cc-da7c-4b6b-9ca8-ebb411f7e88d\story.json"

try:
    with open(story_path, 'r', encoding='utf-8') as f:
        story = json.load(f)
except Exception as e:
    print(f"Error reading file: {e}")
    sys.exit(1)

print("=" * 80)
print("[TEST] 현실적 시나리오: 정책 위반으로 인한 반복")
print("=" * 80)
print("\n시나리오: 씬 00이 정책 위반으로 계속 재시도되면?")
print("           (정책 위반 검사에서 true 반환)")

scenes = story.get('scenes', [])

call_log = []

for i in range(len(scenes)):
    scene = scenes[i]
    scene_number = scene.get('scene_number') or scene.get('scene_id') or f"scene_{str(i).zfill(2)}"

    print(f"\n{'='*80}")
    print(f"🔄 씬 처리 시작: 인덱스 {i}/{len(scenes)-1}")
    print(f"   scene_id: {scene.get('scene_id')}")
    print(f"{'='*80}")

    prompt_source = None
    if scene.get('image_prompt'):
        prompt = scene.get('image_prompt')
        prompt_source = 'image_prompt'
    elif scene.get('sora_prompt'):
        prompt = scene.get('sora_prompt')
        prompt_source = 'sora_prompt'
    else:
        continue

    print(f"📍 출처: {prompt_source}")

    max_retries = 3

    for attempt in range(max_retries):
        print(f"\n📌 {scene_number} 입력 중 (시도 {attempt + 1}/{max_retries})...")

        # 호출 기록
        call_log.append({
            'scene_index': i,
            'scene_id': scene.get('scene_id'),
            'attempt': attempt + 1
        })

        # 🔴 현실적 시나리오: 씬 0은 항상 정책 위반
        if i == 0:
            print(f"   입력 성공")
            print(f"🔍 정책 위반 여부 확인 중...")
            print(f"⚠️ Google 정책 위반 감지!")
            print(f"   매칭 키워드: ['elderly', 'dramatic']")

            if attempt < max_retries - 1:
                print(f"🔄 프롬프트를 수정하여 재시도합니다...")
                continue
            else:
                print(f"   ❌ 최대 재시도 횟수 초과, 다음 씬으로 이동")
                break
        else:
            # 씬 1부터는 성공
            print(f"   입력 성공")
            print(f"🔍 정책 위반 여부 확인 중...")
            print(f"✅ 정책 위반 없음")
            break

    print(f"✅ {scene_number} 처리 완료")

print("\n" + "=" * 80)
print("호출 기록 분석")
print("=" * 80)

scene_call_counts = {}
for call in call_log:
    scene_id = call['scene_id']
    if scene_id not in scene_call_counts:
        scene_call_counts[scene_id] = 0
    scene_call_counts[scene_id] += 1

print("\n씬별 호출 횟수:")
for scene_id in sorted(scene_call_counts.keys()):
    count = scene_call_counts[scene_id]
    status = "❌" if scene_id == 'scene_00_bomb' and count > 3 else "✓"
    print(f"  {status} {scene_id}: {count}회")

print("\n호출 순서 (처음 10개만):")
for idx, call in enumerate(call_log[:10]):
    print(f"  {idx+1}. {call['scene_id']} (시도 {call['attempt']})")

if len(call_log) > 10:
    print(f"  ... (총 {len(call_log)}회)")

# 문제 분석
scene_00_count = scene_call_counts.get('scene_00_bomb', 0)

print("\n" + "=" * 80)
print("문제 분석")
print("=" * 80)

if scene_00_count > 3:
    print(f"\n⚠️ 씬 00이 {scene_00_count}회 호출됨!")
    print(f"   원인: 정책 위반으로 인한 무한 재시도 (3회 초과 후에도 진행 가능성)")
else:
    print(f"\n✓ 씬 00이 {scene_00_count}회 호출됨 (정상)")

print("\n" + "=" * 80)
print("[테스트 완료]")
print("=" * 80)
