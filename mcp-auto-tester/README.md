# MCP Auto Tester

자동 테스트 실행 및 결과 추적 MCP

## 기능

- 📝 파일 변경 자동 감지
- 🧪 자동 테스트 실행
- 📊 테스트 결과 통계
- 🔗 mcp-debugger 연동 (실패한 테스트 자동 보고)
- 💾 SQLite 기반 결과 저장

## 설치

```bash
npm install
npm run build
```

## 사용법

### 1. 프로젝트 등록

```bash
npm run cli -- 등록 trend-frontend ../trend-video-frontend "npm test"
```

### 2. 파일 변경 감시 시작

```bash
npm run watch
```

파일이 변경되면 자동으로 테스트가 실행됩니다.

### 3. 수동 테스트 실행

```bash
npm run cli -- 테스트
npm run cli -- 테스트 trend-frontend
```

### 4. 결과 확인

```bash
# 프로젝트 목록
npm run cli -- 목록

# 통계
npm run cli -- 통계
npm run cli -- 통계 trend-frontend

# 실행 기록
npm run cli -- 기록
npm run cli -- 기록 trend-frontend 20

# 실패한 테스트
npm run cli -- 실패
npm run cli -- 실패 trend-frontend

# 상세 정보
npm run cli -- 상세 1
```

## mcp-debugger 연동

실패한 테스트는 자동으로 mcp-debugger의 에러 큐에 추가됩니다.

```bash
# mcp-debugger에서 확인
cd ../mcp-debugger
npm run worker -- 목록
```

## DB 위치

`~/.mcp-auto-tester/test-results.db`

## 명령어

- `등록` - 프로젝트 등록
- `목록` - 프로젝트 목록
- `삭제` - 프로젝트 삭제
- `테스트` - 테스트 실행
- `통계` - 통계 보기
- `기록` - 실행 기록
- `실패` - 실패한 테스트
- `상세` - 상세 정보
