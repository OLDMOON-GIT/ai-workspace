import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video',
  charset: 'utf8mb4'
});

const bugId = `BUG-${Date.now()}`;

await connection.execute(`
  INSERT INTO bugs (
    id,
    title,
    summary,
    status,
    metadata,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
`, [
  bugId,
  '썸네일 폰트가 매번 달라지는 문제',
  `근본 원인:
- create_thumbnail.py Line 322-334: 여러 폰트 경로를 순차 탐색
- fonts/ 폴더 내 파일 존재 여부에 따라 다른 폰트 선택
- 시스템 폰트 경로도 포함되어 환경에 따라 결과 상이

현재 폰트 탐색 순서:
1. fonts/*Aggro*B*.ttf (로컬)
2. fonts/SB*B*.ttf (로컬)
3. C:/Windows/Fonts/SBAggroB.ttf
4. C:/Windows/Fonts/SB 어그로 B.ttf
5. C:/Windows/Fonts/Aggravo.ttf
6. C:/Windows/Fonts/NanumGothicExtraBold.ttf
... (계속)

문제점:
- 폰트 파일 추가/삭제 시 다른 폰트 선택됨
- glob 패턴 매칭 결과가 파일명에 따라 달라짐
- 일관된 폰트 고정 필요

해결방안:
1. Aggro 폰트만 사용하도록 고정 (완료)
2. 우선순위 1번 폰트 없으면 에러 발생 (완료)
3. 로그로 사용된 폰트 표시 (완료)`,
  'resolved',
  JSON.stringify({
    affected_files: ['trend-video-backend/src/video_generator/create_thumbnail.py'],
    affected_lines: [322, 323, 324, 334],
    fixed_lines: [322, 327, 340],
    type: 'inconsistent_behavior',
    severity: 'medium',
    fix_commit: 'pending'
  })
]);

console.log(`✅ Bug registered: ${bugId}`);

await connection.end();
