# 통합테스트 계획

## 현재 존재하는 테스트

### Frontend (trend-video-frontend/__tests__/)
**총 30개 테스트 파일 (87개 테스트 통과)**

#### API 테스트
- `__tests__\api\json-title-extraction.test.ts` - JSON 제목 추출 및 파일명 검증 (4개)
- `__tests__\api\scripts-cancel.test.ts` - 스크립트 생성 취소 기능
- `__tests__\api\scripts-generate.test.ts` - 스크립트 생성 API
- `__tests__\api\youtube-channels.test.ts` - YouTube 채널 관리

#### 통합 테스트 (Integration)
- `__tests__\integration\cancel-video-generation.regression.test.ts` - 영상 생성 취소 리그레션
- `__tests__\integration\load-more-pagination.regression.test.ts` - 페이지네이션 로드
- `__tests__\integration\product-info-placeholder.integration.test.ts` - 상품정보 플레이스홀더 통합
- `__tests__\integration\youtube-shorts-detection.regression.test.ts` - YouTube Shorts 감지
- `__tests__\integration\youtube-upload-cancel.regression.test.ts` - YouTube 업로드 취소

#### Admin 테스트
- `__tests__\admin\architecture.test.ts` - 아키텍처 페이지 (18개)
- `__tests__\admin\settings.test.ts` - 크레딧 설정 (18개)
- `__tests__\admin\users.test.ts` - 사용자 관리 (26개)

#### 기능 테스트
- `__tests__\aiModelSelection.test.ts` - AI 모델 선택 로직 (15개)
- `__tests__\auth\auth.test.ts` - 인증 시스템
- `__tests__\credits\credits.test.ts` - 크레딧 시스템
- `__tests__\database\erd-tables.test.ts` - 데이터베이스 ERD 검증
- `__tests__\lib\email.test.ts` - 이메일 발송
- `__tests__\lib\fetch-utils.test.ts` - Fetch 유틸리티
- `__tests__\lib\json-utils.test.ts` - JSON 유틸리티
- `__tests__\lib\session.test.ts` - 세션 관리
- `__tests__\scripts\scripts.test.ts` - 스크립트 관리
- `__tests__\shop\bookmark.test.ts` - 쇼핑몰 북마크
- `__tests__\youtube\multi-channel.test.ts` - 멀티 채널 관리

### Backend (trend-video-backend/tests/)
**총 56개 테스트 통과, 2개 스킵**

- `test_regression.py` - 롱폼/숏폼/SORA2 생성, TTS, 썸네일, 프로세스 제어 (3+2+3+2+2개)
- `test_api_security.py` - API 보안 테스트 (20개)
- `test_data_integrity.py` - 데이터 무결성 테스트 (24개)
- `test_scene_processing.py` - 씬 처리 로직 (32개: 정렬 6, 미디어 감지 4, Scene 구조 4, 길이 매칭 4, 혼합 처리 4, 엣지 케이스 5, 리그레션 5)

---

## 필요한 통합테스트 목록

### 1. 자동화 파이프라인 테스트 (Script → Video → Upload → Publish)

#### 1.1 대본 생성 파이프라인
- [ ] API: `/api/scripts/generate` - 제목 입력 → AI 대본 생성 → DB 저장
- [ ] 롱폼/숏폼/상품/SORA2 타입별 프롬프트 선택 검증
- [ ] AI 모델 선택 (ChatGPT/Gemini/Claude) → 올바른 agent 실행
- [ ] 크레딧 차감 확인 (contents 테이블 + user credits 감소)
- [ ] 에러 시 크레딧 환불 로직
- [ ] Python 프로세스 실행 및 로그 스트리밍
- [ ] 취소 기능 (.cancel 파일 생성 → Graceful shutdown)

