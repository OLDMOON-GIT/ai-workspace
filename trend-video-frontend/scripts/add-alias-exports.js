const fs = require('fs');
const path = require('path');

const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');
let content = fs.readFileSync(schedulerPath, 'utf-8');

// 파일 끝에 alias export 추가
const aliasExports = `
// Alias exports for backward compatibility
export const startAutoTitleGeneration = startAutomationScheduler;
export const stopAutoTitleGeneration = stopAutomationScheduler;
export const isAutoTitleGenerationRunning = () => schedulerInterval !== null;
`;

if (!content.includes('startAutoTitleGeneration')) {
  content = content.trimEnd() + '\n' + aliasExports;
  fs.writeFileSync(schedulerPath, content, 'utf-8');
  console.log('✅ Alias exports 추가 완료');
} else {
  console.log('⚠️ Alias exports 이미 존재');
}
