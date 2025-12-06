// 실제 로그 형식 테스트
const line = '[2025-12-04 17:13:40] [AutoScheduler] Channel 상사맨: 상품 제목 생성 실패 (딥링크 오류). 이번 실행 스킵';

console.log('테스트 라인:', line);
console.log('');

// IGNORE 패턴 테스트 (monitor.ts의 패턴)
const IGNORE_PATTERNS = [
  /딥링크 오류.*이번 실행 스킵/i,       // 딥링크 생성 실패 시 스킵 (정상 동작)
  /상품 제목 생성 실패.*딥링크/i,       // 상품 카테고리 스킵 (정상 동작)
];

console.log('=== IGNORE 패턴 테스트 (monitor.ts) ===');
let ignored = false;
for (const p of IGNORE_PATTERNS) {
  const result = p.test(line);
  console.log(result ? '✅' : '❌', p.source, ':', result);
  if (result) ignored = true;
}
console.log('무시됨:', ignored ? 'YES' : 'NO');
console.log('');

// ERROR 패턴 테스트 (monitor.ts의 패턴)
const ERROR_PATTERNS = [
  { pattern: /(?:Error|TypeError|ReferenceError|SyntaxError):\s*(.+)/, type: 'runtime_error' },
  { pattern: /\[(?:ERROR|error|ERR)\]\s*(.+)/, type: 'logged_error' },
  { pattern: /(?:파싱 실패|처리 실패|파일 없음|실패|오류|에러)[:\s-]+\s*(.+)/, type: 'logged_error' },
];

console.log('=== ERROR 패턴 테스트 (monitor.ts) ===');
for (const { pattern, type } of ERROR_PATTERNS) {
  const m = line.match(pattern);
  if (m) {
    console.log('✅ 매칭됨!', type);
    console.log('   패턴:', pattern.source);
    console.log('   캡처:', m[1]);
  }
}
console.log('');

// monitor.ts 로직 시뮬레이션
console.log('=== monitor.ts 로직 시뮬레이션 ===');
console.log('1. IGNORE 패턴 체크...');
for (const pattern of IGNORE_PATTERNS) {
  if (pattern.test(line)) {
    console.log('   → return (무시됨) - 버그 등록 안함!');
    process.exit(0);
  }
}
console.log('   → IGNORE 패턴 없음, 계속...');

console.log('2. ERROR 패턴 체크...');
for (const { pattern, type } of ERROR_PATTERNS) {
  const m = line.match(pattern);
  if (m) {
    console.log('   → 에러 감지! bugCreate 호출됨');
    console.log('   → 타입:', type);
    console.log('   → 메시지:', m[1]);
    break;
  }
}
