# 🎬 AutoShortsEditor - 웹 업로더 사용법

## 📌 개요

`web_uploader.py`는 story.json과 이미지들을 **드래그 앤 드롭**으로 한번에 업로드해서 자동으로 비디오를 생성하는 웹 인터페이스입니다.

## 🚀 빠른 시작

### 1. 필수 패키지 설치

```bash
pip install gradio>=4.0.0
```

또는 전체 requirements 설치:

```bash
pip install -r requirements.txt
```

### 2. 웹 서버 실행

```bash
python web_uploader.py
```

자동으로 브라우저가 열리며 `http://localhost:7860`으로 접속됩니다.

### 3. 파일 업로드 및 비디오 생성

1. **story.json** 파일 업로드
2. **이미지 파일들** 여러 개 선택 (Ctrl + 클릭 또는 드래그)
3. 옵션 설정:
   - **TTS 음성**: 원하는 한국어 음성 선택
   - **비디오 비율**: 세로(9:16) 또는 가로(16:9)
   - **자막 추가**: 체크하면 자막 오버레이
4. **"🎬 비디오 생성"** 버튼 클릭
5. 완료되면 비디오 미리보기 및 다운로드!

---

## 📁 파일 준비 방법

### story.json 형식

```json
{
  "title": "영상 제목",
  "scenes": [
    {
      "scene_number": 1,
      "title": "씬 1 제목",
      "narration": "씬 1 대본 내용...",
      "visual_description": "영어 이미지 프롬프트 (선택)"
    },
    {
      "scene_number": 2,
      "title": "씬 2 제목",
      "narration": "씬 2 대본 내용..."
    }
  ]
}
```

### 이미지 파일명 형식

권장 형식 (자동 정렬됨):
```
scene_01_image.png
scene_02_image.png
scene_03_image.png
...
scene_12_image.png
```

대체 형식도 지원 (숫자만 추출):
```
01.png
02.jpg
scene1.png
씬_01.png
```

**중요**: 파일명에 숫자가 포함되어 있으면 자동으로 순서대로 정렬됩니다!

---

## ⚙️ 옵션 설명

### TTS 음성 선택

| 음성 | 설명 | 특징 |
|------|------|------|
| `ko-KR-SoonBokNeural` | 순복 (여성) | 따뜻하고 감정적, 스토리텔링에 적합 |
| `ko-KR-SunHiNeural` | 선희 (여성) | 자연스럽고 부드러운 톤 |
| `ko-KR-InJoonNeural` | 인준 (남성) | 자연스럽고 신뢰감 있는 목소리 |
| `ko-KR-BongJinNeural` | 봉진 (남성) | 깊고 안정적인 목소리 |
| `ko-KR-GookMinNeural` | 국민 (남성) | 뉴스 앵커 스타일 |
| `ko-KR-JiMinNeural` | 지민 (여성) | 밝고 발랄한 톤 |

모든 음성은 **무료** Microsoft Edge TTS를 사용합니다.

### 비디오 비율

- **9:16** (세로): YouTube Shorts, Instagram Reels, TikTok
- **16:9** (가로): YouTube 일반 영상, TV

### 자막 추가

- **체크**: Edge TTS 타이밍 기반 자막 오버레이
- **비활성화**: 음성만 (자막 없음)

---

## 🎯 사용 예시

### 예시 1: 기본 사용

1. `story.json` 준비
2. 이미지 12개 준비 (`scene_01.png` ~ `scene_12.png`)
3. 웹 업로더에서 파일들 선택
4. "비디오 생성" 클릭
5. 약 5-10분 후 완성!

### 예시 2: 자막 포함 세로 영상

- **비율**: 9:16 선택
- **자막**: 체크
- **음성**: ko-KR-SoonBokNeural

→ YouTube Shorts용 자막 포함 영상 생성

### 예시 3: 이미지 부족 시

story.json에 12개 씬이 있는데 이미지가 8개만 있는 경우:
- 경고 메시지 표시
- 8개 씬까지만 비디오 생성
- 나머지 4개 씬은 스킵

---

## 🔧 문제 해결

### 1. "edge-tts 모듈을 찾을 수 없습니다"

```bash
pip install edge-tts>=6.1.0
```

### 2. "FFmpeg를 찾을 수 없습니다"

**Windows**:
```bash
pip install imageio-ffmpeg
```

또는 FFmpeg 수동 설치:
1. https://ffmpeg.org/download.html
2. 다운로드 후 PATH에 추가

