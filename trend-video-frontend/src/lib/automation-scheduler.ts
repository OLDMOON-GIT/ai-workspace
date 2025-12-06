/**
 * @fileoverview 자동화 스케줄러 및 파이프라인 오케스트레이터
 * @refactored 2025-11-28
 *
 * ============================================================
 * 🔄 자동화 플로우 (2025-11-28 정리)
 * ============================================================
 *
 * 【UI 설정 (automation/page.tsx)】
 * 1. 타입 선택 (promptFormat)
 *    - longform: 롱폼 (16:9)
 *    - shortform: 숏폼 (9:16)
 *    - product: 상품 (9:16)
 *
 * 2. 타입별 기본값 (automationUtils.ts)
 *    ┌────────────┬─────────────┬─────────────┐
 *    │   타입     │  미디어모드  │   AI 모델   │
 *    ├────────────┼─────────────┼─────────────┤
 *    │ longform   │ crawl       │ claude      │
 *    │ shortform  │ imagen3     │ chatgpt     │
 *    │ product    │ imagen3     │ gemini      │
 *    └────────────┴─────────────┴─────────────┘
 *
 * 3. 미디어 모드 설명
 *    - crawl: 이미지 크롤링 → 롱폼일 때 imageFX+whisk 창 열림
 *    - imagen3: Google Imagen 3 API로 이미지 생성
 *    - dalle3: OpenAI DALL-E 3 API로 이미지 생성
 *    - upload: 사용자 직접 업로드
 *
 * 【큐 처리 흐름】
 * schedule → script → image (crawl/upload만) → video → youtube
 *
 * 【비율 결정 (generate-video-upload/route.ts:588)】
 * - longform → 16:9
 * - shortform/product → 9:16
 *
 * @see .claude/REFACTORING_SPEC.md - 변경 스펙 문서 (수정 전 필독!)
 * @warning script_content 컬럼은 삭제됨. DB에서 읽으면 에러 발생.
 *          대본은 tasks/{id}/story.json 파일에서 읽어야 함.
 * ============================================================
 */

import {
  getPendingSchedules,
  getWaitingForUploadSchedules,
  createPipeline,
  updatePipelineStatus,
  updateQueueStatus,
  updateScheduleStatus,
  addPipelineLog,
  addTitleLog,
  getAutomationSettings
} from './automation';
import { sendErrorEmail } from './email';
import { QueueManager } from './queue-manager';
import { deleteOldJobs } from './db';
import db from './sqlite';
import { getSql } from './sql-mapper';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ⭐ 스케줄러 인터벌 (글로벌 변수로 핫 리로드 시에도 유지)
// Next.js 핫 리로드 시 모듈이 다시 로드되면 let 변수가 리셋되어
// 여러 스케줄러가 동시에 실행되는 문제 방지
declare global {
  var __automationSchedulerInterval: NodeJS.Timeout | null;
  var __automationSchedulerRunning: boolean;
}
globalThis.__automationSchedulerInterval = globalThis.__automationSchedulerInterval ?? null;
globalThis.__automationSchedulerRunning = globalThis.__automationSchedulerRunning ?? false;

let schedulerInterval = globalThis.__automationSchedulerInterval;
let isRunning = globalThis.__automationSchedulerRunning;
let lastAutoScheduleCheck: Date | null = null;
let lastAutoScheduleResult: { success: number; failed: number; skipped: number } = { success: 0, failed: 0, skipped: 0 };
let imageWorkerProcess: any = null;
let lastImageWorkerCheck: Date | null = null;
let lastCleanupCheck: Date | null = null;
let processingSchedules = false; // processPendingSchedules() 전용 lock
let lastAiResponseCleanupCheck: Date | null = null;
let lastStaleTaskCheck: Date | null = null;

async function isPipelineOrScheduleCancelled(pipelineId: string): Promise<boolean> {
  try {
    // task_queue.status 사용
    const sql = getSql('scheduler', 'checkQueueStatus');
    const queueRow = await db.prepare(sql).get(pipelineId) as { status: string } | undefined;
    const queueStatus = queueRow?.status;

    if (queueStatus === 'cancelled' || queueStatus === 'failed') {
      return true;
    }
  } catch (error: any) {
    console.error(`[Scheduler] Failed to check cancellation for pipeline ${pipelineId}:`, (error as Error).message);
  }

  return false;
}

// ⚠️ DEPRECATED: tasks 테이블에는 status 컬럼이 없음
// 상태 관리는 task_schedule 또는 task_queue에서 처리
// function updateTaskStatus(taskId: string, status: string) {
//   // 사용하지 않음 - task_schedule.status 또는 task_queue.status 사용
// }

