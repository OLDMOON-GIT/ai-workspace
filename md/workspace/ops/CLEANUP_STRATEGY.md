# 프로젝트 정리 전략 (Project Cleanup Strategy)

생성일: 2025-11-26

## 📊 현재 상태 분석

### Frontend (trend-video-frontend)
```
총 용량: ~1.5GB
├── data/          1.4GB  (데이터베이스, JSON 파일)
├── logs/          50MB   (서버 로그 30개 파일)
├── backup/        433KB  (백업 파일)
└── node_modules/  (제외)
```

### Backend (trend-video-backend)
```
총 용량: ~700MB
├── .chrome-automation-profile/  669MB  (Chrome 캐시)
├── backup/                      8.5MB  (백업 파일)
├── logs/                        540KB  (로그 파일)
└── __pycache__/                 93KB   (Python 캐시)
```

### 전체 프로젝트
```
- Python 캐시: 2,204개 파일
- 로그 파일: 50MB+
- Chrome 캐시: 669MB
```

---

## 🗑️ 불필요한 파일 분류

### 1. **즉시 삭제 가능 (안전)**

#### Frontend
```
로그 파일 (50MB):
- logs/server-*.log (30개 백업 로그)
- dev-server.log
- image-worker.log
- image-worker-test.log
- test-*.log (4개)

임시 파일:
- test_script.json
- test-output/ (디렉토리)

유틸리티 스크립트 (루트):
- check-*.js (6개)
- fix-*.js (2개)
- migrate-*.js (2개)
- restore-*.js (2개)
- reset-*.js (1개)
- trigger-*.js (1개)
- monitor-*.js (1개)
- run-migration.js
```

#### Backend
```
캐시 (669MB):
- .chrome-automation-profile/ 전체
  → Chrome 자동화 캐시, 매번 재생성 가능

Python 캐시 (2,204개):
- **/__pycache__/ (모든 디렉토리)
- **/*.pyc

로그:
- logs/*.log
```

### 2. **검토 후 삭제 (주의)**

#### Frontend
```
데이터베이스 (1.4GB):
- data/*.db (삭제된 DB 파일들)
  → 이미 삭제되었으나 Git에 기록됨

JSON 데이터:
- data/*.json (13개)
  → 사용 중인지 확인 필요

백업 (433KB):
- backup/*
  → 복구 필요 시 보관
```

#### Backend
```
백업 (8.5MB):
- backup/*
  → 오래된 백업 파일 정리
```

### 3. **보존해야 할 파일**

```
설정 파일:
- package.json, package-lock.json
- tsconfig.json
- jest.config.js, jest.setup.js
- .gitignore

핵심 스크립트:
- cleanup.js, cleanup-aggressive.js, auto-cleanup.js
- start-*.js
- image-worker.js

인증 파일:
- youtube-credential/*.json
```

---

## 🎯 정리 전략 (3단계)

### **Phase 1: 즉시 실행 (안전)**

#### 1-1. 로그 파일 정리
```bash
# Frontend
rm -f trend-video-frontend/logs/server-2025-*.log
rm -f trend-video-frontend/*.log

# Backend
rm -rf trend-video-backend/logs/*.log
```
**예상 절약: 50MB**

#### 1-2. Python 캐시 삭제
```bash
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -type f -name "*.pyc" -delete
```
**예상 절약: 5MB**

#### 1-3. Chrome 캐시 삭제
```bash
rm -rf trend-video-backend/.chrome-automation-profile/
```
**예상 절약: 669MB**

#### 1-4. 임시 파일 삭제
```bash
rm -f trend-video-frontend/test_script.json
rm -f trend-video-frontend/test-*.log
rm -rf trend-video-frontend/test-output/
```
**예상 절약: 1MB**

**Phase 1 총 절약: ~725MB**

---

### **Phase 2: 유틸리티 스크립트 정리**

#### 2-1. scripts/utils/ 디렉토리로 이동
```javascript
// 이동할 파일 (Frontend 루트 → scripts/utils/)
const filesToMove = [
  'check-db.js',
  'check-db-structure.js',
  'check-queue-db.js',
  'check-queue-status.js',
  'check-status.js',
  'check-task-table.js',
  'fix-current-status.js',
  'fix-media-mode.js',
  'migrate-all-dbs.js',
  'migrate-product-format.js',
  'reset-queue-locks.js',
  'restore-db.js',
  'restore-products.js',
  'run-migration.js',
];

// 보존 (루트 유지)
const keepInRoot = [
  'cleanup.js',
  'cleanup-aggressive.js',
  'auto-cleanup.js',
  'start-all-workers.js',
  'start-image-worker.js',
  'start-with-check.js',
  'image-worker.js',
  'trigger-scheduler.js',
  'monitor-image-worker.js',
];
```

