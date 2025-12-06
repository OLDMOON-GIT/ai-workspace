/**
 * Image Crawler Worker
 *
 * 큐에서 이미지 크롤링 작업을 가져와 실행하는 워커 프로세스
 * task_id 기반으로 작업을 관리합니다.
 *
 * ⚠️ ID 규칙:
 * - task_id = task_schedule.task_id (동일한 값 사용)
 * - 출력 폴더: task_{task_id} 형식
 * - triggerVideoGeneration()에서 task_id로 스케줄 검색
 */

import { QueueManager, QueueTask } from '@/lib/queue-manager';
import { addTitleLog } from '@/lib/automation';
import { addContentLog } from '@/lib/content';
import { parseJsonSafely } from '@/lib/json-utils';  // ⭐ 유도리 파싱 - 전역 적용 필수
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { getOne, run } from '@/lib/mysql';

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

class ImageWorker {
  private manager: QueueManager;
  private running: boolean = false;
  private currentTask: QueueTask | null = null;

  constructor() {
    this.manager = new QueueManager();
  }

  async start() {
    this.running = true;
    console.log('🚀 Image crawler worker started');
    console.log('⏱️  Polling interval: 5 seconds');

    let pollCount = 0;
    while (this.running) {
      try {
        pollCount++;
        console.log(`\n🔍 [Poll #${pollCount}] Checking queue for image tasks...`);

        // 1. 큐에서 다음 작업 가져오기 (script 단계가 완료된 것만)
        this.currentTask = await this.manager.dequeue('image');

        if (!this.currentTask) {
          // 작업 없음, 5초 대기
          console.log(`   ⏸️  No tasks available. Waiting 5 seconds...`);
          await this.sleep(5000);
          continue;
        }

        const taskId = this.currentTask.taskId;
        console.log(`\n▶️  Processing image task: ${taskId}`);
        await this.manager.appendLog(taskId, 'image', '🚀 이미지 크롤링 시작...');
        addTitleLog(taskId, 'info', '🖼️ 이미지 크롤링 작업 시작', 'image');
        addContentLog(taskId, '🚀 이미지 크롤링 시작...', 'image');

        // 2. 작업 실행
        await this.processTask(this.currentTask);

        // 3. task_time_log 종료 시간 기록
        await run(`
          UPDATE task_time_log
          SET end_time = ?
          WHERE task_id = ? AND type = ? AND end_time IS NULL
          ORDER BY retry_cnt DESC LIMIT 1
        `, [getLocalDateTime(), taskId, 'image']);

        await this.manager.appendLog(taskId, 'image', '✅ 이미지 크롤링 완료!');
        addTitleLog(taskId, 'info', '✅ 이미지 크롤링 완료 → 영상 제작 대기', 'image');
        addContentLog(taskId, '✅ 이미지 크롤링 완료!', 'image');
        console.log(`✅ Image task completed: ${taskId}`);

        // 4. ⭐ 영상 제작으로 바로 전환 (completed 없이)
        await this.triggerVideoGeneration(taskId);

      } catch (error: any) {
        console.error(`❌ Image task failed:`, error);

        if (this.currentTask) {
          const taskId = this.currentTask.taskId;
          // ⭐ 자동 재시도 제거 - 사용자가 수동으로 재시도
          await this.manager.updateTask(taskId, 'image', {
            state: 'failed',
            completedAt: getLocalDateTime(),
            error: error.message
          });
          await this.manager.appendLog(
            taskId, 'image',
            `❌ 실패: ${error.message}`
          );
        }
      } finally {
        this.currentTask = null;
      }
    }

    console.log('🛑 Image crawler worker stopped');
  }

  async stop() {
    this.running = false;
    if (this.currentTask) {
      // 중지 시 현재 작업을 cancelled 상태로 변경
      console.log(`⚠️ [STOP] Cancelling task: ${this.currentTask.taskId}`);
      await this.manager.updateTask(this.currentTask.taskId, 'image', {
        state: 'cancelled'
      });
    }
    this.manager.close();
  }

  private async processTask(task: QueueTask): Promise<void> {
    const { metadata, taskId } = task;
    const { scriptId, useImageFX: metadataUseImageFX } = metadata || {};
    // ⭐ useImageFX는 metadata에서 먼저 체크, 없으면 format으로 결정

    // ⭐ story.json에서 scenes 데이터 읽기 (metadata 대신)
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolderPath = path.join(backendPath, 'tasks', taskId);
    const storyJsonPath = path.join(taskFolderPath, 'story.json');

    // story.json 존재 확인 - ⭐ parseJsonSafely 사용 (유도리 파싱)
    // 전역 JSON 파싱 시 반드시 parseJsonSafely 사용! (title에 따옴표 등 특수문자 대응)
    let storyData: any;
    try {
      const storyContent = await fs.readFile(storyJsonPath, 'utf-8');
      const parseResult = parseJsonSafely(storyContent);
      if (!parseResult.success) {
        throw new Error(parseResult.error || 'JSON 파싱 실패');
      }
      storyData = parseResult.data;
    } catch (error: any) {
      throw new Error(`story.json 파일을 읽을 수 없습니다: ${storyJsonPath} - ${error.message}`);
    }

    const scenes = storyData.scenes;
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      throw new Error(`story.json에 씬 데이터가 없습니다: ${storyJsonPath}`);
    }

