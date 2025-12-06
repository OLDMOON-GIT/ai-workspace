const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/lib/json-utils.cjs';

let content = fs.readFileSync(path, 'utf-8');

// Already patched?
if (content.includes('BTS-0001203')) {
  console.log('✅ Already patched (BTS-0001203)');
  process.exit(0);
}

// Find the insertion point - after Step 0.1
const oldPattern = `  // Step 0.1: 문자열 값 뒤의 괄호 제거 (글자수 카운트 등)
  // "narration": "텍스트"(20자) -> "narration": "텍스트"
  // "narration": "텍스트" (20자) -> "narration": "텍스트"
  fixed = fixed.replace(/"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\s*:\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\s*\\([^)]+\\)/g, '"$1": "$2"');

  // Step 1: JSON 시작점 찾기`;

const newPattern = `  // Step 0.1: 문자열 값 뒤의 괄호 제거 (글자수 카운트 등)
  // "narration": "텍스트"(20자) -> "narration": "텍스트"
  // "narration": "텍스트" (20자) -> "narration": "텍스트"
  fixed = fixed.replace(/"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\s*:\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\s*\\([^)]+\\)/g, '"$1": "$2"');

  // ✅ BTS-0001203: 잘못된 Unicode escape 수정
  // \\u 뒤에 4자리 hex가 아닌 경우 백슬래시를 이스케이프 (\\\\u로 변경)
  // 예: \\upcoming -> \\\\upcoming, \\user -> \\\\user
  fixed = fixed.replace(/\\\\u(?![0-9a-fA-F]{4})/g, '\\\\\\\\u');

  // Step 1: JSON 시작점 찾기`;

if (content.includes(oldPattern)) {
  content = content.replace(oldPattern, newPattern);
  fs.writeFileSync(path, content);
  console.log('✅ BTS-0001203 patched: Unicode escape fix added');
} else {
  console.log('❌ Pattern not found');
  // Debug
  const idx = content.indexOf('Step 0.1');
  if (idx !== -1) {
    console.log('Found Step 0.1 at:', idx);
    console.log(content.substring(idx, idx + 300));
  }
}