#### 2-2. 실행 스크립트 작성
```bash
# scripts/utils/로 이동
mkdir -p trend-video-frontend/scripts/utils/db
mkdir -p trend-video-frontend/scripts/utils/migration

# 이동 실행
mv trend-video-frontend/check-*.js scripts/utils/db/
mv trend-video-frontend/fix-*.js scripts/utils/
mv trend-video-frontend/migrate-*.js scripts/utils/migration/
mv trend-video-frontend/restore-*.js scripts/utils/
mv trend-video-frontend/reset-*.js scripts/utils/
mv trend-video-frontend/run-migration.js scripts/utils/migration/
```

---

### **Phase 3: .gitignore 업데이트**

#### 3-1. 추가할 패턴
```gitignore
# 로그 파일
*.log
logs/
dev-server.log

# 데이터베이스 파일
*.db
*.sqlite
*.db-shm
*.db-wal
data/*.db
data/*.sqlite

# Python
__pycache__/
*.py[cod]
*$py.class
*.so

# Chrome 프로필
.chrome-automation-profile/

# 임시/테스트 파일
test-output/
*.test.json
test_*.json

# 백업 파일
*.backup
*.bak
backup-*/
```

#### 3-2. Frontend .gitignore 업데이트
```bash
cat >> trend-video-frontend/.gitignore << 'EOF'

# Database files
*.db
*.sqlite
*.db-shm
*.db-wal

# Log files
*.log
logs/*.log
dev-server.log

# Test output
test-output/
test_*.json
EOF
```

#### 3-3. Backend .gitignore 업데이트
```bash
cat >> trend-video-backend/.gitignore << 'EOF'

# Python cache
__pycache__/
*.py[cod]
*$py.class

# Chrome profile
.chrome-automation-profile/

# Logs
*.log
logs/
EOF
```

---

## 📋 실행 체크리스트

### 즉시 실행 (Phase 1) ✅
- [ ] 1. 백업 생성 확인
- [ ] 2. 로그 파일 삭제 (50MB)
- [ ] 3. Python 캐시 삭제 (5MB)
- [ ] 4. Chrome 캐시 삭제 (669MB)
- [ ] 5. 임시 파일 삭제 (1MB)
- [ ] 6. Git status 확인

### 정리 (Phase 2) 📁
- [ ] 1. scripts/utils/ 디렉토리 구조 생성
- [ ] 2. 유틸리티 스크립트 이동
- [ ] 3. Git add/commit
- [ ] 4. 테스트 실행 확인

### 방지 (Phase 3) 🛡️
- [ ] 1. .gitignore 업데이트 (Frontend)
- [ ] 2. .gitignore 업데이트 (Backend)
- [ ] 3. Git commit
- [ ] 4. 로컬 파일 삭제

---

## 🔧 자동화 스크립트

### cleanup-project.sh
```bash
#!/bin/bash

echo "🧹 프로젝트 정리 시작..."

# Phase 1: 안전한 삭제
echo "📝 Phase 1: 로그 및 캐시 정리"
find . -name "*.log" -type f -delete
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -type f -name "*.pyc" -delete
rm -rf trend-video-backend/.chrome-automation-profile/

echo "✅ Phase 1 완료"

# 결과 확인
echo ""
echo "📊 정리 결과:"
du -sh trend-video-frontend/logs/ 2>/dev/null || echo "logs/ 없음"
du -sh trend-video-backend/.chrome-automation-profile/ 2>/dev/null || echo "Chrome 캐시 없음"
find . -name "__pycache__" | wc -l
```

### 주기적 정리 (cron/Task Scheduler)
```bash
# 매일 자정에 실행
0 0 * * * /path/to/cleanup-project.sh >> /path/to/cleanup.log 2>&1
```

---

## ⚠️ 주의사항

### 삭제 전 확인
1. **data/*.json 파일**: 실제 사용 중인지 확인
2. **backup/**: 복구 필요 시 압축 보관
3. **Git 커밋**: 정리 전후 커밋 생성

### 복구 방법
```bash
# Git에서 파일 복구
git checkout HEAD -- <파일명>

# 백업에서 복구
cp backup/<백업파일> <복구위치>
```

---

## 📈 예상 효과

```
Phase 1 (즉시):  725MB 절약
Phase 2 (정리):  파일 구조 개선
Phase 3 (방지):  향후 불필요한 파일 자동 제외

총 디스크 공간 절약: ~725MB
Git 저장소 크기: 변화 없음 (이미 .gitignore됨)
프로젝트 가독성: 향상
```

---

## 다음 단계

1. **즉시 실행**: Phase 1 실행 → 725MB 절약
2. **스크립트 이동**: Phase 2 실행 → 구조 정리
3. **자동화 설정**: Phase 3 + cron 설정
4. **문서화**: README.md에 정리 가이드 추가
