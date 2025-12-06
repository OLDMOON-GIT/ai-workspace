/**
 * YouTube Upload Worker
 *
 * 큐에서 YouTube 업로드 작업을 가져와 실행하는 워커 프로세스
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

class YouTubeWorker {
  private manager: QueueManager;
  private running: boolean = false;
  private currentTask: QueueTask | null = null;

  constructor() {
    this.manager = new QueueManager();
  }

  async start() {
    this.running = true;
    console.log('🚀 YouTube upload worker started');
    console.log('⏱️  Polling interval: 5 seconds');

    let pollCount = 0;
    while (this.running) {
      try {
        pollCount++;
        console.log(`\n🔍 [Poll #${pollCount}] Checking queue for youtube tasks...`);

        // 1. 큐에서 다음 작업 가져오기
        this.currentTask = await this.manager.dequeue('youtube');

        if (!this.currentTask) {
          // 작업 없음, 5초 대기
          console.log(`   ⏸️  No tasks available. Waiting 5 seconds...`);
          await this.sleep(5000);
          continue;
        }

        const taskId = this.currentTask.taskId;
        console.log(`\n▶️  Processing youtube task: ${taskId}`);
        await this.manager.appendLog(taskId, 'youtube', '📺 YouTube 업로드 시작...');
        addTitleLog(taskId, 'info', '📺 YouTube 업로드 작업 시작', 'youtube');
        addContentLog(taskId, '📺 YouTube 업로드 시작...', 'youtube');

        // 2. 작업 실행
        await this.processTask(this.currentTask);

        // 3. task_time_log 종료 시간 기록
        await run(`
          UPDATE task_time_log
          SET end_time = ?
          WHERE task_id = ? AND type = ? AND end_time IS NULL
          ORDER BY retry_cnt DESC LIMIT 1
        `, [getLocalDateTime(), taskId, 'youtube']);

        // 4. 완료 처리 (YouTube는 마지막 단계이므로 completed로 표시)
        await this.manager.updateTask(taskId, 'youtube', {
          state: 'completed'
        });

        await this.manager.appendLog(taskId, 'youtube', '✅ YouTube 업로드 완료!');
        addTitleLog(taskId, 'info', '✅ YouTube 업로드 완료! 전체 파이프라인 완료', 'youtube');
        addContentLog(taskId, '✅ YouTube 업로드 완료!', 'youtube');
        console.log(`✅ YouTube task completed (All stages done): ${taskId}`);

      } catch (error: any) {
        console.error(`❌ YouTube task failed:`, error);

        if (this.currentTask) {
          const taskId = this.currentTask.taskId;
          await this.manager.updateTask(taskId, 'youtube', {
            state: 'failed',
            completedAt: getLocalDateTime(),
            error: error.message
          });
          await this.manager.appendLog(
            taskId, 'youtube',
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

    // content 정보 가져오기
    const content = await getOne(`
      SELECT c.*, cs.*
      FROM content c
      LEFT JOIN content_setting cs ON c.content_id = cs.content_id
      WHERE c.content_id = ?
    `, [taskId]) as any;

    if (!content) {
      throw new Error('Content not found');
    }

    // Python 스크립트 경로
    // ✅ BTS-0000019: 파일명 수정 (upload.py → youtube_upload_cli.py)
    const scriptPath = path.join(backendPath, 'src', 'youtube', 'youtube_upload_cli.py');

    // Python 스크립트 실행
    const pythonProcess = spawn('python', [
      scriptPath,
      taskId,
      content.title || '',
      content.youtube_privacy || content.youtubePrivacy || 'public'
    ], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONPATH: backendPath  // ⭐ src 모듈을 찾을 수 있도록 PYTHONPATH 설정
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(text.trim());

      // 실시간 로그 업데이트
      this.manager.appendLog(taskId, 'youtube', text.trim()).catch(err => {
        console.error('로그 추가 실패:', err);
      });
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error(text.trim());

      // 에러 로그도 기록
      this.manager.appendLog(taskId, 'youtube', `⚠️ ${text.trim()}`).catch(err => {
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
          reject(new Error(`YouTube upload failed with exit code ${code}\n${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error(`❌ Failed to start Python script:`, error);
        reject(new Error(`Failed to start YouTube upload: ${error.message}`));
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log('⏹️ Stopping youtube worker...');
    this.running = false;
    if (this.currentTask) {
      // 중지 시 현재 작업을 cancelled 상태로 변경
      console.log(`⚠️ [STOP] Cancelling task: ${this.currentTask.taskId}`);
      await this.manager.updateTask(this.currentTask.taskId, 'youtube', {
        state: 'cancelled'
      });
    }
    this.manager.close();
  }
}

// 워커 실행
if (require.main === module) {
  const worker = new YouTubeWorker();

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

export default YouTubeWorker;
