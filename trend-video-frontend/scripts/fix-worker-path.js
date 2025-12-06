const fs = require('fs');
const path = require('path');

const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');
let content = fs.readFileSync(schedulerPath, 'utf-8');

// require.resolve를 process.cwd() + 런타임 문자열로 변경
const oldPattern = "require.resolve('../../../start-image-worker')";
const newPattern = "process.cwd() + '/start-image-worker.js'";

if (content.includes(oldPattern)) {
  content = content.replace(oldPattern, newPattern);
  fs.writeFileSync(schedulerPath, content, 'utf-8');
  console.log('✅ Worker path 수정: ' + newPattern);
} else {
  console.log('⚠️ 패턴을 찾을 수 없음');
}
