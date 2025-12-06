const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/lib/json-utils.cjs';

let content = fs.readFileSync(path, 'utf-8');
let lines = content.split('\n');

// Already patched?
if (content.includes('BTS-0001203')) {
  console.log('✅ Already patched (BTS-0001203)');
  process.exit(0);
}

// Find "Step 1: JSON 시작점 찾기" line
let insertLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Step 1: JSON 시작점 찾기')) {
    insertLine = i;
    console.log(`Found insertion point at line ${i + 1}`);
    break;
  }
}

if (insertLine === -1) {
  console.log('❌ Insertion point not found');
  process.exit(1);
}

// Insert new code before "Step 1"
const newCode = `
  // ✅ BTS-0001203: 잘못된 Unicode escape 수정
  // \\u 뒤에 4자리 hex가 아닌 경우 백슬래시를 이스케이프 (\\\\u로 변경)
  // 예: \\upcoming -> \\\\upcoming, \\user -> \\\\user
  fixed = fixed.replace(/\\\\u(?![0-9a-fA-F]{4})/g, '\\\\\\\\u');
`;

lines.splice(insertLine, 0, newCode);
console.log('✅ Inserted BTS-0001203 fix');

fs.writeFileSync(path, lines.join('\n'));
console.log('✅ BTS-0001203 Unicode escape fix patched');
