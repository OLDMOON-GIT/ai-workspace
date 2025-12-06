/**
 * 통합 워커 - 모든 워커를 하나의 프로세스에서 실행
 * Node.js 이벤트 루프를 활용하여 효율적으로 실행
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { parseJsonSafely } = require('../lib/json-utils.cjs');

// MySQL 연결 설정
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'trend2024',
  database: process.env.MYSQL_DATABASE || 'trend_video',
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,           // BTS-3391: 유휴 커넥션 최대 5개 유지
  idleTimeout: 60000,   // BTS-3391: 60초 후 유휴 커넥션 해제
  queueLimit: 0
};

let pool = null;
function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

async function getOne(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows[0];
}

async function run(sql, params) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

// 로컬 시간 헬퍼
function getLocalDateTime() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ✅ BTS-0000022: 로그 파일 append 헬퍼
function appendToLogFile(taskId, logType, message) {
  try {
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const logFilePath = path.join(backendPath, 'tasks', taskId, `${logType}.log`);
    const tasksDir = path.dirname(logFilePath);

    // 폴더가 없으면 생성
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }

    const timestamp = getLocalDateTime();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFilePath, logLine, 'utf-8');
  } catch (error) {
    // 로그 실패는 무시 (워커를 멈추지 않음)
    console.error(`Failed to append to ${logType}.log:`, error.message);
  }
}

// ============================================================
// Task Lock Management (동시성 제어)
// ============================================================

/**
 * 락 획득 시도 (atomic operation)
 * @returns true if lock acquired, false otherwise
 */
async function acquireLock(taskType, workerId, taskId = null) {
  try {
    const now = getLocalDateTime();
    const workerPid = process.pid;

    // UPDATE ... WHERE worker_pid IS NULL (atomic)
    const result = await run(`
      UPDATE task_lock
      SET locked_at = ?, worker_pid = ?, lock_task_id = ?
      WHERE task_type = ? AND (worker_pid IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
    `, [now, workerPid, taskId, taskType]);

    const acquired = result.affectedRows > 0;
    if (acquired) {
      console.log(`🔒 [LOCK] Acquired: ${taskType} by ${workerId} (PID: ${workerPid})${taskId ? ` for task ${taskId}` : ''}`);
    }
    return acquired;
  } catch (error) {
    console.error(`❌ [LOCK] Failed to acquire ${taskType}:`, error.message);
    return false;
  }
}

/**
 * 락 해제
 */
async function releaseLock(taskType, workerId) {
  try {
    const workerPid = process.pid;
    await run(`
      UPDATE task_lock
      SET locked_at = NULL, worker_pid = NULL, lock_task_id = NULL
      WHERE task_type = ? AND worker_pid = ?
    `, [taskType, workerPid]);

    console.log(`🔓 [LOCK] Released: ${taskType} by ${workerId}`);
  } catch (error) {
    console.error(`❌ [LOCK] Failed to release ${taskType}:`, error.message);
  }
}

/**
 * 만료된 락 정리 (5분 이상 된 락)
 */
async function cleanupStaleLocks() {
  try {
    const result = await run(`
      UPDATE task_lock
      SET locked_at = NULL, worker_pid = NULL, lock_task_id = NULL
      WHERE worker_pid IS NOT NULL AND locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    `);

    if (result.affectedRows > 0) {
      console.log(`🧹 [LOCK] Cleaned up ${result.affectedRows} stale lock(s)`);
    }
  } catch (error) {
    console.error('❌ [LOCK] Failed to cleanup stale locks:', error.message);
  }
}

class UnifiedWorker {
  constructor() {
    this.running = false;
    this.workerId = `worker-${process.pid}-${Date.now()}`;
    this.workers = {
      script: { processing: false, pollCount: 0, hasLock: false, currentTaskId: null },
      image: { processing: false, pollCount: 0, hasLock: false, currentTaskId: null },
      video: { processing: false, pollCount: 0, hasLock: false, currentTaskId: null },
      youtube: { processing: false, pollCount: 0, hasLock: false, currentTaskId: null }
    };
    // ✅ BTS-0000025: YouTube 중복 업로드 방지
    this.runningYoutubeUploads = new Map();
  }

  async dequeue(type) {
    const task = await getOne(`
      SELECT * FROM task_queue
      WHERE type = ? AND status = 'waiting'
      ORDER BY created_at ASC
      LIMIT 1
    `, [type]);

    if (!task) return null;

    // 상태를 processing으로 변경
    const startedAt = getLocalDateTime();
    await run(`
      UPDATE task_queue
      SET status = 'processing'
      WHERE task_id = ? AND type = ?
    `, [task.task_id, type]);

    // task_time_log에 시작 시간 기록
    const retryCnt = await getOne(`
      SELECT COALESCE(MAX(retry_cnt), -1) + 1 as next_retry
      FROM task_time_log
      WHERE task_id = ? AND type = ?
    `, [task.task_id, type]);

    // REPLACE 사용하여 중복 키 에러 방지 (재시도 시)
    await run(`
      REPLACE INTO task_time_log (task_id, type, retry_cnt, start_time)
      VALUES (?, ?, ?, ?)
    `, [task.task_id, type, retryCnt?.next_retry || 0, startedAt]);

    return {
      taskId: task.task_id,
      type: task.type,
      status: task.status,
      userId: task.user_id,
      createdAt: task.created_at
    };
  }

