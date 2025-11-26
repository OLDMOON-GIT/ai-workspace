# MCP Debugger

서버 에러를 큐에 저장하고 CLI 워커 또는 Claude가 처리할 수 있는 디버깅 MCP 서버입니다.

## 특징

- 어느 워크스페이스에서든 동일한 에러 큐 사용 (DB: `~/.mcp-debugger/error-queue.db`)
- 로그 파일 실시간 모니터링으로 에러 자동 감지
- CLI 워커로 에러를 하나씩 가져가서 처리
- 처리 기록 및 리포트 생성

## 설치

```bash
cd mcp-debugger
npm install
npm run build
```

## Claude Code에 MCP 등록

`claude_mcp_config.json` 내용을 Claude Code 설정에 추가:

```json
{
  "mcpServers": {
    "mcp-debugger": {
      "command": "node",
      "args": ["C:\\Users\\oldmoon\\workspace\\mcp-debugger\\dist\\index.js"]
    }
  }
}
```

## CLI 워커 사용법

```bash
# 에러 하나 가져오기
npm run worker -- 에러탐지해

# 대기 중인 에러 목록
npm run worker -- 목록

# 에러 상세 보기
npm run worker -- 상세 5

# 에러 해결 완료
npm run worker -- 해결 5 "SQL 쿼리 수정"

# 에러 무시
npm run worker -- 무시 3

# 통계 보기
npm run worker -- 통계

# 처리 기록
npm run worker -- 기록

# 종합 리포트
npm run worker -- 리포트

# 도움말
npm run worker -- 도움말
```

## 로그 모니터링

```bash
# 로그 소스 추가
npm run monitor -- --add /path/to/logfile.log --name "서버로그"

# 등록된 로그 소스 확인
npm run monitor -- --list

# 모니터링 시작
npm run monitor
```

## MCP 도구 (Claude에서 사용)

### 에러 관리
- `add_error` - 에러 수동 등록
- `get_pending_errors` - 대기 중인 에러 목록
- `get_error_detail` - 에러 상세 정보
- `claim_error` - 에러 가져오기
- `resolve_error` - 에러 해결 완료
- `ignore_error` - 에러 무시

### 통계/리포트
- `get_error_stats` - 에러 통계
- `get_resolution_history` - 처리 기록
- `generate_report` - 종합 리포트

### 프로젝트/로그 관리
- `add_project` / `list_projects` / `remove_project`
- `add_log_source` / `list_log_sources` / `remove_log_source`

## 워크플로우 예시

1. 로그 모니터가 서버 에러 감지 → 에러 큐에 추가
2. Claude 또는 CLI 워커가 `claim_error`로 에러 할당받음
3. 에러 분석 및 수정
4. `resolve_error`로 완료 처리
5. `generate_report`로 진행 상황 확인

## DB 구조

- `error_queue` - 에러 큐
- `error_resolution` - 처리 기록
- `worker_status` - 워커 상태
- `log_source` - 로그 소스
- `project` - 프로젝트
