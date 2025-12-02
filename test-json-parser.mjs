import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseJsonSafely } = require('./trend-video-frontend/src/lib/json-utils.cjs');

const filePath = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\tasks\\14d8d605-f6d0-4176-9f55-ee45b77c92d9\\story.json';

console.log('📄 Reading file:', filePath);
const content = readFileSync(filePath, 'utf-8');

console.log('📏 File length:', content.length);
console.log('🔍 Position 8470-8480:', content.substring(8470, 8480));
console.log('');

console.log('🧪 Testing parseJsonSafely...');
const result = parseJsonSafely(content);

console.log('✅ Success:', result.success);
console.log('🔧 Fixed:', result.fixed);

if (!result.success) {
  console.log('❌ Error:', result.error);
} else {
  console.log('✅ Parsed successfully!');
  console.log('📊 Scenes count:', result.data.scenes?.length);
}
