# MCP Dev Tools

코드 리뷰와 통합 테스트 생성을 위한 MCP 서버

## 기능

### 1. `review_code` - 코드 리뷰
- 코드 품질 분석 (console.log, TODO, any 타입 등)
- 보안 체크 (eval, innerHTML, 하드코딩된 비밀번호)
- ESLint 연동 (설치된 경우)
- 함수 복잡도 분석

### 2. `generate_test` - 통합 테스트 생성
- API 테스트 (Next.js route 자동 감지)
- 컴포넌트 테스트 (React Testing Library)
- 함수 테스트
- 자동 타입 감지

### 3. `run_tests` - 테스트 실행
- Jest 테스트 실행
- 결과 리포트 (통과/실패/스킵)

### 4. `analyze_project` - 프로젝트 분석
- 의존성 분석
- 파일 통계
- 개발 도구 설정 확인

## 설치

```bash
cd C:\Users\oldmoon\workspace\mcp-dev-tools
npm install
npm run build
```

## Claude Code 연동

### 방법 1: 프로젝트별 설정
프로젝트 루트에 `.mcp.json` 파일 생성:

```json
{
  "mcpServers": {
    "dev-tools": {
      "command": "node",
      "args": ["C:\\Users\\oldmoon\\workspace\\mcp-dev-tools\\dist\\index.js"]
    }
  }
}
```

### 방법 2: 전역 설정
Claude Code 설정에서 MCP 서버 추가:

```bash
claude mcp add dev-tools node C:\Users\oldmoon\workspace\mcp-dev-tools\dist\index.js
```

## 사용 예시

Claude Code에서:

```
# 코드 리뷰
"src/app/api/generate-script/route.ts 파일 리뷰해줘"

# 테스트 생성
"src/app/api/titles/route.ts에 대한 통합 테스트 만들어줘"

# 테스트 실행
"trend-video-frontend 프로젝트 테스트 실행해줘"

# 프로젝트 분석
"trend-video-frontend 프로젝트 구조 분석해줘"
```

## 비용

**무료!**
- 외부 API 호출 없음
- 로컬에서 모든 분석 수행
- ESLint, Jest 등 기존 도구 활용

## 요구사항

- Node.js 18+
- (선택) ESLint - 코드 린팅
- (선택) Jest - 테스트 실행
