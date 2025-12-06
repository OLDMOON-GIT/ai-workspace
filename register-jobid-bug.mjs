import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

// Get next bug ID
const [rows] = await conn.query(`
  SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) as max_seq
  FROM bugs
  WHERE id REGEXP '^BTS-[0-9]{7}$'
`);
const maxSeq = rows[0]?.max_seq || 0;
const bugId = 'BTS-' + String(maxSeq + 1).padStart(7, '0');

// Insert bug
await conn.execute(`
  INSERT INTO bugs (id, title, summary, status, log_path, created_at, updated_at, assigned_to, metadata)
  VALUES (?, ?, ?, 'open', 'server.log', NOW(), NOW(), 'auto', ?)
`, [
  bugId,
  'shortform 영상 생성 실패 - 이미지 소스 none일 때 MP4 미생성',
  `task: 80ddfcfd-6e95-4c30-baa7-4092ec27e806
타입: shortform
이미지 소스: none
비율: 9:16
음성: ko-KR-SoonBokNeural

에러:
- Video file not found. Task 폴더에 MP4 파일이 없습니다 (전체 파일: 12개)
- thumbnail.jpg는 생성됨, video.mp4는 생성 실패
- 통합 정렬 결과: 8개, 비디오 정렬 결과: 0개
- Python 프로세스가 코드 1로 종료됨

150 크레딧이 환불됨.

원인 추정:
- 이미지 소스가 none인 경우 비디오 클립 정렬이 0개로 나와 영상 생성 실패`,
  JSON.stringify({
    type: 'runtime-error',
    source: 'user-report',
    task_id: '80ddfcfd-6e95-4c30-baa7-4092ec27e806',
    error_type: 'SHORTFORM_VIDEO_GENERATION_FAILED',
    image_source: 'none'
  })
]);

console.log('버그 등록 완료:', bugId);
await conn.end();
