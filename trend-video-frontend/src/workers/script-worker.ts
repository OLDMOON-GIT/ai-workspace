/**
 * Script Generation Worker
 *
 * 큐에서 대본 생성 작업을 가져와 실행하는 워커 프로세스
 */

import { QueueManager, QueueTask } from '@/lib/queue-manager';
import { addTitleLog } from '@/lib/automation';
import { addContentLog } from '@/lib/content';
import { generateScript } from '@/lib/script-generator';
import { getOne, run } from '@/lib/mysql';

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

class ScriptWorker {
  private manager: QueueManager;
  private running: boolean = false;
  private currentTask: QueueTask | null = null;

  constructor() {
    this.manager = new QueueManager();
  }

  async start() {
    this.running = true;
    console.log('🚀 Script generation worker started');
    console.log('⏱️  Polling interval: 5 seconds');

    let pollCount = 0;
    while (this.running) {
      try {
        pollCount++;
        console.log(`\n🔍 [Poll #${pollCount}] Checking queue for script tasks...`);

        // 1. 큐에서 다음 작업 가져오기
        this.currentTask = await this.manager.dequeue('script');

        if (!this.currentTask) {
          // 작업 없음, 5초 대기
          console.log(`   ⏸️  No tasks available. Waiting 5 seconds...`);
          await this.sleep(5000);
          continue;
        }

        const taskId = this.currentTask.taskId;
        console.log(`\n▶️  Processing script task: ${taskId}`);
        await this.manager.appendLog(taskId, 'script', '📝 대본 생성 시작...');
        addTitleLog(taskId, 'info', '📝 대본 생성 작업 시작', 'script');
        addContentLog(taskId, '📝 대본 생성 시작...', 'script');

        // 2. 작업 실행
        await this.processTask(this.currentTask);

        // 3. task_time_log 종료 시간 기록
        await run(`
          UPDATE task_time_log
          SET end_time = ?
          WHERE task_id = ? AND type = ? AND end_time IS NULL
          ORDER BY retry_cnt DESC LIMIT 1
        `, [getLocalDateTime(), taskId, 'script']);

        await this.manager.appendLog(taskId, 'script', '✅ 대본 생성 완료!');
        addTitleLog(taskId, 'info', '✅ 대본 생성 완료 → 이미지 크롤링 대기', 'script');
        addContentLog(taskId, '✅ 대본 생성 완료!', 'script');
        console.log(`✅ Script task completed: ${taskId}`);

        // 4. 이미지 크롤링으로 바로 전환 (completed 없이)
        await this.triggerImageCrawling(taskId);

      } catch (error: any) {
        console.error(`❌ Script task failed:`, error);

        if (this.currentTask) {
          const taskId = this.currentTask.taskId;
          await this.manager.updateTask(taskId, 'script', {
            state: 'failed',
            completedAt: getLocalDateTime(),
            error: error.message
          });
          await this.manager.appendLog(
            taskId, 'script',
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

    console.log(`📝 Generating script for: ${content.title}`);

    // 대본 생성
    const result = await generateScript({
      taskId,
      title: content.title,
      promptFormat: content.prompt_format || content.promptFormat,
      aiModel: content.ai_model || content.aiModel,
      category: content.category,
      productInfo: content.product_info || content.productInfo,
      scriptMode: content.script_mode || content.scriptMode,
      settings: content.settings
    });

    console.log(`✅ Script generated: ${result.storyPath}`);
  }

  private async triggerImageCrawling(taskId: string): Promise<void> {
    try {
      console.log(`🖼️ [TRIGGER] 이미지 크롤링 자동 트리거 시작: ${taskId}`);
      addTitleLog(taskId, 'info', '🖼️ 이미지 크롤링 자동 시작됨');

      // 대본 생성 완료 후 이미지 크롤링으로 전환 (status 체크 없이 바로 전환)
      await run(`
        UPDATE task_queue
        SET type = 'image', status = 'waiting'
        WHERE task_id = ?
      `, [taskId]);

      console.log(`✅ [TRIGGER] 대본 완료 → 이미지 크롤링 대기: ${taskId}`);
      addContentLog(taskId, '🖼️ 이미지 크롤링 자동 시작...', 'image');
    } catch (error: any) {
      console.error(`❌ [TRIGGER] 이미지 크롤링 트리거 실패:`, error);
      addContentLog(taskId, `⚠️ 이미지 크롤링 자동 시작 실패: ${error.message}`, 'image');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log('⏹️ Stopping script worker...');
    this.running = false;
    if (this.currentTask) {
      // 중지 시 현재 작업을 cancelled 상태로 변경
      console.log(`⚠️ [STOP] Cancelling task: ${this.currentTask.taskId}`);
      await this.manager.updateTask(this.currentTask.taskId, 'script', {
        state: 'cancelled'
      });
    }
    this.manager.close();
  }
}

// 워커 실행
if (require.main === module) {
  const worker = new ScriptWorker();

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

export default ScriptWorker;
