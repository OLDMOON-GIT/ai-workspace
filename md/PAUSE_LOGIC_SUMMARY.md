# Pause (쉼) Logic for Commas and Periods in TTS Processing

## Overview
The codebase implements pause/silence logic for narration TTS in two main ways:
1. **Natural pauses** - Automatic insertion of line breaks after punctuation marks
2. **SSML breaks** - Addition of SSML `<break>` tags for specific punctuation in narrator.py

---

## 1. NATURAL PAUSES (create_video_from_folder.py)

### Method: `_add_natural_pauses()`
**Location**: `C:\Users\oldmoon\workspace\trend-video-backend\create_video_from_folder.py:846-876`

This method adds newlines after punctuation marks to create natural pauses in TTS.

### Implementation Details

```python
def _add_natural_pauses(self, text: str) -> str:
    """구두점 뒤에 줄바꿈을 추가하여 자연스러운 쉼 효과"""
    import re

    # 먼저 연속된 구두점 조합 처리 (중복 줄바꿈 방지)
    # ." → ."\n (한 번만)
    text = text.replace('."', '."\n')
    # ?" → ?"\n (한 번만)
    text = text.replace('?"', '?"\n')
    # !" → !"\n (한 번만)
    text = text.replace('!"', '!"\n')

    # ... 뒤에 줄바꿈 추가 (가장 긴 쉼)
    text = text.replace('...', '...\n')

    # 남은 " 뒤에 줄바꿈 추가 (이미 처리된 것은 제외)
    text = re.sub(r'"(?!\n)', '"\n', text)

    # ? 뒤에 줄바꿈 추가 (이미 처리된 것은 제외)
    text = re.sub(r'\?(?!\n)', '?\n', text)

    # ! 뒤에 줄바꿈 추가 (이미 처리된 것은 제외)
    text = re.sub(r'!(?!\n)', '!\n', text)

    # , 뒤에 줄바꿈 추가 (짧은 쉼)
    text = text.replace(',', ',\n')

    # . 뒤에 줄바꿈 추가 (단, 숫자 뒤나 이미 처리된 것은 제외)
    text = re.sub(r'\.(?!\d)(?!\n)', '.\n', text)

    return text
```

### Pause Hierarchy (Duration)
From longest to shortest pause:
1. **`...`** (ellipsis) → 3 newlines = longest pause
2. **`.`** (period) → 1 newline = long pause
3. **`?`** (question mark) → 1 newline = long pause  
4. **`!`** (exclamation) → 1 newline = long pause
5. **`,`** (comma) → 1 newline = short pause

### How It Works
- **Newlines act as pause markers** in Edge TTS - Edge TTS interprets newlines as natural pause points
- **Edge TTS voice rate**: Set to `-15%` (15% slower) to make pauses more natural
- **Text preprocessing**: Applied in `_generate_tts()` method at line 890

### Usage in TTS Generation
```python
async def _generate_tts(self, text: str, output_path: Path) -> tuple:
    """Edge TTS로 음성 생성 + 단어별 타임스탬프 추출"""
    # 텍스트 정리
    clean_text = self._clean_narration(text)
    
    # 구두점에 쉼표 추가 (자연스러운 쉼표 효과)
    tts_text = self._add_natural_pauses(clean_text)  # LINE 890
    
    # Edge TTS로 생성하면서 타임스탬프 수집
    # rate: -15%로 설정하여 약간 천천히 말하게 함
    communicate = edge_tts.Communicate(tts_text, self.voice, rate='-15%')
```

---

## 2. SSML BREAKS (narrator.py)

### Method: `_add_emotion_tags()`
**Location**: `C:\Users\oldmoon\workspace\trend-video-backend\src\video_generator\narrator.py:738-796`

This method adds SSML `<break>` tags to text for periods, exclamation marks, and question marks.

### Implementation Details

```python
def _add_emotion_tags(self, text: str, enable_emotion: bool = True) -> str:
    """
    Add SSML emotion tags to text based on punctuation and keywords.
    """
    # ... [emotion keyword detection code] ...
    
    # 느린 장면 전환에 약간의 pause 추가
    result_text = ''.join(result)
    result_text = result_text.replace('.\n', '.<break time="300ms"/>\n')
    result_text = result_text.replace('!\n', '!<break time="400ms"/>\n')
    result_text = result_text.replace('?\n', '?<break time="350ms"/>\n')
    
    return result_text
```

### SSML Break Durations
- **Period (`.`)**: 300ms pause
- **Exclamation (`!`)**: 400ms pause (slightly longer for emphasis)
- **Question (`?`)**: 350ms pause (medium duration)

### When Applied
- Applied when `TTS_ENABLE_EMOTION` environment variable is set to "true" (default)
- Used in the `generate_speech()` method after cleaning script text
- Works with Edge TTS and other SSML-compatible TTS systems

---

## 3. CONTROL COMMANDS (narrator.py)

### Method: `_process_control_commands()`
**Location**: `C:\Users\oldmoon\workspace\trend-video-backend\src\video_generator\narrator.py:1007-1058`

Processes explicit pause commands in narration text.

### Supported Commands
- **`[무음 N초]`** - Silence/mute for N seconds (default: 2 seconds)
- **`[침묵 N초]`** - Silence for N seconds (default: 3 seconds)
- **`[pause N초]`** - Pause for N seconds (default: 2 seconds)

### Example
```
"이것은 [무음 1.5초] 정말 좋은 예시입니다."
```

---

## Current Implementation Status

### In use (create_video_from_folder.py)
- `_add_natural_pauses()` - ACTIVELY USED for comma/period pause handling

### In use (narrator.py)
- `_add_emotion_tags()` - SSML breaks for periods/exclamation/question
- `_process_control_commands()` - Explicit pause commands

### NOT CURRENTLY USED in long_form_creator.py
- The `_add_natural_pauses()` method is defined in `create_video_from_folder.py`
- The `long_form_creator.py` calls `narrator.generate_speech()` which only applies:
  - `_clean_script_for_tts()`
  - `_add_emotion_tags()`
  - `_process_control_commands()`

---

## Recommendation: Apply Pauses in Long-Form TTS

To add comma/period pauses to long-form (scenes-based) TTS generation, you should:

1. **Option A**: Add `_add_natural_pauses()` to narrator.py and call it in `generate_speech()`
2. **Option B**: Call `_add_natural_pauses()` in long_form_creator's `_generate_scene_narration()` before passing to narrator

Example implementation (Option A):
```python
def generate_speech(self, script: str, output_path: Path, use_free_tts: bool = True) -> Path:
    # Clean
    script = self._clean_script_for_tts(script)
    
    # Add natural pauses (BEFORE emotion tags)
    script = self._add_natural_pauses(script)  # NEW LINE
    
    # Add emotion tags
    enable_emotion = os.getenv("TTS_ENABLE_EMOTION", "true").lower() == "true"
    script = self._add_emotion_tags(script, enable_emotion=enable_emotion)
    
    # Process control commands
    cleaned_script, pauses = self._process_control_commands(script)
    
    # ... rest of speech generation
```

---

## Related Files

- **Main pause logic**: `/trend-video-backend/create_video_from_folder.py` (lines 846-876)
- **SSML breaks**: `/trend-video-backend/src/video_generator/narrator.py` (lines 790-794)
- **Long-form TTS generation**: `/trend-video-backend/src/video_generator/long_form_creator.py` (lines 2310-2333)
- **TTS entry point**: `/trend-video-backend/src/video_generator/narrator.py` (lines 1060-1100)

