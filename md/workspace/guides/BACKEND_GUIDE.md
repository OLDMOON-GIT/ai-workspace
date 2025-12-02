# Backend 통합 가이드 (Trend Video Backend)

비디오 생성/머지, AI 멀티 에이전트, 크롤러/업로드 등 백엔드 문서를 한 곳에서 볼 수 있도록 정리했습니다.

## 목차
- [빠른 시작](#빠른-시작)
- [주요 기능 요약](#주요-기능-요약)
- [상세 가이드/스펙](#상세-가이드스펙)
- [테스트/유틸](#테스트유틸)

## 빠른 시작
1) 의존성 설치
```
cd trend-video-backend
python -m venv venv
venv\Scripts\activate   # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```
2) 주요 스크립트 실행 예
- 멀티 AI 응답 수집: `python -m src.ai_aggregator.main -q "질문"` (Chrome 프로필 사용)
- 롱폼 비디오 생성: `python -m src.video_generator.long_form_creator <task_id>`
- 유튜브 업로드: `python -m src.youtube.youtube_upload_cli <task_id> <title> <privacy>`

## 주요 기능 요약
- **Video Generator/Merger**: JSON 스토리 + 이미지 + TTS로 16:9/9:16 비디오 생성·병합 (`src/video_generator`)
- **AI Aggregator**: ChatGPT/Claude/Gemini/Grok 동시 실행, 병렬 응답 수집 (`src/ai_aggregator`)
- **Image Crawler**: 이미지 수집/현황 및 퀵 픽스 (`src/image_crawler`)
- **YouTube Upload**: OAuth 기반 업로드 및 예약 게시 (`src/youtube`)

## 상세 가이드/스펙
- 백엔드 개요/폴더 구조: `md/backend/README.md`
- 빠른 시작/환경 설정: `md/backend/spec/QUICK_START.md`
- AI 멀티 에이전트 상세: `md/backend/spec/AI_AGGREGATOR_GUIDE.md`, `md/backend/src/ai_aggregator/PROMPTS_README.md`
- 음성/TTS 설정: `md/backend/spec/TTS_SETUP_GUIDE.md`
- 유튜브 업로드 설정: `md/backend/spec/YOUTUBE_SETUP.md`
- 이미지 크롤러 메모: `md/backend/src/image_crawler/CHANGELOG.md`, `md/backend/src/image_crawler/CURRENT_STATUS.md`, `md/backend/src/image_crawler/QUICK_FIX.md`
- 크롬 자동화 프로필/요구사항: `md/backend/backup/image_crawler_requirements.md`

## 테스트/유틸
- 테스트 가이드: `md/backend/tests/README.md`
- 환경/설정 README: `md/backend/config/README.md`
