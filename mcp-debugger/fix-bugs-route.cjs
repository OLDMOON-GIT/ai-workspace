const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/bugs/route.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 정규식으로 해당 블록 찾아서 교체
const pattern = /\/\/ bug_sequence에서 다음 번호 생성.*?return NextResponse\.json\(\{ id, success: true \}\);/s;

const newCode = `// AUTO_INCREMENT 사용 (id 컬럼 생략)
    const [result] = await db.execute(
      \`
        INSERT INTO bugs (
          type, title, summary, status, log_path, screenshot_path, video_path, trace_path,
          resolution_note, created_at, updated_at, assigned_to, metadata
        ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)
      \`,
      [
        type,
        title,
        summary || null,
        null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify(metadata || {})
      ]
    ) as any;

    const id = \`BTS-\${String(result.insertId).padStart(7, '0')}\`;
    return NextResponse.json({ id, success: true });`;

if (pattern.test(content)) {
  content = content.replace(pattern, newCode);
  fs.writeFileSync(filePath, content);
  console.log('bugs/route.ts 수정 완료');
} else {
  console.log('수정할 코드를 찾지 못했습니다.');
  console.log('bug_sequence 검색:', content.includes('bug_sequence'));
}
