#!/usr/bin/env node
/**
 * Image Worker Starter
 * 이미지 크롤링 작업을 처리하는 워커 프로세스 시작
 */

const path = require('path');

// ⭐ 환경 변수 로드 (.env.local)
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });

// TypeScript 파일 직접 실행을 위한 설정
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: false,
    skipLibCheck: true,
    resolveJsonModule: true,
    moduleResolution: 'node',
    paths: {
      '@/*': ['./src/*']
    }
  }
});

// 경로 alias 설정
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', path.resolve(__dirname, 'src'));

console.log('🚀 Starting Image Worker...');
console.log('📁 Working directory:', process.cwd());

// 이미지 워커 임포트 및 실행
const ImageWorker = require('./src/workers/image-worker').default;

const worker = new ImageWorker();

// 종료 시그널 처리
process.on('SIGINT', async () => {
  console.log('\n⏹️  Stopping Image Worker...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Stopping Image Worker...');
  await worker.stop();
  process.exit(0);
});

// 에러 처리
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  worker.stop().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  worker.stop().then(() => process.exit(1));
});

// 워커 시작
(async () => {
  try {
    console.log('✅ Image Worker is starting...');
    console.log('⏳ Polling queue for image tasks...');
    console.log('');
    await worker.start();
  } catch (error) {
    console.error('❌ Failed to start Image Worker:', error);
    process.exit(1);
  }
})();