// ============================================================
// 🕐 MySQL DATETIME 형식 변환 유틸리티
// ============================================================
// MySQL datetime: 'YYYY-MM-DD HH:MM:SS' (로컬 시간대 그대로)
// ⭐ DB 저장 시 반드시 이 함수 사용 - UTC 변환 하지 않음!
function toSqliteDatetime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 한국 시간 표시용 (로그/UI)
function toKoreanTime(date: Date): string {
  return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

// 오래된 작업 자동 삭제 (24시간마다 실행)
async function cleanupOldJobs() {
  const now = new Date();

  // 마지막 정리 시간이 없거나 24시간이 지났으면 실행
  if (!lastCleanupCheck || (now.getTime() - lastCleanupCheck.getTime()) > 24 * 60 * 60 * 1000) {
    try {
      const deletedCount = await deleteOldJobs(30); // 30일 이전 작업 삭제
      lastCleanupCheck = now;

      if (deletedCount > 0) {
        console.log(`🗑️  [Cleanup] ${deletedCount}개의 오래된 작업 삭제 완료`);
      }
    } catch (error: any) {
      console.error('[Cleanup] 오래된 작업 삭제 실패:', error);
    }
  }
}

// ⭐ AI 응답 로그 파일 자동 삭제 (24시간마다 실행, 7일 이상 된 파일 삭제)
function cleanupOldAiResponses() {
  const now = new Date();

  // 24시간에 한 번만 실행
  if (lastAiResponseCleanupCheck && (now.getTime() - lastAiResponseCleanupCheck.getTime()) < 24 * 60 * 60 * 1000) {
    return;
  }

  try {
    const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
    const scriptsDir = path.join(BACKEND_PATH, 'src', 'scripts');

    if (!fs.existsSync(scriptsDir)) {
      return;
    }

    const cutoffTime = now.getTime() - 7 * 24 * 60 * 60 * 1000; // 7일 전
    let deletedCount = 0;

    const files = fs.readdirSync(scriptsDir);
    for (const file of files) {
      if (file.startsWith('ai_responses_') && file.endsWith('.txt')) {
        const filePath = path.join(scriptsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
    }

    lastAiResponseCleanupCheck = now;

    if (deletedCount > 0) {
      console.log(`🗑️  [AI Response Cleanup] ${deletedCount}개의 오래된 AI 응답 파일 삭제 완료`);
    }
  } catch (error: any) {
    console.error('[AI Response Cleanup] AI 응답 파일 삭제 실패:', error);
  }
}

// ⭐ 서버 재시작 시 중단된 파이프라인 자동 복구
// completed 상태인 작업을 다음 단계로 전환 (type UPDATE)
async function recoverOrphanedPipelines() {
  try {
    // MySQL: db imported from sqlite wrapper

    // Phase 전환 맵: 현재 Phase → 다음 Phase
    // schedule → script는 processPendingSchedules()에서 별도 처리
    const phaseTransitions: Record<string, string> = {
      'script': 'image',
      'image': 'video',
      'video': 'youtube'
      // youtube completed는 최종 상태 (더 이상 전환 없음)
    };

    // completed 상태인 작업 찾기 (youtube 제외 - 최종 단계)
    const sql = getSql('scheduler', 'getCompletedTasks');
    const completedTasks = await db.prepare(sql).all() as Array<{ task_id: string; type: string }>;

    let totalRecovered = 0;

    for (const task of completedTasks) {
      const nextType = phaseTransitions[task.type];
      if (nextType) {
        const sql = getSql('scheduler', 'updateTaskToNextPhase');
        await db.prepare(sql).run(nextType, task.task_id);
        totalRecovered++;
        console.log(`🔄 [Recovery] ${task.task_id}: ${task.type} completed → ${nextType} waiting`);
      }
    }

    // MySQL: pool manages connections

    if (totalRecovered > 0) {
      console.log(`✅ [Recovery] ${totalRecovered}개의 중단된 파이프라인 복구 완료`);
    }
  } catch (error: any) {
    console.error('[Recovery] 파이프라인 복구 실패:', error);
  }
}

// ⭐ Stale Task Observer: processing 상태에서 멈춘 작업 자동 복구 (10분마다 실행)
async function recoverStaleTasks() {
  const now = new Date();

  // 10분에 한 번만 실행
  if (lastStaleTaskCheck && (now.getTime() - lastStaleTaskCheck.getTime()) < 10 * 60 * 1000) {
    return;
  }
  lastStaleTaskCheck = now;

  try {
    // MySQL: db imported from sqlite wrapper
    const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks');

    // 30분 이상 processing 상태인 작업 찾기 (v6: task_time_log 기반)
    const staleMinutes = 30;
    const sql = getSql('scheduler', 'getStaleTasks');
    const staleTasks = await db.prepare(sql).all(staleMinutes) as Array<{ task_id: string; type: string; status: string; started_at: string }>;

    if (staleTasks.length === 0) {
      // MySQL: pool manages connections
      return;
    }

    console.log(`🔍 [Stale Observer] ${staleTasks.length}개의 멈춘 작업 발견`);
    let recovered = 0;
    let failed = 0;

    // BTS-3349: 최대 재시도 횟수 (무한 재시도 방지)
    const MAX_RETRY_COUNT = 2;

    for (const task of staleTasks) {
      // BTS-3349: 재시도 횟수 확인 (task_time_log에서 현재 type의 retry_cnt 조회)
      let currentRetryCount = 0;
      try {
        const retryRow = await db.prepare(`
          SELECT COALESCE(MAX(retry_cnt), 0) as max_retry
          FROM task_time_log
          WHERE task_id = ? AND type = ?
        `).get(task.task_id, task.type) as { max_retry: number } | undefined;
        currentRetryCount = retryRow?.max_retry || 0;
      } catch (e) {
        console.error(`[Stale] ${task.task_id}: retry_cnt 조회 실패`, e);
      }

      const taskFolder = path.join(BACKEND_PATH, task.task_id);

      if (!fs.existsSync(taskFolder)) {
        // 폴더 없음 → 실패 처리
        const sql = getSql('scheduler', 'markTaskFailed');
        await db.prepare(sql).run('작업 폴더가 없습니다 (서버 중단)', task.task_id);
        console.log(`❌ [Stale] ${task.task_id}: 폴더 없음 → failed`);
        failed++;
        continue;
      }

      const files = fs.readdirSync(taskFolder);

      // 파일 상태 확인
      const hasStory = files.some(f => f === 'story.json');
      const hasImages = files.some(f =>
        (f.startsWith('scene_') || /^\d+\.(png|jpg|jpeg)$/.test(f)) &&
        (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      );
      const hasVideo = files.some(f =>
        f.endsWith('.mp4') && !f.startsWith('scene_') && !f.includes('_audio')
      );
      const imageCount = files.filter(f =>
        (f.startsWith('scene_') || /^\d+\.(png|jpg|jpeg)$/.test(f)) &&
        (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      ).length;

      let newType = task.type;
      let newStatus = 'waiting';
      let message = '';

      // 현재 type에 따른 복구 결정
      if (task.type === 'script') {
        if (hasStory) {
          newType = 'image';
          message = 'story.json 있음 → image waiting';
        } else {
          newStatus = 'failed';
          message = 'story.json 없음 → failed';
        }
      } else if (task.type === 'image') {
        if (hasVideo) {
          newType = 'youtube';
          message = `영상 있음 → youtube waiting`;
        } else if (hasImages && imageCount >= 3) {
          newType = 'video';
          message = `이미지 ${imageCount}개 있음 → video waiting`;
        } else if (hasStory) {
          // BTS-3349: 재시도 횟수 제한 확인
          if (currentRetryCount >= MAX_RETRY_COUNT) {
            newStatus = 'failed';
            message = `이미지 크롤링 ${currentRetryCount}회 실패 → failed (최대 재시도 초과)`;
          } else {
            newStatus = 'waiting';
            message = `이미지 부족 (${imageCount}개) → image waiting (재시도 ${currentRetryCount + 1}/${MAX_RETRY_COUNT})`;
          }
        } else {
          newStatus = 'failed';
          message = 'story.json 없음 → failed';
        }
      } else if (task.type === 'video') {
        if (hasVideo) {
          newType = 'youtube';
          message = '영상 있음 → youtube waiting';
        } else if (hasImages && imageCount >= 3) {
          // BTS-3349: 재시도 횟수 제한 확인
          if (currentRetryCount >= MAX_RETRY_COUNT) {
            newStatus = 'failed';
            message = `영상 생성 ${currentRetryCount}회 실패 → failed (최대 재시도 초과)`;
          } else {
            newStatus = 'waiting';
            message = `이미지 ${imageCount}개, 영상 없음 → video waiting (재시도 ${currentRetryCount + 1}/${MAX_RETRY_COUNT})`;
          }
        } else {
          newStatus = 'failed';
          message = `이미지 부족 (${imageCount}개) → failed`;
        }
      } else if (task.type === 'youtube') {
        if (hasVideo) {
          // BTS-3349: 재시도 횟수 제한 확인
          if (currentRetryCount >= MAX_RETRY_COUNT) {
            newStatus = 'failed';
            message = `YouTube 업로드 ${currentRetryCount}회 실패 → failed (최대 재시도 초과)`;
          } else {
            newStatus = 'waiting';
            message = `영상 있음 → youtube waiting (재시도 ${currentRetryCount + 1}/${MAX_RETRY_COUNT})`;
          }
        } else {
          newStatus = 'failed';
          message = '영상 없음 → failed';
        }
      }

      // DB 업데이트
      if (newStatus === 'failed') {
        const sql = getSql('scheduler', 'markTaskFailed');
        await db.prepare(sql).run(`서버 중단으로 복구 실패: ${message}`, task.task_id);
        failed++;
      } else {
        const sql = getSql('scheduler', 'retryTask');
        await db.prepare(sql).run(newType, task.task_id);
        recovered++;
      }

      console.log(`🔄 [Stale] ${task.task_id}: ${task.type}|processing → ${newType}|${newStatus} (${message})`);

      // 사용자 로그에도 자동 재시도 사실을 남겨 재시작된 작업임을 명시
      if (newStatus !== 'failed') {
        const retryBanner = '============================================================';
        addTitleLog(
          task.task_id,
          'info',
          retryBanner,
          newType as any
        );
        addTitleLog(
          task.task_id,
          'info',
          `🔄 자동 재시도: ${task.type} → ${newType} (${message})`,
          newType as any
        );
        addTitleLog(
          task.task_id,
          'info',
          retryBanner,
          newType as any
        );
      }
    }

    // MySQL: pool manages connections

    if (recovered > 0 || failed > 0) {
      console.log(`✅ [Stale Observer] 복구: ${recovered}개, 실패: ${failed}개`);
    }
  } catch (error: any) {
    console.error('[Stale Observer] 오류:', error);
  }
}

// 스케줄러 시작
export async function startAutomationScheduler() {
  // ⭐ global 변수 체크 (핫 리로드 대응)
  if (globalThis.__automationSchedulerInterval) {
    console.log('⚠️ Scheduler is already running (global check)');
    return;
  }

  const settings = await getAutomationSettings();
  const enabled = settings.enabled === 'true';
  // 최소 3초 간격 (중복 실행 방지)
  const checkInterval = Math.max(3, parseInt(settings.check_interval || '10')) * 1000;

  if (!enabled) {
    console.log('⚠️ Automation is disabled in settings');
    return;
  }

  console.log(`✅ Automation scheduler started (checking every ${checkInterval / 1000}s)`);

  // 아키텍처 자동 업데이트 스케줄러 시작 (매일 오후 1시)
  startArchitectureAutoUpdate();

  // 이미지 워커 확인 및 시작
  ensureImageWorkerRunning();

  // ⭐ 서버 재시작 시 중단된 파이프라인 복구
  recoverOrphanedPipelines();
  recoverStaleTasks(); // processing 상태에서 멈춘 작업 복구

  // 즉시 한 번 실행
  processPendingSchedules();

  // Step 4: 상품 자동화 - coupang_product 감시
  const coupangResult = await checkAndRegisterCoupangProducts();

  // 자동 제목 생성 스케줄러 시작
  const autoTitleGeneration = settings.auto_title_generation === 'true';
  if (autoTitleGeneration) {
    console.log('🤖 Starting auto title generation scheduler...');
    await startAutoTitleGeneration();
  } else {
    console.log('⏸️ Auto title generation is disabled');
  }

  // 주기적으로 실행
  // ⭐ global 변수에 할당 (핫 리로드 대응)
  const interval = setInterval(async () => {
    ensureImageWorkerRunning(); // 이미지 워커가 실행 중인지 확인

    // ⭐ 각 단계 완료 후 다음 단계로 자동 전환 (실시간)
    recoverOrphanedPipelines();  // completed → next phase waiting

    // ⭐ Queue Spec v3: 모든 Phase는 독립적으로 처리
    processPendingSchedules();  // Phase 0: Schedule → Script
    processScriptQueue();        // Phase 1: Script → Image/Video
    // Phase 2: Image는 외부 이벤트 처리 (checkWaitingForUploadSchedules)
    processVideoQueue();         // Phase 3: Video → YouTube
    processYoutubeQueue();       // Phase 4: YouTube (최종 완료)

    // ⚠️ DISABLED: 함수 정의 없음 - 제거됨
    // checkWaitingForUploadSchedules(); // 이미지 업로드 대기 중인 스케줄 체크
    // checkReadyToUploadSchedules(); // 영상 생성 완료되어 업로드 대기 중인 스케줄 체크
    // checkCompletedShortformJobs(); // ⚠️ DISABLED: 숏폼 관련 컬럼 제거됨 (cleanup-task-schedule.js)

    // Step 4: 상품 자동화 - coupang_product 감시
    const coupangResult = await checkAndRegisterCoupangProducts();

    // 쿠팡 상품 자동 등록이 활성화된 경우에만 채널 자동 스케줄링 실행
    if (coupangResult.enabled) {
      const settings = await getAutomationSettings();
      const autoTitleGeneration = settings.auto_title_generation === 'true';
      if (autoTitleGeneration) {
        // ⚠️ checkAndCreateAutoSchedules()는 startAutoTitleGeneration()에서 별도 타이머로 실행됨
        // 여기서 중복 실행하면 안 됨!
        // checkAndCreateAutoSchedules();
      }
    }

    // 오래된 작업 자동 삭제 (매 사이클마다 실행, 내부에서 주기 체크)
    cleanupOldJobs();
    cleanupOldAiResponses(); // AI 응답 로그 파일 정리 (7일 이상 된 파일 삭제)
    recoverStaleTasks(); // processing 상태에서 30분 이상 멈춘 작업 자동 복구 (10분마다)
  }, checkInterval);

  // ⭐ global 변수에 저장 (핫 리로드 대응)
  globalThis.__automationSchedulerInterval = interval;
  globalThis.__automationSchedulerRunning = true;
  schedulerInterval = interval;
  isRunning = true;
}

// 스케줄러 중지
export async function stopAutomationScheduler() {
  // ⭐ global 변수 사용 (핫 리로드 대응)
  const intervalToStop = globalThis.__automationSchedulerInterval || schedulerInterval;
  if (intervalToStop) {
    clearInterval(intervalToStop);
    globalThis.__automationSchedulerInterval = null;
    globalThis.__automationSchedulerRunning = false;
    schedulerInterval = null;
    isRunning = false;

    // 🚫 진행 중인 모든 작업을 cancelled 상태로 변경
    try {
      const { run } = await import('./mysql');
      const result = await run(`
        UPDATE task_queue
        SET status = 'cancelled'
        WHERE status = 'processing'
      `);

      const cancelledCount = (result as any).affectedRows || 0;
      if (cancelledCount > 0) {
        console.log(`⏸️ Automation scheduler stopped - ${cancelledCount}개 작업을 cancelled 상태로 변경`);
      } else {
        console.log('⏸️ Automation scheduler stopped (진행 중인 작업 없음)');
      }
    } catch (error) {
      console.error('❌ Failed to cancel processing tasks:', error);
      console.log('⏸️ Automation scheduler stopped (상태 변경 실패)');
    }
  }
}

export async function getSchedulerStatus() {
  // ⭐ global 변수 사용 (핫 리로드 대응)
  const running = globalThis.__automationSchedulerRunning || isRunning;
  const settings = await getAutomationSettings();
  return {
    isRunning: running, // 프론트엔드와 호환성을 위해 isRunning 사용
    running, // 하위 호환성 유지
    lastCheck: lastAutoScheduleCheck,
    lastResult: lastAutoScheduleResult,
    settings // 🆕 auto_title_generation 등 설정 포함
  };
}

// 이미지 워커가 실행 중인지 확인하고 필요시 시작
async function ensureImageWorkerRunning() {
  try {
    // 5분에 한 번만 체크
    const now = new Date();
    if (lastImageWorkerCheck && (now.getTime() - lastImageWorkerCheck.getTime()) < 5 * 60 * 1000) {
      return;
    }
    lastImageWorkerCheck = now;

    // 큐에 대기 중인 이미지 작업이 있는지 확인 (MySQL)
    const { getOne } = await import('./mysql');
    const waitingTasks = await getOne(`
      SELECT COUNT(*) as count
      FROM task_queue
      WHERE type = 'image' AND status = 'waiting'
    `) as any;

    if (waitingTasks.count > 0) {
      console.log(`[Scheduler] ${waitingTasks.count}개의 이미지 작업이 대기 중입니다.`);

      // 이미지 워커 실행 (별도 프로세스로)
      if (!imageWorkerProcess) {
        console.log('[Scheduler] 이미지 워커를 시작합니다...');
        const { exec } = require('child_process');

        // 로그 디렉토리 생성
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        const logPath = path.join(logsDir, 'image-worker-auto.log');

        // 🆕 로그 로테이션 (server.log와 동일한 방식)
        try {
          if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            if (stats.size > 0) {
              const now = new Date();
              const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
              const backupPath = path.join(logsDir, `image-worker-${timestamp}.log`);

              if (fs.existsSync(backupPath)) {
                // 같은 시간대 백업이 있으면 내용 추가
                const existing = fs.readFileSync(backupPath, 'utf-8');
                const current = fs.readFileSync(logPath, 'utf-8');
                fs.writeFileSync(backupPath, existing + '\n' + current, 'utf-8');
              } else {
                fs.renameSync(logPath, backupPath);
              }
              console.log(`[Scheduler] 이미지 워커 로그 백업됨: image-worker-${timestamp}.log`);
            } else {
              fs.unlinkSync(logPath);
            }
          }
          // 새 로그 파일 생성
          fs.writeFileSync(logPath, '', 'utf-8');
        } catch (rotateError: any) {
          console.log(`[Scheduler] 로그 로테이션 실패 (무시): ${rotateError.message}`);
        }

        // exec로 실행 (Turbopack 정적 분석 회피)
        const workerCmd = `node "${path.join(process.cwd(), 'start-image-worker.js')}" >> "${logPath}" 2>&1`;

        imageWorkerProcess = exec(workerCmd, {
          cwd: process.cwd(),
          windowsHide: true
        }, (error: any) => {
          if (error && !error.killed) {
            console.error(`[Scheduler] 이미지 워커 오류:`, error.message);
          }
          imageWorkerProcess = null;
        });

        if (imageWorkerProcess.pid) {
          console.log(`[Scheduler] 이미지 워커가 시작되었습니다. (PID: ${imageWorkerProcess.pid})`);
          console.log(`[Scheduler] 로그 파일: ${logPath}`);
        }
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] 이미지 워커 확인 중 오류:', error.message);
  }
}

// ============================================================
// Helper: 다음 Phase 결정
// ============================================================
function getNextPhase(currentType: 'schedule' | 'script' | 'image' | 'video' | 'youtube'): 'script' | 'image' | 'video' | 'youtube' | null {
  const phaseMap: Record<string, 'script' | 'image' | 'video' | 'youtube' | null> = {
    'schedule': 'script',
    'script': 'image',    // ⚠️ media_mode에 따라 image 또는 video
    'image': 'video',
    'video': 'youtube',
    'youtube': null       // 마지막 Phase
  };
  return phaseMap[currentType] || null;
}

// ============================================================
// Generic Queue Processor (모든 Phase에서 사용)
// v6: 'schedule' 타입 제거됨 - task_schedule 직접 처리
// ============================================================
async function processQueue(
  type: 'script' | 'image' | 'video' | 'youtube',
  executor: (queue: any) => Promise<void>
) {
  const TIMEOUT = 60 * 60 * 1000; // 1시간 타임아웃 (이미지 크롤링은 오래 걸릴 수 있음)

  try {
    // MySQL: waiting → processing 변경 (async queries)
    let queue: any = null;

    // 1. processing 중인지 확인 (task_queue)
    const countSql = getSql('scheduler', 'getProcessingCount');
    const processingCount = await db.prepare(countSql).get(type) as { count: number } | null;

    if (processingCount && processingCount.count > 0) {
      return; // 이미 처리 중이면 skip
    }

    // 1-2. ⭐ task_lock 테이블도 확인 (다른 워커가 작업 중인지)
    const lockSql = getSql('scheduler', 'checkTaskLock');
    const lock = await db.prepare(lockSql).get(type) as { worker_pid: number | null; locked_at: string | null } | null;

    if (lock && lock.worker_pid !== null) {
      const lockTime = lock.locked_at ? new Date(lock.locked_at).getTime() : 0;
      const LOCK_TIMEOUT = 60 * 60 * 1000; // 1시간 타임아웃 (이미지 크롤링은 오래 걸릴 수 있음)
      if (Date.now() - lockTime < LOCK_TIMEOUT) {
        return; // 다른 워커가 작업 중이면 skip
      }
      // 타임아웃된 락은 해제
      console.log(`⚠️ [Scheduler] 타임아웃된 락 해제: ${type} (${lock.worker_pid})`);
      const releaseSql = getSql('scheduler', 'releaseTaskLock');
      await db.prepare(releaseSql).run(type);
    }

    // 2. waiting 큐 조회
    const waitingSql = getSql('scheduler', 'getFirstWaitingTask');
    const waitingQueue = await db.prepare(waitingSql).get(type) as { taskId: string } | null;

    if (!waitingQueue) {
      return; // waiting 없음
    }

    // 3. 즉시 processing으로 변경
    const processingSql = getSql('scheduler', 'markTaskProcessing');
    await db.prepare(processingSql).run(waitingQueue.taskId, type);

    // 3-1. ⭐ task_lock 테이블에도 락 획득 (다른 워커와 충돌 방지)
    // MySQL: ON DUPLICATE KEY UPDATE 사용
    const acquireSql = getSql('scheduler', 'acquireTaskLock');
    await db.prepare(acquireSql).run(type, waitingQueue.taskId, process.pid);

    // 4. task + content + content_setting 정보 조회 (v5: 통합 키 시스템)
    const queueSql = getSql('scheduler', 'getQueueWithDetails');
    queue = await db.prepare(queueSql).get(waitingQueue.taskId);

    if (!queue) {
      // ⭐ 버그 수정: queue 조회 실패 시 상태 롤백 및 락 해제
      console.warn(`[Scheduler] queue 조회 실패: ${waitingQueue.taskId} - 상태 롤백`);
      const rollbackSql = getSql('scheduler', 'rollbackTaskStatus');
      await db.prepare(rollbackSql).run(waitingQueue.taskId, type);
      const releaseSql2 = getSql('scheduler', 'releaseTaskLock');
      await db.prepare(releaseSql2).run(type);
      return;
    }

    // ⭐ promptFormat과 product_data를 명시적으로 설정
    // ⚠️ 유효한 promptFormat 값만 허용 (카테고리 이름이 들어올 수 있음!)
    // 🐛 FIX: SQL alias는 camelCase (promptFormat)이지만 여기서 snake_case로 접근하고 있었음!
    const VALID_PROMPT_FORMATS = ['longform', 'shortform', 'product', 'product-info', 'sora2'];
    const rawPromptFormat = queue.promptFormat; // SQL alias가 camelCase이므로 camelCase로 접근
    // 🐛 FIX: category가 '상품'인 경우도 product로 처리해야 9:16 비율 적용됨!
    const isProductCategory = queue.category === '상품' || queue.productInfo;
    const validQueueFormat = VALID_PROMPT_FORMATS.includes(rawPromptFormat) ? rawPromptFormat : (isProductCategory ? 'product' : 'longform');
    // 🐛 FIX: SQL alias가 product_data이므로 product_data로 확인, category가 '상품'인 경우도 포함
    queue.promptFormat = isProductCategory ? 'product' : validQueueFormat;

    console.log(`[Scheduler] Processing ${type} queue: ${queue.taskId}`);
    console.log(`  - rawPromptFormat: ${rawPromptFormat}`);
    console.log(`  - validQueueFormat: ${validQueueFormat}`);
    console.log(`  - promptFormat (final): ${queue.promptFormat}`);

    const taskId = queue.taskId;
    const startTime = Date.now();

    // ⭐ 작업 시작 로그 추가
    addTitleLog(taskId, 'info', `▶️ ${type} 작업 시작`, type as any);

    try {
      // status는 이미 processing으로 변경됨

      // 3. executor 실행 (15분 타임아웃)
      await Promise.race([
        executor(queue),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${type} 작업이 15분을 초과했습니다`)), TIMEOUT)
        )
      ]);

      // 4. 성공: type을 다음 Phase로 전환
      const elapsedTime = Date.now() - startTime;
      // MySQL: use imported db

      // 다음 Phase 결정
      const nextType = getNextPhase(type);

      if (nextType) {
        // ⭐ 즉시 다음 phase의 waiting으로 전환 (completed 거치지 않음!)
        // WHERE 조건에 원래 type 포함하여 아토믹 업데이트
        const updateSql = getSql('scheduler', 'updateTaskToNextPhaseWithTime');
        const result = await db.prepare(updateSql).run(nextType, taskId, type);

        if (result.changes === 0) {
          // executor가 이미 다음 phase를 설정했음 (mediaMode 분기 등)
          console.log(`✅ [${type}] ${taskId} completed in ${(elapsedTime/1000).toFixed(1)}s → executor already changed phase`);
        } else {
          console.log(`✅ [${type}] ${taskId} completed in ${(elapsedTime/1000).toFixed(1)}s → ${nextType} waiting (바로 전환!)`);
        }

        addTitleLog(taskId, 'info', `⏱️ ${type} 완료 (${(elapsedTime/1000).toFixed(1)}초) → ${nextType} 대기`);
      } else {
        // 마지막 Phase (youtube) 완료 → youtube completed
        // 1. task_queue 상태 업데이트
        const completeQueueSql = getSql('scheduler', 'completeTaskQueue');
        db.prepare(completeQueueSql).run(taskId);

        // 2. task_schedule 상태도 완료로 업데이트
        const cancelSql = getSql('scheduler', 'markTaskCancelled');
        db.prepare(cancelSql).run(taskId);

        // 3. content 상태도 완료로 업데이트
        const completeContentSql = getSql('scheduler', 'completeContent');
        db.prepare(completeContentSql).run(taskId);

        console.log(`✅ [${type}] ${taskId} FINAL completed in ${(elapsedTime/1000).toFixed(1)}s`);
        addTitleLog(taskId, 'info', `🎉 전체 파이프라인 완료!`);
      }

      // ⭐ 성공 시 락 해제
      const releaseSuccessSql = getSql('scheduler', 'releaseTaskLock');
      await db.prepare(releaseSuccessSql).run(type);
      console.log(`🔓 [${type}] 락 해제 완료: ${taskId}`);

      // 평균 시간 로깅
      logAverageTime(type);

    } catch (error: any) {
      const elapsedTime = Date.now() - startTime;
      console.error(`[Scheduler] Failed to process ${type} queue ${taskId}:`, error);

      // 5. 실패: failed (타임아웃 포함) + elapsed_time 기록
      const isTimeout = error.message?.includes('Timeout');
      const errorMsg = isTimeout ? `⏱️ 타임아웃 (15분 초과)` : (error.message || 'Unknown error');

      // 1. task_queue 상태 업데이트
      const failQueueSql = getSql('scheduler', 'failTaskQueue');
      db.prepare(failQueueSql).run(errorMsg, taskId);

      // 2. task_schedule 상태도 업데이트 (실패 시)
      const cancelSql2 = getSql('scheduler', 'markTaskCancelled');
      db.prepare(cancelSql2).run(taskId);
      console.log(`❌ [${type}] task_schedule 상태도 failed로 업데이트: ${taskId}`);

      // 3. content 테이블 상태도 실패로 업데이트 (모든 단계에서)
      const failContentSql = getSql('scheduler', 'failContent');
      db.prepare(failContentSql).run(errorMsg, taskId);
      console.log(`❌ [${type}] content 상태도 failed로 업데이트: ${taskId}`);

      // 4. 실패 시에도 락 해제 (핵심!)
      const releaseFailSql = getSql('scheduler', 'releaseTaskLock');
      await db.prepare(releaseFailSql).run(type);
      console.log(`🔓 [${type}] 실패 후 락 해제: ${taskId}`);

      addTitleLog(taskId, 'error', `❌ ${type} 실패: ${errorMsg}`);
    }
  } catch (error: any) {
    console.error(`[Scheduler] Error in processQueue(${type}):`, error);
    // ⭐ 예외 발생 시에도 락 해제 (안전장치)
    try {
      const releaseExcSql = getSql('scheduler', 'releaseTaskLock');
      await db.prepare(releaseExcSql).run(type);
      console.log(`🔓 [${type}] 예외 후 락 해제`);
    } catch (e: any) {
      console.error(`[Scheduler] 락 해제 실패:`, e);
    }
  }
}

// ============================================================
// Phase별 평균 실행 시간 로깅
// ============================================================
async function logAverageTime(type: string) {
  try {
    // MySQL: db imported from sqlite wrapper
    const avgTimeSql = getSql('scheduler', 'getAverageTime');
    const result = await db.prepare(avgTimeSql).get(type) as any;
    // MySQL: pool manages connections

    if (result && result.count > 0) {
      const avgSec = (result.avg_time / 1000).toFixed(1);
      const minSec = (result.min_time / 1000).toFixed(1);
      const maxSec = (result.max_time / 1000).toFixed(1);
      console.log(`📊 [${type}] 평균 실행시간: ${avgSec}s (최소: ${minSec}s, 최대: ${maxSec}s, 샘플: ${result.count})`);
    }
  } catch (error: any) {
    console.error(`[logAverageTime] Error:`, error);
  }
}

// ============================================================
// Phase 0: Schedule Queue 처리
// ============================================================
async function processPendingSchedules() {
  if (processingSchedules) {
    console.log('⚠️ Previous schedule processing is still running, skipping...');
    return;
  }

  processingSchedules = true;

  try {
    const pendingSchedules = await getPendingSchedules();

    if (pendingSchedules.length === 0) {
      // 로그 줄임 (매번 출력하면 너무 많음)
      return;
    }

    console.log(`[Scheduler] Found ${pendingSchedules.length} pending schedule(s)`);

    // v6: processQueue('schedule') 대신 직접 처리
    for (const schedule of pendingSchedules) {
      const taskId = schedule.taskId || schedule.task_id;
      const scheduleId = schedule.scheduleId || schedule.schedule_id;

      try {
        console.log(`[Scheduler] Processing schedule for task: ${taskId}`);

        // ⭐ schedule 큐를 script로 변경 (type만 업데이트)
        const { getOne } = await import('./mysql');
        const existingQueue = await getOne(`SELECT type, status FROM task_queue WHERE task_id = ?`, [taskId]) as any;

        if (existingQueue && existingQueue.type !== 'schedule') {
          // schedule이 아닌 다른 타입(script/image/video/youtube)이면 스킵
          console.log(`✅ [Scheduler] Task ${taskId} already in queue (type=${existingQueue.type}, status=${existingQueue.status})`);
          continue;
        }

        addTitleLog(taskId, 'info', '⏰ 예약 시간 도달 - 대본 작성 대기 중');

        // schedule 큐를 script로 변경
        await updateQueueStatus(taskId, 'script', 'waiting');
        console.log(`✅ [Scheduler] Schedule → Script queue: ${taskId}`);
      } catch (error: any) {
        console.error(`[Scheduler] Error processing schedule ${scheduleId}:`, error);
        // schedule 실패 시 status만 failed로 변경
        await updateQueueStatus(taskId, 'schedule', 'failed', (error as Error).message);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] Error in processPendingSchedules:', error);
  } finally {
    processingSchedules = false;
  }
}

// ============================================================
// Phase 1: Script Queue 처리
// ============================================================
async function processScriptQueue() {
  await processQueue('script', async (queue) => {
    const taskId = queue.taskId;
    const settings = await getAutomationSettings();
    const maxRetry = parseInt(settings.max_retry || '3');

    // media_mode 가져오기 (SQL JOIN으로 이미 가져온 값 사용)
    // 1순위: queue.mediaMode (content_setting.media_mode)
    // 2순위: settings.media_generation_mode (전역 설정)
    // 3순위: 'upload' (기본값)
    let mediaMode = `${queue.mediaMode || settings.media_generation_mode || 'upload'}`.trim();
    if (mediaMode === 'dalle') mediaMode = 'dalle3';

    console.log(`[Scheduler] Processing script queue for task: ${taskId}, mediaMode: ${mediaMode}, promptFormat: ${queue.promptFormat}`);
    addTitleLog(taskId, 'info', '📝 대본 작성 중...');

    // 대본 생성
    const scriptResult = await generateScript(queue, taskId, maxRetry);

    if (!scriptResult.success) {
      throw new Error(`Script generation failed: ${scriptResult.error}`);
    }

    addTitleLog(taskId, 'info', `✅ 대본 작성 완료`);

    // media_mode에 따라 다음 큐 결정
    if (mediaMode === 'upload' || mediaMode === 'crawl') {
      updateQueueStatus(taskId, 'image', 'waiting');
      addTitleLog(taskId, 'info', '📸 이미지 처리 대기 중...', 'image');
    } else {
      // dalle3, imagen3, sora2는 바로 video로
      updateQueueStatus(taskId, 'video', 'waiting');
      addTitleLog(taskId, 'info', '🎬 영상 제작 대기 중...');
    }
  });
}

// ============================================================
// Phase 3: Video Queue 처리
// ============================================================
async function processVideoQueue() {
  await processQueue('video', async (queue) => {
    const taskId = queue.taskId;
    const settings = await getAutomationSettings();
    const maxRetry = parseInt(settings.max_retry || '3');

    addTitleLog(taskId, 'info', '🎬 영상 생성 중...');

    // 영상 생성 (task_id = content_id = script_id)
    const videoResult = await generateVideo(queue.taskId, taskId, maxRetry, taskId, queue);

    if (!videoResult.success) {
      throw new Error(`Video generation failed: ${videoResult.error}`);
    }

    addTitleLog(taskId, 'info', `✅ 영상 생성 완료`);

    // 다음 큐 생성 (youtube waiting)
    updateQueueStatus(taskId, 'youtube', 'waiting');
    addTitleLog(taskId, 'info', '📤 YouTube 업로드 대기 중...');
  });
}

// ============================================================
// Phase 4: YouTube Queue 처리
// ============================================================
async function processYoutubeQueue() {
  await processQueue('youtube', async (queue) => {
    const taskId = queue.taskId;
    const settings = await getAutomationSettings();
    const maxRetry = parseInt(settings.max_retry || '3');

    addTitleLog(taskId, 'info', '📤 YouTube 업로드 중...');

    // YouTube 업로드 (task_id = content_id)
    const uploadResult = await uploadToYouTube(queue.taskId, queue, taskId, maxRetry);

    if (!uploadResult.success) {
      const errMsg = uploadResult.error || 'Unknown error';
      const isAuthError = /invalid_grant|인증 실패|expired or revoked|auth/i.test(errMsg);
      const friendly = '유튜브 인증이 만료되었습니다. 채널을 다시 연결해 주세요.';

      if (isAuthError) {
        addPipelineLog(taskId, 'error', friendly);
        addTitleLog(queue.taskId, 'error', `❌ ${friendly} (원인: ${errMsg})`, 'youtube');
      }

      throw new Error(isAuthError ? friendly : `YouTube upload failed: ${errMsg}`);
    }

    addTitleLog(taskId, 'info', `✅ YouTube 업로드 완료: ${uploadResult.videoUrl}`);
  });
}

// 파이프라인 실행
export async function executePipeline(queue: any) {
  // ⭐ task_id를 키로 사용 (random pipelineId 제거)
  const taskId = queue.taskId;
  const settings = await getAutomationSettings();

  // media_mode 가져오기 (SQL JOIN으로 이미 가져온 값 사용)
  let mediaMode = `${queue.mediaMode || settings.media_generation_mode || 'upload'}`.trim();
  if (mediaMode === 'dalle') mediaMode = 'dalle3';
  const maxRetry = parseInt(settings.max_retry || '3');

  try {
    // ============================================================
    // Stage 1: 대본 생성
    // ============================================================
    addPipelineLog(taskId, 'info', `Starting script generation for: ${queue.title}`);
    addTitleLog(queue.taskId, 'info', `Starting script generation for: ${queue.title}`);
    updatePipelineStatus(taskId, 'running');

    const scriptResult = await generateScript(queue, taskId, maxRetry);

    if (!scriptResult.success) {
      throw new Error(`Script generation failed: ${scriptResult.error}`);
    }

    updatePipelineStatus(taskId, 'completed');

    // v3: script_id는 더이상 task_schedule에 저장하지 않음 (content 테이블에서 조회 가능)
    // scriptId는 updateScheduleStatus에서도 무시됨 (큐 스펙 v3)
    // ⚠️ updateQueueStatus는 하단에서 미디어 모드 처리 후 호출됨 (중복 호출 방지)

    addPipelineLog(taskId, 'info', `Script generated successfully: ${scriptResult.scriptId}`);
    addTitleLog(queue.taskId, 'info', `✅ Script generated successfully: ${scriptResult.scriptId}`);

    // ============================================================
    // ⚠️ DEPRECATED: 상품설명 대본 별도 생성 제거
    // 이제 상품 대본 생성 시 youtube_description이 자동 포함됨
    // ============================================================
    console.log('ℹ️ [SCHEDULER] 상품 대본에 youtube_description 포함 완료 (별도 생성 불필요)');

    // ============================================================
    // 미디어 모드 분기 처리 (5가지 모드)
    // - upload: 직접 업로드 (사용자가 파일 선택)
    // - crawl: 이미지 크롤링 (Whisk 크롤러 자동 실행)
    // - dalle3: DALL-E 3 자동 생성
    // - imagen3: Imagen 3 자동 생성
    // - sora2: Sora 2 자동 생성
    // ============================================================

    // upload 또는 crawl 모드일 때만 이미지 대기 처리
    if (mediaMode === 'upload' || mediaMode === 'crawl') {
      // ⭐ 프로젝트 폴더와 story.json 생성 (task_id 기반 폴더, prefix 없이 UUID만!)
      const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
      const projectFolderPath = path.join(BACKEND_PATH, 'tasks', queue.taskId);

      try {
        // 폴더가 없으면 생성
        if (!fs.existsSync(projectFolderPath)) {
          fs.mkdirSync(projectFolderPath, { recursive: true });
          console.log(`📁 [SCHEDULER] 프로젝트 폴더 생성: ${projectFolderPath}`);
        }

        // story.json 파일에서 스크립트 내용 가져오기 (DB script_content 컬럼 삭제됨)
        const existingStoryPath = path.join(projectFolderPath, 'story.json');
        let contentStr = '';

        if (fs.existsSync(existingStoryPath)) {
          contentStr = fs.readFileSync(existingStoryPath, 'utf-8');
          console.log(`[SCHEDULER] story.json read: ${existingStoryPath}`);
        }

        if (contentStr && contentStr.includes('{')) {
          // JSON cleanup
          const rawContent = contentStr;

          // JSON 정리
          contentStr = contentStr.trim();
          if (contentStr.startsWith('JSON')) {
            contentStr = contentStr.substring(4).trim();
          }
          const jsonStart = contentStr.indexOf('{');
          if (jsonStart > 0) {
            contentStr = contentStr.substring(jsonStart);
          }

          const jsonEnd = contentStr.lastIndexOf('}');
          if (jsonEnd > 0 && jsonEnd < contentStr.length - 1) {
            contentStr = contentStr.substring(0, jsonEnd + 1);
          }

          // story.json 생성
          if (contentStr && contentStr.length > 0 && contentStr.includes('{')) {
            try {
              // ⭐ {home_url}과 {별명} 플레이스홀더 치환 (절대 빼면 안됨!)
              const hasHomeUrl = contentStr.includes('{home_url}');
              const hasNickname = contentStr.includes('{별명}');

              if (hasHomeUrl || hasNickname) {
                console.log(`🔧 [SCHEDULER] 플레이스홀더 치환 시작...`);
                // MySQL: removed better-sqlite3
                // MySQL: using global db
                // MySQL: db imported from sqlite wrapper

                const userSql = getSql('scheduler', 'getUserSettings');
                const userSettings = await db.prepare(userSql).get(queue.userId);
                const homeUrl = userSettings?.google_sites_home_url || '';
                const nickname = userSettings?.nickname || '';
                // MySQL: pool manages connections

                console.log(`  - {home_url}: ${hasHomeUrl} (값: ${homeUrl})`);
                console.log(`  - {별명}: ${hasNickname} (값: ${nickname})`);

                contentStr = contentStr
                  .replace(/{home_url}/g, homeUrl)
                  .replace(/{별명}/g, nickname);

                console.log(`✅ [SCHEDULER] 플레이스홀더 치환 완료`);
              }

              const scriptData = JSON.parse(contentStr);
              const storyJson = {
                ...scriptData,
                scenes: scriptData.scenes || []
              };

              const storyJsonPath = path.join(projectFolderPath, 'story.json');
              fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');
              console.log(`✅ [SCHEDULER] story.json 생성 완료: ${storyJsonPath}`);
              addTitleLog(queue.taskId, 'info', `✅ 프로젝트 폴더 및 story.json 생성 완료`);

              // ============================================================
              // 🚀 crawl 모드일 때만 이미지 크롤링 큐 등록
              // upload 모드는 사용자가 직접 업로드하므로 큐 등록 안함
              // ============================================================
              if (mediaMode === 'crawl') {
                if (storyJson.scenes && storyJson.scenes.length > 0) {
                  try {
                    // ⚠️ QueueManager는 더 이상 사용하지 않음 - automation.ts의 updateQueueStatus 사용
                    // task_queue에 직접 등록 (type='image', status='waiting')
                    // ⭐ 롱폼일 때만 imageFX+whisk 사용 (핵심!)
                    const isLongform = queue.promptFormat === 'longform';
                    updateQueueStatus(queue.taskId, 'image', 'waiting', {
                      metadata: {
                        scenes: storyJson.scenes,
                        useImageFX: isLongform,  // ⭐ 롱폼 → true, 그 외 → false
                        scheduleId: queue.id,
                        taskId: queue.taskId,
                        format: queue.promptFormat || 'longform',
                        promptFormat: queue.promptFormat || 'longform',  // ⭐ 콘텐츠 형식
                        scriptId: scriptResult.scriptId,
                        product_info: storyJson.product_info
                      }
                    });

                    // task_id는 이미 task_schedule에 저장되어 있음
                    console.log(`✅ [SCHEDULER] 이미지 크롤링 큐 등록 완료: ${scriptResult.scriptId}`);
                    addTitleLog(queue.taskId, 'info', `🖼️ 이미지 크롤링 자동 시작됨 (폴더: tasks/${scriptResult.scriptId})`, 'image');
                    addPipelineLog(taskId, 'info', `🖼️ Image crawling queued: ${queue.taskId}`);
                  } catch (queueError: any) {
                    console.error(`❌ [SCHEDULER] 이미지 크롤링 큐 등록 실패: ${queueError.message}`);
                    addTitleLog(queue.taskId, 'warn', `⚠️ 자동 크롤링 실패 - 수동으로 이미지를 업로드해주세요`, 'image');
                  }
                } else {
                  console.warn(`⚠️ [SCHEDULER] scenes 데이터가 없어 이미지 크롤링 큐 등록 건너뜀`);
                  addTitleLog(queue.taskId, 'warn', `⚠️ 씬 데이터가 없습니다 - 수동으로 이미지를 업로드해주세요`, 'image');
                }
              } else {
                // upload 모드: 크롤링 없이 직접 업로드 대기
                console.log(`📤 [SCHEDULER] 직접 업로드 모드 - 사용자가 이미지를 업로드할 때까지 대기`);
                addTitleLog(queue.taskId, 'info', `📤 직접 업로드 모드 - 이미지를 업로드해주세요`, 'image');
              }
            } catch (parseError: any) {
              console.error(`❌ [SCHEDULER] JSON 파싱 실패: ${parseError.message}`);
              addTitleLog(queue.taskId, 'warn', `⚠️ story.json 생성 실패 (수동으로 대본 확인 필요)`);
            }
          } else {
            console.warn(`⚠️ [SCHEDULER] 대본 content가 비어있거나 JSON이 아님`);
          }
        }
      } catch (folderError: any) {
        console.error(`❌ [SCHEDULER] 폴더 생성 실패: ${folderError.message}`);
        addTitleLog(queue.taskId, 'warn', `⚠️ 프로젝트 폴더 생성 실패 (계속 진행)`);
      }

      updateQueueStatus(queue.taskId, 'script', 'completed');
      updateQueueStatus(queue.taskId, 'image', 'waiting');
      // ⚠️ DEPRECATED: video_titletq.status는 더이상 사용하지 않음 (task_schedule.status만 참조)
      // updateTitleStatus(queue.taskId, 'waiting_for_upload');

      // 모드에 따라 다른 대기 메시지 표시
      if (mediaMode === 'crawl') {
        addPipelineLog(taskId, 'info', `⏸️ 이미지 크롤링 대기 중...`);
        addTitleLog(queue.taskId, 'info', `⏸️ 이미지 크롤링이 완료되면 자동으로 영상 생성이 시작됩니다.`, 'image');
        console.log(`[Scheduler] Queue ${queue.id} is waiting for image crawling to complete`);
      } else {
        addPipelineLog(taskId, 'info', `⏸️ 이미지 직접 업로드 대기 중...`);
        addTitleLog(queue.taskId, 'info', `⏸️ 이미지를 업로드하면 자동으로 영상 생성이 시작됩니다.`, 'image');
        console.log(`[Scheduler] Queue ${queue.id} is waiting for manual image upload`);
      }

      return; // 이미지 대기, video 단계로 진행하지 않음
    }

    // ============================================================
    // Stage 2: 영상 생성
    // ============================================================
    addPipelineLog(taskId, 'info', `Starting video generation from script: ${scriptResult.scriptId}`);
    addTitleLog(queue.taskId, 'info', `🎬 Starting video generation...`);
    updatePipelineStatus(taskId, 'running');

    if (!scriptResult.scriptId) {
      throw new Error('Script ID not found in scriptResult');
    }

    const videoResult = await generateVideo(scriptResult.scriptId, taskId, maxRetry, queue.taskId, queue);

    if (!videoResult.success) {
      // skipError가 true이면 (이미지 업로드 대기) 에러를 던지지 않고 조용히 종료
      if (videoResult.skipError) {
        console.log(`[Scheduler] Video generation waiting for upload: ${queue.id}`);
        return;
      }
      throw new Error(`Video generation failed: ${videoResult.error}`);
    }

    updatePipelineStatus(taskId, 'completed');

    // 통합 키 시스템: task_id = content_id 이므로 별도 저장 불필요

    updateQueueStatus(queue.taskId, 'video', 'completed');
    updateQueueStatus(queue.taskId, 'youtube', 'waiting');
    addPipelineLog(taskId, 'info', `Video generated successfully: ${videoResult.videoId}`);
    addTitleLog(queue.taskId, 'info', `✅ Video generated successfully: ${videoResult.videoId}`);

    console.log(`[Scheduler] Video generation completed for queue ${queue.scheduleId}, continuing with upload...`);
    // return 삭제 - 자동으로 업로드 진행

    // ============================================================
    // Stage 3: 유튜브 업로드
    // ============================================================
    addPipelineLog(taskId, 'info', `Starting YouTube upload for video: ${videoResult.videoId}`);
    addTitleLog(queue.taskId, 'info', `📤 Uploading to YouTube...`);
    updatePipelineStatus(taskId, 'running');

    const uploadResult = await uploadToYouTube(videoResult.videoId, queue, taskId, maxRetry);

    if (!uploadResult.success) {
      throw new Error(`YouTube upload failed: ${uploadResult.error}`);
    }

    updatePipelineStatus(taskId, 'completed');

    // youtube_upload_id 제거됨 (큐 스펙 v3)
    updateQueueStatus(queue.taskId, 'youtube', 'processing');
    addPipelineLog(taskId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
    addTitleLog(queue.taskId, 'info', `✅ YouTube upload successful: ${uploadResult.videoUrl}`);

    // ============================================================
    // Stage 4: 유튜브 퍼블리시 (예약 시간에 공개)
    // ⚠️ COMMENTED OUT: scheduleYouTubePublish function not implemented
    // YouTube uploads are already completed in Stage 3
    // ============================================================
    // addPipelineLog(taskId, 'info', `Scheduling YouTube publish`);
    // addTitleLog(queue.taskId, 'info', `📅 Scheduling publish...`);
    // updatePipelineStatus(taskId, 'running');

    // const publishResult = await scheduleYouTubePublish(uploadResult.uploadId!, queue, taskId);

    // if (!publishResult.success) {
    //   throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
    // }

    updatePipelineStatus(taskId, 'completed');
    updateQueueStatus(queue.taskId, 'youtube', 'completed');
    // ⚠️ DEPRECATED: video_titletq.status는 더이상 사용하지 않음 (task_schedule.status만 참조)
    // updateTitleStatus(queue.taskId, 'completed');
    addPipelineLog(taskId, 'info', `Pipeline completed successfully!`);
    addTitleLog(queue.taskId, 'info', `🎉 All done! Pipeline completed successfully!`);

    console.log(`✅ [Pipeline] Successfully completed for queue ${queue.id}`);

    // ============================================================
    // ⚠️ DISABLED: 롱폼 완료 후 숏폼 자동 생성
    // - shortform_task_id, parent_youtube_url 컬럼이 task_schedule 테이블에서 제거됨 (cleanup-task-schedule.js)
    // - 숏폼 관련 정보는 content 테이블로 이동 예정
    // ============================================================
    /*
    if (schedule.type === 'longform' && uploadResult.videoUrl) {
      console.log(`🎬 [SHORTFORM] Longform completed, triggering shortform conversion...`);
      addTitleLog(schedule.task_id, 'info', `🎬 롱폼 완료! 숏폼 변환 시작...`);

      try {
        // 롱폼 content_id (job_id) 가져오기
        const longformJobId = videoResult.videoId;
        const longformYoutubeUrl = uploadResult.videoUrl;

        console.log(`🔍 [SHORTFORM] Longform job_id: ${longformJobId}, YouTube URL: ${longformYoutubeUrl}`);

        // convert-to-shorts API 호출
        const convertResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/jobs/${longformJobId}/convert-to-shorts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system',
            'X-User-Id': schedule.user_id // 인증 우회용
          }
        });

        if (!convertResponse.ok) {
          const errorText = await convertResponse.text();
          console.error(`❌ [SHORTFORM] Conversion failed: ${errorText}`);
          addTitleLog(schedule.task_id, 'warn', `⚠️ 숏폼 변환 실패: ${errorText}`);
        } else {
          const convertData = await convertResponse.json();
          const shortformJobId = convertData.taskId;

          console.log(`✅ [SHORTFORM] Conversion started, shortform job_id: ${shortformJobId}`);
          addTitleLog(schedule.task_id, 'info', `✅ 숏폼 변환 시작됨 (작업 ID: ${shortformJobId})`);

          // 숏폼 작업 ID와 롱폼 YouTube URL 저장 (나중에 업로드할 때 사용)
          // MySQL: use imported db
        }
      } catch (e: any) {
        console.error(`❌ [SHORTFORM] Error:`, e);
      }
    }
    */

  } catch (error: any) {
    // 현재 실행 중인 큐 타입 조회
    const queueTypeSql = getSql('scheduler', 'getCurrentQueueType');
    const currentQueue = await db.prepare(queueTypeSql).get(queue.taskId) as { type: string; status: string } | undefined;

    const failedPhase = currentQueue?.type || 'script';  // 기본값은 script
    console.error(`❌ [Pipeline] Failed at phase: ${failedPhase}`);

    // 실패한 phase만 failed로 업데이트 (다른 phase는 그대로 유지)
    updateQueueStatus(queue.taskId, failedPhase as any, 'failed', { errorMessage: error.message });
    // ⚠️ DEPRECATED: video_titletq.status는 더이상 사용하지 않음 (task_schedule.status만 참조)
    // updateTitleStatus(queue.taskId, 'failed');
    addTitleLog(queue.taskId, 'error', `❌ Pipeline failed at ${failedPhase}: ${error.message}`);

    // 에러 이메일 전송 (TODO: 올바른 형식으로 구현 필요)
    // await sendErrorEmail(...);
  }
}

// ============================================================
// 개별 Stage 함수들
// ============================================================

// Stage 1: 대본 생성 (재시도 로직 제거)
async function generateScript(queue: any, pipelineId: string, maxRetry: number) {
  console.log('🔍 [SCHEDULER] generateScript called with queue:', {
    id: queue.id,
    title: queue.title,
    user_id: queue.userId,
    hasUserId: !!queue.userId
  });
  console.log('🔍 [SCHEDULER] Full queue keys:', Object.keys(queue));
  console.log('🔍 [SCHEDULER] queue.productInfo exists?:', !!queue.productInfo);
  console.log('🔍 [SCHEDULER] queue.promptFormat:', queue.promptFormat);

  let result: { success: boolean; scriptId?: string; error?: string } = { success: false, error: 'Unknown error' };

  try {
    addPipelineLog(pipelineId, 'info', `📝 대본 생성 시작...`);
    addTitleLog(queue.taskId, 'info', `📝 대본 생성 시작...`);
    if (await isPipelineOrScheduleCancelled(pipelineId)) {
      throw new Error('Automation stopped by user');
    }

    // 상품 정보 추출 (product_data에서 파싱)
    // ⭐ 통일 구조: { productId, title, price, thumbnail, deepLink, category }
    let productInfo = undefined;
    if (queue.productInfo) {
      try {
        const parsed = JSON.parse(queue.productInfo);
        // 레거시 nested 구조 호환 (data 필드가 있으면 사용)
        const source = parsed.data || parsed;
        // 통일 구조로 정규화
        productInfo = {
          productId: source.productId || `prod_${Date.now()}`,
          title: source.title || source.productName || '',
          price: source.price ?? source.productPrice ?? 0,
          thumbnail: source.thumbnail || source.productImage || '',
          deepLink: source.deepLink || source.productUrl || source.product_link || parsed.url || '',
          category: source.category || '상품'
        };
        console.log('🛍️ [SCHEDULER] Product data (정규화됨):', productInfo);

        /**
         * ╔═══════════════════════════════════════════════════════════════════════════╗
         * ║  🚨🚨🚨 딥링크 검증 - 절대 삭제/수정 금지! 🚨🚨🚨                          ║
         * ║                                                                           ║
         * ║  ✅ 유효한 딥링크 형식 (단축 URL):                                        ║
         * ║     link.coupang.com/{1-2글자}/XXXXX                                      ║
         * ║     예: /a/, /b/, /ab/, /cL/ 등                                          ║
         * ║                                                                           ║
         * ║  ❌ 무효한 딥링크 형식 (모두 거부!):                                      ║
         * ║     - link.coupang.com/re/AFFSDP?... (긴 형식 - 딥링크 아님!)            ║
         * ║     - coupang.com/vp/products/... (일반 상품 URL)                        ║
         * ╚═══════════════════════════════════════════════════════════════════════════╝
         */
        if (queue.promptFormat === 'product' && productInfo.deepLink) {
          const isDeeplink = productInfo.deepLink.includes('link.coupang.com/') &&
            !productInfo.deepLink.includes('/re/AFFSDP') &&
            !productInfo.deepLink.includes('?lptag=') &&
            !productInfo.deepLink.includes('?pageKey=');
          if (!isDeeplink) {
            console.error(`❌ [SCHEDULER] 딥링크 형식 오류 - 단축 URL만 허용: ${productInfo.deepLink}`);
            addTitleLog(queue.taskId, 'error', `❌ 딥링크 형식 오류!\n\n/re/AFFSDP 긴 형식은 딥링크가 아닙니다.\n\n현재 URL: ${productInfo.deepLink}`);
            throw new Error(`딥링크 형식 오류: ${productInfo.deepLink}`);
          }
          console.log(`✅ [SCHEDULER] 상품 딥링크 검증 통과: ${productInfo.deepLink.substring(0, 50)}...`);
        }
      } catch (e: any) {
        console.error('❌ [SCHEDULER] Failed to parse product_data:', e);
        console.error('  - Raw product_data:', queue.productInfo);
      }
    }
    if (!queue.productInfo) {
      console.warn(`⚠️ [SCHEDULER] No product_data for promptFormat: ${queue.promptFormat}`);
    }

    // ⭐ Format에 따른 프롬프트 가져오기
    let prompt = '';
    try {
      // 포맷별 프롬프트 파일 읽기
      const promptFileName = `prompt_${queue.promptFormat}.txt`;
      const promptFilePath = path.join(process.cwd(), 'prompts', promptFileName);

      if (fs.existsSync(promptFilePath)) {
        prompt = fs.readFileSync(promptFilePath, 'utf-8');
        console.log(`✅ [SCHEDULER] Loaded prompt for format: ${queue.promptFormat} (${prompt.length} chars)`);
      } else {
        console.warn(`⚠️ [SCHEDULER] Prompt file not found: ${promptFilePath}`);
        prompt = '';
      }
    } catch (e: any) {
      console.warn(`⚠️ [SCHEDULER] Failed to load prompt for ${queue.promptFormat}:`, e);
      prompt = '';
    }

    // ⭐ script_mode에 따라 mode 파라미터 설정
    const scriptMode = queue.scriptMode || 'chrome'; // 기본값: chrome
    console.log(`🔍 [SCHEDULER] script_mode: ${scriptMode}`);

    // 통합 API 호출: /api/scripts/generate?mode=chrome or mode=api
    const requestBody = {
      title: queue.title,
      type: queue.promptFormat,
      scriptModel: queue.aiModel || 'claude',
      productInfo: productInfo,
      category: queue.category || '상품',
      userId: queue.userId,
      mode: scriptMode, // ⭐ 'chrome' 또는 'api'
      taskId: queue.taskId // ⭐ task와 content 연결
    };

    console.log('🔍 [SCHEDULER] Request body:', JSON.stringify(requestBody, null, 2));
    console.log('🔍 [SCHEDULER] productInfo 전달:', productInfo ? 'YES ✅' : 'NO ❌');
    console.log('🔍 [SCHEDULER] userId 전달:', queue.userId);
    console.log('🔍 [SCHEDULER] mode:', scriptMode);

    console.log(`📤 [SCHEDULER] Calling /api/scripts/generate?mode=${scriptMode}...`);
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scripts/generate?mode=${scriptMode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'automation-system'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📥 [SCHEDULER] Script API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [SCHEDULER] Script API error response: ${errorText}`);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e: any) {
        throw new Error(`Script generation failed: ${errorText}`);
      }
      throw new Error(error.error || 'Script generation failed');
    }

    const data = await response.json();
    console.log('✅ [SCHEDULER] Script API response data:', JSON.stringify(data, null, 2));

    // scriptId 또는 taskId 추출 (API 모드는 scriptId, Chrome 모드는 taskId 반환)
    const taskId = data.scriptId || data.taskId;
    if (!taskId) {
      throw new Error('Script taskId not found in API response');
    }

    addPipelineLog(pipelineId, 'info', `Script generation job started: ${taskId}`);

    // 작업 완료 대기 (최대 10분)
    const maxWaitTime = 10 * 60 * 1000;
    const startTime = Date.now();
    let lastProgress = 0; // 마지막 진행률 추적
    let scriptCompleted = false;

    while (Date.now() - startTime < maxWaitTime && !scriptCompleted) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5초마다 체크
      if (await isPipelineOrScheduleCancelled(pipelineId)) {
        throw new Error('Automation stopped by user');
      }


      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`🔍 [SCHEDULER] Checking script status for ${taskId}... (경과시간: ${elapsed}초)`);
      const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scripts/status/${taskId}`);

      console.log(`📥 [SCHEDULER] Status API response: ${statusRes.status}`);

      if (!statusRes.ok) {
        const errorText = await statusRes.text();
        console.error(`❌ [SCHEDULER] Status API failed: ${statusRes.status}, Response: ${errorText}`);
        continue;
      }

      const statusData = await statusRes.json();
      console.log(`📊 [SCHEDULER] Script Status Response:`, JSON.stringify(statusData, null, 2));

      if (statusData.status === 'completed') {
        addPipelineLog(pipelineId, 'info', `Script generation completed: ${taskId}`);
        addTitleLog(queue.taskId, 'info', '✅ 대본 생성 완료!');
        console.log(`✅ [SCHEDULER] Script generation completed!`);
        scriptCompleted = true;
        break;
      } else if (statusData.status === 'failed') {
        console.error(`❌ [SCHEDULER] Script generation failed: ${statusData.error}`);
        throw new Error(`Script generation failed: ${statusData.error}`);
      }

      // 진행 상황 로그 (progress가 변경될 때만)
      if (statusData.progress && statusData.progress !== lastProgress) {
        lastProgress = statusData.progress;
        const msg = `📝 대본 생성 중... ${statusData.progress}%`;
        addPipelineLog(pipelineId, 'info', msg);
        addTitleLog(queue.taskId, 'info', msg);
      }
    }

    if (!scriptCompleted) {
      throw new Error('Script generation timeout (10분 초과)');
    }

    result = { success: true, scriptId: taskId };

  } catch (error: any) {
    const errorMsg = (error as any)?.message || 'Unknown error';
    addPipelineLog(pipelineId, 'error', `❌ 대본 생성 실패: ${errorMsg}`);
    addTitleLog(queue.taskId, 'error', `❌ 대본 생성 실패: ${errorMsg}`);
    console.error(`❌ [SCHEDULER] Script generation failed:`, errorMsg);
    result = { success: false, error: errorMsg };
  }

  return result;
}

// Stage 2: 영상 생성 (재시도 로직 제거)
async function generateVideo(scriptId: string, pipelineId: string, maxRetry: number, titleId: string, queue: any) {
  // ⭐ queue 객체 정규화: snake_case와 camelCase 모두 지원
  const queueTaskId = queue.taskId || queue.task_id;
  const queueUserId = queue.userId || queue.user_id;
  const queuePromptFormat = queue.promptFormat || queue.prompt_format;
  const queueCategory = queue.category;
  const queueProductInfo = queue.productInfo || queue.product_info;
  const queueScriptMode = queue.scriptMode || queue.script_mode;
  const queueAiModel = queue.aiModel || queue.ai_model;
  const queueTtsVoice = queue.ttsVoice || queue.tts_voice;

  const settings = await getAutomationSettings();

  // media_mode 가져오기 (SQL JOIN으로 이미 가져온 값 사용)
  const mediaMode = `${queue.mediaMode || settings.media_generation_mode || 'upload'}`.trim();

  try {
    addPipelineLog(pipelineId, 'info', `🎬 영상 생성 시작... (mode: ${mediaMode})`);
    addTitleLog(titleId, 'info', `🎬 영상 생성 시작...`);

    // story.json 파일에서 대본 조회 (DB script_content 컬럼 삭제됨)
    // MySQL: db imported from sqlite wrapper
    const contentSql = getSql('scheduler', 'getContentBasicById');
    const dbContent = await db.prepare(contentSql).get(scriptId) as any;
    // MySQL: pool manages connections

    if (!dbContent) {
      throw new Error(`Script not found: ${scriptId}`);
    }

    if (!dbContent.user_id) {
      throw new Error(`Script ${scriptId} has no user_id`);
    }

    // story.json 파일에서 대본 읽기
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const storyPath = path.join(backendPath, 'tasks', scriptId, 'story.json');

    let scriptData;
    try {
      if (!fs.existsSync(storyPath)) {
        throw new Error(`story.json not found: ${storyPath}`);
      }
      let contentStr = fs.readFileSync(storyPath, 'utf-8');

      // JSON 정리
      contentStr = contentStr.trim();
      if (contentStr.startsWith('JSON')) {
        contentStr = contentStr.substring(4).trim();
      }
      const jsonStart = contentStr.indexOf('{');
      if (jsonStart > 0) {
        contentStr = contentStr.substring(jsonStart);
      }

      const jsonEnd = contentStr.lastIndexOf('}');
      if (jsonEnd > 0 && jsonEnd < contentStr.length - 1) {
        contentStr = contentStr.substring(0, jsonEnd + 1);
      }

      scriptData = JSON.parse(contentStr);
    } catch (e: any) {
      throw new Error(`Failed to parse script content: ${e.message}`);
    }

    // story.json 생성
    const storyJson = {
      ...scriptData,
      scenes: scriptData.scenes || []
    };

    // ⭐ 업로드된 이미지와 비디오 확인 (task_id 기반 폴더, prefix 없이 UUID만!)
    const taskFolderPath = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks', queueTaskId);
    const scriptFolderPath = taskFolderPath;
    let hasUploadedImages = false;
    let hasUploadedVideos = false;
    let imageFiles: string[] = [];
    let videoFiles: string[] = [];
    if (fs.existsSync(scriptFolderPath)) {
      const files = fs.readdirSync(scriptFolderPath);
      // ⭐ thumbnail.* 파일 제외 (영상 제작 재료에서 제외)
      imageFiles = files.filter(f =>
        /\.(png|jpg|jpeg|webp)$/i.test(f) && !f.startsWith('thumbnail.')
      );
      videoFiles = files.filter(f => /\.(mp4|mov|avi|mkv)$/i.test(f));
      hasUploadedImages = imageFiles.length > 0;
      hasUploadedVideos = videoFiles.length > 0;
      if (hasUploadedImages || hasUploadedVideos) {
        console.log(`[Scheduler] Found ${imageFiles.length} image(s) and ${videoFiles.length} video(s) in ${scriptFolderPath} (thumbnail excluded)`);
      }
    }

    // 씬 개수 확인
    const sceneCount = storyJson.scenes?.length || 0;
    const totalMediaCount = imageFiles.length + videoFiles.length;

    // ============================================================
    // ⭐ 이미지 체크: 모든 모드에서 이미지가 없으면 대기
    // - upload 모드: 사용자가 직접 업로드할 때까지 대기
    // - whisk/imagefx 모드: 이미지 크롤링이 완료될 때까지 대기
    // ============================================================
    if (!hasUploadedImages && !hasUploadedVideos) {
      const waitMessage = mediaMode === 'upload'
        ? '⏸️ 이미지를 업로드해주세요. 업로드 후 자동으로 영상 생성이 시작됩니다.'
        : '⏸️ 이미지 크롤링이 완료될 때까지 대기 중입니다...';

      console.log(`⏸️ [SCHEDULER] 이미지가 없습니다 (mode: ${mediaMode}). 대기 상태로 변경합니다.`);
      addPipelineLog(pipelineId, 'info', waitMessage);
      addTitleLog(titleId, 'info', waitMessage);

      // 스케줄 상태를 다시 waiting_for_upload로 변경
      updateQueueStatus(queueTaskId, 'script', 'completed');
      updateQueueStatus(queueTaskId, 'image', 'waiting');
      // ⚠️ DEPRECATED: video_titletq.status는 더이상 사용하지 않음 (task_schedule.status만 참조)
      // updateTitleStatus(titleId, 'waiting_for_upload');
      updatePipelineStatus(pipelineId, 'pending'); // video pipeline을 pending으로 되돌림

      return {
        success: false,
        error: 'Waiting for images',
        skipError: true // 에러 이메일 발송하지 않음
      };
    }

    // 썸네일 분리 로직: 영상+이미지가 함께 있고, 총 미디어가 씬보다 많을 때만 첫 이미지를 썸네일로 사용
    let useThumbnailFromFirstImage = false;
    if (hasUploadedImages && hasUploadedVideos && totalMediaCount > sceneCount) {
      // 파일을 scene 번호 순으로 정렬 (scene_0, scene_1, ...)
      const sortedImages = imageFiles.sort((a, b) => {
        const aMatch = a.match(/scene_(\d+)/);
        const bMatch = b.match(/scene_(\d+)/);
        const aNum = aMatch ? parseInt(aMatch[1]) : 999;
        const bNum = bMatch ? parseInt(bMatch[1]) : 999;
        return aNum - bNum;
      });

      // 첫 번째 파일이 scene_0이고 이미지인지 확인
      const firstFile = sortedImages[0];
      if (firstFile && /scene_0.*\.(png|jpg|jpeg|webp)$/i.test(firstFile)) {
        useThumbnailFromFirstImage = true;
        console.log(`\n📌 [SCHEDULER] 썸네일 분리 조건 만족: 영상+이미지 있고 미디어(${totalMediaCount}) > 씬(${sceneCount})`);
        console.log(`   🖼️ 썸네일: ${firstFile}`);
        console.log(`   📹 씬 미디어: ${totalMediaCount - 1}개 (${firstFile} 제외)`);
      }
    } else {
      console.log(`\n📌 [SCHEDULER] 썸네일 분리 안 함:`);
      if (!hasUploadedImages || !hasUploadedVideos) {
        console.log(`   - 영상+이미지 미포함 (영상: ${hasUploadedVideos}, 이미지: ${hasUploadedImages})`);
      }
      if (totalMediaCount <= sceneCount) {
        console.log(`   - 미디어(${totalMediaCount}) ≤ 씬(${sceneCount})`);
      }
      console.log(`   → 모든 미디어를 씬에 사용`);
    }

    // 이미지 소스 설정 (업로드된 이미지가 있으면 우선 사용)
    const imageSource = (mediaMode === 'upload' || hasUploadedImages) ? 'none' : mediaMode;

    // 이미지 모델 설정 (imagen3 -> imagen3, 나머지는 dalle3)
    const imageModel = mediaMode === 'imagen3' ? 'imagen3' : 'dalle3';

    // 비디오 포맷 + 카테고리 (⭐ 상품 카테고리는 9:16 비율!)
    // ⚠️ task.prompt_format (type)을 사용! scriptData.metadata?.genre 사용 금지 (카테고리 이름이 들어옴)
    const category = queueCategory || scriptData.metadata?.category || '';
    // 🐛 FIX: category가 '상품'이면 기본값을 'product'로 설정해야 9:16 비율 적용됨!
    const isProductCategory = category === '상품' || queueProductInfo;
    // ⭐ 1순위: metadata.promptFormat (story.json에서 대본 생성 시 설정됨)
    const storyMetadata = scriptData.metadata || {};
    const VALID_FORMATS = ['longform', 'shortform', 'product', 'product-info', 'sora2'];
    const promptFormat = (storyMetadata.promptFormat && VALID_FORMATS.includes(storyMetadata.promptFormat))
      ? storyMetadata.promptFormat
      : (queuePromptFormat || (isProductCategory ? 'product' : 'longform'));

    // 🔍 DEBUG: 비율 결정에 사용되는 값 확인
    console.log(`📐 [generateVideo] 비율 결정 값:`);
    console.log(`  - metadata.promptFormat (1순위): ${storyMetadata.promptFormat}`);
    console.log(`  - queue.promptFormat: ${queuePromptFormat}`);
    console.log(`  - queue.category: ${queueCategory}`);
    console.log(`  - promptFormat (final): ${promptFormat}`);
    console.log(`  - category (final): ${category}`);

    // JSON으로 전송 (내부 요청)
    // scriptId에 task_id를 전달하여 폴더 이름이 task_{task_id}가 되도록 함
    // ⭐ TTS 기본값: 롱폼=순복, 숏폼/상품=선희
    const defaultTtsVoice = promptFormat === 'longform' ? 'ko-KR-SoonBokNeural' : 'ko-KR-SunHiNeural';
    const requestBody: any = {
      storyJson,
      userId: queueUserId,
      imageSource,
      imageModel,
      promptFormat,
      category,  // ⭐ 카테고리 추가 (상품인 경우 9:16)
      ttsVoice: queueTtsVoice || defaultTtsVoice,
      title: queue.title,
      scriptId: queueTaskId || scriptId,  // task_id 우선, 없으면 scriptId (레거시)
      useThumbnailFromFirstImage  // 첫 번째 이미지를 썸네일로 사용 여부
    };

    // ============================================================
    // 중복 실행 방지: 같은 source_content_id로 이미 실행 중인 job이 있는지 확인
    // ============================================================
    // MySQL: use imported db
    let taskId: string | undefined;
    let shouldCallApi = true;

    const existingJobSql = getSql('scheduler', 'getExistingJobBySourceId');
    const existingJob = await db.prepare(existingJobSql).get(scriptId) as any;

    // MySQL: pool manages connections

    // ⭐ existingJob.id가 유효한 경우에만 기존 작업 재사용
    if (existingJob && existingJob.id) {
      console.log(`🔍 [DUPLICATE CHECK] Found existing job: ${existingJob.id} (status: ${existingJob.status})`);
      addPipelineLog(pipelineId, 'info', `⚠️ 이미 실행 중인 작업 발견: ${existingJob.id}`);
      addTitleLog(titleId, 'info', `⚠️ 기존 작업을 재사용합니다: ${existingJob.id}`);

      taskId = existingJob.id;
      shouldCallApi = false;
    } else {
      // 새로운 job 생성은 API에서 처리 (fresh created_at 타임스탬프로)
      console.log(`✅ [DUPLICATE CHECK] No existing job found, will create new job via API`);
      addPipelineLog(pipelineId, 'info', `📝 API를 통해 새 Job 생성 예정`);
      shouldCallApi = true;
    }

    console.log('📤 [SCHEDULER] Calling /api/generate-video-upload...');
    console.log('🔍 [SCHEDULER] Request body:', {
      scriptId,
      userId: queueUserId,
      imageSource,
      imageModel,
      promptFormat
    });

    let response: Response | null = null;
    let data: any = null;

    // 기존 job이 없을 때만 API 호출
    if (shouldCallApi) {
      // API가 fresh created_at 타임스탬프로 새 job을 생성하도록 taskId를 전달하지 않음
      // (메인 페이지와 동일한 방식)

      // /api/generate-video-upload 호출
      response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'automation-system'
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`📥 [SCHEDULER] Video API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [SCHEDULER] Video API error response: ${errorText}`);
        let error;
        try {
          error = JSON.parse(errorText);
        } catch (e: any) {
          throw new Error(`Video generation failed: ${errorText}`);
        }
        throw new Error(error.error || 'Video generation failed');
      }

      data = await response.json();
      console.log('✅ [SCHEDULER] Video API response data:', JSON.stringify(data, null, 2));

      taskId = data.taskId;
    } else {
      // 기존 job 재사용 - taskId는 이미 설정됨
      console.log(`♻️ [SCHEDULER] Reusing existing job: ${taskId}`);
    }

    // 작업이 비동기로 처리되는 경우 폴링
    if (taskId) {
      addPipelineLog(pipelineId, 'info', `Video generation job: ${taskId}`);

      // 통합 키 시스템: task_id = content_id 이므로 별도 저장 불필요
      console.log(`✅ [SCHEDULER] Video generation started: ${taskId}`);
      addTitleLog(queueTaskId, 'info', `🎬 영상 생성 작업 시작: ${taskId}`);

      // 작업 완료 대기 (최대 30분)
      const maxWaitTime = 30 * 60 * 1000; // 30분
      const startTime = Date.now();
      let lastProgress = 0; // 마지막 진행률 추적

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5초마다 체크

        // 중지 요청 확인 (DB에서 schedule 상태 체크)
        // v6: task_schedule.status 직접 사용 (task_queue.type='schedule' 제거됨)
        const scheduleStatusSql = getSql('scheduler', 'getScheduleStatus');
        const scheduleStatus = await db.prepare(scheduleStatusSql).get(pipelineId) as { status: string } | undefined;

        if (scheduleStatus && (scheduleStatus.status === 'failed' || scheduleStatus.status === 'cancelled')) {
          console.log(`🛑 [SCHEDULER] Pipeline ${pipelineId} ${scheduleStatus.status}`);
          throw new Error(`작업이 ${scheduleStatus.status === 'failed' ? '실패' : '취소'}되었습니다`);
        }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`🔍 [SCHEDULER] Checking video status for ${taskId}... (경과시간: ${elapsed}초)`);

        const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload?taskId=${taskId}`);
        console.log(`📥 [SCHEDULER] Video Status API response: ${statusRes.status}`);

        if (!statusRes.ok) {
          const errorText = await statusRes.text();
          console.error(`❌ [SCHEDULER] Video Status API failed: ${statusRes.status}, Response: ${errorText}`);
          continue;
        }

        const statusData = await statusRes.json();
        console.log(`📊 [SCHEDULER] Video Status Response:`, JSON.stringify(statusData, null, 2));

        if (statusData.status === 'completed') {
          addPipelineLog(pipelineId, 'info', `Video generation completed: ${statusData.videoId}`);
          addTitleLog(titleId, 'info', '✅ 영상 생성 완료!');
          console.log(`✅ [SCHEDULER] Video generation completed!`);

          // 통합 키 시스템: task_id = content_id 이므로 별도 저장 불필요
          console.log(`🔥 [FINAL] Video generation completed: ${statusData.videoId}`);

          return { success: true, videoId: statusData.videoId };
        } else if (statusData.status === 'failed') {
          console.error(`❌ [SCHEDULER] Video generation failed: ${statusData.error}`);
          throw new Error(`Video generation failed: ${statusData.error}`);
        }

        // 진행 상황 로그 (progress가 변경될 때만)
        if (statusData.progress && statusData.progress !== lastProgress) {
          lastProgress = statusData.progress;
          const msg = `🎬 영상 생성 중... ${statusData.progress}%`;
          console.log(`📈 [SCHEDULER] Video Progress: ${statusData.progress}`);
          addPipelineLog(pipelineId, 'info', msg);
          addTitleLog(titleId, 'info', msg);
        }
      }

      throw new Error('Video generation timeout (30분 초과)');
    }

    // 즉시 완료되는 경우 (거의 없지만 방어 코드)
    return { success: true, videoId: data?.videoId || taskId };

  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    addPipelineLog(pipelineId, 'error', `❌ 영상 생성 실패: ${errorMsg}`);
    addTitleLog(titleId, 'error', `❌ 영상 생성 실패: ${errorMsg}`);
    console.error(`❌ [SCHEDULER] Video generation failed:`, error.message);
    return { success: false, error: errorMsg };
  }
}

// Stage 3: 유튜브 업로드
async function uploadToYouTube(videoId: string, queue: any, pipelineId: string, maxRetry: number) {
  try {
    addPipelineLog(pipelineId, 'info', `Uploading to YouTube`);
    console.log(`🔍 [YOUTUBE UPLOAD] videoId: ${videoId}`);

    // content 테이블에서 title 조회
    // MySQL: db imported from sqlite wrapper
    const jobSql = getSql('scheduler', 'getContentAllById');
    const job = await db.prepare(jobSql).get(videoId) as any;
    // MySQL: pool manages connections

    if (!job) {
      addPipelineLog(pipelineId, 'error', `Content not found: videoId=${videoId}`);
      throw new Error('Content not found');
    }

    // ⭐ video_path를 DB가 아닌 폴더에서 직접 탐색
    const fs = require('fs');
    const path = require('path');
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolder = path.join(backendPath, 'tasks', videoId);

    let videoPath = '';
    if (fs.existsSync(taskFolder)) {
      const files = fs.readdirSync(taskFolder);
      // scene_*.mp4, *_audio.mp4 제외하고 최종 영상 파일 찾기
      const videoFile = files.find((f: string) =>
        f.endsWith('.mp4') &&
        !f.startsWith('scene_') &&
        !f.includes('_audio')
      );
      if (videoFile) {
        videoPath = path.join(taskFolder, videoFile);
      }
    }

    console.log(`🔍 [YOUTUBE UPLOAD] job found:`, {
      hasJob: !!job,
      taskId: job?.id,
      videoPath,
      jobTitle: job?.title,
      jobStatus: job?.status
    });

    if (!videoPath) {
      addPipelineLog(pipelineId, 'error', `Video file not found in folder: ${taskFolder}`);
      throw new Error(`Video file not found in folder: ${taskFolder}`);
    }

    console.log(`🔍 [YOUTUBE UPLOAD] videoPath: ${videoPath}`);

    // 파일 존재 여부 확인
    const fileExists = fs.existsSync(videoPath);
    console.log(`🔍 [YOUTUBE UPLOAD] file exists: ${fileExists}`);

    if (!fileExists) {
      addPipelineLog(pipelineId, 'error', `Video file not found at path: ${videoPath}`);
      throw new Error(`Video file not found at path: ${videoPath}`);
    }

    // 🔒 중복 체크: 이미 업로드된 영상인지 확인 (content.youtube_url)
    // MySQL: use imported db
    const checkUploadSql = getSql('scheduler', 'checkExistingYoutubeUpload');
    const existingUpload = await db.prepare(checkUploadSql).get(videoId) as { content_id: string; youtube_url: string } | undefined;

    if (existingUpload) {
      console.warn(`⚠️ [YOUTUBE] 중복 업로드 방지: videoId=${videoId}는 이미 업로드됨 (${existingUpload.youtube_url})`);
      addPipelineLog(pipelineId, 'info', `⚠️ 이미 업로드된 영상입니다: ${existingUpload.youtube_url}`);

      return {
        success: true,
        uploadId: videoId,
        videoUrl: existingUpload.youtube_url
      };
    }

    // 실제 YouTube 업로드 로직은 /api/generate-video-upload에서 처리됨
    // 여기서는 이미 업로드된 경우만 체크하고 return
    throw new Error('uploadToYouTube should not reach here - upload logic moved to API');

  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    addPipelineLog(pipelineId, 'error', `❌ YouTube upload failed: ${errorMsg}`);
    console.error(`❌ [YOUTUBE UPLOAD] Error:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// 영상 생성 완료 후 업로드 재개
async function resumeUploadPipeline(queue: any, taskId: string, maxRetry: number) {
  addPipelineLog(taskId, 'info', `Starting YouTube upload for video: ${queue.taskId}`);
  addTitleLog(queue.taskId, 'info', `📤 YouTube 업로드 중...`);
  updatePipelineStatus(taskId, 'running');

  const uploadResult = await uploadToYouTube(queue.taskId, queue, taskId, maxRetry);

  if (!uploadResult.success) {
    throw new Error(`YouTube upload failed: ${uploadResult.error}`);
  }

  updatePipelineStatus(taskId, 'completed');

  // content 테이블에 youtube_url 저장 (task_schedule에는 youtube_url 컬럼 없음)
  // MySQL: db imported from sqlite wrapper
  const updateYoutubeUrlSql = getSql('scheduler', 'updateContentYoutubeUrl');
  await db.prepare(updateYoutubeUrlSql).run(uploadResult.videoUrl, queue.taskId);
  // MySQL: pool manages connections

  addPipelineLog(taskId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
  addTitleLog(queue.taskId, 'info', `✅ YouTube 업로드 완료: ${uploadResult.videoUrl}`);

  // Publish 단계
  addPipelineLog(taskId, 'info', `Scheduling YouTube publish`);
  addTitleLog(queue.taskId, 'info', `📅 퍼블리시 예약 중...`);
  updatePipelineStatus(taskId, 'running');

  // const publishResult = await scheduleYouTubePublish(uploadResult.uploadId || '', queue, taskId);
  // if (!publishResult.success) {
  //   throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
  // }

  updatePipelineStatus(taskId, 'completed');
  updateQueueStatus(queue.taskId, 'youtube', 'completed');
  // ⚠️ DEPRECATED: video_titletq.status는 더이상 사용하지 않음 (task_schedule.status만 참조)
  // updateTitleStatus(queue.taskId, 'completed');

  addPipelineLog(taskId, 'info', `Pipeline completed successfully`);
  addTitleLog(queue.taskId, 'info', `🎉 모든 작업이 완료되었습니다!`);

  console.log(`[Scheduler] Upload pipeline completed for schedule ${queue.id}`);
}

// 이미지 업로드 후 video 생성 재개
async function resumeVideoGeneration(queue: any, taskId: string) {
  const maxRetry = 3;

  const scriptId = queue.script_id || queue.scriptId;
  const titleId = queue.task_id || queue.taskId;

  if (!scriptId) {
    throw new Error(`No script_id found in queue: ${JSON.stringify(queue)}`);
  }

  addPipelineLog(taskId, 'info', `Starting video generation from script: ${scriptId}`);
  addTitleLog(titleId, 'info', `🎬 영상 생성 중...`);
  updatePipelineStatus(taskId, 'running');

  const videoResult = await generateVideo(scriptId, taskId, maxRetry, titleId, queue);

  if (!videoResult.success) {
    // skipError가 true이면 (이미지 업로드 대기) 에러를 던지지 않고 조용히 종료
    if (videoResult.skipError) {
      console.log(`[Scheduler] Video generation waiting for upload: ${queue.id}`);
      return;
    }
    throw new Error(`Video generation failed: ${videoResult.error}`);
  }

  if (!videoResult.videoId) {
    throw new Error('Video generation succeeded but videoId is missing');
  }

  console.log(`✅ [SCHEDULER] Video generation completed, videoId: ${videoResult.videoId}, schedule: ${queue.id}`);

  updatePipelineStatus(taskId, 'completed');

  // 통합 키 시스템: task_id = content_id 이므로 별도 저장 불필요
  console.log(`✅ [SCHEDULER] Video generation completed: ${videoResult.videoId}`);

  updateQueueStatus(titleId, 'video', 'completed');
  updateQueueStatus(titleId, 'youtube', 'waiting');
  addPipelineLog(taskId, 'info', `Video generated successfully: ${videoResult.videoId}`);
  addTitleLog(titleId, 'info', `✅ 영상 생성 완료: ${videoResult.videoId}`);

  // 이후 upload, publish 단계는 기존 로직 활용
  // TODO: upload와 publish 단계를 별도 함수로 분리하여 재사용
  console.log(`[Scheduler] Video generation completed for ${queue.scheduleId}, continuing with upload...`);

  // Upload 단계 시작
  // ⚠️ taskId는 함수 파라미터로 이미 받음, 재선언 불필요
  console.log(`[Scheduler] Starting upload for task: ${taskId}`);

  addPipelineLog(taskId, 'info', `Starting YouTube upload for video: ${videoResult.videoId}`);
  addTitleLog(queue.taskId, 'info', `📤 YouTube 업로드 중...`);
  updatePipelineStatus(taskId, 'running');

  const uploadResult = await uploadToYouTube(videoResult.videoId, queue, taskId, maxRetry);

  if (!uploadResult.success) {
    throw new Error(`YouTube upload failed: ${uploadResult.error}`);
  }

  updatePipelineStatus(taskId, 'completed');

  // content 테이블에 youtube_url 저장 (task_schedule에는 youtube_url 컬럼 없음)
  // MySQL: use imported db
  const updateYoutubeUrlSql2 = getSql('scheduler', 'updateContentYoutubeUrl');
  db.prepare(updateYoutubeUrlSql2).run(uploadResult.videoUrl, queue.taskId);
  // MySQL: pool manages connections

  addPipelineLog(taskId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
  addTitleLog(queue.taskId, 'info', `✅ YouTube 업로드 완료: ${uploadResult.videoUrl}`);

  // Youtube 업로드 완료 후 처리
  console.log(`[Scheduler] YouTube upload completed for task: ${taskId}`);

  addPipelineLog(taskId, 'info', `Scheduling YouTube publish`);
  addTitleLog(queue.taskId, 'info', `📅 퍼블리시 예약 중...`);
  updatePipelineStatus(taskId, 'running');

  // const publishResult = await scheduleYouTubePublish(uploadResult.uploadId || '', queue, taskId);
  // if (!publishResult.success) {
  //   throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
  // }

  updatePipelineStatus(taskId, 'completed');
  updateQueueStatus(queue.taskId, 'youtube', 'completed');
  // ⚠️ DEPRECATED: video_titletq.status는 더이상 사용하지 않음 (task_schedule.status만 참조)
  // updateTitleStatus(queue.taskId, 'completed');

  addPipelineLog(taskId, 'info', `Pipeline completed successfully`);
  addTitleLog(queue.taskId, 'info', `🎉 모든 작업이 완료되었습니다!`);

  console.log(`[Scheduler] Pipeline completed for schedule ${queue.id}`);
}

// ========== Step 4: 상품 자동화 - coupang_product 감시 및 자동 스케줄 등록 ==========

/**
 * coupang_product 테이블에서 새로운 상품을 감지하고 자동으로 스케줄 등록
 * Step 3에서 저장된 상품을 감시하여 자동으로 예약큐에 등록
 */
/**
 * ⚠️ DEPRECATED: prefetchCoupangBestsellers()가 모든 작업을 처리함
 * 베스트셀러 → 내목록 + 예약큐 (같은 트랜잭션)
 */
export async function checkAndRegisterCoupangProducts() {
  const settings = await getAutomationSettings();
  const autoTitleGeneration = settings.auto_title_generation === 'true';

  if (!autoTitleGeneration) {
    return { success: 0, failed: 0, skipped: 0, enabled: false };
  }

  // prefetchCoupangBestsellers()에서 처리하므로 여기서는 아무것도 하지 않음
  return { success: 0, failed: 0, skipped: 0, enabled: true };
}

// ========== 완전 자동화: 채널 주기 체크 및 자동 스케줄 생성 ==========

/**
 * 채널별 주기를 확인하고, 주기가 도래했으면 자동으로 제목 생성 → 스케줄 추가
 * 1. 모든 활성화된 채널 설정 조회
 * 2. 각 채널의 다음 스케줄 시간 계산
 * 3. 다음 스케줄이 없으면 (또는 주기가 도래했으면):
 *    - 카테고리에서 랜덤하게 선택
 *    - AI로 제목 생성
 *    - 제목 DB에 추가
 *    - 스케줄 자동 추가
 */
export async function checkAndCreateAutoSchedules() {
  try {
    // ⚠️ 먼저 자동 제목 생성이 활성화되어 있는지 확인
    const settings = await getAutomationSettings();
    const autoTitleGeneration = settings.auto_title_generation === 'true';

    if (!autoTitleGeneration) {
      console.log('[AutoScheduler] Auto title generation is disabled, skipping');
      lastAutoScheduleResult = { success: 0, failed: 0, skipped: 0 };
      return { success: 0, failed: 0, skipped: 0 };
    }

    // ⚠️ 주기 체크: 마지막 실행으로부터 설정된 시간이 지났는지 확인
    const intervalMinutes = parseFloat(settings.auto_title_generation_interval || '10');
    const now = new Date();

    if (lastAutoScheduleCheck) {
      const minutesSinceLastCheck = (now.getTime() - lastAutoScheduleCheck.getTime()) / 1000 / 60;
      if (minutesSinceLastCheck < intervalMinutes) {
        const displayInterval = intervalMinutes < 1
          ? `${Math.round(intervalMinutes * 60)}초`
          : `${intervalMinutes}분`;
        const displaySince = minutesSinceLastCheck < 1
          ? `${Math.round(minutesSinceLastCheck * 60)}초`
          : `${Math.floor(minutesSinceLastCheck)}분`;
        console.log(`[AutoScheduler] ${displayInterval} 주기 - 마지막 실행 ${displaySince} 전, 대기 중...`);
        return lastAutoScheduleResult; // 이전 결과 반환
      }
    }

    lastAutoScheduleCheck = now;
    const displayInterval = intervalMinutes < 1
      ? `${Math.round(intervalMinutes * 60)}초`
      : `${intervalMinutes}분`;
    console.log(`[AutoScheduler] ${displayInterval} 주기 도래 - 제목 생성 시작`);
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // MySQL: db imported from sqlite wrapper

    // ⭐ 0. 쿠팡 베스트셀러 자동 가져오기 (미리 상품 풀 확보)
    await prefetchCoupangBestsellers();

    // 1. 모든 활성화된 채널 설정 조회
    const channelSql = getSql('scheduler', 'getAllActiveChannels');
    const channelSettings = await db.prepare(channelSql).all() as any[];

    // MySQL: pool manages connections

    if (channelSettings.length === 0) {
      console.log('[AutoScheduler] No active channel settings found');
      lastAutoScheduleResult = { success: 0, failed: 0, skipped: 0 };
      return { success: 0, failed: 0, skipped: 0 };
    }

    console.log(`[AutoScheduler] Checking ${channelSettings.length} active channels for auto-scheduling`);

    for (const setting of channelSettings) {
      try {
        // categories가 없거나 빈 문자열이면 자동 생성 불가
        if (!setting.categories || setting.categories.trim() === '') {
          console.log(`[AutoScheduler] ⏸️ Channel ${setting.channel_name}: No categories configured, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        let categories;
        try {
          categories = JSON.parse(setting.categories);
        } catch (parseError) {
          console.log(`[AutoScheduler] ⏸️ Channel ${setting.channel_name}: Invalid categories JSON, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        if (!categories || !Array.isArray(categories) || categories.length === 0) {
          console.log(`[AutoScheduler] ⏸️ Channel ${setting.channel_name}: Empty categories array, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        // 2. 이 채널의 최근 스케줄 확인 (v5: content_setting.youtube_channel)
        // MySQL: use imported db
        const lastScheduleSql = getSql('scheduler', 'getLastScheduleForChannel');
        const lastSchedule = await db.prepare(lastScheduleSql).get(setting.channel_id, setting.user_id) as any;
        // MySQL: pool manages connections

        // 3. 다음 스케줄 시간 계산
        const { calculateNextScheduleTime } = await import('./automation');
        // ⭐ 항상 현재 시간 기준으로 다음 스케줄 찾기 (마지막 스케줄이 미래여도 현재 시간 기준)
        const now = new Date();
        const nextScheduleTime = await calculateNextScheduleTime(
          setting.user_id,
          setting.channel_id,
          undefined  // fromDate를 undefined로 전달 = 현재 시간 기준
        );

        if (!nextScheduleTime) {
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Could not calculate next schedule time`);
          skippedCount++;
          continue;
        }

        // ⭐ 과거 시간 체크: 과거면 생성하지 않음 (now는 2236 라인에서 선언됨)
        if (nextScheduleTime < now) {
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Next schedule ${nextScheduleTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} is in the past, skipping`);
          skippedCount++;
          continue;
        }

        // ⭐ 2일 제한: 다음 스케줄이 2일 이후면 생성하지 않음
        const twoDaysFromNow = new Date();
        twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
        twoDaysFromNow.setHours(23, 59, 59, 999);

        if (nextScheduleTime > twoDaysFromNow) {
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Next schedule ${nextScheduleTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} is more than 2 days away, skipping`);
          skippedCount++;
          continue;
        }

        // 4. 다음 스케줄이 이미 존재하는지 확인 (같은 시간 스케줄 있으면 스킵)
        // 🚨 중복 방지: 같은 채널에 같은 시간 스케줄이 있으면 생성 안 함
        // MySQL: using imported db
        // ⭐ 로컬 시간대 그대로 MySQL datetime 형식으로 변환
        const scheduleTimeStr = `${nextScheduleTime.getFullYear()}-${String(nextScheduleTime.getMonth() + 1).padStart(2, '0')}-${String(nextScheduleTime.getDate()).padStart(2, '0')} ${String(nextScheduleTime.getHours()).padStart(2, '0')}:${String(nextScheduleTime.getMinutes()).padStart(2, '0')}:${String(nextScheduleTime.getSeconds()).padStart(2, '0')}`;
        const existingScheduleSql = getSql('scheduler', 'getExistingScheduleByDate');
        const existingSchedule = await db.prepare(existingScheduleSql).get(
          setting.channel_id,
          setting.user_id,
          scheduleTimeStr
        ) as any;

        if (existingSchedule) {
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: 이미 ${scheduleTimeStr} 스케줄 존재, 스킵`);
          skippedCount++;
          continue;
        }

        // 5. 카테고리에서 랜덤 선택
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];

        console.log(`[AutoScheduler] Channel ${setting.channel_name}: Generating content for category "${randomCategory}"`);

        let titleId: string;
        let generatedTitle: string;
        let productData: any = null;

        // 6. 카테고리별 분기 처리
        if (randomCategory === '상품') {
          // === 상품 카테고리: 쿠팡 베스트 상품 조회 ===
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Fetching Coupang bestseller...`);

          const result = await generateProductTitle(
            setting.user_id,
            setting.channel_id,
            setting.channel_name,
            nextScheduleTime  // 🆕 채널별 예약 시간 전달
          );
          if (!result) {
            // ⚠️ 딥링크 생성 실패 시 상품 카테고리 스킵 (에러 던지지 않음)
            console.warn(`[AutoScheduler] Channel ${setting.channel_name}: 상품 제목 생성 실패 (딥링크 오류). 이번 실행 스킵`);
            continue; // 다음 채널로 넘어감
          }

          titleId = result.taskId;
          generatedTitle = result.title;
          productData = result.productData;

        } else {
          // === 다른 카테고리: 멀티 모델 AI 평가 시스템 ===
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Using multi-model AI evaluation...`);

          const result = await generateTitleWithMultiModelEvaluation(
            randomCategory,
            setting.user_id,
            setting.channel_id,
            setting.channel_name,
            nextScheduleTime  // 🆕 채널별 예약 시간 전달
          );
          if (!result) {
            throw new Error('Failed to generate title with multi-model evaluation');
          }

          titleId = result.titleId;
          generatedTitle = result.title;
        }

        console.log(`[AutoScheduler] Channel ${setting.channel_name}: Created title ${titleId}`);

        // 8. 스케줄 자동 추가
        const { addSchedule } = await import('./automation');
        const scheduleId = addSchedule({
          titleId,
          scheduledTime: toSqliteDatetime(nextScheduleTime),
          youtubePrivacy: 'public' // 기본값, 필요 시 채널 설정에 추가 가능
        });

        console.log(`[AutoScheduler] ✅ Channel ${setting.channel_name}: Auto-scheduled "${generatedTitle}" for ${nextScheduleTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);

        // 9. 로그 추가
        const { addTitleLog } = await import('./automation');
        addTitleLog(titleId, 'info', `🤖 완전 자동화: 주기 도래로 제목 자동 생성 및 스케줄 추가 (채널: ${setting.channel_name}, 카테고리: ${randomCategory})`);

        successCount++;

      } catch (channelError: any) {
        console.error(`[AutoScheduler] Error processing channel ${setting.channel_name}:`, channelError);
        failedCount++;
        // 개별 채널 실패는 전체 프로세스를 중단하지 않음
      }
    }

    lastAutoScheduleResult = { success: successCount, failed: failedCount, skipped: skippedCount };
    console.log(`[AutoScheduler] ✅ Completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);
    return lastAutoScheduleResult;

  } catch (error: any) {
    console.error('[AutoScheduler] Error in checkAndCreateAutoSchedules:', error);
    lastAutoScheduleResult = { success: 0, failed: 1, skipped: 0 };
    return lastAutoScheduleResult;
  }
}

