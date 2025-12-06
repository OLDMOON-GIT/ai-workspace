const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/external/bugs/route.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 첫 번째 위치 수정 (GET 요청 처리 부분)
const pattern1 = /\/\/ bug_sequence에서 다음 번호 생성\s+await db\.execute\(`UPDATE bug_sequence.*?const id = `BTS-\$\{String\(nextNum\)\.padStart\(7, '0'\)\}`;\s+await db\.execute\(\s+`INSERT INTO bugs \(id, type, title, summary, status, created_at, updated_at, metadata\)\s+VALUES \(\?, \?, \?, \?, 'open', NOW\(\), NOW\(\), \?\)`,\s+\[id, type, title, summary \|\| null, JSON\.stringify\(metadata\)\]\s+\);/s;

const newCode1 = `// AUTO_INCREMENT 사용 (id 컬럼 생략)
      const [result] = await db.execute(
        \`INSERT INTO bugs (type, title, summary, status, created_at, updated_at, metadata)
         VALUES (?, ?, ?, 'open', NOW(), NOW(), ?)\`,
        [type, title, summary || null, JSON.stringify(metadata)]
      ) as any;

      const id = \`BTS-\${String(result.insertId).padStart(7, '0')}\`;`;

// 두 번째 위치 수정 (POST 요청 처리 부분)
const pattern2 = /\/\/ bug_sequence에서 다음 번호 생성\s+await db\.execute\(`UPDATE bug_sequence.*?const id = `BTS-\$\{String\(nextNum\)\.padStart\(7, '0'\)\}`;\s+await db\.execute\(\s+`\s+INSERT INTO bugs \(\s+id, type, title, summary, status, log_path, screenshot_path, video_path, trace_path,\s+resolution_note, created_at, updated_at, assigned_to, metadata\s+\) VALUES \(\?, \?, \?, \?, 'open', NULL, NULL, NULL, NULL, NULL, NOW\(\), NOW\(\), NULL, \?\)\s+`,\s+\[id, type, title, summary \|\| null, JSON\.stringify\(metadata\)\]\s+\);/s;

const newCode2 = `// AUTO_INCREMENT 사용 (id 컬럼 생략)
    const [result] = await db.execute(
      \`
        INSERT INTO bugs (
          type, title, summary, status, log_path, screenshot_path, video_path, trace_path,
          resolution_note, created_at, updated_at, assigned_to, metadata
        ) VALUES (?, ?, ?, 'open', NULL, NULL, NULL, NULL, NULL, NOW(), NOW(), NULL, ?)
      \`,
      [type, title, summary || null, JSON.stringify(metadata)]
    ) as any;

    const id = \`BTS-\${String(result.insertId).padStart(7, '0')}\`;`;

let modified = false;

if (pattern1.test(content)) {
  content = content.replace(pattern1, newCode1);
  modified = true;
  console.log('첫 번째 위치 수정 완료');
}

if (pattern2.test(content)) {
  content = content.replace(pattern2, newCode2);
  modified = true;
  console.log('두 번째 위치 수정 완료');
}

if (modified) {
  fs.writeFileSync(filePath, content);
  console.log('external/bugs/route.ts 저장 완료');
} else {
  console.log('수정할 코드를 찾지 못했습니다.');
  console.log('bug_sequence 검색:', content.includes('bug_sequence'));
}