  async updateTask(taskId, type, updates) {
    const fields = [];
    const values = [];

    if (updates.state !== undefined) {
      fields.push('status = ?');
      values.push(updates.state);
    }

    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (fields.length === 0) return;

    values.push(taskId, type);

    await run(`
      UPDATE task_queue
      SET ${fields.join(', ')}
      WHERE task_id = ? AND type = ?
    `, values);
  }

  async appendLog(taskId, type, message) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      const taskFolder = path.join(backendPath, 'tasks', taskId);
      const logFile = path.join(taskFolder, `${type}.log`);

      // 폴더 생성 (없으면)
      await fs.mkdir(taskFolder, { recursive: true });

      // 타임스탬프 추가 (한국 시간 UTC+9)
      const kstDate = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
      const timestamp = kstDate.toISOString().replace('T', ' ').substring(0, 19);
      const logLine = `[${timestamp}] ${message}\n`;

      // 로그 파일에 추가
      await fs.appendFile(logFile, logLine, 'utf8');
    } catch (error) {
      console.error(`❌ Failed to write log for ${taskId}:`, error.message);
    }
  }

  async start() {
    this.running = true;
    console.log('🚀 Unified Worker started - all 4 workers in one process');
    console.log(`🆔 Worker ID: ${this.workerId}`);
    console.log('⏱️  Polling interval: 5 seconds per worker');
    console.log('📝 Script → 📸 Image → 🎬 Video → 📺 YouTube\n');

    // 시작 시 만료된 락 정리
    await cleanupStaleLocks();

    // 모든 워커를 병렬로 실행 (각자의 polling loop)
    await Promise.all([
      this.runWorker('script', '📝'),
      this.runWorker('image', '📸'),
      this.runWorker('video', '🎬'),
      this.runWorker('youtube', '📺')
    ]);
  }

  async runWorker(type, emoji) {
    const workerState = this.workers[type];

    while (this.running) {
      try {
        if (workerState.processing) {
          await this.sleep(1000);
          continue;
        }

        // 🔒 락 획득 시도
        if (!workerState.hasLock) {
          const acquired = await acquireLock(type, this.workerId);
          if (!acquired) {
            // 락 획득 실패 시 대기
            await this.sleep(5000);
            continue;
          }
          workerState.hasLock = true;
        }

        workerState.pollCount++;
        if (workerState.pollCount % 6 === 1) { // 30초마다 로그
          console.log(`${emoji} [${type}] Poll #${workerState.pollCount} - checking queue...`);
        }

        const task = await this.dequeue(type);

        if (!task) {
          await this.sleep(5000);
          continue;
        }

        workerState.processing = true;
        workerState.currentTaskId = task.taskId;
        const taskId = task.taskId;
        console.log(`\n${emoji} [${type}] Processing: ${taskId}`);

        // lock_task_id 업데이트 (현재 처리 중인 task 표시)
        try {
          await run(`
            UPDATE task_lock
            SET lock_task_id = ?
            WHERE task_type = ? AND worker_pid = ?
          `, [taskId, type, process.pid]);
        } catch (e) {
          console.error(`⚠️ [LOCK] Failed to update lock_task_id:`, e.message);
        }

        try {
          await this.processTask(type, task, emoji);

          // task_time_log 종료 시간 기록
          const completedAt = getLocalDateTime();
          await run(`
            UPDATE task_time_log
            SET end_time = ?
            WHERE task_id = ? AND type = ? AND end_time IS NULL
            ORDER BY retry_cnt DESC LIMIT 1
          `, [completedAt, taskId, type]);

          // 다음 단계로 전환 (또는 완료 처리)
          const hasNextStage = await this.triggerNextStage(type, taskId, emoji);

          if (hasNextStage) {
            console.log(`${emoji} [${type}] ✅ Completed and moved to next stage: ${taskId}`);
          } else {
            // ⭐ 안전장치: video는 절대 completed가 되면 안 됨 (BTS-0000017)
            if (type === 'video') {
              const errorMsg = `CRITICAL: video stage cannot be completed without youtube stage`;
              console.error(`❌ [${type}] ${errorMsg}, taskId=${taskId}`);
              throw new Error(errorMsg);
            }

            // 마지막 단계 (youtube)만 completed 상태로 변경
            // 1. task_queue
            await this.updateTask(taskId, type, {
              state: 'completed'
            });
            // 2. content.status도 'completed'로 설정
            await run(`
              UPDATE content
              SET status = 'completed'
              WHERE content_id = ?
            `, [taskId]);
            console.log(`${emoji} [${type}] ✅ All stages completed: ${taskId}`);
          }

        } catch (error) {
          console.error(`${emoji} [${type}] ❌ Failed: ${taskId}`, error.message);

          // 에러 로그 파일에 기록 (BTS-0000028)
          const errorMsg = `❌ 에러: ${error.message}`;
          await this.appendLog(taskId, type, errorMsg);
          appendToLogFile(taskId, type, errorMsg); // BTS-0000028: 에러 로그 파일 저장

          if (error.stack) {
            const stackMsg = `스택 트레이스:\n${error.stack}`;
            await this.appendLog(taskId, type, stackMsg);
            appendToLogFile(taskId, type, stackMsg); // BTS-0000028: 스택 트레이스 파일 저장
          }

          await this.updateTask(taskId, type, {
            state: 'failed',
            error: error.message
          });
        } finally {
          workerState.processing = false;
          workerState.currentTaskId = null;

          // lock_task_id 초기화 (task 처리 완료)
          try {
            await run(`
              UPDATE task_lock
              SET lock_task_id = NULL
              WHERE task_type = ? AND worker_pid = ?
            `, [type, process.pid]);
          } catch (e) {
            console.error(`⚠️ [LOCK] Failed to clear lock_task_id:`, e.message);
          }
        }

      } catch (error) {
        console.error(`${emoji} [${type}] Worker error:`, error);
        workerState.processing = false;
        await this.sleep(5000);
      }
    }
  }

  // 유연한 JSON 파서 (json-utils.ts의 parseJsonSafely 로직)
  parseJsonSafely(jsonString) {
    try {
      return { success: true, data: JSON.parse(jsonString) };
    } catch (error) {
      // 자동 수정 시도
      try {
        let fixed = jsonString.trim();

        // 코드 블록 제거
        fixed = fixed.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '');

        // JSON 시작/끝 찾기
        const firstBrace = fixed.indexOf('{');
        const lastBrace = fixed.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          fixed = fixed.substring(firstBrace, lastBrace + 1);
        }

        // trailing comma 제거
        fixed = fixed.replace(/,(\s*})/g, '$1').replace(/,(\s*\])/g, '$1');

        return { success: true, data: JSON.parse(fixed), fixed: true };
      } catch (secondError) {
        return { success: false, error: secondError.message };
      }
    }
  }

  async processTask(type, task, emoji) {
    const taskId = task.taskId;
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const fs = require('fs');

    console.log(`${emoji} [${type}] Processing: ${taskId}`);

    if (type === 'script') {
      // ==== 대본 작성 (API 호출 방식) ====
      const content = await getOne(`SELECT * FROM content WHERE content_id = ?`, [taskId]);
      const setting = await getOne(`SELECT * FROM content_setting WHERE content_id = ?`, [taskId]);

      if (!content) throw new Error(`Content not found: ${taskId}`);

      const title = content.title || '';
      const scriptType = content.prompt_format || 'longform';
      const aiModel = content.ai_model || 'claude';
      const userId = content.user_id;
      const scriptMode = setting?.script_mode || 'chrome';

      console.log(`${emoji} [${type}] Calling API: title="${title}", type=${scriptType}, model=${aiModel}, mode=${scriptMode}`);

      // API 호출
      const fetch = (await import('node-fetch')).default;
      const apiUrl = 'http://localhost:2000/api/scripts/generate';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'automation-system'
        },
        body: JSON.stringify({
          title,
          type: scriptType,
          model: aiModel,
          mode: scriptMode,
          userId,
          taskId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      // 응답 대기 (API는 작업 완료 시까지 대기함)
      const result = await response.text();

      // 결과 로깅
      if (result) {
        const lines = result.split('\n').filter(line => line.trim());
        for (const line of lines) {
          console.log(`${emoji} ${line}`);
          await this.appendLog(taskId, type, line.trim());
          appendToLogFile(taskId, 'script', line.trim()); // BTS-0000028: 로그 파일 저장
        }
      }

      console.log(`${emoji} [${type}] ✅ API call completed`);

    } else if (type === 'image') {
      // ==== 이미지 크롤링 ====
      const taskFolderPath = path.join(backendPath, 'tasks', taskId);
      const storyJsonPath = path.join(taskFolderPath, 'story.json');
      const scriptPath = path.join(backendPath, 'src', 'image_crawler', 'image_crawler_working.py');

      // story.json에서 설정 읽기 (유연한 JSON 파서 사용)
      const storyContent = fs.readFileSync(storyJsonPath, 'utf-8');
      const parseResult = parseJsonSafely(storyContent);

      if (!parseResult.success) {
        throw new Error(`story.json 파싱 실패: ${parseResult.error}`);
      }

      if (parseResult.fixed) {
        console.log(`${emoji} [${type}] ⚠️ story.json 자동 수정됨 - 수정된 파일 저장`);
        // 수정된 JSON을 다시 파일에 저장 (Python이 읽을 수 있도록)
        fs.writeFileSync(storyJsonPath, JSON.stringify(parseResult.data, null, 2), 'utf-8');
      }

      const storyData = parseResult.data;
      const metadata = storyData.metadata || {};
      const promptFormat = metadata.promptFormat || 'longform';
      const aspectRatio = (promptFormat === 'longform') ? '16:9' : '9:16';

      // BTS-0000034: imageMode 지원 (기존 useImageFX 하위호환)
      let imageMode = metadata.imageMode || 'whisk';
      if (!metadata.imageMode) {
        // 기존 useImageFX가 있으면 변환
        if (typeof metadata.useImageFX === 'boolean') {
          imageMode = metadata.useImageFX ? 'imagefx' : 'whisk';
        } else {
          // format 기반 자동 결정
          imageMode = (promptFormat === 'longform') ? 'imagefx' : 'whisk';
        }
      }

      const pythonArgs = [scriptPath, storyJsonPath, '--output-dir', taskFolderPath, '--aspect-ratio', aspectRatio];
      if (imageMode === 'imagefx') pythonArgs.push('--use-imagefx');
      else if (imageMode === 'flow') pythonArgs.push('--use-flow');

      const startMsg = `🎨 이미지 생성 시작 (모드: ${imageMode}, 비율: ${aspectRatio})`;
      console.log(`${emoji} [${type}] ${startMsg}`);
      await this.appendLog(taskId, type, startMsg);
      appendToLogFile(taskId, 'image', startMsg); // BTS-0000028: 시작 로그 파일 저장

      return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python', pythonArgs, {
          cwd: backendPath,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true  // 이미지 크롤링 완료 시 콘솔 창 자동 숨김
        });

        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
          const text = data.toString();
          process.stdout.write(`${emoji} ${text}`);
          this.appendLog(taskId, type, text.trim()).catch(() => {});
          appendToLogFile(taskId, 'image', text.trim());
        });

        pythonProcess.stderr.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          process.stderr.write(`${emoji} ⚠️ ${text}`);
          this.appendLog(taskId, type, `⚠️ ${text.trim()}`).catch(() => {});
          appendToLogFile(taskId, 'image', `⚠️ ${text.trim()}`);
        });

        pythonProcess.on('close', async (code) => {
          if (code === 0) {
            const successMsg = '✅ 이미지 생성 완료';
            console.log(`${emoji} [${type}] ${successMsg}`);
            await this.appendLog(taskId, type, successMsg).catch(() => {});
            appendToLogFile(taskId, 'image', successMsg); // BTS-0000028: 성공 로그 파일 저장
            resolve();
          } else {
            reject(new Error(`Python script exited with code ${code}\n${errorOutput}`));
          }
        });

        pythonProcess.on('error', (error) => reject(new Error(`Failed to start: ${error.message}`)));
      });

    } else if (type === 'video') {
      // ==== 영상 제작 (API 호출) ====
      // content 정보 가져오기 (prompt_format 확인용)
      const content = await getOne(`
        SELECT c.*, cs.*
        FROM content c
        LEFT JOIN content_setting cs ON c.content_id = cs.content_id
        WHERE c.content_id = ?
      `, [taskId]);

      if (!content) throw new Error('Content not found');

      const promptFormat = content.prompt_format || 'shortform';
      console.log(`${emoji} [${type}] Video type: ${promptFormat} (task: ${taskId})`);

      // API 호출
      const apiUrl = `http://localhost:2000/api/videos/generate`;
      console.log(`${emoji} [${type}] Calling API: ${apiUrl}`);
      await this.appendLog(taskId, type, `📡 영상 생성 API 호출 (타입: ${promptFormat})`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'automation-system'
        },
        body: JSON.stringify({
          scriptId: taskId,
          type: promptFormat
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`API failed: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      // ✅ BTS-0000017: API가 영상 생성 완료까지 동기로 대기하므로 이 시점에서 실제로 완료됨
      console.log(`${emoji} [${type}] ✅ API call completed`);
      await this.appendLog(taskId, type, `✅ 영상 생성 완료`);
      appendToLogFile(taskId, 'video', `✅ 영상 생성 완료`); // BTS-0000028: 로그 파일 저장

    } else if (type === 'youtube') {
      // ==== 유튜브 업로드 ====
      // ✅ task_lock 테이블 사용: 진짜 atomic lock
      console.log(`${emoji} [${type}] 🔒 task_lock 테이블 락 획득 시도: ${taskId}`);

      // 1. task_lock 테이블에서 락 획득 시도
      const lockResult = await run(`
        UPDATE task_lock
        SET lock_task_id = ?, locked_at = NOW(), worker_pid = ?
        WHERE task_type = 'youtube' AND lock_task_id IS NULL
      `, [taskId, process.pid]);

      if (lockResult.affectedRows === 0) {
        // 락 획득 실패 - 다른 Worker가 이미 락을 획득했거나 좀비 락
        const currentLock = await getOne(`
          SELECT lock_task_id, locked_at, worker_pid,
                 TIMESTAMPDIFF(MINUTE, locked_at, NOW()) as minutes_elapsed
          FROM task_lock
          WHERE task_type = 'youtube'
        `, []);

        if (!currentLock || !currentLock.lock_task_id) {
          console.error(`${emoji} [${type}] ❌ 락 획득 실패: lock_task_id가 NULL (race condition)`);
          await this.appendLog(taskId, type, `❌ 락 획득 실패: 다른 Worker와 race condition`);
          throw new Error('락 획득 실패: 다른 Worker가 동시에 락을 획득함');
        }

        // ✅ 좀비 락 감지: 10분 이상 지속된 락이면 강제 해제
        if (currentLock.minutes_elapsed > 10) {
          console.warn(`${emoji} [${type}] ⚠️ 좀비 락 감지 (${currentLock.minutes_elapsed}분 경과, task=${currentLock.lock_task_id}) - 강제 해제`);
          await this.appendLog(taskId, type, `⚠️ 좀비 락 감지 (${currentLock.minutes_elapsed}분 경과) - 강제 재시도`);

          // 강제로 락 해제 후 재획득
          await run(`
            UPDATE task_lock
            SET lock_task_id = ?, locked_at = NOW(), worker_pid = ?
            WHERE task_type = 'youtube'
          `, [taskId, process.pid]);

          console.log(`${emoji} [${type}] ✅ 좀비 락 강제 해제 후 재획득 성공`);
        } else {
          console.error(`${emoji} [${type}] ❌ 락 획득 실패: 다른 작업 처리 중 (task=${currentLock.lock_task_id}, 경과 시간: ${currentLock.minutes_elapsed.toFixed(1)}분)`);
          console.error(`${emoji} [${type}] 📊 Lock 상태: locked_at=${currentLock.locked_at}, worker_pid=${currentLock.worker_pid}`);
          await this.appendLog(taskId, type, `❌ 락 획득 실패: 다른 작업 처리 중 (${currentLock.lock_task_id})`);
          throw new Error(`락 획득 실패: 다른 작업(${currentLock.lock_task_id})이 처리 중입니다 (경과 시간: ${currentLock.minutes_elapsed.toFixed(1)}분)`);
        }
      }

      console.log(`${emoji} [${type}] ✅ task_lock 락 획득 성공: ${taskId}`);

      // 2. task_queue의 status도 processing으로 변경
      await run(`
        UPDATE task_queue
        SET status = 'processing', updated_at = NOW()
        WHERE task_id = ? AND type = 'youtube'
      `, [taskId]);

      // Memory 락도 설정 (보조 방어)
      this.runningYoutubeUploads.set(taskId, Date.now());

      // ✅ BTS-0000021: /api/youtube/upload/route.ts와 동일한 방식으로 수정
      const content = await getOne(`
        SELECT c.*, cs.*
        FROM content c
        LEFT JOIN content_setting cs ON c.content_id = cs.content_id
        WHERE c.content_id = ?
      `, [taskId]);

      if (!content) {
        // task_lock + task_queue 락 해제
        await run(`
          UPDATE task_lock
          SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
          WHERE task_type = 'youtube' AND lock_task_id = ?
        `, [taskId]);
        await run(`
          UPDATE task_queue SET status = 'failed'
          WHERE task_id = ? AND type = 'youtube'
        `, [taskId]);
        this.runningYoutubeUploads.delete(taskId);
        throw new Error('Content not found');
      }

      // 🔍 DEBUG: content 필드 확인
      console.log(`${emoji} [${type}] 🔍 Content 필드 확인:`);
      console.log(`${emoji} [${type}]   - promptFormat: ${content.promptFormat}`);
      console.log(`${emoji} [${type}]   - prompt_format: ${content.prompt_format}`);
      console.log(`${emoji} [${type}]   - category: ${content.category}`);
      console.log(`${emoji} [${type}]   - title: ${content.title}`);

      // 1. 파일 경로 찾기
      const taskFolder = path.join(backendPath, 'tasks', taskId);
      let videoPath = null;
      let thumbnailPath = null;

      if (fs.existsSync(taskFolder)) {
        const files = fs.readdirSync(taskFolder);
        // 최종 영상 파일 찾기 (scene_*, _audio, 숫자파일 제외)
        const mp4Files = files.filter(f =>
          f.endsWith('.mp4') &&
          !f.startsWith('scene_') &&
          !f.includes('_audio') &&
          !/^\d+\.mp4$/i.test(f)
        );
        if (mp4Files.length > 0) {
          // 여러 파일이 있으면 가장 큰 파일 선택
          let maxSize = 0;
          for (const f of mp4Files) {
            const stats = fs.statSync(path.join(taskFolder, f));
            if (stats.size > maxSize) {
              maxSize = stats.size;
              videoPath = path.join(taskFolder, f);
            }
          }
          if (!videoPath) videoPath = path.join(taskFolder, mp4Files[0]);
        }

        // 썸네일 찾기
        const thumbnailFiles = files.filter(f => f === 'thumbnail.jpg' || f === 'thumbnail.png');
        if (thumbnailFiles.length > 0) {
          thumbnailPath = path.join(taskFolder, thumbnailFiles[0]);
        }
      }

      if (!videoPath || !fs.existsSync(videoPath)) {
        const allFiles = fs.existsSync(taskFolder) ? fs.readdirSync(taskFolder) : [];
        const mp4Files = allFiles.filter(f => f.endsWith('.mp4'));
        console.error(`${emoji} [${type}] ❌ 영상 파일을 찾을 수 없습니다`);
        console.error(`${emoji} [${type}] 📁 Task 폴더: ${taskFolder}`);
        console.error(`${emoji} [${type}] 📁 폴더 내 모든 파일 (${allFiles.length}개):`, allFiles.join(', ') || '(없음)');
        console.error(`${emoji} [${type}] 📁 MP4 파일 (${mp4Files.length}개):`, mp4Files.join(', ') || '(없음)');
        await this.appendLog(taskId, type, `❌ 영상 파일 없음`);
        await this.appendLog(taskId, type, `📁 Task 폴더: ${taskFolder}`);
        await this.appendLog(taskId, type, `📁 MP4 파일: ${mp4Files.join(', ') || '없음'}`);
        throw new Error(`Video file not found. Task 폴더에 MP4 파일이 없습니다 (전체 파일: ${allFiles.length}개)`);
      }

      console.log(`${emoji} [${type}] Video: ${videoPath}`);
      console.log(`${emoji} [${type}] Thumbnail: ${thumbnailPath || 'none'}`);

      // 2. 메타데이터 준비 (상품/숏폼/롱폼 처리)
      let description = '';
      let pinnedComment = '';

      // content_setting에서 tags 가져오기
      let contentTags = '';
      try {
        const settingRow = await getOne(`SELECT tags FROM content_setting WHERE content_id = ?`, [taskId]);
        if (settingRow && settingRow.tags) {
          contentTags = settingRow.tags;
        }
      } catch (e) {
        console.warn(`${emoji} [${type}] ⚠️ tags 조회 실패:`, e.message);
      }

      // 상품 카테고리: story.json에서 youtube_description 로드
      console.log(`${emoji} [${type}] 🔍 타입 체크: promptFormat=${content.promptFormat}, prompt_format=${content.prompt_format}`);

      if (content.promptFormat === 'product' || content.prompt_format === 'product') {
        console.log(`${emoji} [${type}] ✅ 상품으로 감지됨 - story.json에서 youtube_description 로드 시도`);
        const storyPath = path.join(taskFolder, 'story.json');
        console.log(`${emoji} [${type}] 📁 Story path: ${storyPath}`);
        console.log(`${emoji} [${type}] 📁 Story exists: ${fs.existsSync(storyPath)}`);

        if (fs.existsSync(storyPath)) {
          try {
            const storyContent = fs.readFileSync(storyPath, 'utf-8');
            const parseResult = parseJsonSafely(storyContent);
            if (!parseResult.success) {
              throw new Error(parseResult.error);
            }
            const storyData = parseResult.data;
            console.log(`${emoji} [${type}] 📊 Story data keys:`, Object.keys(storyData));
            console.log(`${emoji} [${type}] 📊 Has youtube_description:`, !!storyData.youtube_description);

            if (storyData.youtube_description && storyData.youtube_description.text) {
              description = storyData.youtube_description.text.replace(/\\n/g, '\n');
              pinnedComment = description; // 상품은 고정 댓글도 설정
              console.log(`${emoji} [${type}] 📦 상품 YouTube 설명 로드 성공 (${description.length}자)`);
              console.log(`${emoji} [${type}] 📦 설명 미리보기: ${description.substring(0, 100)}...`);
              if (parseResult.fixed) {
                console.log(`${emoji} [${type}] 🔧 JSON 자동 수정 (글자수 카운트 제거)`);
              }
            } else {
              console.warn(`${emoji} [${type}] ⚠️ story.json에 youtube_description.text 없음`);
              description = '구독과 좋아요 부탁드립니다 ❤️';
              console.log(`${emoji} [${type}] ⏭️ 기본 description 설정`);
            }
          } catch (e) {
            console.warn(`${emoji} [${type}] ⚠️ story.json 파싱 실패:`, e.message);
            description = '구독과 좋아요 부탁드립니다 ❤️';
            console.log(`${emoji} [${type}] ⏭️ 기본 description 설정`);
          }
        } else {
          throw new Error('story.json 파일이 존재하지 않습니다');
        }
      } else {
        console.log(`${emoji} [${type}] ⏭️ 상품 아님 - 기본 description 설정`);
        // 상품이 아닌 경우(longform, shortform) 기본 description 생성
        description = '구독과 좋아요 부탁드립니다 ❤️';
      }

      // 숏폼: 롱폼 YouTube URL 추가
      if (content.prompt_format === 'shortform' || content.promptFormat === 'shortform') {
        console.log(`${emoji} [${type}] 📱 숏폼 감지 - 롱폼 링크 확인 중...`);
        let longformUrl = '';

        // source_content_id로 롱폼 YouTube URL 찾기
        if (content.source_content_id || content.sourceContentId) {
          const sourceId = content.source_content_id || content.sourceContentId;
          try {
            const sourceContent = await getOne(`
              SELECT youtube_url FROM content WHERE content_id = ?
            `, [sourceId]);

            if (sourceContent && sourceContent.youtube_url) {
              longformUrl = sourceContent.youtube_url;
              console.log(`${emoji} [${type}] 📺 롱폼 링크 발견:`, longformUrl);
            }
          } catch (e) {
            console.warn(`${emoji} [${type}] ⚠️ 롱폼 링크 조회 실패:`, e.message);
          }
        }

        // story.json에서도 확인
        if (!longformUrl) {
          const storyPath = path.join(taskFolder, 'story.json');
          if (fs.existsSync(storyPath)) {
            try {
              const storyContent = fs.readFileSync(storyPath, 'utf-8');
              const parseResult = parseJsonSafely(storyContent);
              if (parseResult.success) {
                const storyData = parseResult.data;
                if (storyData.metadata && storyData.metadata.longform_youtube_url) {
                  longformUrl = storyData.metadata.longform_youtube_url;
                  console.log(`${emoji} [${type}] 📺 롱폼 링크 (story.json):`, longformUrl);
                }
              }
            } catch (e) {}
          }
        }

        // 롱폼 링크가 있으면 설명과 고정 댓글에 추가
        if (longformUrl) {
          if (description && description.trim() !== '') {
            description = `🎬 전체 영상 보기: ${longformUrl}\n\n${description}`;
          } else {
            description = `🎬 전체 영상 보기: ${longformUrl}\n\n구독과 좋아요 부탁드립니다 ❤️`;
          }
          pinnedComment = `🎬 전체 영상 보러가기 👉 ${longformUrl}`;
          console.log(`${emoji} [${type}] ✅ 숏폼 설명/댓글에 롱폼 링크 추가`);
        }
      }

      // tags를 해시태그로 변환하여 description에 추가
      if (contentTags) {
        const tagsArray = contentTags.split(',').map(t => t.trim()).filter(t => t);
        const hashtags = tagsArray.map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
        if (hashtags) {
          description = description ? `${description}\n\n${hashtags}` : hashtags;
          console.log(`${emoji} [${type}] 🏷️ 태그 추가: ${hashtags}`);
        }
      }

      // 3. 메타데이터 JSON 생성
      const credentialsDir = path.join(backendPath, 'config');
      const metadata = {
        title: content.title || '',
        description: description,
        tags: [],
        category_id: '27',
        privacy_status: content.youtube_privacy || content.youtubePrivacy || 'public'
      };

      // 고정 댓글 추가
      if (pinnedComment) {
        metadata.pinned_comment = pinnedComment;
        console.log(`${emoji} [${type}] 📌 고정 댓글 설정 (${pinnedComment.length}자)`);
      }

      // 디버그 로그: metadata 내용 확인
      console.log(`${emoji} [${type}] 📋 Metadata 생성 완료:`);
      console.log(`${emoji} [${type}]   - title: ${metadata.title?.substring(0, 50)}...`);
      console.log(`${emoji} [${type}]   - description 길이: ${metadata.description?.length || 0}자`);
      console.log(`${emoji} [${type}]   - pinned_comment 길이: ${metadata.pinned_comment?.length || 0}자`);
      console.log(`${emoji} [${type}]   - privacy_status: ${metadata.privacy_status}`);

      const metadataPath = path.join(credentialsDir, `youtube_metadata_${Date.now()}.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log(`${emoji} [${type}] 💾 Metadata 파일 저장: ${path.basename(metadataPath)}`);

      // 3. 인증 파일 경로
      // ✅ BTS-0000023: 채널 ID 포함한 토큰 경로 사용
      const credentialsPath = path.join(credentialsDir, 'youtube_client_secret.json');

      let tokenPath = null;
      // youtube_channel이 있으면 해당 채널의 토큰 사용
      if (content.youtube_channel) {
        tokenPath = path.join(credentialsDir, `youtube_token_${content.user_id}_${content.youtube_channel}.json`);
        console.log(`${emoji} [${type}] Token with channel: ${path.basename(tokenPath)}`);
      }

      // 토큰이 없거나 파일이 없으면 user_id로 시작하는 토큰 파일 찾기
      if (!tokenPath || !fs.existsSync(tokenPath)) {
        const configFiles = fs.readdirSync(credentialsDir);
        const userTokenFiles = configFiles.filter(f =>
          f.startsWith(`youtube_token_${content.user_id}_`) && f.endsWith('.json')
        );

        if (userTokenFiles.length > 0) {
          tokenPath = path.join(credentialsDir, userTokenFiles[0]);
          console.log(`${emoji} [${type}] Token fallback: ${path.basename(tokenPath)}`);
        } else {
          const allTokenFiles = configFiles.filter(f => f.startsWith('youtube_token_') && f.endsWith('.json'));
          console.error(`${emoji} [${type}] ❌ YouTube 토큰을 찾을 수 없습니다`);
          console.error(`${emoji} [${type}] 📊 User ID: ${content.user_id}`);
          console.error(`${emoji} [${type}] 📊 Channel ID: ${content.youtube_channel || '(없음)'}`);
          console.error(`${emoji} [${type}] 📁 검색 패턴: youtube_token_${content.user_id}_*.json`);
          console.error(`${emoji} [${type}] 📁 사용 가능한 토큰 파일 (${allTokenFiles.length}개):`, allTokenFiles.join(', ') || '(없음)');
          await this.appendLog(taskId, type, `❌ YouTube 토큰 없음 (user_id: ${content.user_id})`);
          await this.appendLog(taskId, type, `📁 사용 가능한 토큰: ${allTokenFiles.join(', ') || '없음'}`);
          throw new Error(`No YouTube token found for user ${content.user_id}. 사용 가능한 토큰: ${allTokenFiles.length}개`);
        }
      }

      // 4. Python CLI 호출 (argparse 형식)
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

      console.log(`${emoji} [${type}] Running: python ${args.join(' ')}`);

      return new Promise((resolve, reject) => {
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
          process.stdout.write(`${emoji} ${text}`);
          this.appendLog(taskId, type, text.trim()).catch(() => {});
          // ✅ BTS-0000022: youtube.log 파일에도 기록
          appendToLogFile(taskId, 'youtube', text.trim());
        });

        pythonProcess.stderr.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          process.stderr.write(`${emoji} ⚠️ ${text}`);
          this.appendLog(taskId, type, `⚠️ ${text.trim()}`).catch(() => {});
          // ✅ BTS-0000022: youtube.log 파일에도 기록
          appendToLogFile(taskId, 'youtube', `⚠️ ${text.trim()}`);
        });

        pythonProcess.on('close', async (code) => {
          // 메타데이터 파일 정리
          try {
            if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
          } catch {}

          if (code === 0) {
            // JSON 결과 파싱하여 youtube_url 업데이트
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
                  // content 테이블에 youtube_url 저장
                  await run(`
                    UPDATE content SET youtube_url = ?, updated_at = NOW()
                    WHERE content_id = ?
                  `, [result.video_url, taskId]);

                  // youtube_uploads 테이블에 업로드 이력 기록
                  const videoId = result.video_id || result.video_url.split('/').pop();
                  await run(`
                    INSERT INTO youtube_uploads (content_id, youtube_url, youtube_video_id, uploaded_at)
                    VALUES (?, ?, ?, NOW())
                  `, [taskId, result.video_url, videoId]);

                  console.log(`${emoji} [${type}] YouTube URL saved: ${result.video_url}`);
                }
              }
            } catch (parseError) {
              console.warn(`${emoji} [${type}] JSON parsing failed (업로드는 성공):`, parseError);
            }
            // ✅ task_lock 해제 (성공)
            await run(`
              UPDATE task_lock
              SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
              WHERE task_type = 'youtube' AND lock_task_id = ?
            `, [taskId]);
            this.runningYoutubeUploads.delete(taskId);
            console.log(`${emoji} [${type}] 🔓 task_lock 해제: ${taskId}`);
            resolve();
          } else {
            // ✅ task_lock 해제 (실패)
            await run(`
              UPDATE task_lock
              SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
              WHERE task_type = 'youtube' AND lock_task_id = ?
            `, [taskId]);
            this.runningYoutubeUploads.delete(taskId);
            console.error(`${emoji} [${type}] ❌ Python 프로세스 실패 (exit code: ${code})`);
            console.error(`${emoji} [${type}] 📁 Video: ${videoPath}`);
            console.error(`${emoji} [${type}] 📁 Token: ${tokenPath}`);
            console.error(`${emoji} [${type}] 📁 Metadata: ${metadataPath}`);
            console.error(`${emoji} [${type}] 📋 Metadata 내용:`, JSON.stringify(metadata, null, 2));
            console.error(`${emoji} [${type}] 🔴 Python stderr:\n${errorOutput}`);
            console.error(`${emoji} [${type}] 🔓 task_lock 해제 (실패): ${taskId}`);

            await this.appendLog(taskId, type, `❌ Python 실패 (code ${code})`);
            await this.appendLog(taskId, type, `📁 Video: ${videoPath}`);
            await this.appendLog(taskId, type, `📁 Token: ${path.basename(tokenPath)}`);
            await this.appendLog(taskId, type, `🔴 stderr: ${errorOutput}`);
            appendToLogFile(taskId, 'youtube', `\n❌ Python 실패 (code ${code})`);
            appendToLogFile(taskId, 'youtube', `📁 Video: ${videoPath}`);
            appendToLogFile(taskId, 'youtube', `📁 Token: ${path.basename(tokenPath)}`);
            appendToLogFile(taskId, 'youtube', `🔴 stderr:\n${errorOutput}`);

            reject(new Error(`YouTube 업로드 실패 (exit code: ${code}). 자세한 내용은 youtube.log 확인`));
          }
        });

        pythonProcess.on('error', (error) => {
          // ✅ BTS-0000025: 락 해제 (에러)
          this.runningYoutubeUploads.delete(taskId);
          console.log(`${emoji} [${type}] 🔓 업로드 락 해제 (에러): ${taskId}`);
          reject(new Error(`Failed to start: ${error.message}`));
        });
      });

    } else {
      throw new Error(`Unknown type: ${type}`);
    }
  }

  async triggerNextStage(currentType, taskId, emoji) {
    const nextTypeMap = {
      script: 'image',
      image: 'video',
      video: 'youtube',
      youtube: null
    };

    const nextType = nextTypeMap[currentType];
    if (!nextType) {
      console.log(`${emoji} [${currentType}] Pipeline completed for: ${taskId}`);
      return false; // 다음 단계 없음
    }

    const nextEmoji = { image: '📸', video: '🎬', youtube: '📺' }[nextType];

    try {
      console.log(`⭐ [TRIGGER] Starting: ${currentType} → ${nextType} for ${taskId}`);

      // 1. content.status 설정 (표 규칙에 따라)
      // script 완료 → 'script', video 완료 → 'video', image는 변경 안 함
      if (currentType === 'script' || currentType === 'video') {
        console.log(`⭐ [TRIGGER] Updating content.status to '${currentType}'`);
        const contentResult = await run(`
          UPDATE content
          SET status = ?
          WHERE content_id = ?
        `, [currentType, taskId]);
        console.log(`⭐ [TRIGGER] content UPDATE result:`, contentResult);
      }
      // image 완료 시에는 content.status 변경 안 함 (script 상태 유지)

      // 2. task_queue의 type과 status를 다음 단계로 UPDATE
      console.log(`⭐ [TRIGGER] Updating task_queue: type='${nextType}', status='waiting'`);
      const queueResult = await run(`
        UPDATE task_queue
        SET type = ?, status = 'waiting'
        WHERE task_id = ?
      `, [nextType, taskId]);
      console.log(`⭐ [TRIGGER] task_queue UPDATE result:`, queueResult);

      console.log(`${emoji} → ${nextEmoji} [${currentType}→${nextType}] Triggered next stage for: ${taskId}`);
      return true; // 다음 단계 있음

    } catch (error) {
      console.error(`${emoji} [${currentType}] ❌ Failed to trigger next stage:`, error);
      console.error(`⭐ [TRIGGER] Error details:`, error.message);
      if (error.stack) {
        console.error(`⭐ [TRIGGER] Stack trace:`, error.stack);
      }
      // ⚠️ 에러 발생 시 false 반환하면 completed로 처리되는 버그! (BTS-0000017)
      // 에러를 throw하여 상위에서 failed로 처리되도록 함
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log('\n⏹️ Stopping unified worker...');
    this.running = false;

    // 모든 워커의 락 해제 및 처리 중인 작업 취소
    const types = ['script', 'image', 'video', 'youtube'];
    for (const type of types) {
      // 현재 처리 중인 작업을 cancelled로 변경
      if (this.workers[type].processing && this.workers[type].currentTaskId) {
        const taskId = this.workers[type].currentTaskId;
        console.log(`⚠️ [STOP] Cancelling task: ${taskId} (type: ${type})`);
        await this.updateTask(taskId, type, {
          state: 'cancelled'
        });
      }

      // 락 해제
      if (this.workers[type].hasLock) {
        await releaseLock(type, this.workerId);
        this.workers[type].hasLock = false;
      }
    }

    console.log('✅ All locks released and processing tasks cancelled');
  }
}

// 워커 실행
if (require.main === module) {
  const worker = new UnifiedWorker();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n📛 SIGINT received. Shutting down...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n📛 SIGTERM received. Shutting down...');
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch((error) => {
    console.error('❌ Worker failed:', error);
    process.exit(1);
  });
}

module.exports = UnifiedWorker;