#### 1.2 영상 생성 파이프라인
- [ ] API: `/api/generate-video-upload` - 이미지 업로드 → 영상 생성
  - 파일 정렬 (시퀀스 번호 → lastModified)
  - 썸네일 선택 (시퀀스 제일 앞 또는 오래된 것 1장)
  - TTS 음성 선택 전달
- [ ] Python 스크립트 실행: `convert_images_to_shorts.py` 또는 `create_video_from_folder.py`
- [ ] 씬 처리 로직 통합 (이미지+비디오 혼합)
  - 이미지만 → image-to-video 변환
  - 비디오만 → 오디오+자막 추가
  - 혼합 → 통합 파이프라인
- [ ] 자막 싱크 조정 (영상 길이 ≠ 자막 길이)
- [ ] 비디오 병합 (concat demuxer)
- [ ] SAR 필터 정규화 (setsar=1)

#### 1.3 YouTube 업로드 파이프라인
- [ ] OAuth 인증 상태 확인
- [ ] 멀티 채널 관리 (기본 채널 선택)
- [ ] 영상 업로드 (메타데이터, 썸네일, 공개 범위)
- [ ] 업로드 진행 상태 추적
- [ ] 업로드 취소 기능
- [ ] 에러 처리 (할당량 초과, 네트워크 오류)

#### 1.4 자동화 스케줄러 (AUTOMATION_GUIDE.md 참고)
- [ ] 제목 리스트 등록 → DB 저장 (video_titles)
- [ ] 스케줄 등록 (scheduled_time, youtube_publish_time)
- [ ] 스케줄러 시작/중지 (automation_settings.enabled)
- [ ] 파이프라인 자동 실행 (script → video → upload → publish)
- [ ] 각 단계별 상태 추적 (automation_pipelines)
- [ ] 실패 시 이메일 알림
- [ ] 로그 기록 (automation_logs)
- [ ] **재시도 로직 비활성화** (시스템 안정화 전까지)

---

### 2. API 엔드포인트 테스트

#### 2.1 인증 (Auth)
- [ ] `POST /api/auth/signup` - 회원가입 (이메일 검증, 비밀번호 강도, 중복 방지)
- [ ] `POST /api/auth/login` - 로그인 (자격 증명, 세션 쿠키, 인증 메일 확인)
- [ ] `POST /api/auth/logout` - 로그아웃 (세션 종료, 쿠키 삭제)
- [ ] `POST /api/auth/verify-email` - 이메일 인증 (토큰 검증, 만료 처리)
- [ ] `GET /api/auth/session` - 세션 확인 (httpOnly 쿠키)

#### 2.2 크레딧 (Credits)
- [ ] `GET /api/credits` - 크레딧 조회 (잔액, 사용 내역)
- [ ] `POST /api/credits/request` - 충전 요청 (입금자명 필수)
- [ ] 크레딧 차감 로직 (대본/영상 생성 시)
- [ ] 잔액 부족 시 거부
- [ ] Admin: 충전 요청 승인/거부 (`/api/admin/charge-requests`)

#### 2.3 대본 (Scripts)
- [ ] `POST /api/scripts/generate` - 대본 생성 (제목, 타입, AI 모델)
- [ ] `GET /api/my-scripts` - 대본 목록 (사용자별 필터링, 페이지네이션)
- [ ] `GET /api/scripts/[id]` - 대본 상세 (JSON 파싱, productInfo 전달)
- [ ] `POST /api/scripts/[id]/cancel` - 대본 생성 취소
- [ ] `POST /api/restart-script` - 대본 재생성
- [ ] 포맷 변환 (롱폼 ↔ 숏폼 ↔ SORA2 ↔ 상품)