// ============================================================
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨🚨🚨 베스트셀러 → 내목록 + 예약큐 (같은 트랜잭션!) 🚨🚨🚨              ║
 * ║                                                                           ║
 * ║  1. 내목록에 제목으로 중복체크                                             ║
 * ║  2. 중복 없으면 deep_link 생성 (50자 이하만!)                             ║
 * ║  3. 내목록 + 예약큐 동시 INSERT (같은 트랜잭션)                           ║
 * ║                                                                           ║
 * ║  deep_link 생성 실패 시 → 등록 안 함 (product_url 사용 금지!)            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

let lastCoupangPrefetch: Date | null = null;
const COUPANG_PREFETCH_INTERVAL = 60 * 60 * 1000; // 1시간마다

async function prefetchCoupangBestsellers() {
  try {
    // 1시간마다만 실행
    const now = new Date();
    if (lastCoupangPrefetch && (now.getTime() - lastCoupangPrefetch.getTime()) < COUPANG_PREFETCH_INTERVAL) {
      return;
    }
    lastCoupangPrefetch = now;

    console.log('[CoupangPrefetch] 🛒 베스트셀러 → 내목록 + 예약큐 시작...');

    // MySQL: db imported from sqlite wrapper

    // 활성 사용자 중 상품 카테고리가 있는 채널 조회
    const activeChannelsSql = getSql('scheduler', 'getActiveProductChannels');
    const activeChannels = await db.prepare(activeChannelsSql).all() as any[];

    // MySQL: pool manages connections

    if (activeChannels.length === 0) {
      console.log('[CoupangPrefetch] 상품 카테고리가 있는 채널 없음');
      return;
    }

    const { getCoupangBestsellers, generateAffiliateDeepLink } = await import('./coupang');
    const { calculateNextScheduleTime } = await import('./automation');

    let totalAdded = 0;

    for (const channel of activeChannels) {
      try {
        // 쿠팡 API 호출
        const result = await getCoupangBestsellers(channel.user_id, '1001');

        if (!result.success || !result.products || result.products.length === 0) {
          continue;
        }

        // MySQL: use imported db

        // ⭐ 1. 기존 제목 조회 (제목으로 중복체크!)
        const existingProductsSql = getSql('scheduler', 'getExistingProductTitles');
        const existingProducts = await db.prepare(existingProductsSql).all(channel.user_id);
        const existingTitles = new Set(existingProducts.map((row: any) => row.title));

        // 채널의 마지막 스케줄 시간 조회 (v5: content.youtube_channel)
        const lastScheduleTimeSql = getSql('scheduler', 'getLastScheduleTimeForChannel');
        const lastSchedule = await db.prepare(lastScheduleTimeSql).get(channel.user_id, channel.channel_id) as any;

        let lastScheduleTime = lastSchedule ? new Date(lastSchedule.scheduled_time) : undefined;

        // 2일 제한
        const twoDaysFromNow = new Date();
        twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
        twoDaysFromNow.setHours(23, 59, 59, 999);

        // 새 상품만 추가 (최대 5개)
        let addedCount = 0;
        for (const product of result.products) {
          // ⭐ 제목으로 중복체크!
          if (existingTitles.has(product.productName) || addedCount >= 5) {
            continue;
          }

          try {
            // ⭐ 2. 중복 없으면 deep_link 생성
            // ⭐ affiliate URL에서 pageKey 추출 후 제품 상세 URL로 변환
            let productUrlForDeepLink = product.productUrl;
            try {
              const urlObj = new URL(product.productUrl);
              const pageKey = urlObj.searchParams.get('pageKey');
              if (pageKey) {
                // affiliate URL → 제품 상세 URL 변환
                productUrlForDeepLink = `https://www.coupang.com/vp/products/${pageKey}`;
                console.log(`[CoupangPrefetch] affiliate URL 감지 → 제품 URL로 변환: ${productUrlForDeepLink}`);
              }
            } catch (e) {
              // URL 파싱 실패 시 원본 사용
            }

            console.log(`[CoupangPrefetch] 🔗 딥링크 생성 시도: ${productUrlForDeepLink}`);
            const deepLink = await generateAffiliateDeepLink(channel.user_id, productUrlForDeepLink);

            /**
             * 🚨🚨🚨 딥링크 검증 - 50자 이하 단축 URL만! 🚨🚨🚨
             */
            const isValidDeepLink = deepLink &&
              deepLink.length <= 50 &&
              deepLink.includes('link.coupang.com/') &&
              !deepLink.includes('/re/AFFSDP') &&
              !deepLink.includes('?lptag=');

            if (!isValidDeepLink) {
              console.log(`[CoupangPrefetch] ❌ 딥링크 오류 (스킵): ${deepLink} (${deepLink?.length}자)`);
              continue;
            }

            // 다음 스케줄 시간 계산
            const scheduledTime = await calculateNextScheduleTime(channel.user_id, channel.channel_id, lastScheduleTime);
            if (!scheduledTime || scheduledTime > twoDaysFromNow) {
              console.log(`[CoupangPrefetch] ⏸️ 2일 초과 - 등록 중단`);
              break;
            }

            // ⭐ 3. 같은 트랜잭션으로 내목록 + 예약큐 동시 INSERT
            const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const taskId = crypto.randomUUID();
            const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

            // MySQL: individual queries (no transaction wrapper needed)
            // 내목록 INSERT
            const insertProductSql = getSql('scheduler', 'insertCoupangProduct');
            await db.prepare(insertProductSql).run(
              productId, channel.user_id, product.productUrl, deepLink,
              product.productName, product.productName, product.categoryName || '상품',
              product.productPrice || 0, product.productPrice || 0, product.productImage || ''
            );

            // task INSERT
            const productInfo = JSON.stringify({
              productId, productName: product.productName,
              productPrice: product.productPrice, productImage: product.productImage,
              deepLink
            });

            // v5: task + content + content_setting 분리
            const insertTaskSql = getSql('scheduler', 'insertTask');
            const scheduledTimeStr = scheduledTime.toISOString().slice(0, 19).replace('T', ' ');
            await db.prepare(insertTaskSql).run(taskId, channel.user_id, scheduledTimeStr);

            const insertContentSql = getSql('scheduler', 'insertContentForProduct');
            await db.prepare(insertContentSql).run(taskId, channel.user_id, product.productName, productInfo, channel.channel_id);

            const insertSettingSql = getSql('scheduler', 'insertContentSetting');
            await db.prepare(insertSettingSql).run(taskId);

            // task_queue INSERT
            const insertQueueSql = getSql('scheduler', 'insertTaskQueue');
            await db.prepare(insertQueueSql).run(taskId, channel.user_id);

            lastScheduleTime = scheduledTime;
            existingTitles.add(product.productName);
            addedCount++;
            totalAdded++;

            console.log(`[CoupangPrefetch] ✅ ${product.productName.substring(0, 30)}... @ ${scheduledTime.toLocaleString('ko-KR')}`);

          } catch (insertError: any) {
            console.log(`[CoupangPrefetch] ❌ ${product.productName.substring(0, 20)}...: ${insertError.message}`);
          }
        }

        // MySQL: pool manages connections

      } catch (userError: any) {
        console.log(`[CoupangPrefetch] 채널 ${channel.channel_name} 오류: ${userError.message}`);
      }
    }

    if (totalAdded > 0) {
      console.log(`[CoupangPrefetch] ✅ 총 ${totalAdded}개 등록 완료 (내목록 + 예약큐)`);
    } else {
      console.log('[CoupangPrefetch] 새 상품 없음');
    }

  } catch (error: any) {
    console.log(`[CoupangPrefetch] 오류 (무시): ${error.message}`);
  }
}

