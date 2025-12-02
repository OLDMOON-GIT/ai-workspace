# 사용하지 않는 파일 목록

**작성일**: 2025-11-14

---

## Frontend (trend-video-frontend/)

### Backup 파일 (삭제 권장)
- `data\jobs.json.old.backup` - 오래된 jobs 데이터 백업
- `data\scripts.json.backup_20251029_232156` - 2025-10-29 백업
- `src\app\my-content\page.tsx.backup` - 페이지 백업 1
- `src\app\my-content\page.tsx.backup2` - 페이지 백업 2
- `src\app\my-content\page.tsx.backup_old` - 오래된 페이지 백업
- `src\app\page.tsx.backup` - 메인 페이지 백업
- `src\app\admin\architecture\page.tsx.backup` - 아키텍처 페이지 백업
- `src\app\api\scripts\generate\route.ts.backup` - API 라우트 백업
- `src\app\api\youtube\auth\route.ts.backup` - YouTube 인증 백업

### Old 파일 (삭제 권장)
- `src\app\settings\youtube\page.tsx.old` - 오래된 YouTube 설정 페이지

### 임시 데이터베이스 파일 (삭제 권장)
- `Usersoldmoonworkspacetrend-video-frontenddatadatabase.sqlite` - 잘못된 경로의 DB 파일 (경로명 오류)

---

## Backend (trend-video-backend/)

### Backup 디렉토리 (검토 후 정리 권장)

#### AI Aggregator 백업 (오래된 버전)
**경로**: `backup\ai_aggregator\`
- `agents/` - 오래된 agent 구현
- `templates/` - 오래된 템플릿
- `aggregator.py` - 오래된 aggregator
- `main.py` - 오래된 메인
- `queue_manager.py` - 오래된 큐 관리자
- ⚠️ **현재 사용 중인 버전**: `src\ai_aggregator\`

#### 테스트 스크립트 (일회성)
**경로**: `backup\`
- `check_logins.py` - 로그인 체크 (현재 사용 안 함)
- `test_black_box.py` - 자막 제거 테스트 (완료)
- `test_lama.py` - LAMA 모델 테스트 (완료)
- `test_propainter.py` - ProPainter 테스트 (완료)
- `test_propainter2.py` - ProPainter 테스트 2 (완료)
- `test_subtitle_removal_methods.py` - 자막 제거 방법 테스트 (완료)
- `test_video_watermark.py` - 워터마크 제거 테스트 (완료)
- `test_vsr.py` - VSR 테스트 (완료)
- `test_watermark_removal.py` - 워터마크 제거 테스트 (완료)
- `youtube_upload_cli.py` - YouTube 업로드 CLI (오래된 버전)

### 임시 프롬프트 파일 (삭제 권장)

#### 루트 디렉토리 임시 파일 (18개)
**경로**: `C:\Users\oldmoon\workspace\trend-video-backend\`
- `prompt_1762780268054.txt` (2025-11-10 생성)
- `prompt_1762780303669.txt`
- `prompt_1762780336887.txt`
- `prompt_1762895447619.txt` (2025-11-11 생성)
- `prompt_1762896167629.txt`
- `prompt_1762896236030.txt`
- `prompt_1763046509934.txt` (2025-11-13 생성)
- `prompt_1763047624239.txt`
- `prompt_1763049101897.txt`
- `prompt_1763049616842.txt`
- `prompt_1763049898106.txt`
- `prompt_1763050053125.txt`
- `prompt_1763053439674.txt`
- `prompt_1763054837712.txt`
- `prompt_1763055656891.txt`
- `prompt_1763057846312.txt`
- `prompt_1763057869365.txt`
- `prompt_1763057869383.txt`

#### AI 응답 파일 (6개)
**경로**: `C:\Users\oldmoon\workspace\trend-video-backend\`
- `ai_responses_20251108_215616.txt`
- `ai_responses_20251108_220311.txt`
- `ai_responses_20251108_230116.txt`
- `ai_responses_20251110_223758.txt`
- `ai_responses_20251111_201720.txt`

#### scripts 디렉토리 임시 파일 (126개)
**경로**: `C:\Users\oldmoon\workspace\trend-video-backend\src\scripts\`
- `ai_responses_20251108_220303.txt` ~ `ai_responses_20251114_023228.txt` (126개 파일)
- ⚠️ **이 파일들은 AI 대본 생성 시 생성되는 임시 파일로, 주기적으로 정리 필요**

### 임시 디렉토리 (주기적 정리 권장)
- `temp\` - 임시 작업 파일
- `temp_preview\` - TTS 미리보기 임시 파일
- `prompts_temp\` - 임시 프롬프트 파일
- `test_output\` - 테스트 출력 파일
- `.chrome-automation-profile\` - Selenium Chrome 프로필 (용량 큼, 주기적 정리)

### 빈 파일 (삭제 권장)
- `nul` - 빈 파일

---

## 루트 디렉토리 (workspace/)

### 백업 파일 (보관 권장)
- `DEVELOPMENT_GUIDE.backup.md` - 개발 가이드 백업 (101KB)
  - ⚠️ **보관 권장**: 대규모 변경 시 참고용

### 테스트 스크립트 (검토 후 정리)
- `test-sigterm.py` - SIGTERM 테스트 (일회성)
- `test-youtube-shorts-detection.js` - Shorts 감지 테스트 (일회성)

### 임시 배치 파일 (검토 후 정리)
- `start_dev_server_with_login_check.bat` - 개발 서버 시작 스크립트
  - ⚠️ 사용 중이면 보관, 아니면 삭제

### 빈 파일 (삭제 권장)
- `nul` - 빈 파일

### 기타
- `재료\` - 한글 디렉토리 (내용 확인 필요)
- `__pycache__\` - Python 캐시 (안전하게 삭제 가능)
- `logs\` - 로그 파일 (주기적 정리 권장)

---

## 정리 방법 및 주의사항

### ✅ 안전하게 삭제 가능 (Git 백업 있음)
1. `.backup`, `.old` 확장자 파일
   - Git에 커밋되어 있으면 언제든 복구 가능
2. `__pycache__/` 디렉토리
   - Python이 자동으로 재생성
3. `nul` 빈 파일
4. 타임스탬프 기반 임시 파일 (1개월 이상 경과)
   - `prompt_*.txt` (1개월 이상)
   - `ai_responses_*.txt` (1개월 이상)

### ⚠️ 검토 후 정리
1. `backup\` 디렉토리
   - 현재 사용 중인 코드와 비교 후 삭제
2. `test_*.py`, `test-*.js`
   - 일회성 테스트인지 확인
3. `temp`, `temp_preview`, `prompts_temp`
   - 용량 확인 후 오래된 파일 삭제
4. `.chrome-automation-profile`
   - 용량이 크면 정리 (재생성 가능)

### 📌 보관 권장
1. `DEVELOPMENT_GUIDE.backup.md`
   - 대규모 변경 시 백업본 유지
2. 현재 사용 중인 기능의 백업 파일 (최근 1주일 이내)

---

## 자동 정리 스크립트

### PowerShell 스크립트
```powershell
# Backend 임시 파일 정리 (30일 이상 된 파일)
Get-ChildItem -Path "C:\Users\oldmoon\workspace\trend-video-backend" -Filter "ai_responses_*.txt" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item

