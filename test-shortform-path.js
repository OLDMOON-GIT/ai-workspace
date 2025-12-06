const path = require('path');
const fs = require('fs');

const taskId = '18681426-2dc7-4f64-8d22-39abe686ee46';

// 실제 API 코드는 frontend 폴더에서 실행됨 (process.cwd() = frontend)
// API: const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
const frontendCwd = path.join(process.cwd(), 'trend-video-frontend');
const backendPath = path.join(frontendCwd, '..', 'trend-video-backend');
const taskFolder = path.join(backendPath, 'tasks', taskId);
console.log('Simulated frontend cwd:', frontendCwd);

console.log('backendPath:', backendPath);
console.log('taskFolder:', taskFolder);
console.log('exists:', fs.existsSync(taskFolder));

if (fs.existsSync(taskFolder)) {
  const files = fs.readdirSync(taskFolder);
  console.log('files:', files);

  const videoFile = files.find(f =>
    f.endsWith('.mp4') &&
    !f.startsWith('scene_') &&
    !f.includes('_audio')
  );
  console.log('videoFile:', videoFile);

  if (videoFile) {
    const videoPath = path.join(taskFolder, videoFile);
    console.log('videoPath:', videoPath);

    const normalizedPath = videoPath.replace(/\\/g, '/');
    console.log('normalizedPath:', normalizedPath);

    const tasksMatch = normalizedPath.match(/(tasks|input)\/([^/]+)/);
    console.log('tasksMatch:', tasksMatch);

    if (tasksMatch) {
      const folderName = tasksMatch[2];
      const folderPath = path.join(backendPath, 'tasks', folderName);
      console.log('folderName:', folderName);
      console.log('folderPath:', folderPath);

      const storyPath = path.join(folderPath, 'story.json');
      console.log('storyPath:', storyPath);
      console.log('story.json exists:', fs.existsSync(storyPath));
    }
  }
}
