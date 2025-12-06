const fs = require('fs');
const path = require('path');

const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');

// UTF-8로 읽기
let content = fs.readFileSync(schedulerPath, 'utf-8');

let changes = 0;

// 1. start-image-worker 경로 수정 (Turbopack 우회)
if (content.includes("path.join(process.cwd(), 'start-image-worker.js')")) {
  content = content.replace(
    "path.join(process.cwd(), 'start-image-worker.js')",
    "require.resolve('../../../start-image-worker')"
  );
  changes++;
  console.log('✅ 1. start-image-worker 경로 수정');
}

// 2. Alias exports 추가
if (!content.includes('startAutoTitleGeneration')) {
  const aliasExports = `
// Alias exports for backward compatibility
export const startAutoTitleGeneration = startAutomationScheduler;
export const stopAutoTitleGeneration = stopAutomationScheduler;
export const isAutoTitleGenerationRunning = () => schedulerInterval !== null;
`;
  content = content.trimEnd() + '\n' + aliasExports;
  changes++;
  console.log('✅ 2. Alias exports 추가');
}

if (changes > 0) {
  // UTF-8 BOM 없이 저장
  fs.writeFileSync(schedulerPath, content, { encoding: 'utf-8' });
  console.log('\\n🎉 총 ' + changes + '개 변경 완료!');
} else {
  console.log('\\n⚠️ 변경사항 없음');
}
