const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/automation/bug-db.js';
let content = fs.readFileSync(filePath, 'utf-8');

// 이미 중복 체크가 있는지 확인
if (content.includes('중복 방지: 최근 10개 버그의 title과 비교')) {
  console.log('bug-db.js에 이미 중복 체크 있음');
  process.exit(0);
}

const oldCode = `  // id가 있으면 BTS- 프리픽스 제거 후 숫자로 사용
  let numericId = id ? parseBugId(id) : null;

  try {`;

const newCode = `  // id가 있으면 BTS- 프리픽스 제거 후 숫자로 사용
  let numericId = id ? parseBugId(id) : null;

  // 중복 방지: 최근 10개 버그의 title과 비교
  const [recentBugs] = await pool.query(
    'SELECT id, title FROM bugs ORDER BY created_at DESC LIMIT 10'
  );
  const duplicateBug = recentBugs.find((bug) => bug.title === title);
  if (duplicateBug) {
    const existingId = formatBugId(duplicateBug.id);
    throw new Error(\`동일한 제목의 버그가 이미 존재합니다: \${existingId}\`);
  }

  try {`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content);
  console.log('bug-db.js 중복 체크 추가 완료');
} else {
  console.log('수정할 코드를 찾지 못했습니다.');
}
