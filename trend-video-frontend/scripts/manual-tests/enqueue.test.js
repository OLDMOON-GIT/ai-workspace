#!/usr/bin/env node
/**
 * 테스트 작업을 큐에 추가하는 스크립트
 */

const path = require('path');

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

// QueueManager 임포트
const { QueueManager } = require('./src/lib/queue-manager');

const manager = new QueueManager();

const taskId = 'test_' + Date.now();
const scenes = [{
  scene_number: 1,
  image_prompt: 'Beautiful mountain landscape at sunrise'
}];

manager.enqueue({
  taskId: taskId,
  type: 'image',
  priority: 0,
  userId: 'test-user',
  metadata: {
    scenes: scenes,
    useImageFX: false
  },
  logs: [],
  retryCount: 0,
  maxRetries: 3
});

console.log('✅ Task enqueued:', taskId);
manager.close();
