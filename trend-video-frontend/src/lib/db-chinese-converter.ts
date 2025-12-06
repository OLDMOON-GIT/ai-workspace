import db from './sqlite';

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export interface ChineseConverterJob {
  id: string;
  userId: string;
  title?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  videoPath?: string;
  outputPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  logs?: Array<{ timestamp: string; message: string }>;
}

// 작업 생성
export async function createChineseConverterJob(
  userId: string,
  taskId: string,
  videoPath: string,
  title?: string
): Promise<ChineseConverterJob> {
  const now = getLocalDateTime();

  const stmt = await db.prepare(`
    INSERT INTO chinese_converter_jobs (id, user_id, title, status, progress, video_path, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
  `);

  await stmt.run(taskId, userId, title || null, videoPath, now, now);

  console.log('✅ [중국영상변환 DB] 작업 생성:', taskId, title ? `제목: ${title}` : '');

  return {
    id: taskId,
    userId,
    title,
    status: 'pending',
    progress: 0,
    videoPath,
    createdAt: now,
    updatedAt: now,
    logs: []
  };
}

// 작업 조회
export async function findChineseConverterJobById(taskId: string): Promise<ChineseConverterJob | null> {
  const stmt = await db.prepare(`
    SELECT
      j.*,
      GROUP_CONCAT(jl.log_message, '|||') as log_messages,
      GROUP_CONCAT(jl.created_at, '|||') as log_timestamps
    FROM chinese_converter_jobs j
    LEFT JOIN chinese_converter_job_logs jl ON j.id = jl.job_id
    WHERE j.id = ?
    GROUP BY j.id
  `);

  const row = await stmt.get(taskId) as any;

  if (!row) {
    console.log('❌ [중국영상변환 DB] 작업 없음:', taskId);
    return null;
  }

  const logs: Array<{ timestamp: string; message: string }> = [];
  if (row.log_messages && row.log_timestamps) {
    const messages = row.log_messages.split('|||');
    const timestamps = row.log_timestamps.split('|||');
    for (let i = 0; i < messages.length; i++) {
      logs.push({
        timestamp: timestamps[i],
        message: messages[i]
      });
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    progress: row.progress,
    videoPath: row.video_path,
    outputPath: row.output_path,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    logs
  };
}

// 작업 업데이트
export async function updateChineseConverterJob(
  taskId: string,
  updates: Partial<ChineseConverterJob>
): Promise<ChineseConverterJob | null> {
  const now = getLocalDateTime();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates.outputPath !== undefined) {
    fields.push('output_path = ?');
    values.push(updates.outputPath);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(taskId);

  const stmt = await db.prepare(`
    UPDATE chinese_converter_jobs
    SET ${fields.join(', ')}
    WHERE id = ?
  `);

  const result = await stmt.run(...values);

  if (result.changes > 0) {
    console.log('✅ [중국영상변환 DB] 작업 업데이트:', taskId, updates);
  }

  return findChineseConverterJobById(taskId);
}

// 로그 추가
export async function addChineseConverterJobLog(taskId: string, logMessage: string): Promise<void> {
  const stmt = await db.prepare(`
    INSERT INTO chinese_converter_job_logs (job_id, log_message)
    VALUES (?, ?)
  `);

  await stmt.run(taskId, logMessage);
  console.log(`📝 [중국영상변환 DB] 로그 추가 [${taskId}]: ${logMessage}`);
}

// 사용자별 작업 목록 조회
export async function getChineseConverterJobsByUserId(userId: string): Promise<ChineseConverterJob[]> {
  const stmt = await db.prepare(`
    SELECT
      j.*,
      (SELECT GROUP_CONCAT(jl.log_message, '|||')
       FROM chinese_converter_job_logs jl
       WHERE jl.job_id = j.id) as log_messages,
      (SELECT GROUP_CONCAT(jl.created_at, '|||')
       FROM chinese_converter_job_logs jl
       WHERE jl.job_id = j.id) as log_timestamps
    FROM chinese_converter_jobs j
    WHERE j.user_id = ?
    ORDER BY j.created_at DESC
  `);

  const rows = await stmt.all(userId) as any[];

  console.log('📊 [중국영상변환 DB] 작업 목록 조회:', userId, '- 총', rows.length, '개');

  return rows.map(row => {
    const logs: Array<{ timestamp: string; message: string }> = [];
    if (row.log_messages && row.log_timestamps) {
      const messages = row.log_messages.split('|||');
      const timestamps = row.log_timestamps.split('|||');
      for (let i = 0; i < messages.length; i++) {
        logs.push({
          timestamp: timestamps[i],
          message: messages[i]
        });
      }
    }

    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      status: row.status,
      progress: row.progress,
      videoPath: row.video_path,
      outputPath: row.output_path,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      logs
    };
  });
}

// 작업 삭제
export async function deleteChineseConverterJob(taskId: string): Promise<boolean> {
  const stmt = await db.prepare('DELETE FROM chinese_converter_jobs WHERE id = ?');
  const result = await stmt.run(taskId);
  console.log('🗑️ [중국영상변환 DB] 작업 삭제:', taskId, '- 성공:', result.changes > 0);
  return result.changes > 0;
}
