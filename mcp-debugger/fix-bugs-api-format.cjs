const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/bugs/route.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// formatBugId가 없으면 추가
if (!content.includes('formatBugId')) {
  // import 문 다음에 함수 추가
  const importLine = "import db from '@/lib/mysql';";
  const formatFunc = `import db from '@/lib/mysql';

// 숫자 ID를 BTS- 형식으로 변환
function formatBugId(numId: number | string): string {
  const num = typeof numId === 'string' ? parseInt(numId, 10) : numId;
  return \`BTS-\${String(num).padStart(7, '0')}\`;
}`;

  content = content.replace(importLine, formatFunc);

  // id: obj.id를 id: formatBugId(obj.id)로 변경
  content = content.replace('id: obj.id,', 'id: formatBugId(obj.id),');

  fs.writeFileSync(filePath, content);
  console.log('bugs/route.ts formatBugId 추가 완료');
} else {
  console.log('formatBugId 이미 존재함');
}
