import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as db from './mysql';
import { createContent, updateContent, addContentLog, addContentLogs } from './content';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USER_CREDIT_HISTORY_FILE = path.join(DATA_DIR, 'user_credit_history.json');
const CHARGE_REQUESTS_FILE = path.join(DATA_DIR, 'charge_requests.json');
const USER_ACTIVITY_LOGS_FILE = path.join(DATA_DIR, 'user_activity_logs.json');
const USER_SESSIONS_FILE = path.join(DATA_DIR, 'user_sessions.json');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');
const YOUTUBE_CHANNELS_FILE = path.join(DATA_DIR, 'youtube_channels.json');

// Write queue to prevent concurrent writes
let writeQueue: Promise<void> = Promise.resolve();
let logBuffer: Map<string, string[]> = new Map();
let flushTimeout: NodeJS.Timeout | null = null;

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// 데이터 디렉토리 초기화
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// 파일이 없으면 생성
async function ensureFile(filePath: string, defaultContent: string = '[]') {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, 'utf-8');
  }
}

// 사용자 타입
export interface User {
  id: string;
  email: string;
  password: string; // 해시된 비밀번호
  name: string; // 이름 (필수)
  nickname?: string; // 별명 (선택)
  phone: string; // 핸드폰번호 (필수)
  address: string; // 주소 (필수)
  kakaoId?: string; // 카카오톡 ID (선택)
  emailVerified: boolean; // 이메일 인증 여부
  emailVerificationToken?: string; // 이메일 인증 토큰
  credits: number; // 크레딧 잔액
  isAdmin: boolean; // 관리자 여부
  adminMemo?: string; // 관리자 메모
  createdAt: string;
}

// 작업 타입
export interface Job {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  error?: string;
  logs?: string[];
  createdAt: string;
  updatedAt: string;
  title?: string;
  type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info' | 'product';
  promptFormat?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';  // ⭐ 롱폼/숏폼 구분
  sourceContentId?: string; // 대본 ID (대본->영상) / 원본 컨텐츠 ID
  // ⚠️ convertedFromJobId 제거됨 - sourceContentId로 대체
  ttsVoice?: string; // TTS 음성 선택
  category?: string; // 카테고리
  youtubeUrl?: string | null; // 유튜브 URL
  youtubeUrls?: string[]; // 모든 유튜브 업로드 URL 배열
}

// 대본 타입
export interface Script {
  id: string;
  userId: string;
  title: string;
  originalTitle?: string; // 사용자가 입력한 원본 제목
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  logs?: string[]; // 진행 로그
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  createdAt: string;
  updatedAt: string;
  type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info' | 'product' | 'product-info'; // 대본 타입
  promptFormat?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info'; // type과 동일, 호환성용
  useClaudeLocal?: boolean; // 로컬 Claude 사용 여부 (true: 로컬, false/undefined: API)
  model?: string;
  productInfo?: {
    thumbnail?: string;
    product_link?: string;
    description?: string;
  }; // 상품 정보 (product, product-info 타입일 때만)
  category?: string; // 카테고리
  sourceContentId?: string; // 원본 컨텐츠 ID (변환된 대본인 경우)
}