// ============================================================
// 상품 카테고리: 쿠팡 베스트 상품 조회 및 제목 생성
// ============================================================

async function generateProductTitle(
  userId: string,
  channelId: string,
  channelName: string,
  scheduledTime?: Date  // 🆕 채널별 예약 시간
): Promise<{ taskId: string; title: string; productData: any } | null> {
  try {
    console.log('[ProductTitle] 쿠팡 베스트 상품 조회 중...');

    // 1. 쿠팡 베스트 상품 조회 (내부 함수 직접 사용)
    const { getCoupangBestsellers, generateAffiliateDeepLink } = await import('./coupang');
    const result = await getCoupangBestsellers(userId, '1001');

    if (!result.success || !result.products || result.products.length === 0) {
      console.log('[ProductTitle] No products found');
      return null;
    }

    const products = result.products;

    console.log('[ProductTitle] 기존 상품과 중복 확인 중...');

    // 2. DB에서 기존 상품 조회
    // MySQL: db imported from sqlite wrapper
    const existingProductUrlsSql = getSql('scheduler', 'getExistingProductUrls');
    const existingProducts = await db.prepare(existingProductUrlsSql).all(userId);
    const existingUrls = existingProducts.map((row: any) => row.product_url);

    // 3. DB에 없는 상품 찾기
    const newProduct = products.find((p: any) => !existingUrls.includes(p.productUrl));

    if (!newProduct) {
      console.log('[ProductTitle] All products already in DB, skipping');
      return null;
    }

    // ⭐ affiliate URL에서 pageKey 추출 후 제품 상세 URL로 변환
    let productUrlForDeepLink = newProduct.productUrl;
    try {
      const urlObj = new URL(newProduct.productUrl);
      const pageKey = urlObj.searchParams.get('pageKey');
      if (pageKey) {
        // affiliate URL → 제품 상세 URL 변환
        productUrlForDeepLink = `https://www.coupang.com/vp/products/${pageKey}`;
        console.log(`[ProductTitle] affiliate URL 감지 → 제품 URL로 변환: ${productUrlForDeepLink}`);
      }
    } catch (e) {
      // URL 파싱 실패 시 원본 사용
    }

    console.log(`[ProductTitle] 딥링크 생성 중... 상품 URL: ${productUrlForDeepLink}`);
    const affiliateLink = await generateAffiliateDeepLink(userId, productUrlForDeepLink);
    console.log(`[ProductTitle] 딥링크 생성 결과: "${affiliateLink}"`);

    /**
     * 🚨🚨🚨 딥링크 검증 - 절대 삭제/수정 금지! 🚨🚨🚨
     * ✅ 유효: link.coupang.com/{1-2글자}/XXXXX (단축 URL)
     * ❌ 무효: link.coupang.com/re/AFFSDP?... (긴 형식)
     */
    const isValidDeepLink = affiliateLink &&
      affiliateLink.includes('link.coupang.com/') &&
      !affiliateLink.includes('/re/AFFSDP') &&
      !affiliateLink.includes('?lptag=') &&
      !affiliateLink.includes('?pageKey=');

    if (!isValidDeepLink) {
      console.error(`[ProductTitle] ❌ 딥링크 형식 오류 (스킵)`);
      console.error(`[ProductTitle]   - 상품 URL: ${newProduct.productUrl}`);
      console.error(`[ProductTitle]   - 딥링크 결과: "${affiliateLink}"`);
      console.error(`[ProductTitle]   - 유효성 체크: ${JSON.stringify({
        exists: !!affiliateLink,
        hasCoupangDomain: affiliateLink?.includes('link.coupang.com/'),
        notLongForm: !affiliateLink?.includes('/re/AFFSDP'),
        noLptag: !affiliateLink?.includes('?lptag='),
        noPageKey: !affiliateLink?.includes('?pageKey=')
      })}`);
      return null;
    }

    console.log(`[ProductTitle] Found new product: ${newProduct.productName}`);

    // 4. 상품 DB에 추가
    // ⚠️ PK는 coupang_id (id 아님!)
    const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    // MySQL: use imported db
    const insertProductSimpleSql = getSql('scheduler', 'insertCoupangProductSimple');
    db.prepare(insertProductSimpleSql).run(
      productId,
      userId,
      newProduct.productUrl,
      affiliateLink,
      newProduct.productName,
      newProduct.productName, // description도 제목 사용
      '가전디지털', // 기본 카테고리
      newProduct.productPrice || 0,
      newProduct.productPrice || 0,
      newProduct.productImage || ''
    );
    // MySQL: pool manages connections

    console.log(`[ProductTitle] Added product to DB: ${productId}`);

    // 5. 제목 생성 (상품 이름 기반)
    const title = `${newProduct.productName.substring(0, 50)}... 리뷰`;

    // 6. tasks에 추가
    const { addVideoTitle, createProductDataPayload } = await import('./automation');
    // ⭐ 통일된 상품 정보 구조: { productId, title, price, thumbnail, deepLink, category }
    const productDataForSave = createProductDataPayload({
      productId: productId,
      title: newProduct.productName,
      price: newProduct.productPrice,
      thumbnail: newProduct.productImage,
      deepLink: affiliateLink,
      category: '가전디지털' // 기본 카테고리
    });
    const taskId = await addVideoTitle({
      title,
      promptFormat: 'product',
      category: '상품',
      channel: channelId, // ⭐ 채널 ID 설정 (중복 체크용)
      scriptMode: 'chrome',
      mediaMode: 'crawl', // ⭐ 상품: 이미지 크롤링
      aiModel: 'gemini', // ⭐ 상품: Gemini
      userId,
      deepLink: affiliateLink,  // 🚨 productUrl → deepLink
      productData: productDataForSave,
      scheduledTime  // 🆕 채널별 예약 시간 전달
    });

    if (!taskId) {
      console.log(`[ProductTitle] ⚠️ 제목 생성 실패 (중복 또는 저점수)`);
      return null;
    }

    console.log(`[ProductTitle] ✅ 제목 생성 완료: ${title}`);

    return {
      taskId,
      title,
      productData: { ...newProduct, deepLink: affiliateLink }
    };

  } catch (error: any) {
    console.error('[ProductTitle] Error:', error);
    // 에러 시 이메일 알림
    const { sendAutomationErrorEmail } = await import('@/utils/email');
    await sendAutomationErrorEmail(
      '상품 제목 생성 실패',
      error.message || 'Unknown error',
      { userId, channelId, channelName, category: '상품' }
    );
    return null;
  }
}

