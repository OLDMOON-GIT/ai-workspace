// BTS-14833: log 타입 추가 패치
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'trend-video-frontend/src/app/my-content/page.tsx');

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // 타입이 없는 log 파라미터를 타입이 있는 것으로 변경
  const oldCode = 'const uniqueNewLogs = statusData.logs.filter((log) => !existingSet.has(log));';
  const newCode = 'const uniqueNewLogs = statusData.logs.filter((log: string) => !existingSet.has(log));';

  if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ log 타입 패치 성공!');
  } else if (content.includes(newCode)) {
    console.log('ℹ️ 이미 패치 적용됨');
  } else {
    console.log('❌ 패턴을 찾을 수 없음');
  }
} catch (err) {
  console.error('❌ 에러:', err.message);
}
