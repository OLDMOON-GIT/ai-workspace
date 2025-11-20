const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 프롬프트 구조 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 숏폼 검증
console.log('【1. 숏폼 검증】');
const shortformPath = path.join(__dirname, 'trend-video-frontend/prompts/prompt_shortform.txt');
const shortformContent = fs.readFileSync(shortformPath, 'utf-8');

const shortformChecks = {
  '8개 씬 구성': shortformContent.includes('총 8개 씬 구성'),
  '씬 0 (40자)': shortformContent.includes('씬 0 (훅): 5초, 40자'),
  '씬 7 (140자)': shortformContent.includes('씬 7 (여운 + CTA): 20초, 140자'),
  '총 800자': shortformContent.includes('총 800자 분량'),
  '120초': shortformContent.includes('120초'),
  'version 3.0': shortformContent.includes('shortform-3.0'),
  'CTA 필수': shortformContent.includes('구독과 좋아요 부탁드립니다'),
  '감정 핵심': shortformContent.includes('재미와 감동의 핵심'),
  '디테일 묘사': shortformContent.includes('디테일 묘사'),
  '예시 간결화': !shortformContent.includes('완벽 예시 1: 엄마의 마지막 소원 (감동 스토리)'),
};

Object.entries(shortformChecks).forEach(([key, value]) => {
  console.log(`${value ? '✅' : '❌'} ${key}`);
});

// 롱폼 검증
console.log('\n【2. 롱폼 검증】');
const longformPath = path.join(__dirname, 'trend-video-frontend/prompts/prompt_longform.txt');
if (fs.existsSync(longformPath)) {
  const longformContent = fs.readFileSync(longformPath, 'utf-8');

  const longformChecks = {
    'Scene 1 CTA': longformContent.includes('Scene 1') && longformContent.includes('구독과 좋아요'),
    'Hook 구조': longformContent.includes('Hook') || longformContent.includes('훅'),
  };

  Object.entries(longformChecks).forEach(([key, value]) => {
    console.log(`${value ? '✅' : '❌'} ${key}`);
  });
} else {
  console.log('⚠️ prompt_longform.txt 파일 없음');
}

// SORA2 검증
console.log('\n【3. SORA2 검증】');
const sora2Path = path.join(__dirname, 'trend-video-frontend/prompts/prompt_sora2.txt');
const sora2Content = fs.readFileSync(sora2Path, 'utf-8');

const sora2Checks = {
  '4개 씬': sora2Content.includes('총 4개 씬'),
  '씬 3 CTA': sora2Content.includes('씬 3') && sora2Content.includes('구독과 좋아요 부탁드립니다'),
  'Vertical 9:16': sora2Content.includes('Vertical 9:16 format'),
  '30초': sora2Content.includes('30초'),
  'version sora2': sora2Content.includes('sora2'),
  '씬 1 몰입': sora2Content.includes('씬 1: 몰입') || sora2Content.includes('씬 1 (몰입)'),
  'CTA 자연스럽게': sora2Content.includes('자연스럽게'),
};

Object.entries(sora2Checks).forEach(([key, value]) => {
  console.log(`${value ? '✅' : '❌'} ${key}`);
});

// sora2_prompt.txt 검증
console.log('\n【4. SORA2 상세 프롬프트 검증】');
const sora2DetailPath = path.join(__dirname, 'trend-video-frontend/prompts/sora2_prompt.txt');
if (fs.existsSync(sora2DetailPath)) {
  const sora2DetailContent = fs.readFileSync(sora2DetailPath, 'utf-8');

  const sora2DetailChecks = {
    '씬 3 CTA': sora2DetailContent.includes('씬 3') && sora2DetailContent.includes('구독과 좋아요'),
    'scene_03_addictive': sora2DetailContent.includes('scene_03_addictive'),
    'CTA 필수 규칙': sora2DetailContent.includes('CTA 필수 규칙'),
  };

  Object.entries(sora2DetailChecks).forEach(([key, value]) => {
    console.log(`${value ? '✅' : '❌'} ${key}`);
  });
} else {
  console.log('⚠️ sora2_prompt.txt 파일 없음');
}

// 상품 검증
console.log('\n【5. 상품 프롬프트 검증】');
const productPath = path.join(__dirname, 'trend-video-frontend/prompts/prompt_product.txt');
if (fs.existsSync(productPath)) {
  const productContent = fs.readFileSync(productPath, 'utf-8');

  const productChecks = {
    '씬 3 CTA': productContent.includes('씬 3') && productContent.includes('상품 링크는 댓글에 있습니다'),
    '구독과 좋아요': productContent.includes('구독과 좋아요 부탁드립니다'),
    'scene_03_cta': productContent.includes('scene_03_cta'),
  };

  Object.entries(productChecks).forEach(([key, value]) => {
    console.log(`${value ? '✅' : '❌'} ${key}`);
  });
} else {
  console.log('⚠️ prompt_product.txt 파일 없음');
}

// JSON 스키마 검증
console.log('\n【6. JSON 스키마 검증】');

// 숏폼 JSON 스키마
const hasShortformSchema = shortformContent.includes('scene_00_hook') &&
                          shortformContent.includes('scene_01_background') &&
                          shortformContent.includes('scene_07_ending');

console.log(`${hasShortformSchema ? '✅' : '❌'} 숏폼 8개 씬 스키마`);

// SORA2 JSON 스키마
const hasSora2Schema = sora2Content.includes('scene_00_hook') &&
                       sora2Content.includes('scene_01_immersion') &&
                       sora2Content.includes('scene_03_addictive');

console.log(`${hasSora2Schema ? '✅' : '❌'} SORA2 4개 씬 스키마`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ 프롬프트 구조 검증 완료');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('💡 OpenAI API 크레딧을 충전한 후 실제 테스트를 진행하세요:');
console.log('   node test-all-formats.js');
