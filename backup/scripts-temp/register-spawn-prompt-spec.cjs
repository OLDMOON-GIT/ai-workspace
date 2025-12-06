const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const title = 'Spawn 버튼: promptFormat별 프롬프트 선택 적용';
    const summary = `Spawn 버튼 클릭 시 promptFormat(longform/shortform/product/sora2)에 따라
적절한 프롬프트를 선택하여 대본 생성 요청.

현재 상태:
- spawn-task API는 고정된 롱폼 프롬프트만 사용

요구사항:
1. promptFormat을 spawn-task API에 전달
2. prompts 폴더의 프롬프트 파일 또는 API를 사용하여 타입별 프롬프트 적용
   - longform: 롱폼 대본 프롬프트
   - shortform: 숏폼 대본 프롬프트
   - product: 상품 대본 프롬프트
   - sora2: Sora2 영상 프롬프트
3. 프론트엔드에서 title의 promptFormat을 함께 전송

관련 파일:
- trend-video-frontend/prompts/ (프롬프트 파일들)
- trend-video-frontend/src/app/api/automation/spawn-task/route.ts
- trend-video-frontend/src/app/automation/page.tsx (spawnExecute 함수)`;

    const metadata = JSON.stringify({
      feature: 'spawn-prompt-selection',
      related_files: [
        'trend-video-frontend/prompts/',
        'trend-video-frontend/src/app/api/automation/spawn-task/route.ts',
        'trend-video-frontend/src/app/automation/page.tsx'
      ],
      depends_on: 'BTS-3184'
    });

    // 기존 BTS-3184 업데이트 (더 상세한 내용으로)
    await conn.query(
      `UPDATE bugs SET
        title = ?,
        summary = ?,
        metadata = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [title, summary, metadata, 3184]
    );

    console.log('✅ BTS-3184 업데이트 완료');
    console.log('Title:', title);

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
