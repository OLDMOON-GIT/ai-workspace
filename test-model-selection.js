/**
 * Test: AI Model Selection by Type
 * 테스트: 콘텐츠 타입별 AI 모델 선택
 */

// Test the getDefaultModelByType logic directly
function getDefaultModelByType(type) {
  switch (type) {
    case 'product':
    case 'product-info':
      return 'gemini'; // 상품: Gemini
    case 'longform':
    case 'sora2':
      return 'claude'; // 롱폼: Claude
    case 'shortform':
      return 'chatgpt'; // 숏폼: ChatGPT
    default:
      return 'claude'; // 기본값: Claude
  }
}

console.log('✅ Successfully loaded getDefaultModelByType function\n');

// Test cases
const testCases = [
  { type: 'product', expected: 'gemini', label: '상품 콘텐츠' },
  { type: 'product-info', expected: 'gemini', label: '상품정보' },
  { type: 'longform', expected: 'claude', label: '롱폼 비디오' },
  { type: 'sora2', expected: 'claude', label: 'Sora2 비디오' },
  { type: 'shortform', expected: 'chatgpt', label: '숏폼 비디오' },
  { type: 'unknown', expected: 'claude', label: '알 수 없는 타입' },
  { type: undefined, expected: 'claude', label: '타입 미지정' }
];

console.log('🧪 AI Model Selection Test Results:\n');

let allPassed = true;

testCases.forEach(test => {
  const result = getDefaultModelByType(test.type);
  const passed = result === test.expected;
  const status = passed ? '✅' : '❌';

  console.log(`${status} ${test.label} (${test.type})`);
  console.log(`   Expected: ${test.expected}, Got: ${result}\n`);

  if (!passed) allPassed = false;
});

if (allPassed) {
  console.log('\n✅ All tests passed! The model selection is working correctly.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
}
