// 영상 생성 API 테스트
import fs from 'fs';
import path from 'path';

const taskId = '94cd4388-b6f9-4359-9f82-ab31a4f408eb';
const backendPath = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend';
const taskFolder = path.join(backendPath, 'tasks', taskId);
const storyPath = path.join(taskFolder, 'story.json');

console.log(`📁 Task folder: ${taskFolder}`);
console.log(`📄 Story path: ${storyPath}`);

// story.json 존재 확인
if (!fs.existsSync(storyPath)) {
  console.error('❌ story.json not found!');
  process.exit(1);
}

// story.json 읽기
const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
console.log(`✅ Story loaded: ${story.scenes?.length || 0} scenes`);
console.log(`📝 Title: ${story.title}`);

// API 호출
const requestBody = {
  scriptId: taskId,
  mediaMode: 'whisk',
  type: 'shortform',
  imageSource: 'none'
};

console.log('\n📤 Calling API: POST /api/videos/generate');
console.log('Body:', JSON.stringify(requestBody, null, 2));

try {
  const response = await fetch('http://localhost:2000/api/videos/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Request': 'automation-system'
    },
    body: JSON.stringify(requestBody)
  });

  console.log(`\n📥 Response status: ${response.status}`);

  const result = await response.json();
  console.log('Response:', JSON.stringify(result, null, 2));

  if (response.ok) {
    console.log('\n✅ SUCCESS! Video generation started');
    console.log(`Task ID: ${result.taskId}`);
  } else {
    console.log('\n❌ FAILED!');
    process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}