#### 2.4 영상 (Videos)
- [ ] `POST /api/generate-video-upload` - 영상 생성 (이미지 업로드, 파일 정렬)
- [ ] `POST /api/generate-video` - 씬 폴더 기반 영상 생성
- [ ] `POST /api/video-merge` - 비디오 병합
- [ ] `GET /api/my-videos` - 영상 목록
- [ ] `GET /api/jobs/[id]` - 영상 상세 및 상태
- [ ] `POST /api/jobs/[id]/convert-to-shorts` - 쇼츠 변환
- [ ] `POST /api/restart-video` - 영상 재생성 (input/output/uploads 폴더)
- [ ] `GET /api/download-video` - 영상 다운로드

#### 2.5 YouTube
- [ ] `GET /api/youtube/auth` - OAuth URL 생성
- [ ] `GET /api/youtube/callback` - OAuth 콜백 처리
- [ ] `POST /api/youtube/upload` - 영상 업로드
- [ ] `GET /api/youtube/channels` - 채널 목록
- [ ] `POST /api/youtube/channels/default` - 기본 채널 설정

#### 2.6 콘텐츠 통합 (My Content)
- [ ] `GET /api/my-content` - 대본+영상 통합 조회
- [ ] 상태별 필터링 (PENDING/PROCESSING/COMPLETED/FAILED)
- [ ] 검색 기능
- [ ] 폴더별 정리

#### 2.7 Admin
- [ ] `GET /api/admin/users` - 사용자 목록
- [ ] `POST /api/admin/credits` - 크레딧 부여/차감
- [ ] `GET /api/admin/user-logs` - 사용자 활동 로그
- [ ] `GET/POST/PATCH /api/admin/prompts` - 프롬프트 관리 (롱폼/숏폼/SORA2)
- [ ] `GET /api/admin/architecture` - 아키텍처 자동 업데이트
- [ ] `POST /api/backup` - DB 백업 생성/복원

#### 2.8 자동화 (Automation)
- [ ] `GET/POST/PATCH/DELETE /api/automation/titles` - 제목 관리
- [ ] `GET/POST/PATCH/DELETE /api/automation/schedules` - 스케줄 관리
- [ ] `GET/POST /api/automation/scheduler` - 스케줄러 제어 (start/stop)
- [ ] `GET /api/automation/logs` - 자동화 로그
- [ ] `POST /api/automation/force-execute` - 수동 실행
- [ ] `POST /api/automation/cleanup` - 완료된 작업 정리

---

### 3. 데이터베이스 CRUD 테스트

#### 3.1 Contents 테이블
- [ ] INSERT: 대본/영상 생성 시 데이터 저장
- [ ] SELECT: 사용자별 콘텐츠 조회 (필터링, 정렬)
- [ ] UPDATE: 상태 변경 (PENDING → PROCESSING → COMPLETED)
- [ ] DELETE: 콘텐츠 삭제 (CASCADE로 로그도 삭제)
- [ ] 필수 컬럼 존재 확인 (product_info, tts_voice)

#### 3.2 Jobs 테이블
- [ ] 영상 생성 작업 생성
- [ ] PID 저장 및 프로세스 추적
- [ ] 상태 업데이트 (running → completed/failed)
- [ ] tts_voice 컬럼 저장

#### 3.3 Content_logs 테이블
- [ ] 로그 추가 (content_id FK 검증)
- [ ] 로그 조회 (시간순 정렬)
- [ ] CASCADE 삭제 (content 삭제 시 로그도 삭제)

#### 3.4 Users 테이블
- [ ] 사용자 생성 (비밀번호 해싱)
- [ ] 이메일 인증 상태 업데이트
- [ ] 크레딧 잔액 관리 (증감)

#### 3.5 Automation 테이블
- [ ] video_titles: 제목 CRUD
- [ ] video_schedules: 스케줄 CRUD, 상태 관리
- [ ] automation_pipelines: 파이프라인 단계별 기록
- [ ] automation_logs: 로그 저장 (pipeline_id FK)
- [ ] automation_settings: 설정 값 저장/조회

---

### 4. 외부 서비스 통합 테스트

