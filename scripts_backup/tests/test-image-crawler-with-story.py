#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
이미지 크롤러 테스트 - 실제 story.json 사용
project_0b47a3cc-da7c-4b6b-9ca8-ebb411f7e88d의 story.json으로 테스트
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
print("[TEST] Image Crawler Analysis - story.json")
print("=" * 80)

print(f"\nFile loaded successfully")
print(f"   Title: {story.get('title', 'N/A')[:60]}...")
print(f"   Version: {story.get('version', 'N/A')}")

scenes = story.get('scenes', [])
print(f"\nScene Analysis: {len(scenes)} scenes found")

print("\n" + "=" * 80)
print("Prompt Field Check by Scene")
print("=" * 80)

for i, scene in enumerate(scenes):
    scene_id = scene.get('scene_id', f'scene_{i:02d}')
    scene_name = scene.get('scene_name', 'N/A')

    print(f"\nScene {i}: {scene_id}")
    print(f"   Name: {scene_name}")

    # Check prompt fields
    has_image_prompt = 'image_prompt' in scene
    has_sora_prompt = 'sora_prompt' in scene

    if has_image_prompt:
        prompt = scene['image_prompt']
        print(f"   [OK] image_prompt: {prompt[:70]}...")
        print(f"        Length: {len(prompt)} chars")
    elif has_sora_prompt:
        prompt = scene['sora_prompt']
        print(f"   [OK] sora_prompt: {prompt[:70]}...")
        print(f"        Length: {len(prompt)} chars")
    else:
        print(f"   [ERROR] No prompt (missing both image_prompt and sora_prompt)")

    # Check narration
    narration = scene.get('narration', '')
    if narration:
        print(f"   [OK] Narration: {len(narration)} chars")
    else:
        print(f"   [WARN] No narration")

# Summary
print("\n" + "=" * 80)
print("Test Summary")
print("=" * 80)

total_scenes = len(scenes)
scenes_with_prompts = 0
image_prompt_count = 0
sora_prompt_count = 0

for scene in scenes:
    if 'image_prompt' in scene or 'sora_prompt' in scene:
        scenes_with_prompts += 1
        if 'image_prompt' in scene:
            image_prompt_count += 1
        elif 'sora_prompt' in scene:
            sora_prompt_count += 1

print(f"\nTotal Scenes: {total_scenes}")
print(f"Scenes with prompts: {scenes_with_prompts}")
print(f"  - image_prompt: {image_prompt_count}")
print(f"  - sora_prompt: {sora_prompt_count}")

if scenes_with_prompts == total_scenes:
    print(f"\n[SUCCESS] All scenes have prompts!")
else:
    print(f"\n[WARN] {total_scenes - scenes_with_prompts} scenes missing prompts")

# Expected crawler output
print("\n" + "=" * 80)
print("Expected Image Crawler Output (Sample)")
print("=" * 80)

print("""
Sequence of scene processing (should be sequential 0->1->2->...->7):

================================================================================
Scene Processing Start: Index 0/7
   scene_id: scene_00_bomb
   scene_number: scene_00_bomb
================================================================================

Scene_00_bomb Prompt Check:
   Source: image_prompt  <- This story.json uses image_prompt
   First 100 chars: Photorealistic professional photograph, Korean dramatic scene...

Prompt Input Function Call: scene_00_bomb (Attempt 1/3)
   [input_prompt_to_whisk] Start
   is_first: True, prompt length: 347
   Result: [SUCCESS]
   [input_prompt_to_whisk] Complete (button found: True)

Wait 3 seconds before next scene...

================================================================================
Scene Processing Start: Index 1/7  <- Index should increment to 1
   scene_id: scene_01_main
   scene_number: scene_01_main
================================================================================

Scene_01_main Prompt Check:
   Source: image_prompt
   First 100 chars: Photorealistic professional photograph, Korean dramatic scene...

... (Scenes 2-7 continue) ...
""")

# Expected call sequence
print("\n" + "=" * 80)
print("Expected Call Sequence (Sequential Processing)")
print("=" * 80)
for i, scene in enumerate(scenes):
    scene_id = scene.get('scene_id')
    print(f"{i}. {scene_id}")

print("\n" + "=" * 80)
print("[TEST COMPLETE]")
print("=" * 80)
