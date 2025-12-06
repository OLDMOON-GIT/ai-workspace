/**
 * Video Generation Worker
 *
 * 큐에서 비디오 생성 작업을 가져와 실행하는 워커 프로세스
 */

import { QueueManager, QueueTask } from '@/lib/queue-manager';
import { addTitleLog } from '@/lib/automation';
import { addContentLog } from '@/lib/content';
import { spawn } from 'child_process';
import path from 'path';
import { getOne, run } from '@/lib/mysql';

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

class VideoWorker {
  private manager: QueueManager;
  private running: boolean = false;
  private currentTask: QueueTask | null = null;

  constructor() {
    this.manager = new QueueManager();
  }

  async start() {
    this.running = true;
    console.log('🚀 Video generation worker started');
    console.log('⏱️  Polling interval: 5 seconds');

    let pollCount = 0;
    while (this.running) {
      try {
        pollCount++;
        console.log(`\n🔍 [Poll #${pollCount}] Checking queue for video tasks...`);

        // 1. 큐에서 다음 작업 가져오기
        this.currentTask = await this.manager.dequeue('video');

        if (!this.currentTask) {
          // 작업 없음, 5초 대기
          console.log(`   ⏸️  No tasks available. Waiting 5 seconds...`);
          await this.sleep(5000);
          continue;
        }

        const taskId = this.currentTask.taskId;
        console.log(`\n▶️  Processing video task: ${taskId}`);
        await this.manager.appendLog(taskId, 'video', '🎬 영상 제작 시작...');
        addTitleLog(taskId, 'info', '🎬 영상 제작 작업 시작', 'video');
        addContentLog(taskId, '🎬 영상 제작 시작...', 'video');

        // 2. 작업 실행
        await this.processTask(this.currentTask);

        // 3. task_time_log 종료 시간 기록
        await run(`
          UPDATE task_time_log
          SET end_time = ?
          WHERE task_id = ? AND type = ? AND end_time IS NULL
          ORDER BY retry_cnt DESC LIMIT 1
        `, [getLocalDateTime(), taskId, 'video']);

        await this.manager.appendLog(taskId, 'video', '✅ 영상 제작 완료!');
        addTitleLog(taskId, 'info', '✅ 영상 제작 완료 → YouTube 업로드 대기', 'video');
        addContentLog(taskId, '✅ 영상 제작 완료!', 'video');
        console.log(`✅ Video task completed: ${taskId}`);

        // 4. YouTube 업로드로 바로 전환 (completed 없이)
        await this.triggerYoutubeUpload(taskId);

      } catch (error: any) {
        console.error(`❌ Video task failed:`, error);

        if (this.currentTask) {
          const taskId = this.currentTask.taskId;
          await this.manager.updateTask(taskId, 'video', {
            state: 'failed',
            completedAt: getLocalDateTime(),
            error: error.message
          });
          await this.manager.appendLog(
            taskId, 'video',
            `❌ 실패: ${error.message}`
          );
        }
      } finally {
        this.currentTask = null;
      }
    }
  }

  private async processTask(task: QueueTask): Promise<void> {
    const taskId = task.taskId;
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const tasksPath = path.join(backendPath, 'tasks', taskId);

    console.log(`📂 Task folder: ${tasksPath}`);

    // Python 스크립트 경로
    const scriptPath = path.join(backendPath, 'src', 'video_generator', 'long_form_creator.py');

    // Python 스크립트 실행
    const pythonProcess = spawn('python', [scriptPath, taskId], {
      cwd: backendPath,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(text.trim());

      // 실시간 로그 업데이트
      this.manager.appendLog(taskId, 'video', text.trim()).catch(err => {
        console.error('로그 추가 실패:', err);
      });
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error(text.trim());

      // 에러 로그도 기록
      this.manager.appendLog(taskId, 'video', `⚠️ ${text.trim()}`).catch(err => {
        console.error('로그 추가 실패:', err);
      });
    });

    return new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Python script finished successfully`);
          resolve();
        } else {
          console.error(`❌ Python script exited with code ${code}`);
          reject(new Error(`Video generation failed with exit code ${code}\n${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error(`❌ Failed to start Python script:`, error);
        reject(new Error(`Failed to start video generation: ${error.message}`));
      });
    });
  }

  private async triggerYoutubeUpload(taskId: string): Promise<void> {
    try {
      console.log(`📺 [TRIGGER] YouTube 업로드 자동 트리거 시작: ${taskId}`);
      addTitleLog(taskId, 'info', '📺 YouTube 업로드 자동 시작됨');

      // 영상 제작 완료 후 YouTube 업로드로 전환 (status 체크 없이 바로 전환)
      await run(`
        UPDATE task_queue
        SET type = 'youtube', status = 'waiting'
        WHERE task_id = ?
      `, [taskId]);

      console.log(`✅ [TRIGGER] 비디오 완료 → YouTube 업로드 대기: ${taskId}`);
      addContentLog(taskId, '📺 YouTube 업로드 자동 시작...', 'youtube');
    } catch (error: any) {
      console.error(`❌ [TRIGGER] YouTube 업로드 트리거 실패:`, error);
      addContentLog(taskId, `⚠️ YouTube 업로드 자동 시작 실패: ${error.message}`, 'youtube');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log('⏹️ Stopping video worker...');
    this.running = false;
    if (this.currentTask) {
      // 중지 시 현재 작업을 cancelled 상태로 변경
      console.log(`⚠️ [STOP] Cancelling task: ${this.currentTask.taskId}`);
      await this.manager.updateTask(this.currentTask.taskId, 'video', {
        state: 'cancelled'
      });
    }
    this.manager.close();
  }
}

// 워커 실행
if (require.main === module) {
  const worker = new VideoWorker();

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

  worker.start().catch((error) => {
    console.error('❌ Worker failed:', error);
    process.exit(1);
  });
}

export default VideoWorker;
