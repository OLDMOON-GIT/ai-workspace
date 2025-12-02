# 📊 아키텍처 문서 자동 업데이트 설정 완료

## ✅ 설정 완료 사항

### 1. 자동 생성되는 문서
매일 새벽 6시에 다음 문서들이 자동으로 업데이트됩니다:

- **DATABASE_ERD.md** - 전체 데이터베이스 ERD (47개 테이블)
- **SEQUENCE_DIAGRAMS.md** - 시스템 시퀀스 다이어그램 5종
- **ARCHITECTURE_OVERVIEW.md** - 시스템 아키텍처 개요

**위치**: `trend-video-frontend/docs/`

### 2. Windows Task Scheduler 등록 완료
- **작업명**: ERD Auto Update Daily
- **경로**: \TrendVideo\ERD Auto Update Daily
- **실행 시간**: 매일 새벽 06:00
- **상태**: Ready (실행 준비 완료)

## 📂 파일 구조

```
workspace/
├── scripts/utils/
│   ├── update-architecture-docs.js     # 메인 업데이트 스크립트
│   ├── update-erd-daily.js              # ERD 생성 모듈
│   ├── update-erd-daily.bat             # Windows 배치 파일
│   └── setup-erd-scheduler.ps1          # 스케줄러 설정 스크립트
└── logs/
    └── architecture-update.log          # 실행 로그
```

## 🔧 수동 실행 방법

### 1. Node.js로 직접 실행
```bash
cd C:\Users\oldmoon\workspace
node scripts/utils/update-architecture-docs.js
```

### 2. 배치 파일 실행
```cmd
C:\Users\oldmoon\workspace\scripts\utils\update-erd-daily.bat
```

### 3. Task Scheduler로 실행
```powershell
Start-ScheduledTask -TaskName "ERD Auto Update Daily" -TaskPath "\TrendVideo\"
```

## 📊 생성되는 문서 내용

### DATABASE_ERD.md
- 전체 ERD Mermaid 다이어그램
- 47개 테이블 목록 (카테고리별 분류)
- 각 테이블의 상세 스키마
- 컬럼, 외래키, 인덱스 정보

### SEQUENCE_DIAGRAMS.md
1. 자동화 파이프라인 흐름
2. 영상 생성 워크플로우
3. 큐 시스템 처리
4. 사용자 인증 흐름
5. YouTube 업로드 흐름

### ARCHITECTURE_OVERVIEW.md
- 프로젝트 구조
- 기술 스택
- 데이터 흐름도
- 주요 테이블 관계
- 보안 정책

## 🔍 확인 방법

### Task Scheduler에서 확인
1. `Win + R` → `taskschd.msc` 입력
2. 작업 스케줄러 라이브러리 → TrendVideo
3. "ERD Auto Update Daily" 작업 확인

### 실행 로그 확인
```cmd
type C:\Users\oldmoon\workspace\logs\architecture-update.log
```

### 생성된 문서 확인
```cmd
dir C:\Users\oldmoon\workspace\trend-video-frontend\docs\*.md
```

## 🛠️ 스케줄러 재설정

스케줄러를 다시 설정하려면:

```powershell
# PowerShell을 관리자 권한으로 실행 후
cd C:\Users\oldmoon\workspace\scripts\utils
.\setup-erd-scheduler.ps1
```

## ⚙️ 설정 변경

### 실행 시간 변경
`setup-erd-scheduler.ps1` 파일에서 다음 라인 수정:
```powershell
$trigger = New-ScheduledTaskTrigger -Daily -At "06:00"
```

### 스크립트 내용 수정
`update-architecture-docs.js` 파일 수정 후 자동 반영됩니다.

## 📋 주의사항

1. **Node.js 필요**: Node.js가 설치되어 있어야 합니다
2. **DB 접근**: database.sqlite 파일이 있어야 합니다
3. **로그 관리**: 로그 파일이 10MB 넘으면 자동 로테이션
4. **권한**: Task Scheduler는 사용자 로그인 없이도 실행됩니다

## 🎯 다음 실행 일정

Task Scheduler에서 자동으로 매일 새벽 6시에 실행됩니다.
수동으로 실행하려면 위의 "수동 실행 방법" 참고하세요.

---

*설정 완료 시간: ${new Date().toLocaleString('ko-KR')}*