// ============================================================
// 규칙 기반 제목 점수 평가 (AI 비용 절감)
// ============================================================

/**
 * 간단한 규칙 기반으로 제목 점수를 평가합니다.
 * AI API 호출 없이 로컬에서 빠르게 평가할 수 있습니다.
 *
 * 🆕 2024-11 개선사항:
 * - 문법 검증 (조사 연결 체크)
 * - 카테고리-키워드 필수 매칭 강화
 * - 주어 완결성 체크
 */
function evaluateTitleWithRules(title: string, category: string): number {
  let score = 0;
  let grammarPenalty = 0;

  // 🆕 0. 문법 검증 (조사 연결 체크)
  // 잘못된 예: "비밀이 간병하던" (비밀이 간병할 수 없음)
  // 잘못된 예: "딸을 월급 떼먹은" (주어 누락)
  const grammarErrors = [
    // 추상명사 + 이/가 + 행위동사 (불가능한 조합)
    /비밀이\s*(간병|무시|배신|외면|차별|성공|실패)/,
    /진실이\s*(간병|무시|배신|외면|차별)/,
    /사랑이\s*(간병|무시|배신|외면|차별)/,
    // 목적격 조사로 시작하는데 주어 없음
    /^[가-힣]+[을를]\s*[가-힣]*(했던|한|하던|떼먹|무시|배신)/,
    // "~와 용서했다" - 문맥 불명확
    /[가-힣]+와\s+용서했/,
    // 주어 없이 동사로 끝남
    /^[가-힣]+[을를]\s*[가-힣]+[했었였]다$/,
  ];

  for (const pattern of grammarErrors) {
    if (pattern.test(title)) {
      grammarPenalty += 40;
      console.log(`[TitleScore] 🚨 문법 오류 감지: "${title.substring(0, 30)}..." → -40점`);
      break;
    }
  }

  // 🆕 0-2. 주어 완결성 체크
  // "둘째 딸을 월급 떼먹은" - 누가 떼먹었는지 불명확
  const hasObjectMarker = /[을를]/.test(title);
  const hasSubjectMarker = /[이가은는]/.test(title.split(',')[0] || '');
  if (hasObjectMarker && !hasSubjectMarker) {
    // 목적어는 있는데 주어가 없는 경우
    const firstPart = title.split(',')[0] || '';
    if (!/그들|그녀|그가|[가-힣]+들이|[가-힣]+가/.test(firstPart)) {
      grammarPenalty += 25;
      console.log(`[TitleScore] ⚠️ 주어 누락: "${firstPart}" → -25점`);
    }
  }

  score -= grammarPenalty;

  // 1. 제목 길이 평가 (20-60자가 최적)
  const length = title.length;
  if (length >= 20 && length <= 60) {
    score += 30; // 최적 길이
  } else if (length >= 15 && length < 20) {
    score += 20; // 약간 짧음
  } else if (length > 60 && length <= 80) {
    score += 20; // 약간 김
  } else if (length < 15) {
    score += 5; // 너무 짧음
  } else {
    score += 10; // 너무 김
  }

  // 2. 특수문자 평가 (호기심 유발)
  const hasQuestion = title.includes('?');
  const hasExclamation = title.includes('!');
  const hasEllipsis = title.includes('...');
  const hasQuotes = title.includes('"') || title.includes("'");

  if (hasQuestion) score += 10;
  if (hasExclamation) score += 8;
  if (hasEllipsis) score += 5;
  if (hasQuotes) score += 5;

  // 3. 감정 키워드 평가
  const emotionalKeywords = [
    '후회', '복수', '반전', '충격', '눈물', '감동',
    '배신', '비밀', '진실', '최후', '귀환', '성공',
    '통쾌', '화려', '무릎', '외면', '당당', '전설',
    '알고보니', '결국', '드디어', '끝판왕', '최고'
  ];

  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) {
      emotionalCount++;
    }
  }
  score += Math.min(emotionalCount * 5, 20); // 최대 20점

  // 4. 숫자 포함 여부 (구체성)
  if (/\d+/.test(title)) {
    score += 8;
  }

  // 5. 카테고리 관련 키워드 평가 (🆕 강화됨)
  const categoryKeywords: Record<string, { required: string[]; bonus: string[]; minRequired: number }> = {
    '시니어사연': {
      required: ['시어머니', '며느리', '고부', '시댁', '양로원', '노인', '할머니', '할아버지', '효도', '불효', '부모', '자식', '손주'],
      bonus: ['간병', '유산', '상속', '노환', '치매', '용서', '눈물'],
      minRequired: 1,  // 최소 1개 필수
    },
    '복수극': {
      required: ['복수', '무시', 'CEO', '귀환', '배신', '신입', '회장', '사장', '갑질', '되갚', '응징', '후회'],
      bonus: ['성공', '반전', '충격', '최후', '통쾌', '무릎'],
      minRequired: 1,
    },
    '탈북자사연': {
      required: ['탈북', '북한', '남한', '북쪽', '휴전선', '김정은', '김정일', '평양', '조선', '인민군'],
      bonus: ['자유', '대한민국', '통일', '탈출', '고향', '어머니'],
      minRequired: 1,  // 필수 키워드 최소 1개
    },
    '북한탈북자사연': {
      required: ['탈북', '북한', '남한', '북쪽', '휴전선', '김정은', '김정일', '평양', '조선', '인민군'],
      bonus: ['자유', '대한민국', '통일', '탈출', '고향', '어머니'],
      minRequired: 1,
    },
    '막장드라마': {
      required: ['출생', '비밀', '재벌', '배다른', '친자', '유전자', '친아버지', '친어머니', '숨긴', '바람'],
      bonus: ['충격', '진실', 'DNA', '검사', '반전'],
      minRequired: 1,
    },
    '감동실화': {
      required: ['감동', '눈물', '사랑', '가족', '희생', '성공', '기적', '꿈', '행복', '용서'],
      bonus: ['실화', '진실', '극복', '재회'],
      minRequired: 1,
    },
  };

  const catConfig = categoryKeywords[category];
  let categoryMatchCount = 0;
  let bonusMatchCount = 0;

  if (catConfig) {
    // 필수 키워드 체크
    for (const keyword of catConfig.required) {
      if (title.includes(keyword)) {
        categoryMatchCount++;
      }
    }
    // 보너스 키워드 체크
    for (const keyword of catConfig.bonus) {
      if (title.includes(keyword)) {
        bonusMatchCount++;
      }
    }

    // 점수 부여
    score += Math.min(categoryMatchCount * 7, 15); // 필수 키워드 최대 15점
    score += Math.min(bonusMatchCount * 3, 9);    // 보너스 키워드 최대 9점

    // 5-2. 🚨 모든 카테고리에 필수 키워드 체크 적용! (강화됨)
    if (categoryMatchCount < catConfig.minRequired) {
      const penalty = 40;  // 통일된 페널티
      score -= penalty;
      console.log(`[TitleScore] ⚠️ "${category}" 카테고리인데 관련 키워드 부족 (${categoryMatchCount}/${catConfig.minRequired}) → -${penalty}점`);
    }
  } else {
    // 알 수 없는 카테고리 - 기본 평가만
    console.log(`[TitleScore] ℹ️ 알 수 없는 카테고리: "${category}" - 기본 평가만 적용`);
  }

  // 6. 문장 구조 평가
  const hasComma = (title.match(/,/g) || []).length;
  if (hasComma >= 1 && hasComma <= 2) {
    score += 7; // 적절한 구조
  }

  // 7. 주어 명확성 평가 (가장 중요!)
  // 문제: "무시당했던 청소부, CEO가 된 비결" - 누가 CEO가 됐는지 불명확
  // 해결: "청소부를 무시했던 그들, CEO가 된 그녀 앞에서..." - 주어가 명확함
  let clarityScore = 0;

  // 7-1. 목적격 조사 + 과거형 패턴 (가해자 명시)
  // "~를 무시했던", "~을 괴롭혔던", "~에게 배신당했던" 등
  const aggressorPatterns = [
    /[을를]?\s*(무시|괴롭히|배신|내쫓|외면|무시당|차별).*?[했던|한|하던]/,
    /에게\s*(배신|무시).*?당했던/
  ];

  let hasAggressor = false;
  for (const pattern of aggressorPatterns) {
    if (pattern.test(title)) {
      hasAggressor = true;
      break;
    }
  }

  // 7-2. 명확한 주어 대명사 또는 지시어
  // "그들", "그녀", "그", "그 앞에서", "그녀 앞에"
  const hasClearSubject = /그들|그녀|그 앞|그가|그를/.test(title);

  // 7-3. 시간 표현 + 변화 패턴 (과거-현재 대비)
  // "3년 후", "10년 만에" 등 + "CEO가 된", "성공한" 등
  const hasTimeTransition = /\d+년\s*(후|만에|뒤).*?(가 된|로 나타|한 그|된 그)/.test(title);

  // 7-4. 애매한 패턴 감점
  // "무시당했던 청소부, CEO로..." - 청소부가 주어인지 불명확
  const hasAmbiguousPattern = /당했던.*?,.*?로\s*(성공|변신|등극)/.test(title) && !hasClearSubject;

  // 점수 계산
  if (hasAggressor) clarityScore += 8; // 가해자 명시
  if (hasClearSubject) clarityScore += 7; // 명확한 주어
  if (hasTimeTransition) clarityScore += 5; // 시간+변화
  if (hasAmbiguousPattern) clarityScore -= 10; // 애매한 패턴 감점

  score += Math.max(0, clarityScore); // 최대 20점 (감점 가능)

  // 🚨 8. 저품질 패턴 감점 (클릭 유도력 낮은 제목 걸러내기)
  let penaltyScore = 0;

  // 8-1. 의미 없는 단어 조합 (맥락 없이 끊김)
  // 예: "울었다, 커밍아웃" - 앞뒤 맥락 없이 갑자기 등장
  const randomWordPatterns = [
    /,\s*커밍아웃/,         // 갑자기 커밍아웃
    /울었다,\s*[가-힣]+$/,   // 울었다 + 단어로 끝 (불완전)
    /했다,\s*[가-힣]{2,4}$/, // 했다 + 짧은 단어로 끝
  ];
  for (const pattern of randomWordPatterns) {
    if (pattern.test(title)) {
      penaltyScore += 30; // 큰 감점
      break;
    }
  }

  // 8-2. 결말/반전 없이 끝나는 불완전한 제목
  // 좋은 제목: "~했다, 충격적인 진실"
  // 나쁜 제목: "~했다" 로만 끝남
  const endsWithAction = /[었했였]다[,.]?\s*$/.test(title);
  const hasCliffhanger = /(진실|비밀|반전|충격|눈물|결말|결국)/.test(title);
  if (endsWithAction && !hasCliffhanger) {
    penaltyScore += 15; // 클리프행어 없음
  }

  // 8-3. 너무 평범한/지루한 패턴
  // 예: "A가 B를 했다" (단순 서술)
  const boringPatterns = [
    /^[가-힣]+가\s+[가-힣]+을\s+[가-힣]+했다$/,  // 주어가 목적어를 동사했다
    /^[가-힣]+이\s+[가-힣]+에게\s+[가-힣]+했다$/, // 주어가 대상에게 동사했다
  ];
  for (const pattern of boringPatterns) {
    if (pattern.test(title)) {
      penaltyScore += 20;
      break;
    }
  }

  // 8-4. 제목 길이 대비 내용 빈약 (글자 수는 맞지만 핵심 없음)
  const wordCount = title.split(/[\s,]+/).filter(w => w.length > 0).length;
  if (length > 30 && wordCount < 5) {
    penaltyScore += 10; // 긴 제목인데 단어 수 적음 = 내용 빈약
  }

  score -= penaltyScore;

  // 최종 점수를 0-100 범위로 제한
  return Math.min(100, Math.max(0, score));
}

