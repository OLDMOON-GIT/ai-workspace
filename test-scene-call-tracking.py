#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
이미지 크롤러 씬 호출 추적 테스트
첫 번째 씬이 연속으로 호출되는지 확인
"""

import json
import sys
import io

# Windows UTF-8 출력 지원
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# story.json 파일 읽기
story_path = r"C:\Users\oldmoon\workspace\trend-video-backend\input\project_0b47a3cc-da7c-4b6b-9ca8-ebb411f7e88d\story.json"

try:
    with open(story_path, 'r', encoding='utf-8') as f:
        story = json.load(f)
except Exception as e:
    print(f"Error reading file: {e}")
    sys.exit(1)

print("=" * 80)
print("[TEST] 씬 호출 추적 분석")
print("=" * 80)

scenes = story.get('scenes', [])
print(f"\n전체 씬: {len(scenes)}개")

# 시뮬레이션: 이미지 크롤러의 루프 로직
print("\n" + "=" * 80)
print("시뮬레이션: 루프 실행 (재시도 로직 포함)")
print("=" * 80)

call_log = []  # 호출 기록

for i in range(len(scenes)):
    scene = scenes[i]
    scene_number = scene.get('scene_number') or scene.get('scene_id') or f"scene_{str(i).zfill(2)}"

    print(f"\n{'='*80}")
    print(f"🔄 씬 처리 시작: 인덱스 {i}/{len(scenes)-1}")
    print(f"   scene_id: {scene.get('scene_id')}")
    print(f"   scene_number: {scene_number}")
    print(f"{'='*80}")

    # 프롬프트 확인
    prompt_source = None
    if scene.get('image_prompt'):
        prompt = scene.get('image_prompt')
        prompt_source = 'image_prompt'
    elif scene.get('sora_prompt'):
        prompt = scene.get('sora_prompt')
        prompt_source = 'sora_prompt'
    else:
        prompt = ''
        prompt_source = None

    if not prompt:
        print(f"⏭️ {scene_number} - 프롬프트 없음")
        continue

    print(f"\n🔍 {scene_number} 프롬프트 확인:")
    print(f"   📍 출처: {prompt_source}")
    print(f"   첫 100자: {prompt[:100]}...")

    # 재시도 루프 시뮬레이션
    max_retries = 3

    for attempt in range(max_retries):
        print(f"\n{'-'*80}")
        print(f"📌 {scene_number} 입력 중 (시도 {attempt + 1}/{max_retries})...")
        print(f"{'-'*80}")

        # 호출 기록
        call_log.append({
            'scene_index': i,
            'scene_id': scene.get('scene_id'),
            'attempt': attempt + 1
        })

        # 시뮬레이션: 첫 시도는 실패, 두 번째부터 성공
        if attempt < 1:  # 첫 시도 실패 가정
            print(f"   결과: ❌ 실패 (시뮬레이션)")
            if attempt < max_retries - 1:
                print(f"   {max_retries - attempt - 1}회 재시도 남음")
                continue
            else:
                print(f"   ❌ 최대 재시도 횟수 초과, 다음 씬으로 이동")
                break
        else:
            print(f"   결과: ✅ 성공 (시뮬레이션)")
            break

    print(f"\n✅ {scene_number} 처리 완료")

print("\n" + "=" * 80)
print("호출 기록 분석")
print("=" * 80)

# 호출 기록 분석
scene_call_counts = {}
for call in call_log:
    scene_id = call['scene_id']
    if scene_id not in scene_call_counts:
        scene_call_counts[scene_id] = 0
    scene_call_counts[scene_id] += 1

print("\n씬별 호출 횟수:")
for scene_id in sorted(scene_call_counts.keys()):
    count = scene_call_counts[scene_id]
    status = "✓" if count <= 3 else "❌"
    print(f"  {status} {scene_id}: {count}회")

print("\n호출 순서:")
for idx, call in enumerate(call_log):
    print(f"  {idx+1}. {call['scene_id']} (시도 {call['attempt']})")

# 문제 감지
print("\n" + "=" * 80)
print("문제 감지")
print("=" * 80)

if len(call_log) > len(scenes) * 3:
    print(f"\n⚠️ 예상 호출 수: {len(scenes)} 씬 × 최대 3회 = {len(scenes) * 3}회")
    print(f"   실제 호출 수: {len(call_log)}회")
    print(f"   ❌ 예상보다 많은 호출 발생!")
else:
    print(f"\n✓ 호출 수 정상: {len(call_log)}회 (예상: {len(scenes)} ~ {len(scenes) * 3}회)")

# 첫 번째 씬이 연속으로 호출되는지 확인
print("\nScene 00 호출 패턴:")
scene_00_calls = [idx for idx, call in enumerate(call_log) if call['scene_index'] == 0]
print(f"  호출 위치: {[idx+1 for idx in scene_00_calls]}")

if len(scene_00_calls) > 3:
    print(f"  ❌ Scene 00이 {len(scene_00_calls)}회 호출됨 (최대 3회 기대)")
elif len(scene_00_calls) <= 3:
    print(f"  ✓ Scene 00이 {len(scene_00_calls)}회 호출됨 (정상)")

# 씬 순서 확인
print("\n씬 순서 확인:")
scene_indices = [call['scene_index'] for call in call_log]
expected_order = []
for i in range(len(scenes)):
    for _ in range(3):  # 최대 3회 재시도
        expected_order.append(i)

is_sequential = True
prev_index = -1
for idx, scene_idx in enumerate(scene_indices):
    if scene_idx < prev_index:
        print(f"  ❌ 호출 #{idx+1}에서 순서 역전: {prev_index} → {scene_idx}")
        is_sequential = False
    elif scene_idx > prev_index + 1 and scene_idx != prev_index:
        # 같은 씬의 재시도는 괜찮음
        if scene_idx != prev_index:
            prev_index = scene_idx
    else:
        prev_index = scene_idx

if is_sequential:
    print(f"  ✓ 씬 순서가 올바릅니다 (0→1→2→...→{len(scenes)-1})")
else:
    print(f"  ❌ 씬 순서가 잘못되었습니다")

print("\n" + "=" * 80)
print("[테스트 완료]")
print("=" * 80)
