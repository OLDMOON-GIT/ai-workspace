# 프로젝트 정리 가이드

## 빠른 실행

```bash
# 1. Phase 1: 로그 및 임시 파일 삭제 (~50MB 절약)
node cleanup-phase1.js

# 2. Phase 2: 유틸리티 스크립트 정리
node cleanup-phase2.js

# 3. Git 커밋
git add .
git commit -m "chore: 프로젝트 파일 정리 (Phase 1-2)"
```

## 상세 내용

자세한 전략과 분석은 `CLEANUP_STRATEGY.md` 참고

## 주요 정리 항목

### ✅ 즉시 삭제 (Phase 1)
- 백업 로그 파일 (30개, ~50MB)
- 임시 테스트 파일
- Backend 로그

### 📁 구조 정리 (Phase 2)
- 루트 유틸리티 → scripts/utils/
  - DB 관리 (6개)
  - 수정 스크립트 (2개)
  - 마이그레이션 (3개)
  - 복구/리셋 (3개)

### 🛡️ 향후 방지
- .gitignore 업데이트 필요
- Python 캐시 자동 무시
- Chrome 프로필 캐시 제외

## 주의사항

**삭제하지 말 것:**
- data/*.json (사용 중)
- youtube-credential/ (인증)
- 실행 스크립트 (start-*, cleanup.js 등)

**백업 확인:**
- Git 커밋 후 실행
- 중요 데이터는 수동 백업