// ============================================================
// 다른 카테고리: 멀티 모델 AI 평가 및 최고 점수 제목 선택
// ============================================================

export async function generateTitleWithMultiModelEvaluation(
  category: string,
  userId: string,
  channelId: string,
  channelName: string,
  scheduledTime?: Date  // 🆕 채널별 예약 시간
): Promise<{ titleId: string; title: string } | null> {
  const { addVideoTitle, useUnusedTitle, saveTitleCandidates, markTitleAsUsed } = await import('./automation');

  try {
    // 카테고리별 promptFormat 결정
    let promptFormat: 'longform' | 'shortform' | 'product' | 'sora2' = 'longform';
    let defaultModel = 'claude';

    if (category === '상품' || category.includes('product')) {
      // 🚨 상품 카테고리는 이 함수를 사용하면 안됨! 쿠팡 베스트셀러 API 사용해야 함
      console.error(`[TitleGen] ❌ 상품 카테고리는 generateTitleWithMultiModelEvaluation을 사용하면 안됩니다!`);
      return null;
    } else if (category.includes('숏') || category === 'shortform' || category === 'Shorts') {
      defaultModel = 'chatgpt';
      promptFormat = 'shortform';
    } else if (category.includes('sora') || category === 'sora2') {
      defaultModel = 'claude';
      promptFormat = 'sora2';
    } else if (category.includes('롱') || category === 'longform') {
      defaultModel = 'claude';
      promptFormat = 'longform';
    }

    // 🎯 1. 먼저 미사용 제목이 있는지 확인 (90점 이상만 사용!)
    const unusedTitle = await useUnusedTitle(category, 90);
    if (unusedTitle) {
      console.log(`[TitleGen] ♻️ 미사용 제목 재사용: "${unusedTitle.title}" (score: ${unusedTitle.score})`);

      const taskId = await addVideoTitle({
        title: unusedTitle.title,
        promptFormat,
        category,
        channel: channelId,
        scriptMode: 'chrome',
        mediaMode: promptFormat === 'longform' ? 'crawl' : 'dalle3', // 롱폼: ImageFX+Whisk, 숏폼: DALL-E
        aiModel: unusedTitle.aiModel + '-reused',
        score: unusedTitle.score,
        autoConvert: promptFormat === 'longform',  // BTS-3356: 롱폼일 때 숏폼 자동변환 활성화
        scheduledTime,  // 🆕 채널별 예약 시간 전달
        userId
      });

      if (!taskId) {
        console.log(`[TitleGen] ⚠️ 미사용 제목 저장 실패 (중복)`);
        return null;
      }

      return {
        titleId: taskId,
        title: unusedTitle.title
      };
    }

    // ⭐ 2. 패턴 기반 샘플링 + AI 생성 혼합 (비용 절감 + 품질 향상)
    console.log(`[TitleGen] 🎲 패턴 기반 샘플링 + AI 혼합 생성 시작...`);

    const allTitles: { title: string; aiModel: string; score: number; source: string }[] = [];

    // 2-1. 패턴 기반 샘플링 (비용 0, 빠름)
    try {
      const sampleResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/title-pool/sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          count: 5,
          minScore: 90 // 90점 이상만!
        })
      });

      if (sampleResponse.ok) {
        const sampleData = await sampleResponse.json();
        if (sampleData.success && sampleData.titles?.length > 0) {
          console.log(`[TitleGen] 📋 패턴 샘플링: ${sampleData.titles.length}개 생성 (시도: ${sampleData.attempts})`);
          sampleData.titles.forEach((item: any) => {
            allTitles.push({
              title: item.title,
              aiModel: 'pattern-sampling',
              score: item.score,
              source: 'sampling'
            });
          });
        }
      }
    } catch (e: any) {
      console.log(`[TitleGen] ⚠️ 패턴 샘플링 실패 (계속 진행): ${e.message}`);
    }

    // 2-2. 샘플링에서 90점 이상 제목이 있으면 AI 스킵 (비용 절감)
    const highScoreSamples = allTitles.filter(t => t.score >= 90);

    if (highScoreSamples.length < 2) {
      // 2-3. AI로 추가 생성 (90점 이상 제목이 부족할 때만)
      console.log(`[TitleGen] 🤖 AI로 추가 생성 (${defaultModel})...`);
      const aiTitles = await generateTitlesWithModel(category, defaultModel);

      aiTitles.forEach((t: string) => {
        const score = evaluateTitleWithRules(t, category);
        allTitles.push({
          title: t,
          aiModel: defaultModel,
          score,
          source: 'ai'
        });
      });
    } else {
      console.log(`[TitleGen] 💡 90점 이상 샘플 ${highScoreSamples.length}개 확보 → AI 생성 스킵 (비용 절감)`);
    }

    if (allTitles.length === 0) {
      console.error('[TitleGen] No titles generated');
      return null;
    }

    // 3. 점수순 정렬
    allTitles.sort((a, b) => b.score - a.score);
    const bestTitle = allTitles[0];

    // 🚨 최소 점수 체크 (90점 미만은 등록 불가!)
    const MIN_SCORE_THRESHOLD = 90;
    if (bestTitle.score < MIN_SCORE_THRESHOLD) {
      console.error(`[TitleGen] ❌ 최고 점수 제목도 ${MIN_SCORE_THRESHOLD}점 미만 (${bestTitle.score}점): "${bestTitle.title}"`);
      console.log(`[TitleGen] 📋 전체 제목 점수:`);
      allTitles.slice(0, 5).forEach((item, index) => {
        console.log(`  ${index + 1}. [${item.score}점] ${item.title}`);
      });
      console.log(`[TitleGen] ⚠️ 제목 품질이 너무 낮아 등록을 건너뜁니다.`);
      return null;
    }

    console.log(`[TitleGen] 🏆 총 ${allTitles.length}개 제목 생성:`);
    allTitles.slice(0, 5).forEach((item, index) => {
      const sourceIcon = item.source === 'sampling' ? '📋' : '🤖';
      console.log(`  ${index + 1}. ${sourceIcon} [${item.score}점] ${item.title}`);
    });

    // 4. 모든 제목 후보 저장 (재사용 위해)
    saveTitleCandidates(category, allTitles.map(t => ({
      title: t.title,
      aiModel: t.aiModel,
      score: t.score
    })));

    // 5. 사용할 제목 마킹
    markTitleAsUsed(bestTitle.title);

    // 6. tasks에 추가
    const taskId = await addVideoTitle({
      title: bestTitle.title,
      promptFormat,
      category,
      channel: channelId,
      scriptMode: 'chrome',
      mediaMode: promptFormat === 'longform' ? 'crawl' : 'dalle3', // 롱폼: ImageFX+Whisk, 숏폼: DALL-E
      aiModel: bestTitle.aiModel,
      score: bestTitle.score,
      autoConvert: promptFormat === 'longform',  // BTS-3356: 롱폼일 때 숏폼 자동변환 활성화
      scheduledTime,  // 🆕 채널별 예약 시간 전달
      userId
    });

    if (!taskId) {
      console.log(`[TitleGen] ⚠️ 제목 저장 실패 (중복 또는 저점수)`);
      return null;
    }

    console.log(`[TitleGen] ✅ 제목 선정: ${bestTitle.title} (${bestTitle.score}점, ${bestTitle.source})`);

    return {
      titleId: taskId,
      title: bestTitle.title
    };

  } catch (error: any) {
    console.error('[MultiModel] Error:', error);
    // 에러 시 이메일 알림
    const { sendAutomationErrorEmail } = await import('@/utils/email');
    await sendAutomationErrorEmail(
      '제목 생성 실패',
      error.message || 'Unknown error',
      { userId, channelId, channelName, category }
    );
    return null;
  }
}

