# 프로젝트 유지보수 가이드

## 🧹 자동 정리 정책

### 보관 기간
- **로그 파일**: 7일
- **데이터베이스 백업**: 7일
- **임시 파일**: 1일
- **손상된 파일**: 즉시 삭제

### 정리 명령어

#### 1. 일반 정리 (7일 정책)
```bash
npm run cleanup
```
- 7일 이상 된 로그와 백업 삭제
- 손상된 파일 정리
- 빌드 캐시 정리
- 권장: 매주 실행

#### 2. 적극적 정리
```bash
npm run cleanup:aggressive
```
- 최근 3개 백업만 유지
- 현재 로그만 유지
- 모든 캐시 삭제
- 긴급 공간 확보시 사용

#### 3. 자동 정리 스케줄러
```bash
npm run cleanup:auto
```
- 매일 자정에 자동 실행
- 7일 정책 자동 적용
- 백그라운드에서 지속 실행

### .gitignore 설정

다음 항목들이 git에서 무시됩니다:

```
# 데이터베이스
/data/*.sqlite
/data/*.sqlite-shm
/data/*.sqlite-wal
/data/backups/
/data/dump.sql
/data/*.corrupted.*
/data/*.broken*

# 로그
/logs/
*.log

# 임시 파일
/temp/
/test-output/

# 빌드 캐시
/.next/
tsconfig.tsbuildinfo
```

## 📊 디스크 사용량 모니터링

### 주요 디렉토리 크기 확인
```bash
du -sh * | sort -rh | head -10
```

### 큰 파일 찾기
```bash
find . -type f -size +10M 2>/dev/null
```

## 🔧 문제 해결

### 개발 속도가 느릴 때
1. `npm run cleanup` 실행
2. 서버 재시작
3. IDE 캐시 정리

### 디스크 공간 부족시
1. `npm run cleanup:aggressive` 실행
2. `node_modules` 재설치: `rm -rf node_modules && npm install`
3. Docker 이미지 정리 (사용시)

### 데이터베이스 WAL 파일이 큰 경우
WAL (Write-Ahead Log) 파일은 서버 재시작시 자동으로 데이터베이스에 병합됩니다.
```bash
# 서버 정지 후
sqlite3 data/database.sqlite "VACUUM;"
```

## 🚀 최적화 팁

1. **주기적 정리**: 주 1회 `npm run cleanup` 실행
2. **자동화**: 프로덕션 서버에서는 `npm run cleanup:auto` 사용
3. **모니터링**: 디스크 사용량 80% 초과시 즉시 정리
4. **백업**: 중요 데이터는 별도 백업 후 정리

## 📈 성능 개선 효과

정기적인 정리로 다음과 같은 개선을 기대할 수 있습니다:

- ✅ Git 작업 속도 30-50% 향상
- ✅ 파일 시스템 탐색 속도 개선
- ✅ IDE 인덱싱 시간 단축
- ✅ 서버 시작 시간 20-30% 단축
- ✅ 빌드 속도 향상