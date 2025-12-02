# Workspace Docs Index
워크스페이스의 모든 MD를 카테고리별로 재정리했습니다.

## 카테고리 개요
- `md/workspace/specs/` : 자동화/큐/아키텍처/흐름/타입 스펙
- `md/workspace/guides/` : 개발·운영 가이드, 핵심 기능/스토리 가이드
- `md/workspace/tests/` : 테스트 계획·체크리스트·보고서
- `md/workspace/fixes/` : 버그/로그/비율/Whisk 관련 수정 이력
- `md/workspace/ops/` : 운영/청소/정책/보고서/유튜브 흐름
- `md/workspace/archive/` : 백업본
- 프론트엔드 전체: `md/frontend/...`
- 백엔드 전체: `md/backend/...`

## 워크스페이스 공통
### Specs (`md/workspace/specs`)
- 자동화/흐름: `AUTOMATION_GUIDE.md`, `AUTOMATION_PIPELINE_FIX.md`, `AUTOMATION_PRODUCT_FLOW.md`, `AUTO_TITLE_PRODUCT_SPEC.md`, `COMPLETE_AUTO_GUIDE.md`
- 큐/스케줄: `QUEUE_SYSTEM_DEVELOPER_GUIDE.md`, `PROCESS_STATE_TRACKING.md`, `PAUSE_LOGIC_SUMMARY.md`, `TASK_QUEUE_FLOW.md`, `AUTOMATION_QUEUE_SPEC.md`, `QUEUE_PROCESSING_SPEC.md`
- 상품/스토리/타입: `PRODUCT_AUTOMATION_PROCESS.md`, `PRODUCT_CATEGORY_AUTOMATION_SPEC.md`, `PRODUCT_INFO_FLOW.md`, `SCRIPT_VIDEO_PRODUCTION_SPEC.md`, `SHORTFORM_AUTO_GENERATION.md`, `SORA2_STORY_GUIDE.md`, `TYPE_SYSTEM_GUIDE.md`, `STABLE_FEATURES.md`
- 아키텍처/통합: `ARCHITECTURE_AUTO_UPDATE.md`, `ARCHITECTURE_SYNC_STATUS.md`, `CHANNEL_SCHEDULE_SPEC.md`, `ID_UNIFICATION_SPEC.md`

### Guides (`md/workspace/guides`)
- 개발: `DEVELOPMENT_GUIDE.md` (링크 갱신), `FRONTEND_GUIDE.md`, `BACKEND_GUIDE.md`
- 기능/스토리: `LONGFORM_STORY_GUIDE.md`, `SHORTFORM_STORY_GUIDE.md`, `UI_GUIDE.md`, `CRITICAL_FEATURES.md`
- 기타: `CLAUDE.md`, `GOOGLE_IMAGE_POLICY_GUIDE.md`, `LAPTOP-LID-CLOSE-GUIDE.md`, `youtube-token-best-practices.md`

### Tests (`md/workspace/tests`)
- 계획/체크: `INTEGRATION_TEST_PLAN.md`, `INTEGRATION_TEST_SUMMARY.md`, `REGRESSION_TEST_CHECKLIST.md`
- 보고/자료: `TEST_GUIDE.md`, `ERD_TABLE_TEST_REPORT.md`, `AUTOMATION_TEST_GUIDE.md`, `TEST_ASPECT_RATIO_FIX.md`, `test-shortform-5scenes-final.md`, `test-shortform-5scenes-manual.md`

### Fixes (`md/workspace/fixes`)
- 로그: `LOG_PATTERN_GUIDE.md`, `LOG_APPEND_FIX_SOLUTION.md`, `LOG_FIX_COMPLETE.md`
- 비율/큐/Whisk: `ASPECT_RATIO_FIX_COMPLETE.md`, `RATIO_SELECTION_FIX.md`, `QUEUE_FIX_SUMMARY.md`, `WHISK_ERROR_FIX.md`, `WHISK_IMAGE_ACCUMULATION_FIX.md`, `IMAGE_CRAWLER_SCENE_BUG_FIX.md`

### Ops (`md/workspace/ops`)
- 운영/청소: `CLEANUP_README.md`, `CLEANUP_STRATEGY.md`, `COMPLETION_SUMMARY.md`
- 분석/보고: `context-menu-analysis-report.md`, `CONVERSION_REPORT.md`, `IMAGE_CRAWLER_DEBUG_GUIDE.md`, `OCR_POLICY_DETECTION.md`
- 유튜브/제목: `TITLE_POOL_GUIDE.md`, `STORY_GENERATION_COMPLETE.md`, `YOUTUBE_AUTOMATION_TRAINING.md`, `YOUTUBE_PRIVACY_TEST_REPORT.md`
- 기타: `QUICK_START_GUIDE.md`, `SCENE_INTEGRATION_TEST_GUIDE.md`, `UNUSED_FILES_LIST.md`

### Archive (`md/workspace/archive`)
- `DEVELOPMENT_GUIDE.backup.md`

## 프론트엔드 (`md/frontend`)
- 통합: `md/workspace/guides/FRONTEND_GUIDE.md`
- 주요 원본: `md/frontend/README.md`, `docs/ARCHITECTURE_OVERVIEW.md`, `docs/DATABASE_ERD.md`, `docs/SEQUENCE_DIAGRAMS.md`, `docs/JSON_PARSING_GUIDE.md`, `md/TABLE_RELATIONS.md`
- 도메인/배포: `COUPANG_*.md`, `WORDPRESS_*.md`, `VERCEL_DEPLOYMENT_GUIDE.md`
- 리팩터/테스트: `REFACTORING_GUIDE.md`, `REGRESSION_TESTS*.md`, `TEST_COVERAGE_DASHBOARD.md`, `SORTING_TEST_REPORT.md`, `src/tests/IMAGE_CRAWLER_TEST_GUIDE.md`
- 한글 안내: `기능목록.md`, `개발가이드.md`, `MAINTENANCE.md`, `sql/README.md`

## 백엔드 (`md/backend`)
- 통합: `md/workspace/guides/BACKEND_GUIDE.md`
- 주요 원본: `README.md`, `spec/QUICK_START.md`
- AI Aggregator: `spec/AI_AGGREGATOR_GUIDE.md`, `src/ai_aggregator/PROMPTS_README.md`
- 음성/TTS: `spec/TTS_SETUP_GUIDE.md`
- 유튜브 업로드: `spec/YOUTUBE_SETUP.md`
- 이미지 크롤러: `src/image_crawler/CHANGELOG.md`, `CURRENT_STATUS.md`, `QUICK_FIX.md`, `backup/image_crawler_requirements.md`
- 기타: `tests/README.md`, `config/README.md`