// 특정 모델로 제목 생성 (내부 함수 직접 사용)
async function generateTitlesWithModel(category: string, model: string): Promise<string[]> {
  try {
    const {
      generateTitlesWithClaude,
      generateTitlesWithChatGPT,
      generateTitlesWithGemini
    } = await import('./ai-title-generation');

    if (model === 'claude') {
      return await generateTitlesWithClaude(category, 3);
    } else if (model === 'chatgpt') {
      return await generateTitlesWithChatGPT(category, 3);
    } else if (model === 'gemini') {
      return await generateTitlesWithGemini(category, 3);
    } else {
      console.error(`[${model}] Unknown model`);
      return [];
    }

  } catch (error: any) {
    console.error(`[${model}] Error:`, error);
    return [];
  }
}

// 제목 점수 평가 (내부 함수 직접 사용)
async function evaluateTitleScore(title: string, category: string): Promise<number> {
  try {
    const { evaluateTitleScore: evaluate } = await import('./ai-title-generation');
    return await evaluate(title, category);
  } catch (error: any) {
    console.error('[ScoreEvaluation] Error:', error);
    return 50; // 에러 시 중간 점수
  }
}

// ============================================================
// 숏폼 자동 업로드 체커
// ============================================================
/**
 * 완료된 숏폼 작업을 찾아서 YouTube에 업로드합니다.
 * 업로드 시 설명란에 롱폼 링크를 추가합니다.
 */
