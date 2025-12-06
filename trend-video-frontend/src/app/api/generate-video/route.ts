import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { parseJsonSafely } from '@/lib/json-utils';
import { videoTasks } from '@/lib/video-tasks';
import { createJob } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const execAsync = promisify(exec);

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function normalizeImageSource(source?: string | null) {
  if (!source || source === 'none') {
    return 'none';
  }

  if (source === 'dalle3') {
    return 'dalle';
  }

  if (source === 'google') {
    return 'dalle';
  }

  return source;
}

export async function POST(request: NextRequest) {
  try {
    const { script, title, scenes, promptFormat, imageSource, sourceContentId, userId } = await request.json();

    if (!script || !title) {
      return NextResponse.json(
        { error: 'script와 title이 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 인증 (내부 요청이 아닌 경우)
    const isInternal = request.headers.get('X-Internal-Request') === 'automation-system';
    let userIdToUse = userId; // 자동화 시스템에서 전달한 userId 사용

    if (!isInternal) {
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userIdToUse = user.userId;
    }

    if (!userIdToUse) {
      console.error('❌ [GENERATE-VIDEO] No userId provided');
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // trend-video-backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    // ✅ FIX: sourceContentId(scriptId)가 있으면 그것을 taskId로 사용 (통일!)
    let taskId: string;
    if (sourceContentId) {
      taskId = sourceContentId.replace(/^(task_|title_|script_)/, '');
      console.log(`🔄 [GENERATE-VIDEO] sourceContentId를 taskId로 사용: ${taskId}`);
    } else {
      // ⭐ UUID 형식으로 통일 (content_id와 동일한 규격)
      taskId = crypto.randomUUID();
      console.log(`📁 [GENERATE-VIDEO] 새 taskId 생성 (UUID): ${taskId}`);
    }
    const projectName = taskId;
    const inputPath = path.join(backendPath, 'tasks', projectName);

    // DB에 Job 생성 (jobs 테이블)
    console.log(`📝 [GENERATE-VIDEO] Creating job in DB: ${taskId} for user: ${userIdToUse}`);
    createJob(userIdToUse, taskId, title, promptFormat || 'longform', sourceContentId);

    // 메모리에도 Task 초기화
    videoTasks.set(taskId, {
      status: 'pending',
      progress: 0,
      step: '준비 중...'
    });

    // 비동기로 영상 생성 시작
    generateVideoAsync(taskId, {
      backendPath,
      inputPath,
      projectName,
      title,
      script,
      scenes,
      type: promptFormat || 'longform', // 기본값은 longform
      imageSource: imageSource || 'none', // 이미지 소스 (none, dalle, imagen3 등)
      userId: userIdToUse
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: '영상 생성이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('Error generating video:', error);
    return NextResponse.json(
      { error: error?.message || '영상 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

async function generateVideoAsync(
  taskId: string,
  config: {
    backendPath: string;
    inputPath: string;
    projectName: string;
    title: string;
    script: string;
    scenes?: any[];
    type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';
    imageSource?: string;
    userId: string;
  }
) {
  const { updateJob, addVideoLog } = require('@/lib/db');

  try {
    const task = videoTasks.get(taskId)!;

    // 1. 입력 폴더 생성
    task.progress = 10;
    task.step = '프로젝트 폴더 생성 중...';
    task.status = 'processing';

    // DB 업데이트
    updateJob(taskId, { status: 'processing', progress: 10, step: '프로젝트 폴더 생성 중...' });
    addVideoLog(taskId, '프로젝트 폴더 생성 중...');

    await fs.mkdir(config.inputPath, { recursive: true });
    addVideoLog(taskId, `✅ 프로젝트 폴더 생성 완료: ${config.projectName}`);

    // 2. story.json 생성
    task.progress = 20;
    task.step = 'JSON 대본 작성 중...';
    updateJob(taskId, { progress: 20, step: 'JSON 대본 작성 중...' });
    addVideoLog(taskId, '📝 JSON 대본 작성 중...');

    const storyJson = {
      title: config.title,
      scenes: config.scenes || [
        {
          sceneNumber: 1,
          title: config.title,
          narration: config.script,
          imagePrompt: config.title,
          createdAt: getLocalDateTime() // 생성 시간 추가
        }
      ]
    };

    await fs.writeFile(
      path.join(config.inputPath, 'story.json'),
      JSON.stringify(storyJson, null, 2),
      'utf-8'
    );
    addVideoLog(taskId, `✅ story.json 생성 완료 (씬 개수: ${storyJson.scenes.length}개)`);

    // 3. Python 스크립트 실행 (영상 생성 + 자막 추가)
    task.progress = 40;
    task.step = '영상 생성 중... (몇 분 소요될 수 있습니다)';
    updateJob(taskId, { progress: 40, step: '영상 생성 중... (몇 분 소요될 수 있습니다)' });

    // ⭐ 사용자 선택(type/category) 우선 → story.json은 경고만
    const isVertical = config.type === 'shortform' || config.type === 'product' || config.type === 'product-info';
    const aspectRatio = isVertical ? '9:16' : '16:9';

    // story.json과 불일치 시 경고 (사용자 선택 우선)
    try {
      const storyPath = path.join(config.inputPath, 'story.json');
      const storyContent = await fs.readFile(storyPath, 'utf-8');
      const storyData = JSON.parse(storyContent);
      const format = storyData.metadata?.format || '';
      const storyCategory = storyData.metadata?.category || '';

      const isStoryVertical = format.includes('9:16') || format.toLowerCase().includes('vertical') || storyCategory === '상품';
      const isStoryHorizontal = format.includes('16:9') || format.toLowerCase().includes('horizontal');

      if (isVertical && isStoryHorizontal) {
        const warning = `⚠️ 참고: story.json은 가로형(${format})이지만 사용자 선택(${config.type})에 따라 세로형(9:16)으로 진행`;
        console.warn(warning);
        addVideoLog(taskId, warning);
      } else if (!isVertical && isStoryVertical) {
        const warning = `⚠️ 참고: story.json은 세로형(${format || storyCategory})이지만 사용자 선택(${config.type})에 따라 가로형(16:9)으로 진행`;
        console.warn(warning);
        addVideoLog(taskId, warning);
      }
    } catch {
      // story.json 읽기 실패 - 무시
    }

    console.log(`📐 비율: ${aspectRatio} (사용자 선택: ${config.type}, 카테고리: ${'N/A'})`);

    // 이미지 소스 설정 (none, dalle, imagen3 등)
    const requestedImageSource = config.imageSource || 'none';
    const pythonImageSource = normalizeImageSource(requestedImageSource);
    console.log(`🖼️  이미지 소스: ${requestedImageSource} (Python: ${pythonImageSource})`);

    addVideoLog(taskId, '🎬 영상 생성 시작...');
    addVideoLog(taskId, `🎞️ 비율: ${aspectRatio === '9:16' ? '세로 (9:16)' : '가로 (16:9)'}`);
    addVideoLog(taskId, `🖼️ 이미지 소스: ${requestedImageSource}`);

    const pythonArgs = [
      'src/video_generator/create_video_from_folder.py',
      '--folder', `input/${config.projectName}`,
      '--aspect-ratio', aspectRatio,
      '--add-subtitles',
      '--image-source', pythonImageSource
    ];


    console.log(`Executing: python ${pythonArgs.join(' ')}`);
    addVideoLog(taskId, `실행: python ${pythonArgs.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const pythonProcess = spawn('python', pythonArgs, {
        cwd: config.backendPath,
        shell: true,
        env: {
          ...process.env,
          JOB_ID: taskId  // Python 로깅 핸들러가 사용
        }
      });

      let currentProgress = 40;
      const progressIncrement = 50 / 100; // 40% ~ 90% 사이를 100단계로 나눔

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Python] ${output}`);

        // 로그를 줄 단위로 분리해서 DB에 저장
        const lines = output.split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          addVideoLog(taskId, line);

          // 특정 키워드에 따라 진행률 조정
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('downloading') || lowerLine.includes('다운로드')) {
            currentProgress = Math.max(currentProgress, 45);
            task.step = '미디어 다운로드 중...';
          } else if (lowerLine.includes('generating image') || lowerLine.includes('이미지 생성')) {
            currentProgress = Math.max(currentProgress, 50);
            task.step = '이미지 생성 중...';
          } else if (lowerLine.includes('tts') || lowerLine.includes('음성 생성')) {
            currentProgress = Math.max(currentProgress, 60);
            task.step = 'TTS 음성 생성 중...';
          } else if (lowerLine.includes('subtitle') || lowerLine.includes('자막')) {
            currentProgress = Math.max(currentProgress, 75);
            task.step = '자막 생성 중...';
          } else if (lowerLine.includes('merging') || lowerLine.includes('합치기') || lowerLine.includes('병합')) {
            currentProgress = Math.max(currentProgress, 85);
            task.step = '영상 병합 중...';
          } else if (lowerLine.includes('scene') && lowerLine.match(/\d+/)) {
            // 씬 번호 감지
            const sceneMatch = line.match(/scene[_\s]*(\d+)/i) || line.match(/씬[_\s]*(\d+)/);
            if (sceneMatch) {
              const sceneNum = parseInt(sceneMatch[1]);
              addVideoLog(taskId, `🎬 씬 ${sceneNum} 처리 중...`);
            }
          }

          // 진행률 증가 (최대 90%까지)
          if (currentProgress < 90) {
            currentProgress = Math.min(90, currentProgress + progressIncrement);
            task.progress = Math.floor(currentProgress);
            updateJob(taskId, { progress: Math.floor(currentProgress), step: task.step });
          }
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`[Python Error] ${output}`);

        // 에러도 로그에 저장
        const lines = output.split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          addVideoLog(taskId, `⚠️ ${line}`);
        });
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Python process completed successfully');
          addVideoLog(taskId, '✅ Python 스크립트 실행 완료');
          resolve();
        } else {
          console.error(`❌ Python process exited with code ${code}`);
          addVideoLog(taskId, `❌ Python 스크립트 실패 (exit code: ${code})`);
          reject(new Error(`Python process exited with code ${code}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('❌ Python process error:', error);
        addVideoLog(taskId, `❌ Python 실행 에러: ${error.message}`);
        reject(error);
      });

      // 60분 타임아웃
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Python execution timeout (60 minutes)'));
      }, 3600000);
    });

    // 4. 생성된 영상 찾기
    task.progress = 90;
    task.step = '영상 파일 확인 중...';
    updateJob(taskId, { progress: 90, step: '영상 파일 확인 중...' });
    addVideoLog(taskId, '영상 파일 확인 중...');

    const generatedPath = path.join(config.inputPath, 'generated_videos');
    const files = await fs.readdir(generatedPath);

    // story.json에서 제목 가져와서 파일명 생성 (유도리있는 파서 사용)
    let expectedFileName: string | null = null;
    try {
      const storyJsonPath = path.join(config.inputPath, 'story.json');
      const storyJsonContent = await fs.readFile(storyJsonPath, 'utf-8');
      const parseResult = parseJsonSafely(storyJsonContent, { logErrors: true });

      if (!parseResult.success) {
        throw new Error('story.json 파싱 실패: ' + parseResult.error);
      }

      const storyData = parseResult.data;
      if (parseResult.fixed) {
        console.log('🔧 story.json 자동 수정 적용됨');
      }

      const title = storyData.title || storyData.metadata?.title || 'video';

      // 안전한 파일명으로 변환 (Python과 동일한 로직)
      const safeTitle = title.replace(/[^a-zA-Z0-9가-힣\s._-]/g, '').trim().replace(/\s+/g, '_');
      expectedFileName = `${safeTitle}.mp4`;
      console.log('📝 예상 파일명:', expectedFileName);
    } catch (error) {
      console.log('⚠️ 제목 기반 파일명 생성 실패, 기본 탐색 진행');
    }

    // 1순위: 제목 기반 파일명 찾기
    let videoFile = expectedFileName ? files.find(f => f === expectedFileName) : null;

    // 2순위: merged.mp4 찾기
    if (!videoFile) {
      videoFile = files.find(f => f === 'merged.mp4');
    }

    // 3순위: scene_를 포함하지 않는 다른 mp4 파일 찾기
    if (!videoFile) {
      videoFile = files.find(f => f.endsWith('.mp4') && !f.includes('scene_'));
    }

    if (!videoFile) {
      throw new Error('생성된 영상 파일을 찾을 수 없습니다.');
    }

    const videoPath = path.join(generatedPath, videoFile);
    console.log('✅ 최종 영상 발견:', videoFile);

    // 썸네일 찾기 (youtube_thumbnail.jpg)
    let thumbnailPath: string | undefined;
    try {
      const thumbnailFile = path.join(config.inputPath, 'youtube_thumbnail.jpg');
      const thumbnailExists = await fs.access(thumbnailFile).then(() => true).catch(() => false);
      if (thumbnailExists) {
        thumbnailPath = thumbnailFile;
        console.log('Thumbnail found:', thumbnailPath);
      }
    } catch (err) {
      console.warn('Thumbnail not found, skipping...');
    }

    // 5. 완료
    task.progress = 100;
    task.step = '완료!';
    task.status = 'completed';
    task.videoPath = videoPath;
    task.thumbnailPath = thumbnailPath;
    task.videoId = taskId; // videoId 설정

    // DB 업데이트 (완료)
    updateJob(taskId, {
      status: 'completed',
      progress: 100,
      step: '완료!',
      videoPath: videoPath,
      thumbnailPath: thumbnailPath
    });
    addVideoLog(taskId, '✅ 영상 생성 완료!');
    console.log(`✅ [GENERATE-VIDEO] Job ${taskId} completed successfully`);

  } catch (error: any) {
    console.error(`Task ${taskId} failed:`, error);
    const task = videoTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error.message || '알 수 없는 오류';
    }

    // DB 업데이트 (실패)
    updateJob(taskId, {
      status: 'failed',
      error: error.message || '알 수 없는 오류'
    });
    addVideoLog(taskId, `❌ 영상 생성 실패: ${error.message}`);
    console.error(`❌ [GENERATE-VIDEO] Job ${taskId} failed:`, error);
  }
}

// 영상 생성 진행 상태 확인
export async function GET(request: NextRequest) {
  const { findJobById } = require('@/lib/db');

  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 1. 메모리에서 먼저 찾기 (실시간 업데이트용)
    let task = videoTasks.get(taskId);

    // 2. 메모리에 없으면 DB에서 찾기
    if (!task) {
      const dbTask = findJobById(taskId);
      if (!dbTask) {
        return NextResponse.json(
          { error: '작업을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // DB Task를 메모리 형식으로 변환
      task = {
        status: dbTask.status,
        progress: dbTask.progress,
        step: dbTask.step,
        videoPath: dbTask.videoPath,
        thumbnailPath: dbTask.thumbnailPath,
        videoId: dbTask.id,
        error: dbTask.error
      };
    }

    // 완료된 경우 영상 파일 URL 생성
    let videoUrl = null;
    let thumbnailUrl = null;
    if (task.status === 'completed' && task.videoPath) {
      // 파일 경로를 상대 URL로 변환 (프로덕션에서는 별도 저장소 필요)
      videoUrl = `/api/download-video?taskId=${taskId}`;
    }
    if (task.status === 'completed' && task.thumbnailPath) {
      thumbnailUrl = `/api/download-thumbnail?taskId=${taskId}`;
    }

    return NextResponse.json({
      status: task.status,
      progress: task.progress,
      step: task.step,
      videoUrl,
      thumbnailUrl,
      videoId: task.videoId || taskId,
      error: task.error || null
    });

  } catch (error: any) {
    console.error('Error checking video status:', error);
    return NextResponse.json(
      { error: error?.message || '상태 확인 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
