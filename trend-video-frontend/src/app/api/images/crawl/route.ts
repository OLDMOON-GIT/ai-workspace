import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

// 포맷에 따른 비율 결정 함수
function getAspectRatioByFormat(format: string): string {
  if (format === 'longform' || format === '16:9') {
    return '16:9';
  }
  return '9:16'; // shortform, product, sora2 등 나머지
}

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// 크롤링 작업 저장소 (메모리)
const crawlingTasks = new Map<string, {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  logs: string[];
  error?: string;
  createdAt: string;
}>();

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scenes, contentId, imageMode, format, productInfo, metadata, category } = body; // BTS-0000034: imageMode

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: '씬 데이터가 필요합니다.' }, { status: 400 });
    }

    // 작업 ID 생성
    const taskId = crypto.randomUUID();

    // 작업 저장
    crawlingTasks.set(taskId, {
      taskId,
      status: 'pending',
      logs: [],
      createdAt: getLocalDateTime()
    });

    const aspectRatio = getAspectRatioByFormat(format || 'shortform');
    console.log(`✅ 이미지 크롤링 작업 생성: ${taskId} (${scenes.length}개 씬, format: ${format || 'shortform'}, aspect_ratio: ${aspectRatio})`);

    // 임시 JSON 파일 생성
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const tempDir = path.join(backendPath, 'temp');

    // temp 디렉토리가 없으면 생성
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (err) {
      console.log('temp 디렉토리 이미 존재');
    }

    const scenesFilePath = path.join(tempDir, `scenes_${taskId}.json`);
    // ✅ metadata에 format 정보 포함, product_info도 포함 (상품 썸네일용)
    const scenesWithMetadata = {
      scenes: scenes,
      metadata: {
        ...(metadata || {}),  // 기존 metadata 유지
        format: format || metadata?.format || 'shortform',
        aspect_ratio: aspectRatio,
        category: category || metadata?.category,  // ⭐ 카테고리 추가
        imageMode: imageMode || 'whisk'  // BTS-0000034: imageMode 추가
      },
      product_info: productInfo  // ⭐ 상품 정보 추가 (썸네일 포함)
    };
    console.log(`📐 [ImageCrawl API] Metadata: format=${format}, aspect_ratio=${aspectRatio}, category=${category || metadata?.category}`);
    console.log(`🛒 [ImageCrawl API] product_info:`, productInfo ? `thumbnail=${productInfo.thumbnail?.substring(0, 50)}...` : 'none');
    await fs.writeFile(scenesFilePath, JSON.stringify(scenesWithMetadata, null, 2), 'utf-8');

    // Python 스크립트 실행 (백엔드 image_crawler 폴더에 있음)
    const pythonScript = path.join(backendPath, 'src', 'image_crawler', 'image_crawler_working.py');

    // contentId가 있으면 태스크 폴더 경로 계산
    // ⭐ ID 규칙: UUID만 사용 (prefix 없음!)
    // 폴더: tasks/{contentId} (task_ prefix 사용하지 않음)
    let outputDir = null;
    console.log(`[ImageCrawl API] contentId received: ${contentId}`);
    if (contentId) {
      // ⭐ prefix 제거 - UUID만 사용
      let cleanId = contentId;
      if (contentId.startsWith('project_')) {
        cleanId = contentId.replace('project_', '');
      } else if (contentId.startsWith('task_')) {
        cleanId = contentId.replace('task_', '');
      }
      outputDir = path.join(backendPath, 'tasks', cleanId);
      console.log(`[ImageCrawl API] 📁 출력 폴더 설정: ${outputDir}`);
    } else {
      console.log(`[ImageCrawl API] ⚠️ contentId가 전달되지 않음! outputDir이 null로 유지됨`);
    }

    console.log('Python 스크립트 실행:', pythonScript);
    console.log('씬 파일:', scenesFilePath);

    const task = crawlingTasks.get(taskId);
    if (task) {
      task.status = 'processing';
      // BTS-0000034: imageMode에 따른 메시지
      if (imageMode === 'imagefx') {
        task.logs.push(`🚀 ImageFX + Whisk 자동화 시작 (${scenes.length}개 씬)`);
      } else if (imageMode === 'flow') {
        task.logs.push(`🚀 Flow 자동화 시작 (${scenes.length}개 씬)`);
      } else {
        task.logs.push(`🚀 Whisk 자동화 시작 (${scenes.length}개 씬)`);
      }
    }

    // 백그라운드로 Python 실행 (시스템 Python 사용)
    const pythonArgs = [pythonScript, scenesFilePath];
    // BTS-0000034: imageMode에 따른 플래그 추가
    if (imageMode === 'imagefx') {
      pythonArgs.push('--use-imagefx');
    } else if (imageMode === 'flow') {
      pythonArgs.push('--use-flow');
    }
    if (outputDir) {
      pythonArgs.push('--output-dir', outputDir);
    }

    const pythonProcess = spawn('python', pythonArgs, {
      cwd: backendPath,
      detached: false,
      shell: true,
      windowsHide: true  // 이미지 크롤링 완료 시 콘솔 창 자동 숨김
    });

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Python] ${output}`);

      const task = crawlingTasks.get(taskId);
      if (task) {
        task.logs.push(output.trim());
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error(`[Python Error] ${error}`);

      const task = crawlingTasks.get(taskId);
      if (task) {
        task.logs.push(`❌ ${error.trim()}`);
      }
    });

    pythonProcess.on('close', async (code) => {
      console.log(`Python 프로세스 종료: ${code}`);

      const task = crawlingTasks.get(taskId);
      if (task) {
        if (code === 0) {
          task.status = 'completed';
          task.logs.push('✅ 모든 이미지 생성 완료!');
        } else {
          task.status = 'failed';
          task.error = `Python 스크립트가 오류로 종료되었습니다. (코드: ${code})`;
          task.logs.push(task.error);
        }
      }

      // 임시 파일 삭제
      try {
        await fs.unlink(scenesFilePath);
      } catch (err) {
        console.error('임시 파일 삭제 실패:', err);
      }
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: useImageFX ? 'ImageFX + Whisk 자동화가 시작되었습니다.' : 'Whisk 자동화가 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 이미지 크롤링 API 오류:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 });
    }

    const task = crawlingTasks.get(taskId);
    if (!task) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      status: task.status,
      logs: task.logs,
      error: task.error
    });

  } catch (error: any) {
    console.error('❌ 작업 상태 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