// ⚠️ DISABLED: 숏폼 관련 컬럼 제거됨 (cleanup-task-schedule.js)
// - shortform_task_id, parent_youtube_url, shortform_uploaded 컬럼이 task_schedule 테이블에서 제거됨
// - 숏폼 관련 정보는 content 테이블로 이동 예정
/*
export async function checkCompletedShortformJobs() {
  try {
    // MySQL: db imported from sqlite wrapper

    // task_schedule에서 shortform_task_id가 있고 아직 업로드되지 않은 스케줄 찾기
    // ⚠️ t.channel 컬럼 사용 (settings JSON이 아님!)
      const shortformSql = getSql('scheduler', 'getSchedulesWithShortform');
      const schedulesWithShortform = await db.prepare(shortformSql).all() as any[];

    if (schedulesWithShortform.length === 0) {
      return;
    }

    console.log(`🔍 [SHORTFORM CHECKER] Found ${schedulesWithShortform.length} schedules with shortform jobs`);

    for (const schedule of schedulesWithShortform) {
      try {
        const shortformTaskId = schedule.shortform_task_id;
        const parentYoutubeUrl = schedule.parent_youtube_url;

        console.log(`🔍 [SHORTFORM] Checking shortform task: ${shortformTaskId}`);

        // 숏폼 작업 상태 확인 (jobs → content 통합)
        // ⚠️ video_path IS NOT NULL 조건 제거 - 폴더에서 직접 확인
        const shortformSql = getSql('scheduler', 'getContentAllById');
        const shortformJob = await db.prepare(shortformSql).get(shortformTaskId) as any;

        if (!shortformJob) {
          console.log(`⚠️ [SHORTFORM] Task not found: ${shortformTaskId}`);
          continue;
        }

        // 폴더에서 영상 파일 확인
        const shortformCheckFolder = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks', shortformTaskId);
        let hasShortformVideo = false;
        if (fs.existsSync(shortformCheckFolder)) {
          const files = fs.readdirSync(shortformCheckFolder);
          hasShortformVideo = files.some((f: string) =>
            f.endsWith('.mp4') &&
            !f.startsWith('scene_') &&
            !f.includes('_audio')
          );
        }

        console.log(`🔍 [SHORTFORM] Job status: ${shortformJob.status}, hasVideo: ${hasShortformVideo}`);

        if (shortformJob.status !== 'completed' || !hasShortformVideo) {
          console.log(`⏳ [SHORTFORM] Job not yet completed: ${shortformJob.status}, hasVideo: ${hasShortformVideo}`);
          continue;
        }

        // 숏폼 완료됨 - YouTube 업로드 시작
        console.log(`✅ [SHORTFORM] Shortform completed! Starting YouTube upload...`);
        addTitleLog(schedule.task_id, 'info', `✅ 숏폼 생성 완료! YouTube 업로드 시작...`);

        // 파이프라인 ID 생성
        const taskId = schedule.id + '_shortform_upload';
        updatePipelineStatus(taskId, 'running');

        // YouTube 업로드 (롱폼 링크를 설명란에 추가)
        // ⭐ video_path를 폴더에서 직접 탐색
        const shortformFolder = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks', shortformTaskId);
        let videoPath = '';
        if (fs.existsSync(shortformFolder)) {
          const files = fs.readdirSync(shortformFolder);
          const videoFile = files.find((f: string) =>
            f.endsWith('.mp4') &&
            !f.startsWith('scene_') &&
            !f.includes('_audio')
          );
          if (videoFile) {
            videoPath = path.join(shortformFolder, videoFile);
          }
        }
        const title = shortformJob.title || schedule.title || `숏폼 영상 (${shortformTaskId})`;

        // 설명란에 롱폼 링크 추가
        let description = '';
        if (parentYoutubeUrl) {
          description = `롱폼 : ${parentYoutubeUrl}`;
        }

        console.log(`📤 [SHORTFORM] Uploading to YouTube with description: ${description}`);
        addTitleLog(schedule.task_id, 'info', `📤 숏폼 YouTube 업로드 중... (설명: ${description})`);

        const uploadResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/youtube/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system'
          },
          body: JSON.stringify({
            videoPath,
            title: `${title} (쇼츠)`,
            description,
            tags: schedule.tags ? schedule.tags.split(',').map((t: string) => t.trim()) : [],
            privacy: 'public', // 숏폼은 기본적으로 public
            channelId: schedule.channel,
            taskId: shortformTaskId,
            publishAt: null, // 숏폼은 즉시 공개
            userId: schedule.user_id,
            type: 'shortform'
          })
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`❌ [SHORTFORM] Upload failed: ${errorText}`);
          addTitleLog(schedule.task_id, 'error', `❌ 숏폼 업로드 실패: ${errorText}`);
          updatePipelineStatus(taskId, 'failed', errorText);
          continue;
        }

        const uploadData = await uploadResponse.json();

        if (!uploadData.success) {
          console.error(`❌ [SHORTFORM] Upload failed: ${uploadData.error}`);
          addTitleLog(schedule.task_id, 'error', `❌ 숏폼 업로드 실패: ${uploadData.error}`);
          updatePipelineStatus(taskId, 'failed', uploadData.error);
          continue;
        }

        // 업로드 성공 - shortform_uploaded 플래그 업데이트
        const updateShortformSql = getSql('scheduler', 'updateShortformUploaded');
        await db.prepare(updateShortformSql).run(schedule.schedule_id);

        console.log(`✅ [SHORTFORM] Upload successful: ${uploadData.videoUrl}`);
        addTitleLog(schedule.task_id, 'info', `✅ 숏폼 YouTube 업로드 완료!`);
        addTitleLog(schedule.task_id, 'info', `🎉 숏폼: ${uploadData.videoUrl}`);
        updatePipelineStatus(taskId, 'completed');

      } catch (error: any) {
        console.error(`❌ [SHORTFORM] Error processing shortform for schedule ${schedule.schedule_id}:`, error);
        addTitleLog(schedule.task_id, 'error', `❌ 숏폼 처리 중 오류: ${error.message}`);
      }
    }

    // MySQL: pool manages connections
  } catch (error: any) {
    console.error('❌ [SHORTFORM CHECKER] Error:', error);
  }
}
*/

// ============================================================
// 아키텍처 & ERD 자동 업데이트 (매일 오후 1시)
// ============================================================

let architectureUpdateInterval: NodeJS.Timeout | null = null;
let lastArchitectureUpdate: Date | null = null;

/**
 * 아키텍처 자동 업데이트 스케줄러 시작
 * 매일 오후 1시(13:00)에 실행
 */
export function startArchitectureAutoUpdate() {
  if (architectureUpdateInterval) {
    console.log('⚠️ Architecture auto-update scheduler is already running');
    return;
  }

  console.log('🏗️ Architecture auto-update scheduler started (daily at 13:00)');

  // 1분마다 시간 체크
  architectureUpdateInterval = setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 오후 1시 0분~1분 사이에 실행 (하루에 한 번만)
    if (hour === 13 && minute === 0) {
      // 오늘 이미 실행했는지 체크
      if (lastArchitectureUpdate) {
        const lastDate = lastArchitectureUpdate.toDateString();
        const todayDate = now.toDateString();
        if (lastDate === todayDate) {
          return; // 오늘 이미 실행함
        }
      }

      console.log('🏗️ [ARCHITECTURE] Starting daily auto-update...');
      lastArchitectureUpdate = now;

      try {
        // 내부 API 호출로 아키텍처 업데이트 실행
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/admin/architecture/auto-update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // 내부 호출용 관리자 인증 (시스템 호출)
            'X-Internal-Call': 'architecture-scheduler'
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ [ARCHITECTURE] Daily auto-update completed:', data.updateInfo);
        } else {
          const error = await response.text();
          console.error('❌ [ARCHITECTURE] Auto-update failed:', error);
        }
      } catch (error: any) {
        console.error('❌ [ARCHITECTURE] Auto-update error:', error.message);
      }
    }
  }, 60 * 1000); // 1분마다 체크
}

/**
 * 아키텍처 자동 업데이트 스케줄러 중지
 */
export function stopArchitectureAutoUpdate() {
  if (architectureUpdateInterval) {
    clearInterval(architectureUpdateInterval);
    architectureUpdateInterval = null;
    console.log('🛑 Architecture auto-update scheduler stopped');
  }
}

/**
 * 아키텍처 업데이트 수동 실행
 */
export async function triggerArchitectureUpdate(): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/admin/architecture/auto-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Call': 'manual-trigger'
      }
    });

    if (response.ok) {
      const data = await response.json();
      lastArchitectureUpdate = new Date();
      return { success: true, message: `업데이트 완료 (${data.updateInfo?.updateCount || 1}회)` };
    } else {
      const error = await response.text();
      return { success: false, message: `업데이트 실패: ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: `오류: ${error.message}` };
  }
}

// ============================================================
// 자동 제목 생성 관련 함수
// ============================================================

let autoTitleGenerationInterval: NodeJS.Timeout | null = null;

/**
 * 자동 제목 생성 시작 (독립 타이머)
 */
export async function startAutoTitleGeneration() {
  if (autoTitleGenerationInterval) {
    console.log('⚠️ Auto title generation is already running');
    return;
  }

  const settings = await getAutomationSettings();
  const checkInterval = Math.max(30, parseInt(settings.check_interval || '60')) * 1000; // 최소 30초

  console.log(`🤖 Starting auto title generation (interval: ${checkInterval / 1000}s)...`);

  // 즉시 한 번 실행
  try {
    await checkAndCreateAutoSchedules();
  } catch (error: any) {
    console.error('❌ Auto title generation initial run failed:', error);
  }

  // 주기적으로 실행
  autoTitleGenerationInterval = setInterval(async () => {
    try {
      const currentSettings = await getAutomationSettings();
      if (currentSettings.auto_title_generation !== 'true') {
        console.log('⏸️ Auto title generation disabled, stopping timer');
        stopAutoTitleGeneration();
        return;
      }
      await checkAndCreateAutoSchedules();
    } catch (error: any) {
      console.error('❌ Auto title generation cycle failed:', error);
    }
  }, checkInterval);

  console.log('✅ Auto title generation started');
}

/**
 * 자동 제목 생성 중지
 */
export function stopAutoTitleGeneration() {
  if (autoTitleGenerationInterval) {
    clearInterval(autoTitleGenerationInterval);
    autoTitleGenerationInterval = null;
    console.log('⏸️ Auto title generation stopped');
  }
}

/**
 * 자동 제목 생성 상태 확인
 */
export async function isAutoTitleGenerationRunning(): Promise<boolean> {
  const settings = await getAutomationSettings();
  return settings.auto_title_generation === 'true';
}

// ============================================================
// 재시도 파이프라인 실행 (worker 우회)
// ============================================================
/**
 * 재시도 파이프라인 - worker를 거치지 않고 직접 실행
 * @param taskId 재시도할 task ID
 * @param retryFromType 재시도 시작 단계 (script, image, video, youtube)
 */
export async function executeRetryPipeline(taskId: string, retryFromType: 'script' | 'image' | 'video' | 'youtube') {
  console.log(`🔄 [RETRY PIPELINE] Starting direct execution: taskId=${taskId}, type=${retryFromType}`);

  try {
    // 1. task_queue에서 task 정보 가져오기
    const queue = await db.prepare(`
      SELECT
        tq.task_id as taskId,
        tq.type,
        tq.status,
        t.user_id as userId,
        c.title,
        c.prompt_format as promptFormat,
        c.ai_model as aiModel,
        c.product_info as productInfo,
        c.category,
        cs.script_mode as scriptMode,
        cs.media_mode as mediaMode,
        cs.settings
      FROM task_queue tq
      INNER JOIN task t ON tq.task_id = t.task_id
      LEFT JOIN content c ON t.task_id = c.content_id
      LEFT JOIN content_setting cs ON t.task_id = cs.content_id
      WHERE tq.task_id = ?
    `).get(taskId) as any;

    if (!queue) {
      throw new Error(`Task not found in queue: ${taskId}`);
    }

    const settings = await getAutomationSettings();
    const maxRetry = parseInt(settings.max_retry || '3');

    // media_mode 결정
    let mediaMode = `${queue.mediaMode || settings.media_generation_mode || 'upload'}`.trim();
    if (mediaMode === 'dalle') mediaMode = 'dalle3';

    console.log(`🔍 [RETRY PIPELINE] Task info:`, { taskId, retryFromType, mediaMode, promptFormat: queue.promptFormat });

    // 2. 재시도 타입에 따라 해당 단계 실행
    switch (retryFromType) {
      case 'script':
        console.log(`📝 [RETRY PIPELINE] Executing script generation...`);
        addTitleLog(taskId, 'info', '📝 대본 작성 재시도 중...');

        const scriptResult = await generateScript(queue, taskId, maxRetry);

        if (!scriptResult.success) {
          throw new Error(`Script generation failed: ${scriptResult.error}`);
        }

        addTitleLog(taskId, 'info', `✅ 대본 작성 완료`);

        // media_mode에 따라 다음 큐 결정
        if (mediaMode === 'upload' || mediaMode === 'crawl') {
          updateQueueStatus(taskId, 'image', 'waiting');
          addTitleLog(taskId, 'info', '📸 이미지 처리 대기 중...', 'image');
        } else {
          updateQueueStatus(taskId, 'video', 'waiting');
          addTitleLog(taskId, 'info', '🎬 영상 제작 대기 중...');
        }
        break;

      case 'video':
        console.log(`🎬 [RETRY PIPELINE] Executing video generation...`);
        addTitleLog(taskId, 'info', '🎬 영상 제작 재시도 중...');

        const videoResult = await generateVideo(taskId, taskId, maxRetry, taskId, queue);

        if (!videoResult.success) {
          throw new Error(`Video generation failed: ${videoResult.error}`);
        }

        addTitleLog(taskId, 'info', `✅ 영상 제작 완료`);
        updateQueueStatus(taskId, 'youtube', 'waiting');
        addTitleLog(taskId, 'info', '📺 YouTube 업로드 대기 중...', 'youtube');
        break;

      case 'youtube':
        console.log(`📺 [RETRY PIPELINE] Executing YouTube upload...`);
        addTitleLog(taskId, 'info', '📺 YouTube 업로드 재시도 중...');

        const uploadResult = await uploadToYouTube(taskId, queue, taskId, maxRetry);

        if (!uploadResult.success) {
          throw new Error(`YouTube upload failed: ${uploadResult.error}`);
        }

        addTitleLog(taskId, 'info', `✅ YouTube 업로드 완료: ${uploadResult.videoUrl}`);
        updateQueueStatus(taskId, 'youtube', 'completed');
        break;

      case 'image':
        // image는 자동 처리 없음 (수동 업로드 또는 외부 worker)
        console.log(`📸 [RETRY PIPELINE] Image phase - waiting for external processing`);
        updateQueueStatus(taskId, 'image', 'waiting');
        addTitleLog(taskId, 'info', '📸 이미지 처리 대기 중...', 'image');
        break;

      default:
        throw new Error(`Unknown retry type: ${retryFromType}`);
    }

    console.log(`✅ [RETRY PIPELINE] Completed: taskId=${taskId}, type=${retryFromType}`);

  } catch (error: any) {
    console.error(`❌ [RETRY PIPELINE] Failed: taskId=${taskId}, type=${retryFromType}`, error);
    addTitleLog(taskId, 'error', `❌ 재시도 실패: ${error.message}`);

    // 실패 시 상태 업데이트
    await db.prepare(`
      UPDATE task_queue
      SET status = 'failed', error = ?
      WHERE task_id = ?
    `).run(error.message, taskId);

    throw error;
  }
}
