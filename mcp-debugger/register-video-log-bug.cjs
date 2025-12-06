const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const summary = `문제:
스크립트 생성 시 "Claude 응답 파일을 찾을 수 없습니다" 에러 발생.
Python 프로세스가 6.2초만에 종료되고 ai_response 파일이 생성되지 않음.

에러 로그:
- POST /api/scripts/generate 500 in 6.2s
- Error: Claude 응답 파일을 찾을 수 없습니다. 브라우저 자동화가 정상적으로 완료되지 않았을 수 있습니다.

가능한 원인:
1. Chrome 프로필 잠금 (다른 프로세스가 사용 중)
2. 브라우저 실행 실패 (channel='chrome' 오류)
3. Claude 에이전트 초기화 또는 로그인 실패
4. Playwright 타임아웃 또는 네트워크 오류

관련 파일:
- trend-video-frontend/src/app/api/scripts/generate/route.ts:771
- trend-video-backend/src/ai_aggregator/main.py
- trend-video-backend/src/ai_aggregator/agents/claude_agent.py

수정 방안:
1. Python 프로세스 stderr 로그를 더 상세히 캡처하여 실패 원인 파악
2. 브라우저 실행 실패 시 재시도 로직 추가
3. 응답 파일 생성 실패 시 구체적인 에러 메시지 반환
4. ai_aggregator에서 발생한 에러를 프론트엔드까지 전파`;

  const metadata = JSON.stringify({
    files: [
      'trend-video-frontend/src/app/api/scripts/generate/route.ts',
      'trend-video-backend/src/ai_aggregator/main.py',
      'trend-video-backend/src/ai_aggregator/agents/claude_agent.py'
    ],
    errorLog: 'POST /api/scripts/generate 500 in 6.2s\\nError: Claude 응답 파일을 찾을 수 없습니다.',
    taskId: '1abc5110-17cf-4de0-a340-04cbe212d53b'
  });

  // 버그 등록 (id는 auto_increment)
  const [result] = await pool.query(`
    INSERT INTO bugs (title, summary, status, type, priority, metadata, created_at, updated_at)
    VALUES (?, ?, 'open', 'bug', 'P1', ?, NOW(), NOW())
  `, [
    '스크립트 생성 실패 - Claude 응답 파일 미생성 (브라우저 자동화 조기 종료)',
    summary,
    metadata
  ]);

  console.log('버그 등록 완료: BTS-' + String(result.insertId).padStart(7, '0'));
  await pool.end();
}

main().catch(e => console.error(e));