Get-ChildItem -Path "C:\Users\oldmoon\workspace\trend-video-backend" -Filter "prompt_*.txt" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item

Get-ChildItem -Path "C:\Users\oldmoon\workspace\trend-video-backend\src\scripts" -Filter "ai_responses_*.txt" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item

# __pycache__ 정리
Get-ChildItem -Path "C:\Users\oldmoon\workspace" -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

# 빈 파일 정리
Get-ChildItem -Path "C:\Users\oldmoon\workspace" -Recurse -Filter "nul" | Remove-Item
```

### Bash 스크립트 (Git Bash)
```bash
# Backend 임시 파일 정리 (30일 이상 된 파일)
find /c/Users/oldmoon/workspace/trend-video-backend -name "ai_responses_*.txt" -mtime +30 -delete
find /c/Users/oldmoon/workspace/trend-video-backend -name "prompt_*.txt" -mtime +30 -delete
find /c/Users/oldmoon/workspace/trend-video-backend/src/scripts -name "ai_responses_*.txt" -mtime +30 -delete

# __pycache__ 정리
find /c/Users/oldmoon/workspace -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

# 빈 파일 정리
find /c/Users/oldmoon/workspace -name "nul" -delete
```

---

## 통계

### Frontend
- **백업 파일**: 9개 (약 1-2MB 추정)
- **임시 파일**: 2개

### Backend
- **backup 디렉토리**: 약 20개 파일
- **임시 프롬프트/응답**: 144개 (루트 18 + scripts 126개)
- **임시 디렉토리**: 5개 (주기적 정리 필요)

### 루트
- **백업 파일**: 1개 (101KB)
- **테스트 스크립트**: 2개
- **임시/빈 파일**: 2개

### 총계
- **삭제 가능 파일 수**: 약 180개 (주로 임시 응답 파일)
- **예상 확보 용량**: 수십 MB ~ 수백 MB (Chrome 프로필 제외)

---

## 정리 우선순위

### 🔴 즉시 삭제 권장
1. 빈 파일 (`nul`)
2. `__pycache__` 디렉토리
3. 1개월 이상 경과한 임시 프롬프트/응답 파일

### 🟡 검토 후 삭제
4. `.backup`, `.old` 파일 (Git 히스토리 확인)
5. `backup\` 디렉토리 (현재 코드와 비교)
6. 테스트 스크립트 (일회성 확인)

### 🟢 주기적 정리
7. `temp`, `temp_preview`, `prompts_temp` 디렉토리
8. `.chrome-automation-profile` (용량 큼)
9. `logs\` 디렉토리 (오래된 로그)

---

## 다음 단계

1. **즉시 정리**: 위의 PowerShell 또는 Bash 스크립트 실행
2. **수동 검토**: backup 디렉토리 및 테스트 스크립트 확인
3. **자동화 설정**: 주기적 정리를 위한 cron/scheduled task 설정
4. **모니터링**: 디스크 사용량 주기적 체크

---

**참고 문서**
- `INTEGRATION_TEST_PLAN.md` - 통합테스트 계획
- `CRITICAL_FEATURES.md` - 보호해야 할 핵심 기능
- `AUTOMATION_GUIDE.md` - 자동화 시스템 가이드