#### 4.1 AI 모델 (trend-video-backend/src/ai_aggregator/)
- [ ] **Claude Agent** (Selenium 기반)
  - 브라우저 자동화 로그인
  - 프롬프트 전송 및 응답 파싱
  - 타임아웃 처리
  - URL: `https://claude.ai/`
- [ ] **ChatGPT Agent** (Selenium 기반)
  - 로그인 및 대본 요청
  - 응답 스트리밍
  - URL: `https://chatgpt.com/` (⚠️ 오래된 URL 금지)
- [ ] **Gemini Agent** (API 기반)
  - API 호출 및 응답 파싱
  - Rate limiting 처리
- [ ] **Aggregator** (멀티 AI 병렬 처리)
  - 여러 AI 동시 요청
  - 결과 취합 및 최적 응답 선택

#### 4.2 YouTube API
- [ ] OAuth 2.0 인증 플로우
- [ ] 토큰 갱신 (refresh_token)
- [ ] 영상 업로드 (videos.insert)
- [ ] 공개 설정 변경 (videos.update)
- [ ] 할당량 에러 처리

#### 4.3 OpenAI API
- [ ] TTS 생성 (tts-1 모델)
- [ ] 음성 선택 (alloy, echo, fable, onyx, nova, shimmer)
- [ ] 파일 저장 및 포맷 변환

#### 4.4 이미지 생성 (DALL-E)
- [ ] 프롬프트 기반 이미지 생성
- [ ] 해상도 선택
- [ ] 에러 처리 (rate limit, content policy)

---

### 5. 핵심 기능 리그레션 방지 테스트 (CRITICAL_FEATURES.md 기반)

- [ ] **상품정보 전달**: script.productInfo 사용 (script.content 파싱 금지)
  - 테스트: DB에서 product_info 조회 → API 응답에 productInfo 포함 확인
- [ ] **영상 재생성 - uploads 폴더 지원**: folderType에 'uploads' 포함
  - 테스트: uploads 폴더 경로 파싱 검증
- [ ] **Video Merge - SAR 필터**: setsar=1 존재 확인
  - 테스트: video_merge.py에 setsar=1 코드 존재
- [ ] **TTS 미리듣기 중지**: interrupted/canceled 에러 무시
  - 테스트: onerror 핸들러 존재 확인
- [ ] **ChatGPT URL**: `https://chatgpt.com/` (오래된 URL 금지)
  - 테스트: 코드에 `chat.openai.com` 없음 확인
- [ ] **DB 컬럼 존재**: contents.product_info, contents.tts_voice, jobs.tts_voice
  - 테스트: PRAGMA table_info() 검증
- [ ] **DROP TABLE 금지**: 스키마 변경은 ALTER TABLE만 사용
  - 테스트: 코드에 DROP TABLE 없음 확인

---

### 6. 파일 처리 및 포맷 테스트

#### 6.1 이미지 처리
- [ ] 업로드 검증 (확장자, 크기 제한)
- [ ] 시퀀스 번호 추출 (`01.jpg`, `image_02.png`, `Image_fx (47).jpg`)
- [ ] 파일 정렬 (시퀀스 → lastModified)
- [ ] 포맷 변환 (WebP → PNG)
- [ ] 메타데이터 제거

#### 6.2 비디오 처리
- [ ] 포맷 검증 (mp4, avi, mov, mkv)
- [ ] 코덱 확인 (ffprobe)
- [ ] 해상도 조정
- [ ] 비트레이트 설정
- [ ] 자막 하드코딩

#### 6.3 자막 파일
- [ ] SRT 파싱 및 생성
- [ ] ASS 포맷 생성
- [ ] 타이밍 조정 (자막 싱크)
- [ ] 인코딩 처리 (UTF-8)

#### 6.4 JSON 파일
- [ ] 제목 추출 및 검증
- [ ] 안전한 파일명 생성 (Windows 금지 문자 제거)
- [ ] 길이 제한 (100자)
- [ ] Unicode 보존 (한글, 일본어)