// 비밀번호 해시
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 사용자 데이터 읽기
export async function getUsers(): Promise<User[]> {
  await ensureDataDir();
  await ensureFile(USERS_FILE);
  const data = await fs.readFile(USERS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 사용자 저장
export async function saveUsers(users: User[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// 이메일로 사용자 찾기
export async function findUserByEmail(email: string): Promise<User | null> {
  const users = await getUsers();
  return users.find(u => u.email === email) || null;
}

// 사용자 생성
export async function createUser(
  email: string,
  password: string,
  name: string,
  nickname: string | undefined,
  phone: string,
  address: string,
  kakaoId?: string
): Promise<User> {
  const users = await getUsers();

  if (users.find(u => u.email === email)) {
    throw new Error('이미 존재하는 이메일입니다.');
  }

  // 관리자 기본 계정에는 초기 200000000 크레딧을 부여
  const isAdmin = email === 'moony75@gmail.com';
  const initialCredits = isAdmin ? 200000000 : 0;

  const emailVerificationToken = isAdmin ? undefined : crypto.randomBytes(32).toString('hex');
  const emailVerified = isAdmin;

  const user: User = {
    id: crypto.randomUUID(),
    email,
    password: hashPassword(password),
    name,
    nickname: nickname?.trim() || undefined,
    phone,
    address,
    kakaoId,
    emailVerified,
    emailVerificationToken,
    credits: initialCredits,
    isAdmin: isAdmin,
    createdAt: getLocalDateTime()
  };

  users.push(user);
  await saveUsers(users);

  return user;
}

export async function findUserById(userId: string): Promise<User | null> {
  const users = await getUsers();
  return users.find(u => u.id === userId) || null;
}

// 이메일 인증
export async function verifyEmail(token: string): Promise<{ success: boolean; email?: string }> {
  const users = await getUsers();
  const user = users.find(u => u.emailVerificationToken === token);

  if (!user) {
    return { success: false };
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  await saveUsers(users);

  return { success: true, email: user.email };
}

// 사용자 업데이트
export async function updateUser(userId: string, updates: Partial<User>): Promise<void> {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  users[userIndex] = { ...users[userIndex], ...updates };
  await saveUsers(users);
}

export async function deleteUserById(userId: string): Promise<void> {
  const users = await getUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) {
    return;
  }

  users.splice(index, 1);
  await saveUsers(users);
}


// ==================== SQLite Job 함수들 ====================

// 작업 생성 (⭐ content 테이블 사용)
export async function createJob(userId: string, taskId: string, title?: string, promptFormat?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info', sourceContentId?: string, ttsVoice?: string, category?: string): Promise<Job> {
  // ⭐ content 테이블에 저장 (v3: type 제거됨)
  const content = await createContent(userId, title || 'Untitled', {
    id: taskId,
    promptFormat,
    sourceContentId,
    ttsVoice,
    category
  });

  // Job 형식으로 변환하여 반환 (하위 호환성)
  return {
    id: content.id,
    userId: content.userId,
    status: content.status as any,
    progress: content.progress,
    step: '준비 중...',
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    title: content.title,
    type: content.promptFormat as 'longform' | 'shortform' | 'sora2' | undefined,
    sourceContentId: content.sourceContentId,
    ttsVoice: content.ttsVoice
  };
}

// 작업 조회 (⭐ content 테이블 사용)
export async function findJobById(taskId: string): Promise<Job | null> {
  // MySQL: db.getOne 사용 (db.prepare는 SQLite 문법)
  const row = await db.getOne(`
    SELECT c.*, q.type as queue_type
    FROM content c
    LEFT JOIN task_queue q ON c.content_id = q.task_id
    WHERE c.content_id = ?
  `, [taskId]) as any;

  if (!row) return null;

  // 로그는 파일에서 읽기
  const { getContentLogs, calculateProgress } = require('./content');

  // ⭐ video_path와 thumbnail_path를 폴더에서 직접 탐색 (DB 의존 제거)
  let videoPath: string | undefined = undefined;
  let thumbnailPath: string | undefined = undefined;
  try {
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolder = path.join(backendPath, 'tasks', taskId);
    if (fsSync.existsSync(taskFolder)) {
      const files = fsSync.readdirSync(taskFolder);
      // 비디오 파일 찾기 (숫자파일 01.mp4 등 제외)
      const mp4Files = files.filter(f =>
        f.endsWith('.mp4') &&
        !f.startsWith('scene_') &&
        !f.includes('_audio') &&
        !/^\d+\.mp4$/i.test(f)
      );
      const videoFile = mp4Files.length > 0 ? mp4Files.reduce((largest, f) => {
        try {
          const fSize = fsSync.statSync(path.join(taskFolder, f)).size;
          const lSize = fsSync.statSync(path.join(taskFolder, largest)).size;
          return fSize > lSize ? f : largest;
        } catch { return largest; }
      }, mp4Files[0]) : undefined;
      if (videoFile) {
        videoPath = path.join(taskFolder, videoFile);
      }
      // 썸네일 파일 찾기
      const thumbnailFile = files.find(f =>
        f.startsWith('thumbnail') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      );
      if (thumbnailFile) {
        thumbnailPath = path.join(taskFolder, thumbnailFile);
      }
    }
  } catch (e) {
    // 폴더 탐색 실패 시 무시
  }

  // ⭐ 여러 채널에 업로드한 경우 모든 URL 조회
  const youtubeUrls = await getYouTubeUrlsByTaskId(taskId);

  // ⭐ 큐 타입에 따른 step 표시
  const stepNames: Record<string, string> = {
    'schedule': '스케줄 대기',
    'script': '대본 생성 중',
    'image': '이미지 생성 중',
    'video': '영상 제작 중',
    'youtube': '유튜브 업로드 중'
  };

  // Job 형식으로 변환 (하위 호환성)
  return {
    id: row.content_id,
    userId: row.user_id,
    status: row.status,
    progress: calculateProgress(row.status, row.queue_type, row.content_id),  // ⭐ 로그 기반 실시간 계산
    step: stepNames[row.queue_type] || '',  // ⭐ 큐 타입으로 step 표시
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    videoPath,
    thumbnailPath,
    error: row.error,
    logs: getContentLogs(taskId),
    type: row.prompt_format || row.ai_model,  // ⭐ prompt_format 우선 (shortform/longform)
    promptFormat: row.prompt_format,  // ⭐ 롱폼/숏폼 구분용
    sourceContentId: row.source_content_id,
    // ⚠️ convertedFromJobId 제거됨 - sourceContentId로 대체
    // ⚠️ prompt (content 컬럼) 제거됨 - tasks/{id}/story.json에서 읽음
    youtubeUrl: row.youtube_url || null,  // 단일 URL (호환성)
    youtubeUrls  // ⭐ 모든 유튜브 업로드 URL 배열
  };
}

// 작업 업데이트 (⭐ content 테이블 사용)
export async function updateJob(taskId: string, updates: Partial<Job>): Promise<Job | null> {
  const { calculateProgress } = require('./content');

  // ⭐ content 테이블 업데이트 (v3: type 제거됨)
  // ⚠️ videoPath, progress는 더 이상 DB에 저장하지 않음 (계산)
  const content = await updateContent(taskId, {
    status: updates.status as any,
    // progress 제거 - DB에 저장하지 않음
    error: updates.error
  });

  if (!content) return null;

  // Job 형식으로 변환하여 반환 (하위 호환성)
  return {
    id: content.id,
    userId: content.userId,
    status: content.status as any,
    progress: calculateProgress(content.status),  // ⭐ DB 저장 없이 계산
    step: updates.step || '',  // step은 contents에 없으므로 업데이트 값 사용
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    title: content.title,
    videoPath: content.videoPath,
    thumbnailPath: content.thumbnailPath,
    error: content.error,
    type: content.promptFormat as 'longform' | 'shortform' | 'sora2' | undefined,
    sourceContentId: content.sourceContentId,
    ttsVoice: content.ttsVoice
  };
}

// 비디오 로그 추가 (⭐ 파일 기반: tasks/{taskId}/video.log)
export async function addVideoLog(taskId: string, logMessage: string): Promise<void> {
  addContentLog(taskId, logMessage, 'video');
}

// 비디오 로그 일괄 추가 (⭐ 파일 기반: tasks/{taskId}/video.log)
export async function addVideoLogs(taskId: string, logs: string[]): Promise<void> {
  for (const log of logs) {
    addContentLog(taskId, log, 'video');
  }
}

// 사용자별 작업 목록 조회 (⭐ content 테이블 사용)
// ⚠️ video_path IS NOT NULL 조건 제거 - 폴더에서 직접 탐색
// BTS-3374: status 조건 수정 - video, completed, failed, cancelled 포함 (영상 관련 상태)
// 주의: pending, processing은 영상 관련 큐 타입(image, video, youtube)일 때만 포함
export async function getJobsByUserId(userId: string, limit: number = 10, offset: number = 0): Promise<Job[]> {
  // MySQL: db.getAll 사용 (db.prepare는 SQLite 문법)
  // BTS-3374: 영상 관련 상태 조회
  // - video, completed, failed, cancelled: 영상 관련 완료 상태 (무조건 포함)
  // - pending, processing: 영상 관련 큐 타입(image, video, youtube)일 때만 포함
  const rows = await db.getAll(`
    SELECT c.*, q.type as queue_type
    FROM content c
    LEFT JOIN task_queue q ON c.content_id = q.task_id
    WHERE c.user_id = ?
      AND (
        c.status IN ('video', 'completed', 'failed', 'cancelled')
        OR (c.status IN ('pending', 'processing') AND (q.type IS NULL OR q.type IN ('image', 'video', 'youtube')))
      )
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]) as any[];
  const { getContentLogs, calculateProgress } = require('./content');
  const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

  // ⭐ 큐 타입에 따른 step 표시
  const stepNames: Record<string, string> = {
    'schedule': '스케줄 대기',
    'script': '대본 생성 중',
    'image': '이미지 생성 중',
    'video': '영상 제작 중',
    'youtube': '유튜브 업로드 중'
  };

  return Promise.all(rows.map(async row => {
    // ⭐ video_path와 thumbnail_path를 폴더에서 직접 탐색
    let videoPath: string | undefined = undefined;
    let thumbnailPath: string | undefined = undefined;
    try {
      const taskFolder = path.join(backendPath, 'tasks', row.content_id);
      if (fsSync.existsSync(taskFolder)) {
        const files = fsSync.readdirSync(taskFolder);
        // 비디오 파일 찾기 (숫자파일 01.mp4 등 제외)
        const mp4Files = files.filter((f: string) =>
          f.endsWith('.mp4') &&
          !f.startsWith('scene_') &&
          !f.includes('_audio') &&
          !/^\d+\.mp4$/i.test(f)
        );
        const videoFile = mp4Files.length > 0 ? mp4Files.reduce((largest: string, f: string) => {
          try {
            const fSize = fsSync.statSync(path.join(taskFolder, f)).size;
            const lSize = fsSync.statSync(path.join(taskFolder, largest)).size;
            return fSize > lSize ? f : largest;
          } catch { return largest; }
        }, mp4Files[0]) : undefined;
        if (videoFile) {
          videoPath = path.join(taskFolder, videoFile);
        }
        // 썸네일 파일 찾기
        const thumbnailFile = files.find((f: string) =>
          f.startsWith('thumbnail') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
        );
        if (thumbnailFile) {
          thumbnailPath = path.join(taskFolder, thumbnailFile);
        }
      }
    } catch (e) {}

    // ⭐ 여러 채널에 업로드한 경우 모든 URL 조회
    const youtubeUrls = await getYouTubeUrlsByTaskId(row.content_id);

    return {
      id: row.content_id,
      userId: row.user_id,
      status: row.status,
      progress: calculateProgress(row.status, row.queue_type, row.content_id),  // ⭐ 로그 기반 실시간 계산
      step: stepNames[row.queue_type] || '',  // ⭐ 큐 타입으로 step 표시
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      title: row.title,
      videoPath,
      thumbnailPath,
      error: row.error,
      logs: getContentLogs(row.content_id),
      type: row.prompt_format, // Changed to use prompt_format for job.type
      promptFormat: row.prompt_format,  // ⭐ 롱폼/숏폼 구분용
      sourceContentId: row.source_content_id,
      // ⚠️ convertedFromJobId 제거됨 - sourceContentId로 대체
      category: row.category,
      youtubeUrl: row.youtube_url || null,  // 단일 URL (호환성)
      youtubeUrls  // ⭐ 모든 유튜브 업로드 URL 배열
    };
  }));
}

// 진행 중인 작업 목록 (⭐ content 테이블 사용)
// ⚠️ video_path IS NOT NULL 조건 제거 - 폴더에서 직접 탐색
// BTS-3374: 영상 관련 큐 타입(image, video, youtube)만 조회 (script 제외)
export async function getActiveJobsByUserId(userId: string): Promise<Job[]> {
  // MySQL: db.getAll 사용 (db.prepare는 SQLite 문법)
  // BTS-3374: pending/processing 상태 중 영상 관련 작업만 조회
  // - q.type IS NULL: task_queue 없이 생성된 작업 (레거시)
  // - q.type IN ('image', 'video', 'youtube'): 영상 관련 단계
  const rows = await db.getAll(`
    SELECT c.*, q.type as queue_type
    FROM content c
    LEFT JOIN task_queue q ON c.content_id = q.task_id
    WHERE c.user_id = ? AND (c.status = 'pending' OR c.status = 'processing')
      AND (q.type IS NULL OR q.type IN ('image', 'video', 'youtube'))
    ORDER BY c.created_at DESC
  `, [userId]) as any[];
  const { getContentLogs, calculateProgress } = require('./content');
  const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

  // ⭐ 큐 타입에 따른 step 표시
  const stepNames: Record<string, string> = {
    'schedule': '스케줄 대기',
    'script': '대본 생성 중',
    'image': '이미지 생성 중',
    'video': '영상 제작 중',
    'youtube': '유튜브 업로드 중'
  };

  return Promise.all(rows.map(async row => {
    // ⭐ video_path와 thumbnail_path를 폴더에서 직접 탐색
    let videoPath: string | undefined = undefined;
    let thumbnailPath: string | undefined = undefined;
    try {
      const taskFolder = path.join(backendPath, 'tasks', row.content_id);
      if (fsSync.existsSync(taskFolder)) {
        const files = fsSync.readdirSync(taskFolder);
        // 비디오 파일 찾기 (숫자파일 01.mp4 등 제외)
        const mp4Files = files.filter((f: string) =>
          f.endsWith('.mp4') &&
          !f.startsWith('scene_') &&
          !f.includes('_audio') &&
          !/^\d+\.mp4$/i.test(f)
        );
        const videoFile = mp4Files.length > 0 ? mp4Files.reduce((largest: string, f: string) => {
          try {
            const fSize = fsSync.statSync(path.join(taskFolder, f)).size;
            const lSize = fsSync.statSync(path.join(taskFolder, largest)).size;
            return fSize > lSize ? f : largest;
          } catch { return largest; }
        }, mp4Files[0]) : undefined;
        if (videoFile) {
          videoPath = path.join(taskFolder, videoFile);
        }
        // 썸네일 파일 찾기
        const thumbnailFile = files.find((f: string) =>
          f.startsWith('thumbnail') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
        );
        if (thumbnailFile) {
          thumbnailPath = path.join(taskFolder, thumbnailFile);
        }
      }
    } catch (e) {}

    // ⭐ 여러 채널에 업로드한 경우 모든 URL 조회
    const youtubeUrls = await getYouTubeUrlsByTaskId(row.content_id);

    return {
      id: row.content_id,
      userId: row.user_id,
      status: row.status,
      progress: calculateProgress(row.status, row.queue_type, row.content_id),  // ⭐ 로그 기반 실시간 계산
      step: stepNames[row.queue_type] || '',  // ⭐ 큐 타입으로 step 표시
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      title: row.title,
      videoPath,
      thumbnailPath,
      error: row.error,
      logs: getContentLogs(row.content_id),
      type: row.prompt_format, // Changed to use prompt_format for job.type
      sourceContentId: row.source_content_id,
      // ⚠️ convertedFromJobId 제거됨 - sourceContentId로 대체
      category: row.category,
      promptFormat: row.prompt_format,  // ⭐ 롱폼/숏폼 구분용
      youtubeUrl: row.youtube_url || null,  // 단일 URL (호환성)
      youtubeUrls  // ⭐ 모든 유튜브 업로드 URL 배열
    };
  }));
}

// 작업 삭제 (⭐ content 테이블 사용)
export async function deleteJob(taskId: string): Promise<boolean> {
  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  const result = await db.run('DELETE FROM content WHERE content_id = ?', [taskId]);
  return result.changes > 0;
}

// 오래된 작업 삭제 (30일 이상 지난 완료/실패 작업) (⭐ content 테이블 사용)
// ⚠️ video_path 컬럼 없음 - 경로는 task_id에서 계산됨 (getTaskPaths 함수)
export async function deleteOldJobs(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const cutoffIso = `${cutoffDate.getFullYear()}-${pad(cutoffDate.getMonth() + 1)}-${pad(cutoffDate.getDate())} ${pad(cutoffDate.getHours())}:${pad(cutoffDate.getMinutes())}:${pad(cutoffDate.getSeconds())}`;

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  const result = await db.run(`
    DELETE FROM content
    WHERE (status = 'completed' OR status = 'failed')
    AND updated_at < ?
  `, [cutoffIso]);

  if (result.changes > 0) {
    console.log(`🗑️  오래된 작업 ${result.changes}개 삭제 (${daysToKeep}일 이전)`);
  }

  return result.changes;
}

// 즉시 로그 플러시 (호환성을 위해 빈 함수로 유지)
export async function flushJobLogs(): Promise<void> {
  // SQLite는 즉시 쓰기이므로 플러시 불필요
}

// ==================== 크레딧 시스템 ====================

// 크레딧 설정 타입
export interface CreditSettings {
  aiScriptCost: number; // AI 대본 생성 비용
  videoGenerationCost: number; // 영상 생성 비용
  scriptGenerationCost?: number; // 대본 재생성 비용 (선택적)
}

// 크레딧 히스토리 타입
export interface CreditHistory {
  id: string;
  userId: string;
  type: 'charge' | 'use' | 'refund'; // 충전, 사용, 환불
  amount: number; // 양수: 증가, 음수: 감소
  balance: number; // 거래 후 잔액
  description: string; // 설명 (예: "영상 생성", "크레딧 충전")
  createdAt: string;
}

// 기본 크레딧 설정
const DEFAULT_SETTINGS: CreditSettings = {
  aiScriptCost: 50,
  videoGenerationCost: 40
};

// 설정 읽기
export async function getSettings(): Promise<CreditSettings> {
  await ensureDataDir();
  await ensureFile(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 설정 저장
export async function saveSettings(settings: CreditSettings): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// 사용자 크레딧 추가
export async function addCredits(userId: string, amount: number): Promise<User | null> {
  const users = await getUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) return null;

  users[index].credits = (users[index].credits || 0) + amount;
  await saveUsers(users);

  return users[index];
}

// 사용자 크레딧 차감
export async function deductCredits(userId: string, amount: number): Promise<{ success: boolean; balance: number; error?: string }> {
  const users = await getUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) {
    return { success: false, balance: 0, error: '사용자를 찾을 수 없습니다.' };
  }

  const currentBalance = users[index].credits || 0;

  if (currentBalance < amount) {
    return { success: false, balance: currentBalance, error: '크레딧이 부족합니다.' };
  }

  users[index].credits = currentBalance - amount;
  await saveUsers(users);

  return { success: true, balance: users[index].credits };
}

// 사용자 크레딧 조회
export async function getUserCredits(userId: string): Promise<number> {
  const users = await getUsers();
  const user = users.find(u => u.id === userId);
  return user?.credits || 0;
}

// 이메일로 크레딧 추가
export async function addCreditsByEmail(email: string, amount: number): Promise<User | null> {
  const users = await getUsers();
  const index = users.findIndex(u => u.email === email);

  if (index === -1) return null;

  users[index].credits = (users[index].credits || 0) + amount;
  await saveUsers(users);

  return users[index];
}

// ==================== 크레딧 히스토리 ====================

// 히스토리 읽기
export async function getCreditHistory(): Promise<CreditHistory[]> {
  await ensureDataDir();
  await ensureFile(USER_CREDIT_HISTORY_FILE);
  const data = await fs.readFile(USER_CREDIT_HISTORY_FILE, 'utf-8');
  return JSON.parse(data);
}

// 히스토리 저장
export async function saveCreditHistory(history: CreditHistory[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USER_CREDIT_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

// 히스토리 추가
export async function addCreditHistory(
  userId: string,
  type: 'charge' | 'use' | 'refund',
  amount: number,
  description: string
): Promise<CreditHistory> {
  const history = await getCreditHistory();
  const currentBalance = await getUserCredits(userId);

  const record: CreditHistory = {
    id: crypto.randomUUID(),
    userId,
    type,
    amount,
    balance: currentBalance,
    description,
    createdAt: getLocalDateTime()
  };

  history.push(record);
  await saveCreditHistory(history);

  return record;
}

// 사용자별 히스토리 조회
export async function getCreditHistoryByUserId(userId: string): Promise<CreditHistory[]> {
  const history = await getCreditHistory();
  return history
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ==================== 크레딧 충전 요청 ====================

// 충전 요청 타입
export interface ChargeRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number; // 요청 크레딧 금액
  status: 'pending' | 'approved' | 'rejected'; // 대기중, 승인됨, 거부됨
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string; // 승인한 관리자 이메일
  rejectedAt?: string;
  rejectedBy?: string; // 거부한 관리자 이메일
  memo?: string; // 관리자 메모
}

// 충전 요청 읽기
export async function getChargeRequests(): Promise<ChargeRequest[]> {
  await ensureDataDir();
  await ensureFile(CHARGE_REQUESTS_FILE);
  const data = await fs.readFile(CHARGE_REQUESTS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 충전 요청 저장
export async function saveChargeRequests(requests: ChargeRequest[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CHARGE_REQUESTS_FILE, JSON.stringify(requests, null, 2), 'utf-8');
}

// 충전 요청 생성
export async function createChargeRequest(userId: string, amount: number): Promise<ChargeRequest> {
  const users = await getUsers();
  const user = users.find(u => u.id === userId);

  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const requests = await getChargeRequests();

  const request: ChargeRequest = {
    id: crypto.randomUUID(),
    userId,
    userName: user.name,
    userEmail: user.email,
    amount,
    status: 'pending',
    createdAt: getLocalDateTime()
  };

  requests.push(request);
  await saveChargeRequests(requests);

  return request;
}

// 충전 요청 승인
export async function approveChargeRequest(requestId: string, adminEmail: string): Promise<ChargeRequest | null> {
  const requests = await getChargeRequests();
  const index = requests.findIndex(r => r.id === requestId);

  if (index === -1) return null;

  const request = requests[index];

  if (request.status !== 'pending') {
    throw new Error('이미 처리된 요청입니다.');
  }

  // 크레딧 부여
  await addCredits(request.userId, request.amount);

  // 히스토리 추가
  await addCreditHistory(
    request.userId,
    'charge',
    request.amount,
    `충전 요청 승인 (관리자: ${adminEmail})`
  );

  // 요청 상태 업데이트
  requests[index].status = 'approved';
  requests[index].approvedAt = getLocalDateTime();
  requests[index].approvedBy = adminEmail;

  await saveChargeRequests(requests);

  return requests[index];
}

// 충전 요청 거부
export async function rejectChargeRequest(requestId: string, adminEmail: string, memo?: string): Promise<ChargeRequest | null> {
  const requests = await getChargeRequests();
  const index = requests.findIndex(r => r.id === requestId);

  if (index === -1) return null;

  const request = requests[index];

  if (request.status !== 'pending') {
    throw new Error('이미 처리된 요청입니다.');
  }

  // 요청 상태 업데이트
  requests[index].status = 'rejected';
  requests[index].rejectedAt = getLocalDateTime();
  requests[index].rejectedBy = adminEmail;
  if (memo) requests[index].memo = memo;

  await saveChargeRequests(requests);

  return requests[index];
}

// 사용자별 충전 요청 조회
export async function getChargeRequestsByUserId(userId: string): Promise<ChargeRequest[]> {
  const requests = await getChargeRequests();
  return requests
    .filter(r => r.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ==================== 사용자 활동 로그 ====================

// 활동 로그 타입
export interface UserActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string; // 액션 타입 (예: 'login', 'logout', 'generate_video', 'search_youtube', etc.)
  details?: string; // 상세 정보
  ipAddress?: string; // IP 주소
  userAgent?: string; // User Agent
  createdAt: string;
}

// 사용자 세션 타입
export interface UserSession {
  id: string;
  userId: string;
  userEmail: string;
  loginAt: string;
  lastActivityAt: string;
  logoutAt?: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean; // 현재 활성 세션 여부
}

// 활동 로그 읽기
export async function getUserActivityLogs(): Promise<UserActivityLog[]> {
  await ensureDataDir();
  await ensureFile(USER_ACTIVITY_LOGS_FILE);
  const data = await fs.readFile(USER_ACTIVITY_LOGS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 활동 로그 저장
export async function saveUserActivityLogs(logs: UserActivityLog[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USER_ACTIVITY_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
}

// 활동 로그 추가
export async function addUserActivityLog(
  userId: string,
  userEmail: string,
  action: string,
  details?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<UserActivityLog> {
  const logs = await getUserActivityLogs();

  const log: UserActivityLog = {
    id: crypto.randomUUID(),
    userId,
    userEmail,
    action,
    details,
    ipAddress,
    userAgent,
    createdAt: getLocalDateTime()
  };

  logs.push(log);
  await saveUserActivityLogs(logs);

  return log;
}

// 사용자별 활동 로그 조회
export async function getUserActivityLogsByUserId(userId: string, limit?: number): Promise<UserActivityLog[]> {
  const logs = await getUserActivityLogs();
  const filtered = logs
    .filter(l => l.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return limit ? filtered.slice(0, limit) : filtered;
}

// 모든 활동 로그 조회 (관리자용, 최신순)
export async function getAllUserActivityLogs(limit?: number): Promise<UserActivityLog[]> {
  const logs = await getUserActivityLogs();
  const sorted = logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return limit ? sorted.slice(0, limit) : sorted;
}

// ==================== 사용자 세션 ====================

// 세션 읽기
export async function getUserSessions(): Promise<UserSession[]> {
  await ensureDataDir();
  await ensureFile(USER_SESSIONS_FILE);
  const data = await fs.readFile(USER_SESSIONS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 세션 저장
export async function saveUserSessions(sessions: UserSession[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USER_SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

// 세션 생성 (로그인 시)
export async function createUserSession(
  userId: string,
  userEmail: string,
  ipAddress?: string,
  userAgent?: string
): Promise<UserSession> {
  const sessions = await getUserSessions();

  const session: UserSession = {
    id: crypto.randomUUID(),
    userId,
    userEmail,
    loginAt: getLocalDateTime(),
    lastActivityAt: getLocalDateTime(),
    ipAddress,
    userAgent,
    isActive: true
  };

  sessions.push(session);
  await saveUserSessions(sessions);

  return session;
}

// 세션 업데이트 (활동 시간 갱신)
export async function updateUserSessionActivity(sessionId: string): Promise<UserSession | null> {
  const sessions = await getUserSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index === -1) return null;

  sessions[index].lastActivityAt = getLocalDateTime();
  await saveUserSessions(sessions);

  return sessions[index];
}

// 세션 종료 (로그아웃 시)
export async function endUserSession(sessionId: string): Promise<UserSession | null> {
  const sessions = await getUserSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index === -1) return null;

  sessions[index].logoutAt = getLocalDateTime();
  sessions[index].isActive = false;
  await saveUserSessions(sessions);

  return sessions[index];
}

// 사용자의 활성 세션 조회
export async function getActiveSessionsByUserId(userId: string): Promise<UserSession[]> {
  const sessions = await getUserSessions();
  return sessions
    .filter(s => s.userId === userId && s.isActive)
    .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());
}

// 사용자의 모든 세션 조회
export async function getSessionsByUserId(userId: string): Promise<UserSession[]> {
  const sessions = await getUserSessions();
  return sessions
    .filter(s => s.userId === userId)
    .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());
}

// 모든 활성 세션 조회 (관리자용)
export async function getAllActiveSessions(): Promise<UserSession[]> {
  const sessions = await getUserSessions();
  return sessions
    .filter(s => s.isActive)
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
}

// 세션 통계 (사용자별 총 활동 시간 계산)
export async function getUserSessionStats(userId: string): Promise<{
  totalSessions: number;
  totalActiveTime: number; // 밀리초
  averageSessionTime: number; // 밀리초
  lastLoginAt?: string;
}> {
  const sessions = await getSessionsByUserId(userId);

  let totalActiveTime = 0;

  for (const session of sessions) {
    const start = new Date(session.loginAt).getTime();
    const end = session.logoutAt
      ? new Date(session.logoutAt).getTime()
      : new Date(session.lastActivityAt).getTime();

    totalActiveTime += (end - start);
  }

  return {
    totalSessions: sessions.length,
    totalActiveTime,
    averageSessionTime: sessions.length > 0 ? totalActiveTime / sessions.length : 0,
    lastLoginAt: sessions.length > 0 ? sessions[0].loginAt : undefined
  };
}

// ==================== 대본 관리 (SQLite) - content 테이블 사용 ====================

// 대본 생성 (초기 pending 상태) - content 테이블에 저장
export async function createScript(
  userId: string,
  title: string,
  content: string = '', // 초기에는 빈 문자열
  tokenUsage?: { input_tokens: number; output_tokens: number },
  originalTitle?: string, // 사용자가 입력한 원본 제목
  format?: 'longform' | 'shortform' | 'sora2' | 'product', // 포맷 타입
  category?: string // 카테고리 (대본 스타일)
): Promise<Script> {
  // content 테이블의 createContent 사용
  const { createContent } = require('./content');

  console.log('📝 createScript 호출 - format:', format, 'category:', category);

  const contentRecord = createContent(
    userId,
    title,
    {
      promptFormat: format || 'longform', // 포맷 전달
      originalTitle: originalTitle || title,
      content: content,
      tokenUsage: tokenUsage,
      useClaudeLocal: false, // API Claude 사용
      category: category // 카테고리 전달
    }
  );

  // Script 타입으로 변환하여 반환 (하위 호환성)
  const script: Script = {
    id: contentRecord.id,
    userId: contentRecord.userId,
    title: contentRecord.title,
    originalTitle: contentRecord.originalTitle,
    content: contentRecord.content || '',
    status: contentRecord.status,
    progress: contentRecord.progress,
    tokenUsage: contentRecord.tokenUsage,
    type: contentRecord.promptFormat, // promptFormat을 type으로 매핑
    createdAt: contentRecord.createdAt,
    updatedAt: contentRecord.updatedAt
  };

  console.log('📝 createScript 반환 - script.type:', script.type);

  return script;
}

// 대본 업데이트 - content 테이블 사용 (type='script')
export async function updateScript(
  scriptId: string,
  updates: Partial<Pick<Script, 'status' | 'progress' | 'content' | 'error' | 'tokenUsage' | 'logs'>>
): Promise<Script | null> {
  // content 테이블의 updateContent, addContentLogs 사용
  const { updateContent, addContentLogs } = require('./content');

  // logs가 있으면 별도로 저장 (v3: type 제거됨)
  if (updates.logs && updates.logs.length > 0) {
    addContentLogs(scriptId, updates.logs);
  }

  // 나머지 필드 업데이트
  const contentUpdates: any = {};
  if (updates.status !== undefined) contentUpdates.status = updates.status;
  if (updates.progress !== undefined) contentUpdates.progress = updates.progress;
  if (updates.content !== undefined) contentUpdates.content = updates.content;
  if (updates.error !== undefined) contentUpdates.error = updates.error;
  if (updates.tokenUsage !== undefined) contentUpdates.tokenUsage = updates.tokenUsage;

  // 업데이트 (v3: type 제거됨)
  const contentRecord = updateContent(scriptId, contentUpdates);

  if (!contentRecord) return null;

  // Script 타입으로 변환하여 반환 (하위 호환성)
  const script: Script = {
    id: contentRecord.id,
    userId: contentRecord.userId,
    title: contentRecord.title,
    originalTitle: contentRecord.originalTitle,
    content: contentRecord.content || '',
    status: contentRecord.status,
    progress: contentRecord.progress,
    error: contentRecord.error,
    logs: contentRecord.logs,
    tokenUsage: contentRecord.tokenUsage,
    createdAt: contentRecord.createdAt,
    updatedAt: contentRecord.updatedAt
  };

  return script;
}

// 사용자별 대본 목록 조회 (⭐ content 테이블 사용 - 모든 콘텐츠)
export async function getScriptsByUserId(userId: string): Promise<Script[]> {
  // MySQL: db.getAll 사용 (db.prepare는 SQLite 문법)
  const rows = await db.getAll(`
    SELECT c.*
    FROM content c
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `, [userId]) as any[];
  const { getContentLogs } = require('./content');

  return rows.map(row => {
    return {
      id: row.content_id,
      userId: row.user_id,
      title: row.title,
      originalTitle: row.original_title,
      content: row.content || '',
      status: row.status || 'completed',
      progress: row.progress ?? 100,
      error: row.error,
      type: row.ai_model, // ai_model 사용
      logs: getContentLogs(row.content_id),
      tokenUsage: row.token_usage ? JSON.parse(row.token_usage) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    };
  });
}

// 대본 ID로 찾기 - content 테이블 사용
export async function findScriptById(scriptId: string): Promise<Script | null> {
  const { findContentById } = require('./content');

  const contentRecord = findContentById(scriptId);
  if (!contentRecord || contentRecord.type !== 'script') return null;

  // Script 타입으로 변환하여 반환 (하위 호환성)
  const script: Script = {
    id: contentRecord.id,
    userId: contentRecord.userId,
    title: contentRecord.title,
    originalTitle: contentRecord.originalTitle,
    content: contentRecord.content || '',
    status: contentRecord.status,
    progress: contentRecord.progress,
    error: contentRecord.error,
    logs: contentRecord.logs,
    tokenUsage: contentRecord.tokenUsage,
    createdAt: contentRecord.createdAt,
    updatedAt: contentRecord.updatedAt
  };

  return script;
}

// scripts_temp 제거됨 - content 테이블만 사용
export async function findScriptTempById(scriptId: string): Promise<any | null> {
  // scripts_temp 테이블이 제거되어 항상 null 반환
  // content 테이블에서 찾으려면 findScriptById 사용
  return null;
}

// 대본 삭제 (⭐ content 테이블 사용)
export async function deleteScript(scriptId: string): Promise<boolean> {
  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  const result = await db.run('DELETE FROM content WHERE content_id = ?', [scriptId]);
  return result.changes > 0;
}

// ==================== 작업 관리 (Tasks) ====================

// Task 타입
export interface Task {
  id: string;
  content: string;
  status: 'todo' | 'ing' | 'done';
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  logs?: string[];
}

// Task 생성
export async function createTask(content: string, priority: number = 0): Promise<Task> {
  const taskId = crypto.randomUUID();
  const now = getLocalDateTime();

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  await db.run(`
    INSERT INTO task (task_id, content, status, priority, created_at, updated_at)
    VALUES (?, ?, 'todo', ?, ?, ?)
  `, [taskId, content, priority, now, now]);

  return {
    id: taskId,
    content,
    status: 'todo',
    priority,
    createdAt: now,
    updatedAt: now
  };
}

// 모든 Task 조회 (status별 정렬)
export async function getAllTasks(): Promise<Task[]> {
  // MySQL: db.getAll 사용 (db.prepare는 SQLite 문법)
  const rows = await db.getAll(`
    SELECT
      task_id as id, content, status, priority,
      created_at as createdAt,
      updated_at as updatedAt,
      completed_at as completedAt
    FROM task
    ORDER BY
      CASE status
        WHEN 'ing' THEN 1
        WHEN 'todo' THEN 2
        WHEN 'done' THEN 3
      END,
      priority DESC,
      created_at DESC
  `) as any[];

  const { getContentLogs } = require('./content');

  return rows.map(row => {
    // logs 가져오기 (파일 기반)
    const logs = getContentLogs(row.id);

    return {
      id: row.id,
      content: row.content,
      status: row.status,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
      logs: logs.length > 0 ? logs : undefined
    };
  });
}

// Task ID로 찾기
export async function findTaskById(taskId: string): Promise<Task | null> {
  // MySQL: db.getOne 사용 (db.prepare는 SQLite 문법)
  const row = await db.getOne(`
    SELECT
      task_id as id, content, status, priority,
      created_at as createdAt,
      updated_at as updatedAt,
      completed_at as completedAt
    FROM task
    WHERE task_id = ?
  `, [taskId]) as any;
  if (!row) return null;

  // logs 가져오기 (파일 기반)
  const { getContentLogs } = require('./content');
  const logs = getContentLogs(taskId);

  return {
    id: row.id,
    content: row.content,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    logs: logs.length > 0 ? logs : undefined
  };
}

// Task 업데이트
export async function updateTask(taskId: string, updates: Partial<Pick<Task, 'content' | 'status' | 'priority'>>): Promise<Task | null> {
  const now = getLocalDateTime();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);

    // done으로 변경되면 완료 시간 기록
    if (updates.status === 'done') {
      fields.push('completed_at = ?');
      values.push(now);
    }
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(taskId);

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  await db.run(`
    UPDATE task
    SET ${fields.join(', ')}
    WHERE task_id = ?
  `, values);

  return findTaskById(taskId);
}

// Task 로그 추가 (파일 기반)
export async function addTaskLog(taskId: string, logMessage: string): Promise<void> {
  const { addContentLog } = require('./content');
  addContentLog(taskId, logMessage, 'script');
}

// DEPRECATED: Use content.ts addContentLog instead
export async function addScriptLog(scriptId: string, logMessage: string): Promise<void> {
  // No longer used - scripts are now managed in contents table
  console.warn('addScriptLog is deprecated, use addContentLog from content.ts');
}

// Task 삭제
export async function deleteTask(taskId: string): Promise<boolean> {
  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  const result = await db.run('DELETE FROM task WHERE task_id = ?', [taskId]);
  return result.changes > 0;
}

// ============================================
// YouTube 채널 관리
// ============================================

export interface YouTubeChannel {
  id: string;
  userId: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl?: string;
  tokenFile?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

// YouTube 채널 목록 읽기
export async function getYouTubeChannels(): Promise<YouTubeChannel[]> {
  await ensureDataDir();
  await ensureFile(YOUTUBE_CHANNELS_FILE, '[]');
  const data = await fs.readFile(YOUTUBE_CHANNELS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 사용자의 YouTube 채널 목록 가져오기
export async function getUserYouTubeChannels(userId: string): Promise<YouTubeChannel[]> {
  const channels = await getYouTubeChannels();
  return channels.filter(ch => ch.userId === userId);
}

// YouTube 채널 추가
export async function addYouTubeChannel(channel: Omit<YouTubeChannel, 'id' | 'createdAt' | 'updatedAt'>): Promise<YouTubeChannel> {
  const channels = await getYouTubeChannels();

  // 같은 사용자의 같은 채널이 이미 있는지 확인
  const existing = channels.find(ch => ch.userId === channel.userId && ch.channelId === channel.channelId);
  if (existing) {
    throw new Error('이미 연결된 채널입니다.');
  }

  const newChannel: YouTubeChannel = {
    ...channel,
    id: crypto.randomUUID(),
    createdAt: getLocalDateTime(),
    updatedAt: getLocalDateTime()
  };

  // 첫 번째 채널이면 자동으로 기본 채널로 설정
  if (channels.filter(ch => ch.userId === channel.userId).length === 0) {
    newChannel.isDefault = true;
  }

  channels.push(newChannel);
  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return newChannel;
}

// YouTube 채널 업데이트
export async function updateYouTubeChannel(channelId: string, updates: Partial<YouTubeChannel>): Promise<YouTubeChannel | null> {
  const channels = await getYouTubeChannels();
  const index = channels.findIndex(ch => ch.id === channelId);

  if (index === -1) return null;

  channels[index] = {
    ...channels[index],
    ...updates,
    updatedAt: getLocalDateTime()
  };

  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return channels[index];
}

// YouTube 채널 토큰 업데이트 (재인증 시)
export async function updateYouTubeChannelToken(userId: string, youtubeChannelId: string, tokenFile: string): Promise<boolean> {
  const channels = await getYouTubeChannels();
  const channel = channels.find(ch => ch.userId === userId && ch.channelId === youtubeChannelId);

  if (!channel) {
    console.log('[DB] Channel not found for token update:', { userId, youtubeChannelId });
    return false;
  }

  channel.tokenFile = tokenFile;
  channel.updatedAt = getLocalDateTime();

  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  console.log('[DB] Channel token updated:', { userId, youtubeChannelId, tokenFile });
  return true;
}

// YouTube 채널 삭제
export async function deleteYouTubeChannel(channelId: string): Promise<boolean> {
  const channels = await getYouTubeChannels();
  const index = channels.findIndex(ch => ch.id === channelId);

  if (index === -1) return false;

  const deletedChannel = channels[index];
  channels.splice(index, 1);

  // 삭제된 채널이 기본 채널이었다면, 같은 사용자의 첫 번째 채널을 기본으로 설정
  if (deletedChannel.isDefault) {
    const userChannels = channels.filter(ch => ch.userId === deletedChannel.userId);
    if (userChannels.length > 0) {
      const firstChannel = channels.find(ch => ch.id === userChannels[0].id);
      if (firstChannel) {
        firstChannel.isDefault = true;
      }
    }
  }

  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return true;
}

// 기본 채널 설정
export async function setDefaultYouTubeChannel(userId: string, channelId: string): Promise<boolean> {
  const channels = await getYouTubeChannels();

  // 해당 사용자의 모든 채널의 isDefault를 false로
  channels.forEach(ch => {
    if (ch.userId === userId) {
      ch.isDefault = false;
    }
  });

  // 선택한 채널만 isDefault = true
  const targetChannel = channels.find(ch => ch.id === channelId && ch.userId === userId);
  if (!targetChannel) return false;

  targetChannel.isDefault = true;
  targetChannel.updatedAt = getLocalDateTime();

  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return true;
}

// 사용자의 기본 YouTube 채널 가져오기
export async function getDefaultYouTubeChannel(userId: string): Promise<YouTubeChannel | null> {
  const channels = await getUserYouTubeChannels(userId);
  return channels.find(ch => ch.isDefault) || channels[0] || null;
}

// ID로 YouTube 채널 찾기
// ⚠️ channelId는 내부 UUID 또는 YouTube 실제 채널ID(UC...) 둘 다 허용
export async function getYouTubeChannelById(channelId: string): Promise<YouTubeChannel | null> {
  const channels = await getYouTubeChannels();
  // 내부 id 또는 YouTube channelId 둘 다 검색
  return channels.find(ch => ch.id === channelId || ch.channelId === channelId) || null;
}

// ============================================
// YouTube 업로드 기록 관리
// ============================================

export interface YouTubeUpload {
  id: string;
  userId: string;
  taskId?: string;
  videoId: string;
  videoUrl: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  channelId: string;
  channelTitle?: string;
  privacyStatus?: string;
  publishedAt: string;
  createdAt: string;
}

// YouTube 업로드 기록 추가 (contents.youtube_url 업데이트)
export async function createYouTubeUpload(upload: Omit<YouTubeUpload, 'id' | 'createdAt' | 'publishedAt'>): Promise<YouTubeUpload> {
  const now = getLocalDateTime();

  // content 테이블의 youtube_url 업데이트
  // ⚠️ video_path 컬럼 없음 - 경로는 task_id에서 계산됨
  if (upload.taskId && upload.videoUrl) {
    // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
    await db.run(`
      UPDATE content SET youtube_url = ?, updated_at = CURRENT_TIMESTAMP WHERE content_id = ?
    `, [upload.videoUrl, upload.taskId]);
  }

  return {
    id: upload.taskId || crypto.randomUUID(),
    ...upload,
    publishedAt: now,
    createdAt: now
  };
}

// 사용자의 YouTube 업로드 기록 조회 (content 테이블에서 조회)
// ⚠️ video_path 컬럼 없음 - 경로는 task_id에서 계산됨 (tasks/{task_id}/thumbnail.jpg)
export async function getUserYouTubeUploads(userId: string): Promise<YouTubeUpload[]> {
  // v6: task_schedule 제거됨, content에서만 조회
  // MySQL: db.getAll 사용 (db.prepare는 SQLite 문법)
  const rows = await db.getAll(`
    SELECT DISTINCT
      c.content_id as schedule_id,
      t.task_id,
      t.user_id,
      c.title,
      c.youtube_url,
      c.updated_at,
      c.created_at,
      COALESCE(cs.youtube_privacy, 'public') as youtube_privacy
    FROM task t
    JOIN content c ON t.task_id = c.content_id
    LEFT JOIN content_setting cs ON t.task_id = cs.content_id
    WHERE t.user_id = ?
      AND c.youtube_url IS NOT NULL AND c.youtube_url != ''
    ORDER BY c.updated_at DESC
  `, [userId]) as any[];

  return rows.map(row => ({
    id: row.schedule_id,
    userId: row.user_id,
    taskId: row.task_id,
    videoId: row.task_id,
    videoUrl: row.youtube_url,
    title: row.title,
    description: undefined,
    thumbnailUrl: row.task_id ? `tasks/${row.task_id}/thumbnail.jpg` : undefined,
    channelId: '',
    channelTitle: undefined,
    privacyStatus: row.youtube_privacy,
    publishedAt: row.updated_at,
    createdAt: row.created_at
  }));
}

// ⭐ 특정 task_id의 모든 YouTube 업로드 URL 조회 (여러 채널에 업로드한 경우)
export async function getYouTubeUrlsByTaskId(taskId: string): Promise<string[]> {
  const urls: string[] = [];

  // 1. content 테이블에서 조회
  const contentRow = await db.getOne(`
    SELECT youtube_url FROM content
    WHERE content_id = ? AND youtube_url IS NOT NULL AND youtube_url != ''
  `, [taskId]) as { youtube_url: string } | undefined;
  if (contentRow) urls.push(contentRow.youtube_url);

  // 2. youtube_uploads 테이블에서 조회 (task_id 컬럼 없음 - content_id만 사용)
  const uploadRows = await db.getAll(`
    SELECT youtube_url FROM youtube_uploads
    WHERE content_id = ? AND youtube_url IS NOT NULL AND youtube_url != ''
  `, [taskId]) as { youtube_url: string }[];
  uploadRows.forEach(r => urls.push(r.youtube_url));

  // 중복 제거
  return [...new Set(urls)];
}

// YouTube 업로드 기록 조회 (단일) - content 테이블에서
// ⚠️ video_path 컬럼 없음 - 경로는 task_id에서 계산됨
export async function getYouTubeUploadById(uploadId: string): Promise<YouTubeUpload | null> {
  const row = await db.getOne(`
    SELECT content_id, user_id, title, youtube_url, updated_at, created_at
    FROM content
    WHERE content_id = ? AND youtube_url IS NOT NULL
  `, [uploadId]) as any;

  if (!row) return null;

  return {
    id: row.content_id,
    userId: row.user_id,
    taskId: row.content_id,
    videoId: row.content_id,
    videoUrl: row.youtube_url,
    title: row.title,
    description: undefined,
    thumbnailUrl: row.content_id ? `tasks/${row.content_id}/thumbnail.jpg` : undefined,
    channelId: '',
    channelTitle: undefined,
    privacyStatus: undefined,
    publishedAt: row.updated_at,
    createdAt: row.created_at
  };
}

// YouTube 업로드 기록 삭제 (youtube_url 초기화)
// ⚠️ type 컬럼 없음 - 삭제된 컬럼
export async function deleteYouTubeUpload(uploadId: string): Promise<boolean> {
  const result = await db.run('UPDATE content SET youtube_url = NULL WHERE content_id = ?', [uploadId]);
  return (result.affectedRows || 0) > 0;
}

// ============================================
// 소셜미디어 계정 관리 (TikTok, Instagram, Facebook)
// ============================================

export type SocialMediaPlatform = 'tiktok' | 'instagram' | 'facebook';

export interface SocialMediaAccount {
  id: string;
  userId: string;
  platform: SocialMediaPlatform;
  accountId: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  followerCount?: number;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

// 소셜미디어 계정 추가
export async function createSocialMediaAccount(account: Omit<SocialMediaAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<SocialMediaAccount> {
  const id = crypto.randomUUID();
  const now = getLocalDateTime();

  // 같은 사용자의 같은 플랫폼 계정이 이미 있는지 확인
  // MySQL: db.getOne 사용 (db.prepare는 SQLite 문법)
  const existing = await db.getOne(`
    SELECT id FROM user_social_media_account
    WHERE user_id = ? AND platform = ? AND account_id = ?
  `, [account.userId, account.platform, account.accountId]);

  if (existing) {
    throw new Error('이미 연결된 계정입니다.');
  }

  // 첫 번째 계정이면 자동으로 기본 계정으로 설정
  // MySQL: db.getOne 사용 (db.prepare는 SQLite 문법)
  const countResult = await db.getOne(`
    SELECT COUNT(*) as count FROM user_social_media_account
    WHERE user_id = ? AND platform = ?
  `, [account.userId, account.platform]) as any;
  const isFirstAccount = countResult.count === 0;

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  await db.run(`
    INSERT INTO user_social_media_account (
      id, user_id, platform, account_id, username, display_name,
      profile_picture, follower_count, access_token, refresh_token,
      token_expires_at, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    account.userId,
    account.platform,
    account.accountId,
    account.username || null,
    account.displayName || null,
    account.profilePicture || null,
    account.followerCount || 0,
    account.accessToken,
    account.refreshToken || null,
    account.tokenExpiresAt || null,
    isFirstAccount || account.isDefault ? 1 : 0,
    now,
    now
  ]);

  return {
    id,
    ...account,
    isDefault: isFirstAccount || account.isDefault,
    createdAt: now,
    updatedAt: now
  };
}

// 사용자의 소셜미디어 계정 목록 가져오기
export async function getUserSocialMediaAccounts(userId: string, platform?: SocialMediaPlatform): Promise<SocialMediaAccount[]> {
  // MySQL: db.getAll 사용 (db.prepare는 SQLite 문법)
  const query = platform
    ? `SELECT * FROM user_social_media_account WHERE user_id = ? AND platform = ? ORDER BY is_default DESC, created_at DESC`
    : `SELECT * FROM user_social_media_account WHERE user_id = ? ORDER BY platform, is_default DESC, created_at DESC`;

  const rows = platform
    ? await db.getAll(query, [userId, platform]) as any[]
    : await db.getAll(query, [userId]) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    accountId: row.account_id,
    username: row.username,
    displayName: row.display_name,
    profilePicture: row.profile_picture,
    followerCount: row.follower_count,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

// ID로 소셜미디어 계정 찾기
export async function getSocialMediaAccountById(id: string): Promise<SocialMediaAccount | null> {
  // MySQL: db.getOne 사용 (db.prepare는 SQLite 문법)
  const row = await db.getOne('SELECT * FROM user_social_media_account WHERE id = ?', [id]) as any;

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    accountId: row.account_id,
    username: row.username,
    displayName: row.display_name,
    profilePicture: row.profile_picture,
    followerCount: row.follower_count,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// 기본 소셜미디어 계정 가져오기
export async function getDefaultSocialMediaAccount(userId: string, platform: SocialMediaPlatform): Promise<SocialMediaAccount | null> {
  const accounts = await getUserSocialMediaAccounts(userId, platform);
  return accounts.find(acc => acc.isDefault) || accounts[0] || null;
}

// 기본 계정 설정
export async function setDefaultSocialMediaAccount(userId: string, platform: SocialMediaPlatform, accountId: string): Promise<boolean> {
  const now = getLocalDateTime();

  // 해당 사용자의 해당 플랫폼 모든 계정의 isDefault를 false로
  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  await db.run(`
    UPDATE user_social_media_account
    SET is_default = 0, updated_at = ?
    WHERE user_id = ? AND platform = ?
  `, [now, userId, platform]);

  // 선택한 계정만 isDefault = true
  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  const result = await db.run(`
    UPDATE user_social_media_account
    SET is_default = 1, updated_at = ?
    WHERE id = ? AND user_id = ? AND platform = ?
  `, [now, accountId, userId, platform]);

  return result.changes > 0;
}

// 소셜미디어 계정 업데이트
export async function updateSocialMediaAccount(accountId: string, updates: Partial<SocialMediaAccount>): Promise<SocialMediaAccount | null> {
  const now = getLocalDateTime();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.username !== undefined) {
    fields.push('username = ?');
    values.push(updates.username);
  }
  if (updates.displayName !== undefined) {
    fields.push('display_name = ?');
    values.push(updates.displayName);
  }
  if (updates.profilePicture !== undefined) {
    fields.push('profile_picture = ?');
    values.push(updates.profilePicture);
  }
  if (updates.followerCount !== undefined) {
    fields.push('follower_count = ?');
    values.push(updates.followerCount);
  }
  if (updates.accessToken !== undefined) {
    fields.push('access_token = ?');
    values.push(updates.accessToken);
  }
  if (updates.refreshToken !== undefined) {
    fields.push('refresh_token = ?');
    values.push(updates.refreshToken);
  }
  if (updates.tokenExpiresAt !== undefined) {
    fields.push('token_expires_at = ?');
    values.push(updates.tokenExpiresAt);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(accountId);

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  await db.run(`
    UPDATE user_social_media_account
    SET ${fields.join(', ')}
    WHERE id = ?
  `, values);
  return await getSocialMediaAccountById(accountId);
}

// 소셜미디어 계정 삭제
export async function deleteSocialMediaAccount(accountId: string): Promise<boolean> {
  const account = await getSocialMediaAccountById(accountId);
  if (!account) return false;

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  const result = await db.run('DELETE FROM user_social_media_account WHERE id = ?', [accountId]);

  // 삭제된 계정이 기본 계정이었다면, 같은 사용자의 같은 플랫폼 첫 번째 계정을 기본으로 설정
  if (account.isDefault && result.changes > 0) {
    const remainingAccounts = await getUserSocialMediaAccounts(account.userId, account.platform);
    if (remainingAccounts.length > 0) {
      await setDefaultSocialMediaAccount(account.userId, account.platform, remainingAccounts[0].id);
    }
  }

  return result.changes > 0;
}

// ============================================
// 소셜미디어 업로드 기록
// ============================================

export interface SocialMediaUpload {
  id: string;
  userId: string;
  taskId?: string;
  platform: SocialMediaPlatform;
  postId: string;
  postUrl?: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  accountId: string;
  accountUsername?: string;
  privacyStatus?: string;
  publishedAt: string;
  createdAt: string;
}

// 소셜미디어 업로드 기록 추가
export async function createSocialMediaUpload(upload: Omit<SocialMediaUpload, 'id' | 'createdAt' | 'publishedAt'>): Promise<SocialMediaUpload> {
  const id = crypto.randomUUID();
  const now = getLocalDateTime();

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  await db.run(`
    INSERT INTO social_media_uploads (
      id, user_id, job_id, platform, post_id, post_url, title, description,
      thumbnail_url, account_id, account_username, privacy_status, published_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    upload.userId,
    upload.taskId || null,
    upload.platform,
    upload.postId,
    upload.postUrl || null,
    upload.title,
    upload.description || null,
    upload.thumbnailUrl || null,
    upload.accountId,
    upload.accountUsername || null,
    upload.privacyStatus || null,
    now,
    now
  ]);

  return {
    id,
    ...upload,
    publishedAt: now,
    createdAt: now
  };
}

// 사용자의 소셜미디어 업로드 기록 조회
export async function getUserSocialMediaUploads(userId: string, platform?: SocialMediaPlatform): Promise<SocialMediaUpload[]> {
  // MySQL: db.getAll 사용 (db.prepare는 SQLite 문법)
  const query = platform
    ? `SELECT * FROM social_media_uploads WHERE user_id = ? AND platform = ? ORDER BY published_at DESC`
    : `SELECT * FROM social_media_uploads WHERE user_id = ? ORDER BY published_at DESC`;

  const rows = platform
    ? await db.getAll(query, [userId, platform]) as any[]
    : await db.getAll(query, [userId]) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    taskId: row.job_id,
    platform: row.platform,
    postId: row.post_id,
    postUrl: row.post_url,
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    accountId: row.account_id,
    accountUsername: row.account_username,
    privacyStatus: row.privacy_status,
    publishedAt: row.published_at,
    createdAt: row.created_at
  }));
}

// 소셜미디어 업로드 기록 삭제
export async function deleteSocialMediaUpload(uploadId: string): Promise<boolean> {
  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  const result = await db.run('DELETE FROM social_media_uploads WHERE id = ?', [uploadId]);
  return result.changes > 0;
}

// ============================================
// API 비용 추적
// ============================================

export type CostType = 'ai_script' | 'image_generation' | 'tts' | 'video_generation';

export interface ApiCost {
  id: string;
  userId: string;
  costType: CostType;
  serviceName: string; // 'claude', 'chatgpt', 'gemini', 'grok', 'dalle3', 'imagen3', 'azure_tts', 'google_tts', 'aws_polly'
  amount: number; // 비용 (달러)
  creditsDeducted?: number; // 차감된 크레딧
  contentId?: string; // 관련 content ID
  metadata?: Record<string, any>; // 추가 정보 (토큰 수, 글자 수 등)
  createdAt: string;
}

// API 비용 기록 추가
export async function createApiCost(cost: Omit<ApiCost, 'id' | 'createdAt'>): Promise<ApiCost> {
  const id = crypto.randomUUID();
  const now = getLocalDateTime();

  // MySQL: db.run 사용 (db.prepare는 SQLite 문법)
  await db.run(`
    INSERT INTO api_costs (
      id, user_id, cost_type, service_name, amount, credits_deducted,
      content_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    cost.userId,
    cost.costType,
    cost.serviceName,
    cost.amount,
    cost.creditsDeducted || null,
    cost.contentId || null,
    cost.metadata ? JSON.stringify(cost.metadata) : null,
    now
  ]);

  return {
    id,
    ...cost,
    createdAt: now
  };
}

// 사용자별 API 비용 조회
export async function getUserApiCosts(userId: string, startDate?: string, endDate?: string): Promise<ApiCost[]> {
  let query = 'SELECT * FROM api_costs WHERE user_id = ?';
  const params: any[] = [userId];

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY created_at DESC';

  const rows = await db.getAll(query, params) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    costType: row.cost_type,
    serviceName: row.service_name,
    amount: row.amount,
    creditsDeducted: row.credits_deducted,
    contentId: row.content_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at
  }));
}

// 전체 API 비용 조회 (관리자용)
export async function getAllApiCosts(startDate?: string, endDate?: string, limit?: number): Promise<ApiCost[]> {
  let query = 'SELECT * FROM api_costs WHERE 1=1';
  const params: any[] = [];

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const rows = await db.getAll(query, params) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    costType: row.cost_type,
    serviceName: row.service_name,
    amount: row.amount,
    creditsDeducted: row.credits_deducted,
    contentId: row.content_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at
  }));
}

