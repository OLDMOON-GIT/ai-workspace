/**
 * YouTube 업로드 통합테스트
 * BTS-0000021 수정 검증용
 *
 * 테스트 재료: __test__/fixtures/youtube-test-task (원본: 6cadc518-f561-42bd-b60d-7b2b695e1bc3)
 */

import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.join(__dirname, '..');

// MySQL 연결
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trend_video',
  waitForConnections: true,
  connectionLimit: 10
});

const TEST_FIXTURE_ID = 'youtube-test-integration';
const backendPath = path.join(workspaceRoot, 'trend-video-backend');
const fixturePath = path.join(workspaceRoot, '__test__', 'fixtures', 'youtube-test-task');

async function testYouTubeUpload() {
  console.log('🧪 YouTube 업로드 통합테스트 시작');
  console.log('📋 BTS-0000021 수정 검증');
  console.log('📂 Fixture:', fixturePath);
  console.log('');

  try {
    // 0. Fixture 폴더 확인
    console.log('0️⃣ Fixture 폴더 확인...');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture not found: ${fixturePath}`);
    }

    const files = fs.readdirSync(fixturePath);
    console.log('   Fixture 파일 목록:');
    files.forEach(f => console.log('   -', f));
    console.log('');

    // 1. story.json에서 제목과 메타데이터 읽기
    console.log('1️⃣ story.json 읽기...');
    const storyPath = path.join(fixturePath, 'story.json');
    if (!fs.existsSync(storyPath)) {
      throw new Error('story.json not found in fixture');
    }

    const storyContent = fs.readFileSync(storyPath, 'utf-8');
    const story = JSON.parse(storyContent);
    const title = story.title || 'Test Video';
    const description = story.youtube_description?.text || '';

    console.log('✅ story.json 로드 성공');
    console.log('   Title:', title);
    console.log('');

    // 2. 파일 경로 확인
    console.log('2️⃣ 비디오 파일 확인...');

    // 비디오 파일 찾기
    const mp4Files = files.filter(f =>
      f.endsWith('.mp4') &&
      !f.startsWith('scene_') &&
      !f.includes('_audio') &&
      !/^\d+\.mp4$/i.test(f)
    );

    if (mp4Files.length === 0) {
      throw new Error('No video file found in fixture');
    }

    let videoPath = null;
    if (mp4Files.length > 1) {
      // 가장 큰 파일 선택
      let maxSize = 0;
      for (const f of mp4Files) {
        const stats = fs.statSync(path.join(fixturePath, f));
        if (stats.size > maxSize) {
          maxSize = stats.size;
          videoPath = path.join(fixturePath, f);
        }
      }
    } else {
      videoPath = path.join(fixturePath, mp4Files[0]);
    }

    console.log('✅ 비디오 파일:', path.basename(videoPath));
    console.log('   크기:', (fs.statSync(videoPath).size / 1024 / 1024).toFixed(2), 'MB');

    // 썸네일 찾기
    const thumbnailFiles = files.filter(f => f === 'thumbnail.jpg' || f === 'thumbnail.png');
    let thumbnailPath = null;
    if (thumbnailFiles.length > 0) {
      thumbnailPath = path.join(fixturePath, thumbnailFiles[0]);
      console.log('✅ 썸네일:', path.basename(thumbnailPath));
    } else {
      console.log('⚠️ 썸네일 없음');
    }
    console.log('');

    // 3. 메타데이터 JSON 생성
    console.log('3️⃣ 메타데이터 JSON 생성...');
    const credentialsDir = path.join(backendPath, 'config');
    const metadata = {
      title: title,
      description: description,
      tags: ['테스트', 'integration-test'],
      category_id: '27',
      privacy_status: 'unlisted'  // ⭐ 테스트는 unlisted로
    };
    const metadataPath = path.join(credentialsDir, `youtube_metadata_test_${Date.now()}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('✅ 메타데이터 파일 생성:', path.basename(metadataPath));
    console.log('   Privacy:', metadata.privacy_status);
    console.log('');

    // 4. 인증 파일 확인 (admin 사용자 토큰 사용)
    console.log('4️⃣ 인증 파일 확인...');
    const credentialsPath = path.join(credentialsDir, 'youtube_client_secret.json');

    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Credentials not found: ${credentialsPath}`);
    }
    console.log('✅ Credentials 존재');

    // admin 사용자 토큰 찾기
    const configFiles = fs.readdirSync(credentialsDir);
    const tokenFiles = configFiles.filter(f => f.startsWith('youtube_token_') && f.endsWith('.json'));

    if (tokenFiles.length === 0) {
      throw new Error('No YouTube token found. Please authenticate first.');
    }

    const tokenPath = path.join(credentialsDir, tokenFiles[0]);
    console.log('✅ Token 존재:', tokenFiles[0]);
    console.log('');

    // 5. Python CLI 호출 (실제 업로드)
    console.log('5️⃣ YouTube 업로드 시작...');
    const scriptPath = path.join(backendPath, 'src', 'youtube', 'youtube_upload_cli.py');
    const args = [
      '-u',  // unbuffered
      scriptPath,
      '--action', 'upload',
      '--credentials', credentialsPath,
      '--token', tokenPath,
      '--video', videoPath,
      '--metadata', metadataPath
    ];

    if (thumbnailPath) {
      args.push('--thumbnail', thumbnailPath);
    }

    console.log('   명령:', 'python', args.slice(1).join(' '));
    console.log('');

    const pythonProcess = spawn('python', args, {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONPATH: backendPath,
        PYTHONIOENCODING: 'utf-8'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write('   ' + text);
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write('   ⚠️ ' + text);
    });

    await new Promise((resolve, reject) => {
      pythonProcess.on('close', async (code) => {
        console.log('');
        console.log('6️⃣ Python 프로세스 종료 (코드:', code, ')');

        // 메타데이터 파일 정리
        try {
          if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
            console.log('✅ 메타데이터 파일 정리 완료');
          }
        } catch {}

        if (code === 0) {
          console.log('');
          console.log('7️⃣ 결과 파싱...');
          try {
            const lines = output.trim().split('\n').filter(line => line.trim());
            let jsonLine = '';
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i].trim();
              if (line.startsWith('{"success":') || line.startsWith('{"error":')) {
                jsonLine = line;
                break;
              }
            }
            if (jsonLine) {
              const result = JSON.parse(jsonLine);
              if (result.success && result.video_url) {
                console.log('✅ 업로드 성공!');
                console.log('   Video ID:', result.video_id);
                console.log('   Video URL:', result.video_url);
                console.log('');
                resolve(result);
              } else {
                reject(new Error('Upload failed: ' + JSON.stringify(result)));
              }
            } else {
              reject(new Error('No JSON result found in output'));
            }
          } catch (parseError) {
            reject(new Error('JSON parsing failed: ' + parseError.message));
          }
        } else {
          reject(new Error(`Python exited with code ${code}\n${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python: ${error.message}`));
      });
    });

    console.log('');
    console.log('🎉 통합테스트 성공!');
    console.log('');
    console.log('✅ BTS-0000021 수정 검증 완료');
    console.log('   ✓ youtube_upload_cli.py argparse 형식 정상 작동');
    console.log('   ✓ 파일 자동 탐색 정상 작동');
    console.log('   ✓ 메타데이터 JSON 생성 정상 작동');
    console.log('   ✓ PYTHONPATH 설정 정상 작동');
    console.log('   ✓ YouTube 업로드 성공');
    console.log('');
    console.log('📝 테스트 재료: __test__/fixtures/youtube-test-task');
    console.log('   (원본 taskId: 6cadc518-f561-42bd-b60d-7b2b695e1bc3)');

  } catch (error) {
    console.error('');
    console.error('❌ 테스트 실패:', error.message);
    console.error('');
    throw error;
  } finally {
    await db.end();
  }
}

// 테스트 실행
testYouTubeUpload()
  .then(() => {
    console.log('');
    console.log('✅ 모든 테스트 통과');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('❌ 테스트 실패');
    process.exit(1);
  });
