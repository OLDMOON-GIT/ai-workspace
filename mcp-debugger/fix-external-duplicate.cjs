const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/external/bugs/route.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// formatBugId 함수 추가 (없으면)
if (!content.includes('function formatBugId')) {
  const importLine = "import db from '@/lib/mysql';";
  const formatFunc = `import db from '@/lib/mysql';

// 숫자 ID를 BTS- 형식으로 변환
function formatBugId(numId: number | string): string {
  const num = typeof numId === 'string' ? parseInt(numId, 10) : numId;
  return \`BTS-\${String(num).padStart(7, '0')}\`;
}`;
  content = content.replace(importLine, formatFunc);
  console.log('formatBugId 함수 추가');
}

// 첫 번째 INSERT 전에 중복 체크 추가 (GET 요청 처리)
const pattern1 = /const metadata = \{\s+source: 'url-api',[\s\S]*?\};\s+\/\/ AUTO_INCREMENT 사용/;
const replacement1 = `const metadata = {
        source: 'url-api',
        priority,
        category,
        registeredAt: new Date().toISOString()
      };

      // 중복 방지: 최근 10개 버그의 title과 비교
      const [recentBugs1] = await db.query(
        'SELECT id, title FROM bugs ORDER BY created_at DESC LIMIT 10'
      ) as any;
      const dup1 = recentBugs1.find((bug: any) => bug.title === title);
      if (dup1) {
        const existingId = formatBugId(dup1.id);
        const html = \`<!DOCTYPE html><html><head><meta charset="utf-8"><title>중복 버그</title>
<style>body{font-family:system-ui,sans-serif;padding:40px;background:#fef2f2}.card{background:white;padding:30px;border-radius:12px;max-width:500px;margin:0 auto;box-shadow:0 2px 10px rgba(0,0,0,0.1)}h1{color:#ef4444}a{color:#3b82f6}</style></head>
<body><div class="card"><h1>⚠️ 중복 버그</h1><p>동일한 제목의 버그가 이미 존재합니다: <strong>\${existingId}</strong></p><p><a href="/admin/bugs">🔗 버그 목록 보기</a></p></div></body></html>\`;
        return new NextResponse(html, { status: 409, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // AUTO_INCREMENT 사용`;

if (pattern1.test(content)) {
  content = content.replace(pattern1, replacement1);
  console.log('첫 번째 중복 체크 추가');
}

// 두 번째 INSERT 전에 중복 체크 추가 (POST 요청 처리)
const pattern2 = /\/\/ AUTO_INCREMENT 사용 \(id 컬럼 생략\)\s+const \[result\] = await db\.execute\(\s+\`\s+INSERT INTO bugs \(\s+type, title, summary, status, log_path/;
const replacement2 = `// 중복 방지: 최근 10개 버그의 title과 비교
    const [recentBugs] = await db.query(
      'SELECT id, title FROM bugs ORDER BY created_at DESC LIMIT 10'
    ) as any;
    const duplicateBug = recentBugs.find((bug: any) => bug.title === title);
    if (duplicateBug) {
      const existingId = formatBugId(duplicateBug.id);
      return NextResponse.json({
        error: \`동일한 제목의 버그가 이미 존재합니다: \${existingId}\`,
        existingId,
        duplicate: true
      }, { status: 409 });
    }

    // AUTO_INCREMENT 사용 (id 컬럼 생략)
    const [result] = await db.execute(
      \`
        INSERT INTO bugs (
          type, title, summary, status, log_path`;

if (pattern2.test(content)) {
  content = content.replace(pattern2, replacement2);
  console.log('두 번째 중복 체크 추가');
}

fs.writeFileSync(filePath, content);
console.log('external/bugs/route.ts 저장 완료');