    // ⭐ product_info 로깅 (story.json에서 직접 읽음)
    const productInfo = storyData.product_info;
    if (productInfo) {
      const productTitle = storyData.title || productInfo.title || '상품';
      await this.manager.appendLog(taskId, 'image', `🛒 상품: ${productTitle}`);
      addTitleLog(taskId, 'info', `🛒 상품 정보 확인: ${productTitle.substring(0, 30)}...`);
    }

    // ⭐ content 테이블에서 prompt_format, category, product_info 조회 (통합 키 시스템)
    const contentRow = await getOne(`SELECT prompt_format, category, product_info FROM content WHERE content_id = ?`, [taskId]) as { prompt_format: string; category: string; product_info: string } | undefined;
    const taskPromptFormat = contentRow?.prompt_format;
    const taskCategory = contentRow?.category;
    const taskProductInfo = contentRow?.product_info;
    console.log(`[ImageWorker] content.prompt_format from DB: ${taskPromptFormat}, category: ${taskCategory}`);

    // format 결정: ⭐ metadata.promptFormat (1순위) > DB prompt_format > category 기반 기본값
    const storyMetadata = storyData.metadata || {};
    const validFormats = ['longform', 'shortform', 'product', 'product-info', 'sora2'];
    // 🐛 FIX: category가 '상품'이거나 product_info가 있으면 기본값을 'product'로 설정
    const isProductCategory = taskCategory === '상품' || !!taskProductInfo;
    // ⭐ 1순위: metadata.promptFormat (story.json에서 대본 생성 시 설정됨)
    const effectiveFormat = (storyMetadata.promptFormat && validFormats.includes(storyMetadata.promptFormat))
      ? storyMetadata.promptFormat
      : (taskPromptFormat && validFormats.includes(taskPromptFormat)
          ? taskPromptFormat
          : (isProductCategory ? 'product' : 'longform'));
    const aspectRatio = (effectiveFormat === 'longform') ? '16:9' : '9:16';
    // ⭐ useImageFX 결정: metadata에서 명시적으로 설정 > format 기반 자동 결정
    // metadata.useImageFX가 boolean이면 그 값 사용, 아니면 longform일 때 true
    const useImageFX = typeof metadataUseImageFX === 'boolean'
      ? metadataUseImageFX
      : (effectiveFormat === 'longform');
    console.log(`[ImageWorker] format 결정: DB=${taskPromptFormat}, metadata.promptFormat=${storyMetadata.promptFormat}, metadata.useImageFX=${metadataUseImageFX}, effective=${effectiveFormat}, useImageFX=${useImageFX}`);

    await this.manager.appendLog(taskId, 'image', `📋 ${scenes.length}개 씬 발견 (format: ${effectiveFormat}, ratio: ${aspectRatio})`);
    addTitleLog(taskId, 'info', `📋 총 ${scenes.length}개 씬 이미지 크롤링 예정`, 'image');
    addContentLog(taskId, `📋 ${scenes.length}개 씬 발견 (format: ${effectiveFormat}, ratio: ${aspectRatio})`, 'image');

    // Python 스크립트 경로 - working 버전 사용 (로그 기능 포함)
    const pythonScript = path.join(backendPath, 'src', 'image_crawler', 'image_crawler_working.py');

    // ⭐ story.json을 직접 사용 (임시 파일 불필요)
    const scenesFilePath = storyJsonPath;

    // 출력 디렉토리 = task 폴더
    const outputDir = taskFolderPath;

    await this.manager.appendLog(taskId, 'image', `📁 출력 폴더: ${outputDir}`);
    addContentLog(taskId, `📁 출력 폴더: ${outputDir}`, 'image');

    // Python 실행
    const pythonArgs = [pythonScript, scenesFilePath];
    if (useImageFX) {
      pythonArgs.push('--use-imagefx');
    }
    pythonArgs.push('--output-dir', outputDir);
    pythonArgs.push('--aspect-ratio', aspectRatio);  // ⭐ 롱폼: 16:9, 숏폼: 9:16
    console.log(`[ImageWorker] Python args: ${pythonArgs.join(' ')}`);

