const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const title = 'BTS CI/CD 자동화 아키텍처 구현';
    const summary = `기획서/Figma/ERD/아키텍처 다이어그램을 입력받아
자동으로 개발-테스트-배포까지 되는 피드백 루프 CI/CD 시스템 구현.

핵심 구성요소:
1. 입력 소스 파서 (Parser)
   - spec-parser.ts: 기획서에서 SPEC 추출
   - figma-parser.ts: Figma에서 UI 컴포넌트 추출
   - erd-parser.ts: ERD에서 DB 마이그레이션 생성
   - arch-parser.ts: 아키텍처에서 의존성 분석

2. 테스트 파이프라인
   - Unit Tests (Jest)
   - Integration Tests
   - UI Tests (Playwright)
   - E2E Tests (automation/)

3. 피드백 루프
   - monitor.ts: 로그 패턴 감지 → 버그 등록
   - test-reporter.ts: 테스트 실패 → 버그 등록
   - error-collector.ts: 런타임 에러 → 버그 등록

4. 배포 파이프라인
   - npm run build
   - Vercel/Docker 배포
   - Health Check + 자동 롤백

5. 관리 UI
   - /admin/bts: 버그/스펙 관리
   - /admin/deploy: 배포 상태
   - /diagrams/*: 아키텍처 뷰어

자동화 플로우:
기획서 → 파서 → SPEC 등록 → AI 개발 → 테스트 → 배포
                                    ↓ 실패
                              버그 등록 → AI 수정 → 재테스트`;

    const metadata = JSON.stringify({
      feature: 'bts-cicd-architecture',
      components: [
        'spec-parser',
        'figma-parser',
        'erd-parser',
        'arch-parser',
        'test-reporter',
        'error-collector',
        'deploy-pipeline'
      ],
      ui_pages: [
        '/admin/bts',
        '/admin/deploy',
        '/diagrams/bts-architecture'
      ]
    });

    const result = await conn.query(
      `INSERT INTO bugs (title, summary, type, priority, status, metadata, created_at, updated_at)
       VALUES (?, ?, 'spec', 'P1', 'open', ?, NOW(), NOW())`,
      [title, summary, metadata]
    );

    console.log(`✅ SPEC 등록 완료: BTS-${result[0].insertId}`);
    console.log('Title:', title);

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