---

### 7. 에러 처리 및 복구 테스트

#### 7.1 프로세스 제어
- [ ] Graceful shutdown (.cancel 파일)
- [ ] Force kill (tree-kill, SIGKILL)
- [ ] Windows 좀비 프로세스 정리 (taskkill)
- [ ] PID 추적 및 상태 확인

#### 7.2 네트워크 에러
- [ ] 타임아웃 처리
- [ ] Rate limiting (429 에러)
- [ ] 서버 오류 (5xx)
- [ ] 재시도 로직 (시스템 안정화 후 재활성화)

#### 7.3 파일 시스템 에러
- [ ] 파일 없음 (ENOENT)
- [ ] 권한 없음 (EACCES)
- [ ] 디스크 부족 (ENOSPC)

#### 7.4 AI 서비스 에러
- [ ] Claude 연결 실패
- [ ] ChatGPT 로그인 실패
- [ ] OpenAI API 오류 (할당량 초과)
- [ ] YouTube API 오류 (할당량, 인증)

---

### 8. 성능 및 부하 테스트

#### 8.1 대용량 파일 처리
- [ ] 4K 영상 처리 (메모리 사용량)
- [ ] 긴 대본 (100+ 씬)
- [ ] 많은 이미지 (50+ 장)

#### 8.2 동시 요청 처리
- [ ] 10명 동시 대본 생성
- [ ] 5명 동시 영상 생성
- [ ] 리소스 경쟁 처리

#### 8.3 장시간 작업
- [ ] 1시간 이상 영상 생성
- [ ] 타임아웃 없이 완료
- [ ] 진행 상태 유지

---

## 우선순위 분류

### 🔴 긴급 (Critical) - 즉시 작성 필요
1. **자동화 파이프라인 End-to-End 테스트**
   - 대본 생성 → 영상 생성 → YouTube 업로드 → 퍼블리시
2. **핵심 기능 리그레션 방지 테스트** (CRITICAL_FEATURES.md)
3. **인증 및 크레딧 시스템** (금전 관련)

### 🟡 높음 (High) - 단기 목표
4. API 엔드포인트 테스트 (Auth, Credits, Scripts, Videos)
5. 데이터베이스 CRUD 테스트
6. 외부 서비스 통합 테스트 (AI, YouTube, OpenAI)

### 🟢 중간 (Medium) - 중기 목표
7. 파일 처리 및 포맷 테스트
8. 에러 처리 및 복구 테스트

### 🔵 낮음 (Low) - 장기 목표
9. 성능 및 부하 테스트

---

## 테스트 작성 가이드

### 테스트 파일 구조
```
trend-video-frontend/
  __tests__/
    integration/
      automation-pipeline.e2e.test.ts        # 자동화 파이프라인 E2E
      script-generation.integration.test.ts  # 대본 생성 통합
      video-generation.integration.test.ts   # 영상 생성 통합
      youtube-upload.integration.test.ts     # YouTube 업로드 통합
    api/
      automation/
        titles.test.ts                        # 제목 API
        schedules.test.ts                     # 스케줄 API
        scheduler.test.ts                     # 스케줄러 제어
```

### 테스트 실행 명령어
```bash
# 전체 테스트 실행
npm test

# 통합 테스트만 실행
npm test -- __tests__/integration

# 특정 파일 실행
npm test -- __tests__/integration/automation-pipeline.e2e.test.ts

# Watch 모드
npm test -- --watch
```

### 테스트 환경 설정
- **데이터베이스**: 테스트용 SQLite DB 사용 (`test_database.sqlite`)
- **외부 서비스**: Mock 또는 테스트 계정 사용
- **파일 시스템**: 임시 디렉토리 생성 후 테스트 완료 시 정리

---

**작성일**: 2025-11-14
**다음 단계**: 우선순위에 따라 통합테스트 작성 시작 (🔴 긴급 항목부터)