    await this.manager.appendLog(
      taskId, 'image',
      useImageFX ? '🚀 ImageFX + Whisk 자동화 시작' : '🚀 Whisk 자동화 시작'
    );
    addContentLog(taskId, useImageFX ? '🚀 ImageFX + Whisk 자동화 시작' : '🚀 Whisk 자동화 시작', 'image');

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', pythonArgs, {
        cwd: backendPath,
        shell: true,
        windowsHide: true  // 이미지 크롤링 완료 시 콘솔 창 자동 숨김
      });

      // 줄 단위 버퍼링
      let stdoutBuffer = '';
      let stderrBuffer = '';

      pythonProcess.stdout.on('data', async (data) => {
        stdoutBuffer += data.toString();

        // 줄바꿈으로 완성된 줄들만 처리
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ''; // 마지막 불완전한 줄은 버퍼에 보관

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            console.log(`[Python] ${trimmed}`);
            await this.manager.appendLog(taskId, 'image', trimmed);
            // 주요 진행 상황은 script.log에도 추가
            if (trimmed.includes('씬') || trimmed.includes('scene') || trimmed.includes('완료') || trimmed.includes('다운로드') || trimmed.includes('검색')) {
              addTitleLog(taskId, 'info', `🔄 ${trimmed.substring(0, 100)}`);
            }
          }
        }
      });

      pythonProcess.stderr.on('data', async (data) => {
        stderrBuffer += data.toString();

        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            console.error(`[Python Error] ${trimmed}`);
            await this.manager.appendLog(taskId, 'image', `❌ ${trimmed}`);
          }
        }
      });

      pythonProcess.on('close', async (code) => {
        console.log(`Python 프로세스 종료: ${code}`);

        // ⚠️ story.json은 삭제하지 않음 (영상 제작에서 재사용)

        if (code === 0) {
          // ⭐ 이미지 파일이 실제로 저장되었는지 확인
          try {
            const outputDirExists = await fs.access(outputDir).then(() => true).catch(() => false);

            if (!outputDirExists) {
              reject(new Error(`출력 디렉토리가 생성되지 않았습니다: ${outputDir}`));
              return;
            }

            const files = await fs.readdir(outputDir);
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));

            if (imageFiles.length === 0) {
              reject(new Error(`이미지 파일이 저장되지 않았습니다. 디렉토리: ${outputDir}`));
              return;
            }

            await this.manager.appendLog(
              taskId, 'image',
              `✅ ${imageFiles.length}개 이미지 파일 저장 확인`
            );
            addContentLog(taskId, `✅ ${imageFiles.length}개 이미지 파일 저장 확인`, 'image');
            console.log(`✅ ${imageFiles.length}개 이미지 저장됨: ${outputDir}`);
            addTitleLog(taskId, 'info', `📁 ${imageFiles.length}개 이미지 파일 저장 완료`, 'image');

            resolve();
          } catch (err: any) {
            reject(new Error(`이미지 파일 확인 실패: ${err.message}`));
          }
        } else {
          reject(new Error(`Python 스크립트가 오류로 종료되었습니다. (코드: ${code})`));
        }
      });

      pythonProcess.on('error', (err) => {
        reject(err);
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ⭐ 이미지 크롤링 완료 후 자동으로 영상 제작 트리거
   * task_schedule의 status를 waiting_for_upload -> processing으로 변경하여 스케줄러가 다시 처리하도록 함
   */
  private async triggerVideoGeneration(taskId: string): Promise<void> {
    try {
      console.log(`🎬 [TRIGGER] 영상 제작 자동 트리거 시작: ${taskId}`);
      addTitleLog(taskId, 'info', '🎬 영상 제작 자동 시작됨');

      // 이미지 크롤링 완료 후 영상 제작으로 전환 (status 체크 없이 바로 전환)
      await run(`
        UPDATE task_queue
        SET type = 'video', status = 'waiting'
        WHERE task_id = ?
      `, [taskId]);

      console.log(`✅ [TRIGGER] 이미지 완료 → 영상 제작 대기: ${taskId}`);
      addContentLog(taskId, '🎬 영상 제작 자동 시작...', 'video');
    } catch (error: any) {
      console.error(`❌ [TRIGGER] 영상 제작 트리거 실패:`, error);
      addContentLog(taskId, `⚠️ 영상 제작 자동 시작 실패: ${error.message}`, 'video');
    }
  }
}

// 워커 실행
if (require.main === module) {
  const worker = new ImageWorker();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n📛 SIGINT 수신. 워커를 종료합니다...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n📛 SIGTERM 수신. 워커를 종료합니다...');
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch((err) => {
    console.error('❌ Worker error:', err);
    process.exit(1);
  });
}

export default ImageWorker;
