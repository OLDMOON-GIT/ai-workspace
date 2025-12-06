#!/usr/bin/env node
/**
 * bug-db.js 문법 오류 수정
 */
const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'automation', 'bug-db.js');

// 현재 파일 읽기
let content = fs.readFileSync(targetPath, 'utf-8');

// 44번 줄의 깨진 주석+함수 라인 수정
// "// ?レ옄 ID瑜?BTS- ?뺤떇 臾몄옄?대줈 蹂??function formatBugId(numId) {"를 찾아서 수정
content = content.replace(
  /\/\/ [^\n]*function formatBugId\(numId\) \{/,
  '// 숫자 ID를 BTS- 형식 문자열로 변환\nfunction formatBugId(numId) {'
);

// 168-172 라인의 깨진 에러 메시지 수정
content = content.replace(
  /\$\{formatBugId\(existing\.id\)\}\? \?대\? \?깅줉\?\?踰꾧렇\?낅땲\?\?\\n/,
  '${formatBugId(existing.id)}은 이미 등록된 버그입니다.\\n'
);

content = content.replace(
  /  - \?쒕ぉ: /g,
  '  - 제목: '
);

content = content.replace(
  /  - \?곹깭: /g,
  '  - 상태: '
);

content = content.replace(
  /  - \?앹꽦\?\? /g,
  '  - 생성시: '
);

content = content.replace(
  /  - \?섏젙\?\? /g,
  '  - 수정시: '
);

// 파일 저장
fs.writeFileSync(targetPath, content, 'utf-8');
console.log('bug-db.js syntax fixed');