// 비용 통계 조회 (관리자용)
export async function getApiCostStats(startDate?: string, endDate?: string): Promise<{
  totalCost: number;
  totalCredits: number;
  byCostType: Record<CostType, { count: number; totalCost: number; totalCredits: number }>;
  byService: Record<string, { count: number; totalCost: number; totalCredits: number }>;
}> {
  let query = 'SELECT * FROM api_costs WHERE 1=1';
  const params: any[] = [];

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  const rows = await db.getAll(query, params) as any[];

  const stats = {
    totalCost: 0,
    totalCredits: 0,
    byCostType: {} as Record<CostType, { count: number; totalCost: number; totalCredits: number }>,
    byService: {} as Record<string, { count: number; totalCost: number; totalCredits: number }>
  };

  for (const row of rows) {
    const amount = row.amount || 0;
    const credits = row.credits_deducted || 0;

    stats.totalCost += amount;
    stats.totalCredits += credits;

    // costType별 집계
    const costType = row.cost_type as CostType;
    if (!stats.byCostType[costType]) {
      stats.byCostType[costType] = { count: 0, totalCost: 0, totalCredits: 0 };
    }
    stats.byCostType[costType].count++;
    stats.byCostType[costType].totalCost += amount;
    stats.byCostType[costType].totalCredits += credits;

    // service별 집계
    if (!stats.byService[row.service_name]) {
      stats.byService[row.service_name] = { count: 0, totalCost: 0, totalCredits: 0 };
    }
    stats.byService[row.service_name].count++;
    stats.byService[row.service_name].totalCost += amount;
    stats.byService[row.service_name].totalCredits += credits;
  }

  return stats;
}