**Linux/Mac**:
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# Mac
brew install ffmpeg
```

### 3. 비디오 순서가 이상함

이미지 파일명에 **숫자**가 포함되어 있는지 확인:
```
✅ scene_01.png, scene_02.png
✅ 01.png, 02.png
✅ image_1.jpg, image_2.jpg
❌ sceneA.png, sceneB.png (숫자 없음)
```

### 4. TTS 음성이 안나옴

1. 네트워크 연결 확인 (Edge TTS는 온라인 필요)
2. 로그 확인:
   ```bash
   cat logs/video_from_folder.log | grep TTS
   ```
3. Edge TTS 테스트:
   ```python
   import edge_tts
   import asyncio

   async def test():
       text = "테스트"
       voice = "ko-KR-SoonBokNeural"
       communicate = edge_tts.Communicate(text, voice)
       await communicate.save("test.mp3")

   asyncio.run(test())
   ```

### 5. 자막이 안보임

- **"자막 추가"** 체크박스 확인
- ASS 자막 생성 로그 확인
- 자막 색상이 배경과 비슷한 경우 (흰색 배경 + 흰색 자막)

### 6. 메모리 부족 에러

씬 개수가 많을 때 발생 가능:
- 씬을 나눠서 처리 (예: 1-6씬, 7-12씬)
- 이미지 해상도 줄이기 (4K → 1080p)

---

## 📊 성능 정보

### 처리 시간 (예상)

| 씬 개수 | GPU 있음 | GPU 없음 |
|---------|----------|----------|
| 6씬 | 2-3분 | 5-8분 |
| 12씬 | 5-8분 | 10-15분 |
| 24씬 | 10-15분 | 20-30분 |

### 씬당 작업 시간

1. TTS 생성: 5-10초
2. 이미지+오디오 결합: 10-20초
3. 자막 추가 (옵션): +5초
4. 최종 병합: 10-30초

---

## 🆚 CLI vs 웹 업로더 비교

| 기능 | CLI (`create_video_from_folder.py`) | 웹 업로더 (`web_uploader.py`) |
|------|-------------------------------------|-------------------------------|
| 파일 업로드 | 폴더 경로 입력 | 드래그 앤 드롭 |
| 사용 난이도 | 중급 | 초보자 |
| 다중 파일 선택 | 폴더에 미리 배치 | 한번에 선택 |
| 미리보기 | ❌ | ✅ |
| 다운로드 | 파일 경로에서 직접 | 버튼 클릭 |
| 진행 상황 표시 | 터미널 로그 | 프로그레스 바 |
| 옵션 설정 | 명령줄 인자 | 웹 폼 |

**추천**:
- **웹 업로더**: 빠르게 테스트하거나 비개발자가 사용할 때
- **CLI**: 자동화 스크립트나 배치 처리할 때

---

## 🚀 고급 기능

### 1. 다른 포트에서 실행

`web_uploader.py` 수정:

```python
app.launch(
    server_name="0.0.0.0",
    server_port=8080,  # 원하는 포트
    share=False,
    inbrowser=True
)
```

### 2. 외부 접속 허용 (Gradio Share)

```python
app.launch(
    server_name="0.0.0.0",
    server_port=7860,
    share=True,  # 공개 URL 생성
    inbrowser=True
)
```

**경고**: `share=True`는 72시간 유효한 공개 URL을 생성합니다. 보안에 주의하세요!

### 3. 인증 추가

```python
app.launch(
    server_name="0.0.0.0",
    server_port=7860,
    auth=("admin", "password123"),  # ID/PW 인증
    inbrowser=True
)
```

---

## 📝 출력 구조

```
output/web_uploads/
  ├── 영상제목1.mp4
  ├── 영상제목2.mp4
  └── ...

logs/
  └── video_from_folder.log  # 상세 로그
```

---

## 🔗 관련 스크립트

- `create_video_from_folder.py`: CLI 버전 (폴더 기반)
- `combine_only.py`: 기존 씬 비디오들만 병합
- `sequential_generator.py`: 순차적 스토리 생성

---

## 💡 팁 & 트릭

### 1. 이미지 품질 최적화

- **권장 해상도**:
  - 9:16: 1080x1920 (세로)
  - 16:9: 1920x1080 (가로)
- **포맷**: PNG, JPG, WEBP 모두 지원
- **파일 크기**: 5MB 이하 권장

### 2. TTS 대본 작성 팁

```json
{
  "narration": "안녕하세요. [일시정지 2초] 오늘은 특별한 이야기를 들려드릴게요."
}
```

- `[일시정지 N초]`: N초 침묵
- `[무음 N초]`: N초 무음
- 문장 부호 (`.`, `!`, `?`)로 자막 분할

### 3. 배치 처리

여러 스토리를 한번에 처리하려면:

```python
import os
from pathlib import Path

stories = ["스토리1", "스토리2", "스토리3"]

for story in stories:
    os.system(f'python web_uploader.py --folder "input/{story}"')
```

---

## ❓ FAQ

**Q: 웹 업로더와 CLI 중 뭐가 더 빠른가요?**
A: 동일합니다. 내부적으로 같은 `VideoFromFolderCreator` 클래스를 사용합니다.

**Q: 자막 폰트를 바꿀 수 있나요?**
A: `create_video_from_folder.py`의 `_create_srt_with_timings()` 함수에서 ASS 스타일을 수정하면 됩니다.

**Q: DALL-E나 Google Image Search도 웹에서 사용 가능한가요?**
A: 현재는 이미지 업로드만 지원합니다. 향후 버전에서 추가 예정입니다.

**Q: GPU가 없으면 얼마나 느린가요?**
A: CPU 인코딩은 약 2-3배 느립니다. FFmpeg가 자동으로 CPU로 폴백합니다.

**Q: 최대 몇 씬까지 가능한가요?**
A: 메모리가 충분하면 제한 없습니다. 실제로 100씬 이상도 테스트 완료했습니다.

---

## 📞 문의 및 지원

문제가 있거나 기능 요청이 있다면:

1. **로그 확인**: `logs/video_from_folder.log`
2. **GitHub Issues**: 프로젝트 저장소에서 이슈 등록
3. **디버그 모드**: 터미널에서 직접 실행해서 에러 메시지 확인

---

**즐거운 비디오 제작 되세요! 🎬✨**
