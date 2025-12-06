/**
 * 이미지 큐 테스트 스크립트
 * 직접 큐에 이미지 작업을 추가하고 워커를 테스트합니다.
 */

const path = require('path');

// TypeScript 모듈 로드 설정
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

async function testImageQueue() {
  console.log('🧪 이미지 큐 테스트 시작');
  console.log('='.repeat(80));

  // QueueManager 임포트
  const { QueueManager } = require('./src/lib/queue-manager');
  const queueManager = new QueueManager();

  // 테스트 씬 데이터
  const testScenes = [
    {
      scene_number: 1,
      scene_id: 'scene_01',
      narration: 'Test scene 1',
      image_prompt: 'Beautiful mountain landscape at sunrise, professional photography',
      duration: 5.0
    },
    {
      scene_number: 2,
      scene_id: 'scene_02',
      narration: 'Test scene 2',
      image_prompt: 'Modern city skyline at night with lights, urban photography',
      duration: 5.0
    }
  ];

  // 테스트 task 생성
  const taskId = `test_${Date.now()}`;
  const testTask = {
    taskId: taskId,
    type: 'image',
    userId: 'test_user',
    priority: 1,
    metadata: {
      scenes: testScenes,
      useImageFX: false,
      scheduleId: 'test_schedule',
      titleId: 'test_title',
      format: 'shortform'
    },
    logs: [],
    retryCount: 0,
    maxRetries: 3
  };

  try {
    // 1. 큐에 작업 추가
    console.log('\n1️⃣ 큐에 이미지 작업 추가...');
    const enqueuedTask = await queueManager.enqueue(testTask);
    console.log(`✅ 작업 추가됨: ${enqueuedTask.taskId}`);

    // 2. 큐 상태 확인
    console.log('\n2️⃣ 큐 상태 확인...');
    const queuedTasks = await queueManager.getQueue({ type: 'image' });
    console.log(`📊 큐에 있는 image 작업: ${queuedTasks.length}개`);

    // 3. 큐에서 작업 가져오기 테스트
    console.log('\n3️⃣ 큐에서 작업 가져오기 테스트...');
    const dequeuedTask = await queueManager.dequeue('image');

    if (dequeuedTask) {
      console.log(`✅ 작업 가져옴: ${dequeuedTask.taskId}`);
      console.log(`  Status: ${dequeuedTask.status}`);
      console.log(`  Type: ${dequeuedTask.type}`);
      console.log(`  Scenes: ${dequeuedTask.metadata.scenes?.length} 개`);

      // 4. 작업 상태 업데이트
      console.log('\n4️⃣ 작업 상태 업데이트...');
      await queueManager.updateTask(taskId, 'image', {
        status: 'processing',
        startedAt: new Date().toISOString()
      });
      console.log('✅ Status: processing');

      // 5. 로그 추가
      console.log('\n5️⃣ 로그 추가...');
      await queueManager.appendLog(taskId, 'image', '🚀 테스트 로그 1');
      await queueManager.appendLog(taskId, 'image', '✅ 테스트 로그 2');
      console.log('✅ 로그 추가됨');

      // 6. 작업 완료 처리
      console.log('\n6️⃣ 작업 완료 처리...');
      await queueManager.updateTask(taskId, 'image', {
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      console.log('✅ Status: completed');

      // 7. 최종 큐 상태
      console.log('\n7️⃣ 최종 큐 상태:');
      const finalTasks = await queueManager.getQueue({ taskId: taskId });
      console.log(`📊 작업 상태:`);
      finalTasks.forEach(task => {
        console.log(`  ${task.type}: ${task.status}`);
      });

    } else {
      console.log('⚠️  작업을 가져올 수 없음 (이미 처리 중인 작업이 있을 수 있음)');
    }

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  } finally {
    queueManager.close();
    console.log('\n' + '='.repeat(80));
    console.log('✅ 테스트 완료');
  }
}

// 테스트 실행
testImageQueue().catch(console.error);