/**
 * 완전 자동화 시스템
 * 제목 리스트 → 대본 생성 → 영상 생성 → 유튜브 업로드
 *
 * ============================================================
 * ⚠️ ID 규칙 (큐 스펙 v3 - 통합 키 시스템):
 * ============================================================
 *
 * 🔑 핵심: task_id = content_id (동일한 UUID)
 *
 * 테이블 구조:
 * ┌─────────────────────────────────────────────────────────┐
 * │ task (최소화)                                           │
 * │ - task_id (PK)                                         │
 * │ - status (draft/active/completed/archived/cancelled)   │
 * │ - user_id                                              │
 * │ - created_at, updated_at                               │
 * └─────────────────────────────────────────────────────────┘
 * ┌─────────────────────────────────────────────────────────┐
 * │ content (메인 데이터) - content_id = task_id            │
 * │ - user_id, title, original_title                       │
 * │ - prompt_format, ai_model, product_info, category      │
 * │ - score, status, error, youtube_url                    │
 * │ - input_tokens, output_tokens                          │
 * └─────────────────────────────────────────────────────────┘
 * ┌─────────────────────────────────────────────────────────┐
 * │ content_setting (제작 설정) - content_id = task_id       │
 * │ - script_mode, media_mode, channel                     │
 * │ - tts_voice, tts_speed, auto_create_shortform          │
 * │ - tags, priority, settings                             │
 * └─────────────────────────────────────────────────────────┘
 * ┌─────────────────────────────────────────────────────────┐
 * │ task_queue (큐 상태)                                    │
 * │ task_schedule (예약 스케줄)                             │
 * └─────────────────────────────────────────────────────────┘
 *
 * 폴더 구조: tasks/{task_id}/
 * - story.json, video.mp4, thumbnail.png 등
 */

import db from './sqlite';
import path from 'path';
import { randomUUID } from 'crypto';
import { addContentLog } from './content';
import { getSql } from './sql-mapper';

// ============================================================
// 상품 데이터 통일 함수
// ============================================================

/**
 * 상품 정보 통일 구조 (전체 시스템에서 이 구조만 사용)
 * - task.product_info
 * - content.product_info
 * - story.json
 * - 유튜브 업로드
 */
export interface ProductInfo {
  productId: string;
  title: string;
  price: number;
  thumbnail: string;
  deepLink: string;
  category: string;
}

/**
 * 상품 정보를 통일된 구조로 변환 (JSON 문자열 반환)
 */
export function createProductDataPayload(product: {
  productId?: string;
  title?: string;
  productName?: string;  // 레거시 호환
  price?: number;
  productPrice?: number;  // 레거시 호환
  thumbnail?: string;
  productImage?: string;  // 레거시 호환
  deepLink?: string;
  productUrl?: string;  // 레거시 호환
  category?: string;
}): string {
  const productInfo: ProductInfo = {
    productId: product.productId || `prod_${Date.now()}`,
    title: product.title || product.productName || '',
    price: product.price ?? product.productPrice ?? 0,
    thumbnail: product.thumbnail || product.productImage || '',
    deepLink: product.deepLink || product.productUrl || '',
    category: product.category || '상품'
  };
  return JSON.stringify(productInfo);
}

/**
 * 상품 정보 객체 반환 (JSON 문자열 아님)
 */
export function createProductInfo(product: {
  productId?: string;
  title?: string;
  productName?: string;
  price?: number;
  productPrice?: number;
  thumbnail?: string;
  productImage?: string;
  deepLink?: string;
  productUrl?: string;
  category?: string;
}): ProductInfo {
  return {
    productId: product.productId || `prod_${Date.now()}`,
    title: product.title || product.productName || '',
    price: product.price ?? product.productPrice ?? 0,
    thumbnail: product.thumbnail || product.productImage || '',
    deepLink: product.deepLink || product.productUrl || '',
    category: product.category || '상품'
  };
}

// ============================================================
// 경로 헬퍼 함수 (룰 베이스)
// ============================================================

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');

/**
 * task_id로부터 경로를 생성 (DB에 저장하지 않음)
 */
export function getTaskPaths(taskId: string) {
  const baseDir = path.join(BACKEND_PATH, 'tasks', taskId);
  return {
    baseDir,
    script: path.join(baseDir, 'story.json'),
    video: path.join(baseDir, 'output.mp4'),
    thumbnail: path.join(baseDir, 'thumbnail.jpg'),
    // 씬 이미지들: scene_00.png, scene_01.png, ...
  };
}

// ============================================================
// 자동화 큐 상태 정의
// ============================================================

/**
 * @deprecated 레거시 상태 타입 - updateQueueStatus(type, status) 사용을 권장합니다
 *
 * 기존 복잡한 상태를 type + status 조합으로 대체:
 * - 'script_processing' → type='script', status='processing'
 * - 'script_failed' → type='script', status='failed'
 * - 'image_processing' → type='image', status='processing'
 * - 'video_processing' → type='video', status='processing'
 * - 'youtube_processing' → type='youtube', status='processing'
 * - 'completed' → type='youtube', status='completed'
 */
export type ScheduleStatus =
  | 'scheduled'           // 예약대기
  | 'script_processing'   // 대본작성중
  | 'script_failed'       // 대본실패
  | 'image_processing'    // 이미지업로드중
  | 'image_failed'        // 이미지실패
  | 'video_processing'    // 영상제작중
  | 'video_failed'        // 영상실패
  | 'youtube_processing'  // 유튜브업로드중
  | 'youtube_failed'      // 유튜브업로드실패
  | 'completed'           // 완료
  | 'cancelled';          // 취소됨

/**
 * @deprecated 레거시 상태 매핑 - 하위 호환용
 */
export const LEGACY_STATUS_MAP: Record<string, ScheduleStatus> = {
  'pending': 'scheduled',
  'processing': 'script_processing',  // 기본값으로 대본작성중으로 매핑
  'waiting_for_upload': 'image_processing',
  'completed': 'completed',
  'failed': 'script_failed',  // 기본값으로 대본실패로 매핑
  'cancelled': 'cancelled',
};

/**
 * @deprecated 상태별 한글 라벨 - 하위 호환용
 */
export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  'scheduled': '예약대기',
  'script_processing': '대본작성중',
  'script_failed': '대본실패',
  'image_processing': '이미지업로드중',
  'image_failed': '이미지실패',
  'video_processing': '영상제작중',
  'video_failed': '영상실패',
  'youtube_processing': '유튜브업로드중',
  'youtube_failed': '유튜브업로드실패',
  'completed': '완료',
  'cancelled': '취소됨',
};

/**
 * @deprecated 상태 전환 규칙 - 하위 호환용
 */
export const VALID_TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  'scheduled': ['script_processing', 'cancelled'],
  'script_processing': ['image_processing', 'video_processing', 'script_failed'],
  'script_failed': ['script_processing', 'cancelled'],  // 재시도 가능
  'image_processing': ['video_processing', 'image_failed'],
  'image_failed': ['image_processing', 'cancelled'],     // 재시도 가능
  'video_processing': ['youtube_processing', 'video_failed'],
  'video_failed': ['video_processing', 'cancelled'],     // 재시도 가능
  'youtube_processing': ['completed', 'youtube_failed'],
  'youtube_failed': ['youtube_processing', 'cancelled'], // 재시도 가능
  'completed': [],  // 최종 상태
  'cancelled': [],  // 최종 상태
};

/**
 * @deprecated 실패 상태 목록 - 하위 호환용
 */
export const FAILED_STATUSES: ScheduleStatus[] = [
  'script_failed',
  'image_failed',
  'video_failed',
  'youtube_failed',
];

/**
 * @deprecated 진행중 상태 목록 - 하위 호환용
 */
export const PROCESSING_STATUSES: ScheduleStatus[] = [
  'script_processing',
  'image_processing',
  'video_processing',
  'youtube_processing',
];

/**
 * @deprecated isFailedStatus - 하위 호환용
 */
export function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.includes(status as ScheduleStatus);
}

/**
 * @deprecated isProcessingStatus - 하위 호환용
 */
export function isProcessingStatus(status: string): boolean {
  return PROCESSING_STATUSES.includes(status as ScheduleStatus);
}

/**
 * @deprecated getRetryStatus - 하위 호환용
 */
export function getRetryStatus(failedStatus: ScheduleStatus): ScheduleStatus | null {
  switch (failedStatus) {
    case 'script_failed': return 'script_processing';
    case 'image_failed': return 'image_processing';
    case 'video_failed': return 'video_processing';
    case 'youtube_failed': return 'youtube_processing';
    default: return null;
  }
}

/**
 * @deprecated isValidTransition - 하위 호환용
 */
export function isValidTransition(from: ScheduleStatus, to: ScheduleStatus): boolean {
  const validNextStates = VALID_TRANSITIONS[from];
  return validNextStates?.includes(to) ?? false;
}

// MySQL: using imported db from sqlite wrapper

// 콘텐츠 타입별 기본 AI 모델 설정
export function getDefaultModelByType(type?: string): string {
  switch (type) {
    case 'product':
    case 'product-info':
      return 'gemini'; // 상품: Gemini
    case 'longform':
    case 'sora2':
    case 'shortform':
    default:
      return 'claude'; // 기본값: Claude
  }
}

// 콘텐츠 타입별 기본 TTS 음성 설정
// - 롱폼: 순복 (SoonBokNeural)
// - 숏폼/상품: 선희 (SunHiNeural)
export function getDefaultTtsByType(type?: string): string {
  switch (type) {
    case 'longform':
      return 'ko-KR-SoonBokNeural'; // 롱폼: 순복
    case 'shortform':
    case 'product':
    case 'product-info':
    default:
      return 'ko-KR-SunHiNeural'; // 숏폼/상품/기본: 선희
  }
}

// DB 초기화 및 테이블 생성
// ⚠️ v3: 테이블 생성은 schema-sqlite.sql에서 통합 관리
// 이 함수는 마이그레이션과 컬럼 추가만 수행
export async function initAutomationTables() {
  // MySQL: using imported db

  // SQLite 동시성 설정 (WAL 모드)
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // ============================================================
  // 핵심 테이블 생성 (없으면 생성)
  // ============================================================

  // user 테이블 생성 (최상위 - 다른 테이블에서 참조)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      user_id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      nickname VARCHAR(255),
      is_admin INTEGER DEFAULT 0,
      credits INTEGER DEFAULT 0,
      is_email_verified INTEGER DEFAULT 0,
      verification_token VARCHAR(255),
      memo TEXT,
      google_sites_url TEXT,
      google_sites_edit_url TEXT,
      google_sites_home_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // user 테이블 인덱스 생성 (MySQL: IF NOT EXISTS 미지원, 에러 무시)
  try {
    await db.exec(`CREATE INDEX idx_user_email ON user(email)`);
  } catch (e) { /* 이미 존재 */ }
  try {
    await db.exec(`CREATE INDEX idx_user_verification_token ON user(verification_token)`);
  } catch (e) { /* 이미 존재 */ }

  // task 테이블 생성 (최소화 - 메인 데이터는 content 테이블)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task (
      task_id VARCHAR(255) PRIMARY KEY,
      title TEXT,
      prompt_format VARCHAR(100),
      status VARCHAR(50) DEFAULT 'draft',
      user_id VARCHAR(255),
      product_info TEXT,
      settings TEXT,
      category VARCHAR(255),
      tags TEXT,
      priority INTEGER DEFAULT 0,
      channel VARCHAR(255),
      script_mode VARCHAR(100),
      media_mode VARCHAR(100),
      ai_model VARCHAR(100),
      tts_voice VARCHAR(100) DEFAULT 'ko-KR-SoonBokNeural',
      tts_speed VARCHAR(50) DEFAULT '+0%',
      auto_convert INTEGER DEFAULT 0,
      product_url TEXT,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // task 테이블 인덱스 생성 (MySQL)
  try {
    await db.exec(`CREATE INDEX idx_task_user_id ON task(user_id)`);
  } catch (e) { /* 이미 존재 */ }
  try {
    await db.exec(`CREATE INDEX idx_task_status ON task(status)`);
  } catch (e) { /* 이미 존재 */ }

  // ============================================================
  // 마이그레이션: 컬럼 추가
  // ============================================================

  // ⛔⛔⛔ task_schedule 컬럼 추가 금지! ⛔⛔⛔
  // task_schedule은 최소화 상태 유지 (schedule_id, task_id, scheduled_time, status, created_at, updated_at만)
  // 다음 컬럼들은 제거됨:
  // - content_id (task_id와 중복)
  // - youtube_publish_time (content 테이블에 있음)
  // - error_message (task_queue에서 관리)
  // - failed_stage (불필요)
  // - retry_count (task_queue에서 관리)
  // - shortform_task_id (불필요)
  // - parent_youtube_url (불필요)
  // - shortform_uploaded (불필요)

  // weekday_times 컬럼 추가 (없는 경우)
  try {
    await db.exec(`ALTER TABLE youtube_channel_setting ADD COLUMN weekday_times TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // categories 컬럼 추가 (자동 제목 생성용 카테고리 리스트, JSON 배열)
  try {
    await db.exec(`ALTER TABLE youtube_channel_setting ADD COLUMN categories TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // coupang_product 테이블 생성 (없으면 생성)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS coupang_product (
      coupang_id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      product_id VARCHAR(255),
      title TEXT,
      description TEXT,
      category VARCHAR(255),
      image_url TEXT,
      product_url TEXT,
      deep_link TEXT,
      original_price INTEGER,
      discount_price INTEGER,
      rocket_shipping INTEGER DEFAULT 0,
      free_shipping INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      view_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      queue_id VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // coupang_product 테이블 인덱스 생성 (MySQL)
  try {
    await db.exec(`CREATE INDEX idx_coupang_product_user_id ON coupang_product(user_id)`);
  } catch (e) { /* 이미 존재 */ }
  try {
    await db.exec(`CREATE INDEX idx_coupang_product_product_id ON coupang_product(product_id)`);
  } catch (e) { /* 이미 존재 */ }

  // coupang_product 테이블에 deep_link 컬럼 추가 (기존 테이블용)
  try {
    await db.exec(`ALTER TABLE coupang_product ADD COLUMN deep_link TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // content 테이블 생성 (없으면 생성)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS content (
      content_id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      title TEXT NOT NULL,
      original_title TEXT,
      status VARCHAR(50) DEFAULT 'draft',  -- BTS-3363: 3단계로 단순화
      error TEXT,
      youtube_url TEXT,
      youtube_channel VARCHAR(255),
      youtube_publish_time VARCHAR(100),
      input_tokens INTEGER,
      output_tokens INTEGER,
      source_content_id VARCHAR(255),
      ai_model VARCHAR(100),
      prompt_format VARCHAR(100),
      product_info TEXT,
      category VARCHAR(255),
      score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // content 테이블 인덱스 생성 (MySQL)
  try {
    await db.exec(`CREATE INDEX idx_content_content_id ON content(content_id)`);
  } catch (e) { /* 이미 존재 */ }
  try {
    await db.exec(`CREATE INDEX idx_content_user_id ON content(user_id)`);
  } catch (e) { /* 이미 존재 */ }
  try {
    await db.exec(`CREATE INDEX idx_content_status ON content(status)`);
  } catch (e) { /* 이미 존재 */ }

  // content 테이블에 youtube_publish_time 컬럼 추가 (예약 공개 시간)
  try {
    await db.exec(`ALTER TABLE content ADD COLUMN youtube_publish_time TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // content 테이블에 youtube_channel 컬럼 추가 (업로드할 채널)
  try {
    await db.exec(`ALTER TABLE content ADD COLUMN youtube_channel TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // ⛔ task 테이블에 컬럼 추가 금지! (CLAUDE.md 참고)
  // ⛔ tts_voice, tts_speed, prompt_format 등은 content/content_setting에 있음

  // content_setting 테이블 생성 (제작 설정 - content와 동일한 ID)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS content_setting (
      content_id VARCHAR(255) PRIMARY KEY,
      script_mode VARCHAR(100) DEFAULT 'chrome',
      media_mode VARCHAR(100) DEFAULT 'crawl',
      channel VARCHAR(255),
      tts_voice VARCHAR(100) DEFAULT 'ko-KR-SoonBokNeural',
      tts_speed VARCHAR(50) DEFAULT '+0%',
      auto_create_shortform INTEGER DEFAULT 1,
      tags TEXT,
      priority INTEGER DEFAULT 0,
      settings TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES content(content_id) ON DELETE CASCADE
    )
  `);

  // user_content_category 테이블 생성 (대본 카테고리)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_content_category (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
    )
  `);

  // user_content_category 인덱스 생성 (MySQL)
  try {
    await db.exec(`CREATE INDEX idx_user_content_category_user_id ON user_content_category(user_id)`);
  } catch (e) { /* 이미 존재 */ }

  // MySQL: pool manages connections
  console.log('✅ Automation tables initialized');
}

// 🆕 제목 중복 체크 함수
export async function checkDuplicateTitle(title: string, category?: string): Promise<{
  isDuplicate: boolean;
  similarity: number;
  existingTitle?: string;
  existingId?: string;
}> {
  // 1. 정확히 같은 제목 체크
  const exactMatch = await db.prepare(`
    SELECT content_id, title FROM content
    WHERE title = ? AND status != 'cancelled'
    LIMIT 1
  `).get(title) as { content_id: string; title: string } | undefined;

  if (exactMatch) {
    return { isDuplicate: true, similarity: 100, existingTitle: exactMatch.title, existingId: exactMatch.content_id };
  }

  // 2. 유사 제목 체크 (70% 이상 일치)
  // 간단한 유사도 계산: 공백 제거 후 문자열 비교
  const normalizedTitle = title.replace(/\s+/g, '').toLowerCase();
  const recentTitles = await db.prepare(`
    SELECT content_id, title FROM content
    WHERE status != 'cancelled'
    ${category ? `AND category = ?` : ''}
    ORDER BY created_at DESC
    LIMIT 100
  `).all(category || undefined) as { content_id: string; title: string }[];

  for (const existing of recentTitles) {
    const normalizedExisting = existing.title.replace(/\s+/g, '').toLowerCase();

    // 레벤슈타인 거리 기반 유사도 계산 (간략화)
    const similarity = calculateSimilarity(normalizedTitle, normalizedExisting);

    if (similarity >= 70) {
      console.log(`[DuplicateCheck] ⚠️ 유사 제목 발견 (${similarity}%): "${title}" ≈ "${existing.title}"`);
      return { isDuplicate: true, similarity, existingTitle: existing.title, existingId: existing.content_id };
    }
  }

  return { isDuplicate: false, similarity: 0 };
}

// 문자열 유사도 계산 (간단한 버전)
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (a.length === 0 || b.length === 0) return 0;

  // 짧은 문자열이 긴 문자열에 포함되는지 체크
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;

  if (longer.includes(shorter)) {
    return Math.round((shorter.length / longer.length) * 100);
  }

  // n-gram 기반 유사도 (2-gram)
  const ngram = (str: string, n: number) => {
    const grams: string[] = [];
    for (let i = 0; i <= str.length - n; i++) {
      grams.push(str.slice(i, i + n));
    }
    return grams;
  };

  const aGrams = ngram(a, 2);
  const bGrams = ngram(b, 2);

  let matches = 0;
  for (const gram of aGrams) {
    if (bGrams.includes(gram)) matches++;
  }

  return Math.round((matches * 2 / (aGrams.length + bGrams.length)) * 100);
}

// 🆕 90점 미만 저점수 제목 정리 함수
export async function cleanupLowScoreTitles(minScore: number = 90): Promise<{
  deleted: number;
  titles: string[];
}> {
  // draft 상태이면서 90점 미만인 제목들 조회 (상품 카테고리 제외)
  const lowScoreTitles = await db.prepare(`
    SELECT c.content_id, c.title, c.title_score, c.category
    FROM content c
    JOIN task t ON c.content_id = t.task_id
    WHERE c.title_score IS NOT NULL
      AND c.title_score < ?
      AND c.status = 'draft'
      AND (c.category IS NULL OR c.category != '상품')
    ORDER BY c.title_score ASC
  `).all(minScore) as { content_id: string; title: string; title_score: number; category: string }[];

  if (lowScoreTitles.length === 0) {
    console.log(`[Cleanup] ✅ 저점수 제목 없음 (기준: ${minScore}점)`);
    return { deleted: 0, titles: [] };
  }

  console.log(`[Cleanup] 🗑️ ${lowScoreTitles.length}개 저점수 제목 발견 (기준: ${minScore}점)`);

  const deletedTitles: string[] = [];
  for (const item of lowScoreTitles) {
    try {
      // task 상태를 cancelled로 변경 (실제 삭제 대신)
      await db.prepare(`UPDATE task SET status = 'cancelled', updated_at = NOW() WHERE task_id = ?`).run(item.content_id);
      await db.prepare(`UPDATE content SET status = 'cancelled', updated_at = NOW() WHERE content_id = ?`).run(item.content_id);

      deletedTitles.push(`${item.title} (${item.score}점)`);
      console.log(`[Cleanup] ❌ 삭제: "${item.title}" (${item.score}점)`);
    } catch (e) {
      console.error(`[Cleanup] 삭제 실패: ${item.content_id}`, e);
    }
  }

  console.log(`[Cleanup] ✅ ${deletedTitles.length}개 저점수 제목 정리 완료`);
  return { deleted: deletedTitles.length, titles: deletedTitles };
}

// 제목 추가 (video_titles → tasks 통합)
export async function addVideoTitle(data: {
  title: string;
  promptFormat: 'shortform' | 'longform' | 'product' | 'sora2';
  category?: string;
  tags?: string;
  priority?: number;
  deepLink?: string;      // 🚨 productUrl → deepLink
  productUrl?: string;    // 레거시 호환
  productData?: string;   // JSON 문자열 (상품 정보)
  channel?: string;
  scriptMode?: string;
  mediaMode?: string;
  youtubeSchedule?: string;
  aiModel?: string;
  ttsVoice?: string;      // TTS 음성 선택
  ttsSpeed?: string;      // TTS 속도
  autoConvert?: boolean;  // 롱폼→숏폼 자동변환
  score?: number;         // 제목 점수 (90점 이상 권장)
  skipDuplicateCheck?: boolean;  // 🆕 중복 체크 스킵 옵션
  executeImmediately?: boolean;  // 🆕 즉시 실행 여부 (테스트/샘플/즉시실행용)
  scheduledTime?: Date;   // 🆕 채널별 예약 시간 (자동 제목 생성 시)
  userId: string;
}) {
  // MySQL: using imported db

  // 🆕 90점 미만 제목 자동 차단 (상품 카테고리 제외)
  const isProductCategory = data.category === '상품' || data.promptFormat === 'product';
  if (!isProductCategory && data.score !== undefined && data.score < 90) {
    console.log(`[addVideoTitle] ⛔ 저점수 제목 차단: "${data.title}" (점수: ${data.score}점 < 90점)`);
    return null;  // 90점 미만이면 저장하지 않음
  }

  // 🆕 중복 제목 체크 (skipDuplicateCheck가 false일 때만)
  if (!data.skipDuplicateCheck) {
    const dupCheck = await checkDuplicateTitle(data.title, data.category);
    if (dupCheck.isDuplicate) {
      console.log(`[addVideoTitle] ⛔ 중복 제목 스킵: "${data.title}" (기존: "${dupCheck.existingTitle}", 유사도: ${dupCheck.similarity}%)`);
      return null;  // 중복이면 null 반환
    }
  }

  // ⚠️ ID 규칙: UUID 기반 (모든 작업의 중심 ID)
  const id = randomUUID();

  // 🔴 "테스트" 제목이거나 type이 'product'인 경우 카테고리를 "상품"으로 자동 설정
  const category = (data.title === '테스트' || data.promptFormat === 'product') ? '상품' : (data.category || null);

  // product_info JSON으로 상품 정보 저장
  // ⭐ 통일된 구조: { productId, title, price, thumbnail, deepLink, category }
  // 🚨 productUrl 사용 금지! deepLink만 사용!
  let productInfo = null;
  const effectiveDeepLink = data.deepLink || data.productUrl;  // 레거시 호환
  if (effectiveDeepLink || data.productData) {
    if (data.productData) {
      const rawData = JSON.parse(data.productData);

      // 레거시 nested 구조 처리 ({ url, data } 형태)
      const source = rawData.data || rawData;

      // createProductInfo로 통일된 구조 생성
      const normalized = createProductInfo({
        productId: source.productId,
        title: source.title,
        productName: source.productName,
        price: source.price,
        productPrice: source.productPrice,
        thumbnail: source.thumbnail,
        productImage: source.productImage,
        deepLink: source.deepLink || rawData.url || effectiveDeepLink,
        category: source.category
      });
      productInfo = JSON.stringify(normalized);
    } else if (effectiveDeepLink) {
      // productData 없이 deepLink만 있는 경우
      productInfo = JSON.stringify(createProductInfo({
        deepLink: effectiveDeepLink
      }));
    }
  }

  // ⭐ task 테이블: ID + user_id + scheduled_time
  // scheduledTime이 있으면 자동화 예약, 없으면 NULL (즉시실행/샘플/테스트는 task_queue에 직접 추가)
  let scheduleTime: string | null = null;
  if (data.scheduledTime) {
    // 자동제목: 채널별 예약 시간 (로컬 시간대 그대로 저장)
    const d = data.scheduledTime;
    scheduleTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }
  // executeImmediately, 샘플, 테스트는 scheduled_time=NULL, task_queue에 직접 추가됨

  const { getSql } = await import('./sql-mapper');
  const insertTaskSql = getSql('scheduler', 'insertTask');
  await db.prepare(insertTaskSql).run(id, data.userId, scheduleTime);

  // ⭐ content 테이블: 메인 데이터 (task_id = content_id)
  // youtube_channel은 content 테이블에 저장 (content_setting이 아님!)
  const insertContentSql = getSql('scheduler', 'insertContentWithStatus');
  await db.prepare(insertContentSql).run(
    id,  // content_id = task_id
    data.userId,
    data.title,
    data.title,  // original_title
    data.aiModel || getDefaultModelByType(data.promptFormat),
    data.promptFormat,
    productInfo,
    category,
    data.score || null,
    data.channel || null
  );

  // ⭐ content_setting 테이블에도 동일한 ID로 제작 설정 저장
  // youtube_channel은 content 테이블에 있음!
  const insertContentSettingSql = getSql('scheduler', 'insertContentSettingFull');
  await db.prepare(insertContentSettingSql).run(
    id,  // content_id = task_id
    data.scriptMode || 'chrome',
    data.mediaMode || 'crawl',
    data.ttsVoice || getDefaultTtsByType(data.promptFormat),
    data.ttsSpeed || '+0%',
    data.autoConvert !== false ? 1 : 0,  // 기본값 true
    data.tags || null
  );

  // ⭐ task_queue 생성 (즉시 실행 시 script, 일반/예약 시 schedule)
  if (data.executeImmediately) {
    // 즉시 실행: script 큐에 직접 추가
    await db.prepare(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, 'script', 'waiting', CURRENT_TIMESTAMP, ?)
    `).run(id, data.userId);
  } else {
    // 일반/예약: schedule 큐에 추가
    await db.prepare(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, 'schedule', 'waiting', CURRENT_TIMESTAMP, ?)
    `).run(id, data.userId);
  }

  // MySQL: pool manages connections
  return id;
}

// 스케줄 추가 (video_titles → tasks 통합)
export async function addSchedule(data: {
  titleId: string;  // 실제로는 task_id
  scheduledTime: string; // SQLite datetime: 'YYYY-MM-DD HH:MM:SS'
  youtubePublishTime?: string;
  youtubePrivacy?: string;
}) {
  // MySQL: using imported db
  const taskId = data.titleId;  // 명확하게 task_id로 사용

  // ✅ BTS-0000031: 이미 MySQL datetime 형식 문자열이므로 그대로 사용
  // API route에서 toMysqlDatetime()로 변환된 문자열이 들어옴
  // 다시 Date 객체로 변환하면 시간대 문제 발생!
  const scheduledMysqlDatetime = data.scheduledTime;

  const privacyValue = data.youtubePrivacy || 'public';
  console.log(`[addSchedule] 공개 설정 저장: ${privacyValue} (원본: ${data.youtubePrivacy})`);

  // v5: content_setting 테이블에서 settings, media_mode 가져오기
  const settingData = await db.prepare(`SELECT settings, media_mode FROM content_setting WHERE content_id = ?`).get(taskId) as { settings: string, media_mode: string } | undefined;
  let mediaMode = settingData?.media_mode || 'crawl';  // 기본값
  if (!mediaMode && settingData?.settings) {
    try {
      const settings = JSON.parse(settingData.settings);
      mediaMode = settings.mediaMode || 'crawl';
    } catch (e) {}
  }

  // task.scheduled_time 업데이트
  await db.prepare(`
    UPDATE task SET scheduled_time = ? WHERE task_id = ?
  `).run(scheduledMysqlDatetime, taskId);

  // youtube_publish_time은 content 테이블에 저장
  if (data.youtubePublishTime) {
    // ✅ BTS-0000031: 이미 MySQL datetime 형식 문자열이므로 그대로 사용
    await db.prepare(`UPDATE content SET youtube_publish_time = ? WHERE content_id = ?`).run(data.youtubePublishTime, taskId);
  }

  // youtube_privacy는 content_setting 테이블에 저장
  await db.prepare(`
    INSERT INTO content_setting (content_id, youtube_privacy)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE youtube_privacy = VALUES(youtube_privacy)
  `).run(taskId, privacyValue);

  // ⭐ task_queue에 schedule 타입 추가 (예약 대기 상태)
  const taskInfo = await db.prepare(`SELECT user_id FROM task WHERE task_id = ?`).get(taskId) as { user_id: string } | undefined;
  if (taskInfo) {
    await db.prepare(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, 'schedule', 'waiting', CURRENT_TIMESTAMP, ?)
      ON DUPLICATE KEY UPDATE status = 'waiting', type = 'schedule'
    `).run(taskId, taskInfo.user_id);
  }

  console.log(`[addSchedule] 스케줄 생성: task_id=${taskId}, time=${data.scheduledTime}, privacy=${privacyValue}`);

  // MySQL: pool manages connections
  return taskId;  // schedule_id 대신 task_id 반환 (1:1 관계)
}

// 예약된 스케줄 가져오기
export async function getPendingSchedules() {
  // MySQL: using imported db

  // 로컬 시간을 ISO 형식으로 변환 (YYYY-MM-DDTHH:mm:ss)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  // ⭐ SQLite datetime 형식: 'YYYY-MM-DD HH:MM:SS' (T 대신 공백)
  const nowLocal = `${year}-${month}-${day} ${hour}:${minute}:${second}`;

  console.log(`[Scheduler] Checking for schedules before: ${nowLocal}`);

  // task_queue.type = 'schedule' 기반으로 예약 확인
  // ⭐ 한 번에 1개만 처리 (LIMIT 1)
  const schedules = await db.prepare(`
    SELECT
      q.task_id as taskId,
      q.task_id as scheduleId,
      q.task_id as titleId,
      t.scheduled_time as scheduledTime,
      c.youtube_publish_time as youtubePublishTime,
      c.title,
      c.prompt_format as type,
      q.user_id as userId,
      c.product_info as productInfo,
      cs.settings,
      q.status as queueStatus,
      q.type as queueType
    FROM task_queue q
    JOIN task t ON q.task_id = t.task_id
    JOIN content c ON q.task_id = c.content_id
    LEFT JOIN content_setting cs ON q.task_id = cs.content_id
    WHERE q.type = 'schedule'
      AND q.status = 'waiting'
      AND t.scheduled_time IS NOT NULL
      AND t.scheduled_time <= ?
    ORDER BY t.scheduled_time ASC
    LIMIT 1
  `).all(nowLocal);

  console.log(`[Scheduler] Found ${schedules.length} scheduled items`);

  // MySQL: pool manages connections
  return schedules;
}

// 이미지 업로드 대기 중인 스케줄 가져오기
export async function getWaitingForUploadSchedules() {
  // MySQL: using imported db

  // v6: task_queue 중심 (task_schedule 제거됨)
  const schedules = await db.prepare(`
    SELECT
      t.task_id as taskId,
      t.task_id as scheduleId,
      c.title,
      c.prompt_format as promptFormat,
      t.user_id as userId,
      c.product_info as productInfo,
      cs.settings,
      cs.media_mode as mediaMode,
      c.youtube_channel as youtubeChannel,
      q.status as queueStatus,
      c.content_id as scriptId,
      t.created_at as createdAt
    FROM task_queue q
    JOIN task t ON q.task_id = t.task_id
    JOIN content c ON q.task_id = c.content_id
    LEFT JOIN content_setting cs ON q.task_id = cs.content_id
    WHERE q.type = 'image' AND q.status = 'completed'
    ORDER BY t.created_at ASC
  `).all();

  console.log(`[Scheduler] Found ${schedules.length} schedules in image processing`);

  // MySQL: pool manages connections
  return schedules;
}

// 파이프라인 생성
export async function createPipeline(scheduleId: string) {
  // ⚠️ DEPRECATED: automation_pipelines 테이블 제거됨
  // task_queue 시스템으로 대체됨 - 빈 배열 반환
  console.log(`[createPipeline] DEPRECATED - skipping pipeline creation for schedule ${scheduleId}`);
  return [];
}

// 파이프라인 상태 업데이트
export async function updatePipelineStatus(
  pipelineId: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  errorMessage?: string
) {
  // ⚠️ DEPRECATED: automation_pipelines 테이블 제거됨
  // 로그만 출력 (task_queue 시스템으로 대체)
  console.log(`[Pipeline ${pipelineId}] Status: ${status}${errorMessage ? ` - ${errorMessage}` : ''}`);
  return;
}

// 파이프라인 로그 추가
export async function addPipelineLog(
  pipelineId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  metadata?: any
) {
  // ⚠️ DEPRECATED: automation_log 테이블 제거됨
  // 콘솔 로그만 출력 (task_queue 시스템으로 대체)
  const levelEmoji = level === 'info' ? 'ℹ️' : level === 'warn' ? '⚠️' : level === 'error' ? '❌' : '🔍';
  console.log(`${levelEmoji} [Pipeline ${pipelineId}] ${message}`);
  return;
}

// 제목 로그 추가 (실시간 진행 상황용) - 파일 기반
export async function addTitleLog(
  titleId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  logType: 'script' | 'image' | 'video' | 'youtube' = 'script'
) {
  try {
    addContentLog(titleId, `[${level.toUpperCase()}] ${message}`, logType);
  } catch (error: any) {
    console.error(`Failed to add title log:`, error);
  }
}

// ============================================================
// ⭐ 새로운 큐 상태 관리 함수 (type + status 조합)
// ============================================================

/**
 * task_queue 상태 업데이트 (type + status 조합)
 * @param taskId - task.id (task_queue.task_id)
 * @param type - 'schedule' | 'script' | 'image' | 'video' | 'youtube'
 * @param status - 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled'
 * @param options - errorMessage, metadata 등
 */
export async function updateQueueStatus(
  taskId: string,
  type: 'schedule' | 'script' | 'image' | 'video' | 'youtube',
  status: 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled',
  options?: {
    errorMessage?: string;
    metadata?: Record<string, any>;  // ⭐ scenes 등 이미지 워커용 데이터
  }
) {
  // MySQL: using imported db

  try {
    // task_queue에서 task_id로 조회 (한 task_id당 하나의 row만 존재)
    const existingQueue = await db.prepare(`
      SELECT task_id, type FROM task_queue
      WHERE task_id = ?
      LIMIT 1
    `).get(taskId) as { task_id: string; type: string } | undefined;

    const fields: string[] = ['status = ?'];
    const values: any[] = [status];

    // ⭐ type 업데이트 (Queue Spec v4 - phase 전환 지원)
    // 기존 큐의 type과 다르면 phase 전환으로 간주하여 type 업데이트
    if (existingQueue && existingQueue.type !== type) {
      fields.push('type = ?');
      values.push(type);
      console.log(`🔄 [updateQueueStatus] Phase transition: ${existingQueue.type} → ${type}`);
    }

    // error 메시지 처리
    if (options?.errorMessage !== undefined) {
      fields.push('error = ?');
      values.push(options.errorMessage);
    } else if (status !== 'failed') {
      // 실패가 아니면 에러 초기화
      fields.push('error = NULL');
    }

    // ⭐ processing 시작 시 task_lock 획득 (중복 실행 방지)
    if (status === 'processing') {
      try {
        // 이미 다른 작업이 processing 중이면 거부
        const existingProcessing = await db.prepare(`
          SELECT COUNT(*) as cnt FROM task_queue WHERE type = ? AND status = 'processing' AND task_id != ?
        `).get(type, taskId) as { cnt: number };

        if (existingProcessing.cnt > 0) {
          console.warn(`⚠️ [updateQueueStatus] 이미 ${type} 작업이 처리 중입니다. 대기열로 유지합니다.`);
          // MySQL: pool manages connections
          return; // 중복 processing 방지
        }

        await db.prepare(`
          INSERT INTO task_lock (task_type, lock_task_id, locked_at, worker_pid)
          VALUES (?, ?, NOW(), ?)
          ON DUPLICATE KEY UPDATE
            lock_task_id = VALUES(lock_task_id),
            locked_at = VALUES(locked_at),
            worker_pid = VALUES(worker_pid)
        `).run(type, taskId, process.pid);
        console.log(`🔒 [updateQueueStatus] Lock acquired for type: ${type}, task: ${taskId}`);
      } catch (e) {
        // task_lock 테이블이 없을 수 있음 (무시)
      }
    }

    // ⭐ 완료/실패 시 task_lock 해제
    if (status === 'completed' || status === 'failed') {
      try {
        await db.prepare(`
          UPDATE task_lock
          SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
          WHERE task_type = ?
        `).run(type);
        console.log(`🔓 [updateQueueStatus] Lock released for type: ${type}`);
      } catch (e) {
        // task_lock 테이블이 없을 수 있음 (무시)
      }
    }

    if (existingQueue) {
      // 기존 큐 업데이트 (task_id로만 업데이트, type도 변경 가능)
      values.push(taskId);
      await db.prepare(`
        UPDATE task_queue
        SET ${fields.join(', ')}
        WHERE task_id = ?
      `).run(...values);
      console.log(`✅ [updateQueueStatus] Updated: task_id=${taskId}, type=${type}, status=${status}`);
    } else {
      // 큐가 없으면 새로 생성 (task_id가 PK이므로 OR REPLACE)
      // ⚠️ task_schedule이 없는 고아 큐 방지 - task 존재 여부 확인
      const task = await db.prepare(`SELECT user_id FROM task WHERE task_id = ?`).get(taskId) as { user_id: string } | undefined;

      if (!task) {
        console.warn(`⚠️ [updateQueueStatus] task not found, skipping queue creation: ${taskId}`);
        // MySQL: pool manages connections
        return;
      }

      await db.prepare(`
        REPLACE INTO task_queue (task_id, type, status, error, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        taskId,
        type,
        status,
        options?.errorMessage || null,
        task.user_id
      );
      console.log(`✅ [updateQueueStatus] Created: task_id=${taskId}, type=${type}, status=${status}`);
    }
  } finally {
    // MySQL: pool manages connections
  }
}

// ============================================================
// ⚠️ DEPRECATED: 레거시 함수 (하위 호환용)
// ============================================================

/**
 * @deprecated updateQueueStatus()를 사용하세요
 * 스케줄 상태 업데이트 (새로운 세분화된 상태 지원)
 */
export async function updateScheduleStatus(
  scheduleId: string,
  status: ScheduleStatus | 'pending' | 'processing' | 'waiting_for_upload' | 'failed' | 'cancelled' | 'completed',  // 레거시 호환
  updates?: {
    scriptId?: string;
    videoId?: string;
    youtubeUploadId?: string;
    errorMessage?: string;  // 실패 시 에러 메시지
    failedStage?: string;   // 실패 단계
  }
) {
  // MySQL: using imported db

  // 레거시 상태를 새 상태로 변환
  let newStatus = status as string;
  if (LEGACY_STATUS_MAP[status]) {
    newStatus = LEGACY_STATUS_MAP[status];
  }

  // v6: schedule_id = task_id (task_schedule 제거됨)
  const taskId = scheduleId;

  // ⭐ task_queue용 status 매핑 (간단한 5가지 상태만 허용)
  const queueStatusMap: Record<string, string> = {
    'scheduled': 'waiting',
    'script_processing': 'processing',
    'image_processing': 'processing',
    'video_processing': 'processing',
    'youtube_processing': 'processing',
    'script_failed': 'failed',
    'image_failed': 'failed',
    'video_failed': 'failed',
    'youtube_failed': 'failed',
    'completed': 'completed',
    'cancelled': 'cancelled',
    // 레거시 상태 직접 매핑
    'pending': 'waiting',
    'processing': 'processing',
    'waiting_for_upload': 'waiting',  // ⭐ image type 큐가 별도로 processing
    'failed': 'failed'
  };

  const queueStatus = queueStatusMap[newStatus] || newStatus;

  // ⭐ task_queue에서 상태 업데이트 (상태 관리는 task_queue에서!)
  const queueFields = ['status = ?'];
  const queueValues: any[] = [queueStatus];

  if (updates?.errorMessage !== undefined) {
    queueFields.push('error = ?');
    queueValues.push(updates.errorMessage);
  }

  // 실패 상태가 아니면 에러 메시지 초기화
  if (!isFailedStatus(newStatus)) {
    queueFields.push('error = NULL');
  }

  queueValues.push(taskId);

  // task_queue 업데이트 (없으면 INSERT)
  const existingQueue = await db.prepare(`SELECT 1 FROM task_queue WHERE task_id = ?`).get(taskId);

  if (existingQueue) {
    await db.prepare(`
      UPDATE task_queue
      SET ${queueFields.join(', ')}
      WHERE task_id = ?
    `).run(...queueValues);
  } else {
    // 큐가 없으면 생성 (schedule 단계로 시작)
    const user = await db.prepare(`SELECT user_id FROM task WHERE task_id = ?`).get(taskId) as { user_id: string } | undefined;
    await db.prepare(`
      INSERT INTO task_queue (task_id, type, status, error, user_id, created_at)
      VALUES (?, 'schedule', ?, ?, ?, NOW())
    `).run(taskId, queueStatus, updates?.errorMessage || null, user?.user_id || 'system');
  }

  console.log(`[updateScheduleStatus] 스케줄 상태 업데이트: ${scheduleId} → ${newStatus}`);

  // MySQL: pool manages connections
}

// 설정 가져오기
export async function getAutomationSettings() {
  // MySQL: using imported db
  const settings = await db.prepare('SELECT `key`, value FROM automation_setting').all() as { key: string; value: string }[];
  // MySQL: pool manages connections

  return settings.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
}

// 설정 업데이트
export async function updateAutomationSetting(key: string, value: string) {
  // MySQL: using imported db

  // INSERT OR REPLACE로 변경 - 키가 없으면 새로 생성
  // MySQL: ON DUPLICATE KEY UPDATE (SQLite는 ON CONFLICT)
  await db.prepare(`
    INSERT INTO automation_setting (\`key\`, \`value\`, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      \`value\` = VALUES(\`value\`),
      updated_at = CURRENT_TIMESTAMP
  `).run(key, value);

  console.log(`[Automation] Setting updated: ${key} = ${value}`);
  // MySQL: pool manages connections
}

// 모든 제목 가져오기 (스케줄 정보 포함)
export async function getAllVideoTitles() {
  // MySQL: using imported db

  // task + content + content_setting JOIN (통합 키 시스템)
  const titles = await db.prepare(`
    SELECT
      t.task_id as taskId,
      c.title,
      c.prompt_format as promptFormat,
      c.category,
      cs.tags,
      c.youtube_channel as youtubeChannel,
      cs.script_mode as scriptMode,
      cs.media_mode as mediaMode,
      c.ai_model as aiModel,
      cs.tts_voice as ttsVoice,
      cs.tts_speed as ttsSpeed,
      c.product_info as productInfo,
      c.score,
      c.youtube_url as youtubeUrl,
      (SELECT COUNT(*) FROM youtube_uploads yu WHERE yu.content_id = c.content_id) as youtubeUploadCount,
      c.created_at as createdAt,
      c.updated_at as updatedAt,
      t.user_id as userId,
      t.scheduled_time as scheduledTime,
      c.youtube_publish_time as youtubePublishTime,
      cs.youtube_privacy as youtubePrivacy,
      q.status
    FROM task t
    JOIN content c ON t.task_id = c.content_id
    LEFT JOIN content_setting cs ON t.task_id = cs.content_id
    LEFT JOIN task_queue q ON t.task_id = q.task_id AND q.type = 'schedule'
    ORDER BY c.created_at DESC
  `).all();

  // MySQL: pool manages connections

  // product_info 파싱 + product_data, product_url 매핑
  const parsedTitles = titles.map((title: any) => {
    if (title.product_info && typeof title.product_info === 'string') {
      try {
        title.product_info = JSON.parse(title.product_info);
      } catch (e) {
        console.error('Failed to parse product_info:', e);
        title.product_info = null;
      }
    }
    if (title.product_info) {
      title.product_data = title.product_info;
      // ⭐ 통일 구조: deepLink (레거시: url, product_link, productUrl)
      title.product_url = title.product_info.deepLink || title.product_info.url || title.product_info.product_link || null;
    }
    return title;
  });

  return parsedTitles;
}

// 스케줄 카운트만 빠르게 가져오기
export async function getAllScheduleCount() {
  const sql = getSql('automation', 'getAllScheduleCount');
  const counts = await db.prepare(sql).all();

  const result: Record<string, number> = {
    schedule: 0,
    script: 0,
    image: 0,
    video: 0,
    youtube: 0,
    failed: 0,
    completed: 0,
    cancelled: 0,
  };

  for (const row of counts as any[]) {
    if (row.tabType && result.hasOwnProperty(row.tabType)) {
      result[row.tabType] = row.count;
    }
  }

  return result;
}

// 특정 탭의 스케줄 가져오기 (페이지네이션)
export async function getAllSchedule() {
  // MySQL: using imported db
  // ⭐⭐⭐ task_queue 기준! (실제 작업 큐)
  // 전체 데이터 반환 → 프론트엔드에서 필터링

  const sql = getSql('automation', 'getAllSchedule');
  const schedules = await db.prepare(sql).all();
  // MySQL: pool manages connections

  // 🔍 디버깅: 첫 번째 항목의 필드 확인
  if (schedules.length > 0) {
    console.log('📊 [getAllSchedule] First item keys:', Object.keys(schedules[0]));
    console.log('📊 [getAllSchedule] First item sample:', {
      taskId: schedules[0].taskId,
      type: schedules[0].type,
      status: schedules[0].status,
      tabType: schedules[0].tabType,
      title: schedules[0].title?.substring(0, 30)
    });
  }

  // product_info 파싱 + product_data, product_url 매핑
  const parsedSchedules = schedules.map((schedule: any) => {
    // SQL에서 productInfo로 alias되어 반환됨
    const productInfoField = schedule.productInfo || schedule.product_info;

    if (productInfoField && typeof productInfoField === 'string') {
      try {
        schedule.product_info = JSON.parse(productInfoField);
        schedule.productInfo = schedule.product_info; // 통일
      } catch (e) {
        console.error('Failed to parse product_info:', e);
        schedule.product_info = null;
        schedule.productInfo = null;
      }
    } else if (productInfoField) {
      schedule.product_info = productInfoField;
      schedule.productInfo = productInfoField;
    }

    if (schedule.product_info) {
      schedule.product_data = schedule.product_info;
      // ⭐ 통일 구조: deepLink 우선 사용 (수익화 필수!)
      schedule.product_url = schedule.product_info.deepLink || schedule.product_info.url || schedule.product_info.product_link || null;
    }

    // ⭐ id 필드 추가 (taskId와 동일) - 하위 호환성
    schedule.id = schedule.taskId || schedule.id;

    return schedule;
  });

  return parsedSchedules;
}

// 파이프라인 상세 정보 가져오기
export async function getPipelineDetails(scheduleId: string) {
  // ⚠️ DEPRECATED: automation_pipelines 테이블 제거됨
  // task_queue 시스템으로 대체됨 - 빈 데이터 반환
  console.log(`[getPipelineDetails] DEPRECATED - returning empty data for schedule ${scheduleId}`);
  return { pipelines: [], logs: [] };
}

// ========== 채널 설정 관리 함수 ==========

// 채널 색상 팔레트 (16가지)
const CHANNEL_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // green-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#6366f1', // indigo-500
  '#a855f7', // purple-500
  '#84cc16', // lime-500
  '#eab308', // yellow-500
  '#22c55e', // green-600
  '#d946ef', // fuchsia-500
  '#0ea5e9', // sky-500
];

// 사용 중인 색상과 겹치지 않는 색상 자동 선택
async function getAvailableChannelColor(userId: string): Promise<string> {
  // MySQL: using imported db

  try {
    // 이미 사용 중인 색상 조회
    const usedColors = await db.prepare(`
      SELECT DISTINCT color FROM youtube_channel_setting
      WHERE user_id = ?
    `).all(userId) as Array<{ color: string }>;

    const usedColorSet = new Set(usedColors.map(c => c.color));

    // 사용되지 않은 색상 찾기
    for (const color of CHANNEL_COLORS) {
      if (!usedColorSet.has(color)) {
        return color;
      }
    }

    // 모든 색상이 사용 중이면 첫 번째 색상 반환
    return CHANNEL_COLORS[0];
  } finally {
    // MySQL: pool manages connections
  }
}

// 채널 설정 추가 또는 업데이트
export async function upsertChannelSettings(data: {
  userId: string;
  channelId: string;
  channelName: string;
  color?: string;
  postingMode?: 'fixed_interval' | 'weekday_time';
  intervalValue?: number;
  intervalUnit?: 'hours' | 'days';
  postingTimes?: string[]; // 고정 주기용 시간대 (예: ["09:00", "15:00", "21:00"])
  weekdayTimes?: { [weekday: string]: string[] }; // 요일별 시간 (예: {"1": ["09:00", "12:00"]})
  isActive?: boolean;
  categories?: string[]; // 자동 제목 생성용 카테고리 리스트
}) {
  // MySQL: using imported db
  const id = `channel_settings_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // JSON 문자열로 변환
  const postingTimesJson = data.postingTimes ? JSON.stringify(data.postingTimes) : null;
  const weekdayTimesJson = data.weekdayTimes ? JSON.stringify(data.weekdayTimes) : null;
  const categoriesJson = data.categories ? JSON.stringify(data.categories) : null;

  // 색상이 지정되지 않은 경우 자동으로 겹치지 않는 색상 할당
  const assignedColor = data.color || getAvailableChannelColor(data.userId);

  try {
    // ⚠️ PK는 setting_id (id 아님!)
    await db.prepare(`
      INSERT INTO youtube_channel_setting
        (setting_id, user_id, channel_id, channel_name, color, posting_mode,
         interval_value, interval_unit, posting_times, weekday_times, is_active, categories)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        channel_name = VALUES(channel_name),
        color = VALUES(color),
        posting_mode = VALUES(posting_mode),
        interval_value = VALUES(interval_value),
        interval_unit = VALUES(interval_unit),
        posting_times = VALUES(posting_times),
        weekday_times = VALUES(weekday_times),
        is_active = VALUES(is_active),
        categories = VALUES(categories),
        updated_at = CURRENT_TIMESTAMP
    `).run(
      id,
      data.userId,
      data.channelId,
      data.channelName,
      assignedColor,
      data.postingMode || 'fixed_interval',
      data.intervalValue || null,
      data.intervalUnit || null,
      postingTimesJson,
      weekdayTimesJson,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
      categoriesJson
    );
  } catch (error) {
    // MySQL: pool manages connections
    throw error;
  }

  // MySQL: pool manages connections
  return id;
}

// 사용자의 모든 채널 설정 조회
export async function getChannelSettings(userId: string) {
  // MySQL: using imported db
  const settings = await db.prepare(`
    SELECT * FROM youtube_channel_setting
    WHERE user_id = ? AND is_active = 1
    ORDER BY created_at DESC
  `).all(userId);

  // MySQL: pool manages connections

  // posting_times, weekday_times, categories JSON 파싱
  return settings.map((setting: any) => ({
    ...setting,
    posting_times: setting.posting_times ? JSON.parse(setting.posting_times) : null,
    weekday_times: setting.weekday_times ? JSON.parse(setting.weekday_times) : null,
    categories: setting.categories ? JSON.parse(setting.categories) : null,
    isActive: setting.is_active === 1
  }));
}

// 특정 채널 설정 조회
export async function getChannelSetting(userId: string, channelId: string) {
  // MySQL: using imported db
  const setting = await db.prepare(`
    SELECT * FROM youtube_channel_setting
    WHERE user_id = ? AND channel_id = ?
  `).get(userId, channelId) as any;

  // MySQL: pool manages connections

  if (!setting) return null;

  return {
    ...setting,
    posting_times: setting.posting_times ? JSON.parse(setting.posting_times) : null,
    weekday_times: setting.weekday_times ? JSON.parse(setting.weekday_times) : null,
    categories: setting.categories ? JSON.parse(setting.categories) : null,
    isActive: setting.is_active === 1
  };
}

// 채널 설정 업데이트
export async function updateChannelSettings(
  userId: string,
  channelId: string,
  updates: {
    color?: string;
    postingMode?: 'fixed_interval' | 'weekday_time';
    intervalValue?: number;
    intervalUnit?: 'hours' | 'days';
    postingTimes?: string[];  // 고정 주기용 시간대
    weekdayTimes?: { [weekday: string]: string[] };
    isActive?: boolean;
    categories?: string[];
  }
) {
  // MySQL: using imported db

  const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];

  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color);
  }
  if (updates.postingMode !== undefined) {
    fields.push('posting_mode = ?');
    values.push(updates.postingMode);
  }
  if (updates.intervalValue !== undefined) {
    fields.push('interval_value = ?');
    values.push(updates.intervalValue);
  }
  if (updates.intervalUnit !== undefined) {
    fields.push('interval_unit = ?');
    values.push(updates.intervalUnit);
  }
  if (updates.postingTimes !== undefined) {
    fields.push('posting_times = ?');
    values.push(JSON.stringify(updates.postingTimes));
  }
  if (updates.weekdayTimes !== undefined) {
    fields.push('weekday_times = ?');
    values.push(JSON.stringify(updates.weekdayTimes));
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  if (updates.categories !== undefined) {
    fields.push('categories = ?');
    values.push(JSON.stringify(updates.categories));
  }

  values.push(userId, channelId);

  await db.prepare(`
    UPDATE youtube_channel_setting
    SET ${fields.join(', ')}
    WHERE user_id = ? AND channel_id = ?
  `).run(...values);

  // MySQL: pool manages connections
}

// 채널 설정 삭제 (soft delete)
export async function deleteChannelSettings(userId: string, channelId: string) {
  // MySQL: using imported db
  await db.prepare(`
    UPDATE youtube_channel_setting
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND channel_id = ?
  `).run(userId, channelId);
  // MySQL: pool manages connections
}

// 다음 스케줄 시간 계산 (채널 설정 기반)
export async function calculateNextScheduleTime(
  userId: string,
  channelId: string,
  fromDate?: Date
): Promise<Date | null> {
  const setting = await getChannelSetting(userId, channelId);
  if (!setting || !setting.isActive) return null;

  const now = fromDate || new Date();

  if (setting.posting_mode === 'fixed_interval') {
    // 고정 주기 모드
    if (!setting.interval_value || !setting.interval_unit) return null;

    const nextDate = new Date(now);

    if (setting.interval_unit === 'minutes') {
      // 최소 5분 제한
      const minutes = Math.max(5, setting.interval_value);
      nextDate.setMinutes(nextDate.getMinutes() + minutes);
    } else if (setting.interval_unit === 'hours') {
      nextDate.setHours(nextDate.getHours() + setting.interval_value);
    } else if (setting.interval_unit === 'days') {
      // ⭐ 일 단위: 먼저 시간을 설정하고, 과거면 날짜를 더함 (당일 스케줄 지원)
      // 채널 설정의 default_time 사용, 없으면 11:00
      const defaultTime = setting.default_time || '11:00';
      const [hours, minutes] = defaultTime.split(':').map(Number);

      const realNow = new Date();

      // ✅ 먼저 오늘의 지정 시간으로 설정
      nextDate.setHours(hours || 11, minutes || 0, 0, 0);

      // ✅ 과거 시간이면 다음 간격으로 (현재보다 미래가 될 때까지)
      while (nextDate <= realNow) {
        nextDate.setDate(nextDate.getDate() + setting.interval_value);
        nextDate.setHours(hours || 11, minutes || 0, 0, 0);  // 시간도 다시 설정!
      }
    }

    return nextDate;
  } else if (setting.posting_mode === 'weekday_time') {
    // 요일/시간 지정 모드 (요일별 독립 시간대 지원)
    if (!setting.weekday_times || Object.keys(setting.weekday_times).length === 0) return null;

    const weekdayTimes = setting.weekday_times;

    // 모든 가능한 다음 시간 후보들을 찾기
    const candidates: Date[] = [];

    // 오늘과 앞으로 7일 동안 검색
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + dayOffset);
      const dayOfWeek = checkDate.getDay();
      const dayKey = dayOfWeek.toString();

      // 이 요일에 설정된 시간이 있는지 확인
      if (weekdayTimes[dayKey] && Array.isArray(weekdayTimes[dayKey])) {
        const times = weekdayTimes[dayKey];

        // 모든 시간에 대해 확인
        for (const time of times) {
          const [hours, minutes] = time.split(':').map(Number);
          const candidate = new Date(checkDate);
          candidate.setHours(hours, minutes, 0, 0);

          // 미래 시간만 추가
          if (candidate > now) {
            candidates.push(candidate);
          }
        }
      }
    }

    // 가장 가까운 미래 시간 찾기
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.getTime() - b.getTime());
    return candidates[0];
  }

  return null;
}

/**
 * 채널의 빈 스케줄 슬롯 가져오기
 * - 채널 설정의 weekday_times 기반으로 앞으로 7일간 슬롯 생성
 * - 이미 스케줄이 있는 슬롯은 제외
 * @param userId 사용자 ID
 * @param channelId 채널 ID
 * @param limit 가져올 슬롯 수 (기본 10개)
 * @returns 빈 슬롯 시간 배열
 */
export async function getAvailableScheduleSlots(
  userId: string,
  channelId: string,
  limit: number = 10
): Promise<Date[]> {
  const setting = await getChannelSetting(userId, channelId);
  if (!setting || !setting.isActive) return [];

  // weekday_time 모드만 지원 (fixed_interval은 슬롯 개념이 없음)
  if (setting.posting_mode !== 'weekday_time') return [];
  if (!setting.weekday_times || Object.keys(setting.weekday_times).length === 0) return [];

  const weekdayTimes = setting.weekday_times;
  const now = new Date();
  const allSlots: Date[] = [];

  // 오늘 + 내일만 (2일간) 슬롯 생성
  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dayOfWeek = checkDate.getDay();
    const dayKey = dayOfWeek.toString();

    if (weekdayTimes[dayKey] && Array.isArray(weekdayTimes[dayKey])) {
      const times = weekdayTimes[dayKey];

      for (const time of times) {
        const [hours, minutes] = time.split(':').map(Number);
        const slot = new Date(checkDate);
        slot.setHours(hours, minutes, 0, 0);

        // 미래 시간만 추가
        if (slot > now) {
          allSlots.push(slot);
        }
      }
    }
  }

  // 시간순 정렬
  allSlots.sort((a, b) => a.getTime() - b.getTime());

  // 이미 스케줄이 있는 슬롯 제외
  // v5: content_setting.youtube_channel 사용
  // MySQL: using imported db
  const existingSchedules = await db.prepare(`
    SELECT t.scheduled_time
    FROM task t
    JOIN content c ON t.task_id = c.content_id
    LEFT JOIN content_setting cs ON t.task_id = cs.content_id
    WHERE t.user_id = ? AND c.youtube_channel = ?
      AND t.scheduled_time >= NOW()
      AND t.scheduled_time IS NOT NULL
  `).all(userId, channelId) as { scheduled_time: string }[];
  // MySQL: pool manages connections

  // 기존 스케줄 시간을 Set으로 변환 (빠른 조회용)
  const existingTimes = new Set(
    existingSchedules.map(s => {
      const d = new Date(s.scheduled_time);
      // 분 단위까지만 비교 (초/밀리초 무시)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
    })
  );

  // 빈 슬롯만 필터링
  const availableSlots = allSlots.filter(slot => {
    const slotKey = `${slot.getFullYear()}-${slot.getMonth()}-${slot.getDate()}-${slot.getHours()}-${slot.getMinutes()}`;
    return !existingTimes.has(slotKey);
  });

  return availableSlots.slice(0, limit);
}

// ===== 카테고리 관리 함수 =====

// 카테고리 추가
export async function addCategory(data: {
  userId: string;
  name: string;
  description?: string;
}): Promise<string> {
  // MySQL: using imported db
  const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  await db.prepare(`
    INSERT INTO user_content_category (id, user_id, name, description)
    VALUES (?, ?, ?, ?)
  `).run(id, data.userId, data.name.trim(), data.description || '');

  // MySQL: pool manages connections
  return id;
}

// 카테고리 목록 조회
export async function getCategories(userId: string) {
  // MySQL: using imported db
  const categories = await db.prepare(`
    SELECT * FROM user_content_category
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);
  // MySQL: pool manages connections
  return categories;
}

// 카테고리 수정
export async function updateCategory(data: {
  id: string;
  userId: string;
  name?: string;
  description?: string;
}) {
  // MySQL: using imported db

  const updates: string[] = [];
  const values: any[] = [];

  if (data.name) {
    updates.push('name = ?');
    values.push(data.name.trim());
  }

  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }

  if (updates.length > 0) {
    values.push(data.id, data.userId);
    await db.prepare(`
      UPDATE user_content_category
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...values);
  }

  // MySQL: pool manages connections
}

// 카테고리 삭제
export async function deleteCategory(id: string, userId: string) {
  // MySQL: using imported db
  await db.prepare(`
    DELETE FROM user_content_category
    WHERE id = ? AND user_id = ?
  `).run(id, userId);
  // MySQL: pool manages connections
}

// 기본 카테고리 초기화 (사용자별)
export async function initDefaultCategories(userId: string) {
  // MySQL: using imported db

  // user 테이블에 해당 유저가 없으면 더미로 생성 (FK 제약조건 해결)
  const userExists = await db.prepare(`SELECT 1 FROM user WHERE user_id = ?`).get(userId);
  if (!userExists) {
    try {
      await db.prepare(`
        INSERT INTO user (user_id, email, password, nickname, is_admin)
        VALUES (?, ?, '', '', 0)
      `).run(userId, `${userId}@placeholder.local`);
    } catch (e) {
      // 이미 존재하면 무시
    }
  }

  // 이미 카테고리가 있는지 확인
  const existingCount = await db.prepare(`
    SELECT COUNT(*) as count FROM user_content_category WHERE user_id = ?
  `).get(userId) as { count: number };

  if (existingCount.count > 0) {
    // MySQL: pool manages connections
    return; // 이미 카테고리가 있으면 스킵
  }

  // 기본 카테고리 목록
  const defaultCategories = [
    { name: '상품', description: '상품 관련 영상' },
    { name: '시니어사연', description: '시니어 사연 영상' },
    { name: '탈북자사연', description: '북한 탈북자 사연' },
    { name: '막장드라마', description: '막장 드라마' },
  ];

  const stmt = await db.prepare(`
    INSERT INTO user_content_category (id, user_id, name, description)
    VALUES (?, ?, ?, ?)
  `);

  for (const category of defaultCategories) {
    const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    try {
      stmt.run(id, userId, category.name, category.description);
    } catch (e) {
      // 중복 등의 에러는 무시
      console.error(`Failed to insert default category ${category.name}:`, e);
    }
  }

  // MySQL: pool manages connections
  console.log(`✅ Default categories initialized for user ${userId}`);
}

// ===== 자동 생성 로그 함수 (REMOVED) =====
// automation_log 테이블 제거됨 - 에러는 이메일로 전송 (sendAutomationErrorEmail)

// ============================================================
// 제목 후보 관리 함수 (title_pool 테이블 활용)
// ============================================================

/**
 * 생성된 제목 후보들 저장 (중복 제외)
 */
export async function saveTitleCandidates(
  category: string,
  titles: { title: string; score: number; aiModel: string }[]
): Promise<number> {
  // MySQL: using imported db
  let savedCount = 0;

  for (const item of titles) {
    // 중복 체크 (같은 제목이 이미 있는지)
    const existing = await db.prepare(`
      SELECT title_id FROM title_pool WHERE title = ?
    `).get(item.title);

    if (!existing) {
      const id = `title_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await db.prepare(`
        INSERT INTO title_pool (title_id, category, title, score, ai_model, used)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(id, category, item.title, item.score, item.aiModel);
      savedCount++;
    }
  }

  // MySQL: pool manages connections
  console.log(`[TitlePool] ${savedCount}/${titles.length} 제목 저장됨 (중복 제외)`);
  return savedCount;
}

/**
 * 제목 사용 마킹
 */
export async function markTitleAsUsed(title: string): Promise<boolean> {
  // MySQL: using imported db
  const result = await db.prepare(`
    UPDATE title_pool SET used = 1 WHERE title = ?
  `).run(title);
  // MySQL: pool manages connections
  return result.changes > 0;
}

/**
 * 미사용 고득점 제목 조회
 */
export async function getUnusedTitleCandidates(
  category: string,
  limit: number = 10,
  minScore: number = 0
): Promise<{ titleId: string; title: string; score: number; aiModel: string; createdAt: string }[]> {
  // MySQL: using imported db
  const titles = await db.prepare(`
    SELECT title_id as titleId, title, score, ai_model as aiModel, created_at as createdAt
    FROM title_pool
    WHERE category = ? AND used = 0 AND score >= ?
    ORDER BY score DESC, created_at DESC
    LIMIT ?
  `).all(category, minScore, limit);
  // MySQL: pool manages connections
  return titles as any[];
}

/**
 * 미사용 제목 사용 (가져오고 마킹)
 */
export async function useUnusedTitle(
  category: string,
  minScore: number = 70
): Promise<{ titleId: string; title: string; score: number; aiModel: string } | null> {
  // MySQL: using imported db

  const title = await db.prepare(`
    SELECT title_id as titleId, title, score, ai_model as aiModel
    FROM title_pool
    WHERE category = ? AND used = 0 AND score >= ?
    ORDER BY score DESC, RAND()
    LIMIT 1
  `).get(category, minScore) as any;

  if (title) {
    await db.prepare(`UPDATE title_pool SET used = 1 WHERE title_id = ?`).run(title.titleId);
    console.log(`[TitlePool] 미사용 제목 사용: "${title.title}" (score: ${title.score})`);
  }

  // MySQL: pool manages connections
  return title || null;
}

/**
 * 제목 풀 통계 조회
 */
export async function getTitlePoolStats(): Promise<{ category: string; total: number; unused: number; avgScore: number }[]> {
  // MySQL: using imported db
  const stats = await db.prepare(`
    SELECT
      category,
      COUNT(*) as total,
      SUM(CASE WHEN used = 0 THEN 1 ELSE 0 END) as unused,
      ROUND(AVG(score), 1) as avgScore
    FROM title_pool
    GROUP BY category
    ORDER BY unused DESC
  `).all();
  // MySQL: pool manages connections
  return stats as any[];
}

// ============================================================
// 큐 상태 관리 함수 (새로운 상태 시스템)
// ============================================================

// 큐 탭별 스케줄 조회 (task_queue 기준)
export async function getSchedulesByQueueTab(tab: string) {
  // MySQL: using imported db

  // ⭐ task_queue에서 상태 필터링 (상태 관리는 task_queue에서!)
  let statusFilter: string;
  switch (tab) {
    case 'scheduled':
      statusFilter = `q.type = 'schedule' AND q.status = 'waiting'`;
      break;
    case 'script':
      statusFilter = `q.type = 'script' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'image':
      statusFilter = `q.type = 'image' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'video':
      statusFilter = `q.type = 'video' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'youtube':
      statusFilter = `q.type = 'youtube' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'failed':
      statusFilter = `q.status = 'failed'`;
      break;
    case 'completed':
      statusFilter = `q.type = 'schedule' AND q.status = 'completed'`;
      break;
    default:
      statusFilter = `1=1`;
  }

  // v5: content + content_setting 테이블 사용
  const schedules = await db.prepare(`
    SELECT
      t.task_id as taskId,
      t.scheduled_time as scheduledTime,
      c.youtube_publish_time as youtubePublishTime,
      cs.youtube_privacy as youtubePrivacy,
      t.created_at as createdAt,
      c.title,
      c.prompt_format as promptFormat,
      t.user_id as userId,
      c.product_info as productInfo,
      c.youtube_channel as youtubeChannel,
      cs.media_mode as mediaMode,
      q.status,
      q.type as queueType,
      q.error
    FROM task t
    JOIN content c ON t.task_id = c.content_id
    LEFT JOIN content_setting cs ON t.task_id = cs.content_id
    LEFT JOIN task_queue q ON t.task_id = q.task_id
    WHERE ${statusFilter} AND t.scheduled_time IS NOT NULL
    ORDER BY t.scheduled_time DESC
  `).all();

  // MySQL: pool manages connections
  return schedules;
}

// 큐 탭별 카운트 조회 (task_queue 기준)
export async function getQueueCounts() {
  // MySQL: using imported db

  // ⭐ task_queue에서 상태 카운트 (상태 관리는 task_queue에서!)
  const counts = await db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'schedule' AND status = 'waiting' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN type = 'script' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as script,
      SUM(CASE WHEN type = 'image' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as image,
      SUM(CASE WHEN type = 'video' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as video,
      SUM(CASE WHEN type = 'youtube' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as youtube,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN type = 'schedule' AND status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM task_queue
  `).get() as any;

  // MySQL: pool manages connections
  return {
    scheduled: counts?.scheduled || 0,
    script: counts?.script || 0,
    image: counts?.image || 0,
    video: counts?.video || 0,
    youtube: counts?.youtube || 0,
    failed: counts?.failed || 0,
    completed: counts?.completed || 0,
  };
}

// 실패한 스케줄 재시도
export async function retryFailedSchedule(taskId: string): Promise<{ success: boolean; newStatus?: ScheduleStatus; error?: string }> {
  // MySQL: using imported db
  try {
    // task_queue에서 실패한 작업 조회
    const queue = await db.prepare(`
      SELECT task_id, type, status
      FROM task_queue
      WHERE task_id = ? AND status = 'failed'
    `).get(taskId) as { task_id: string; type: string; status: string } | undefined;

    if (!queue) {
      return { success: false, error: '실패한 작업을 찾을 수 없습니다.' };
    }

    // task_queue 상태를 waiting으로 변경 (재시도 대기)
    await db.prepare(`
      UPDATE task_queue
      SET status = 'waiting',
          error = NULL,
          started_at = NULL
      WHERE task_id = ?
    `).run(taskId);

    console.log(`✅ 작업 재시도: ${taskId} (${queue.type}: failed → waiting)`);

    return { success: true, newStatus: 'waiting' as ScheduleStatus };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 스케줄 취소
export async function cancelSchedule(scheduleId: string): Promise<{ success: boolean; error?: string }> {
  // MySQL: using imported db

  try {
    // v6: schedule_id = task_id (task_schedule 제거됨)
    const taskId = scheduleId;

    // task_queue에서 상태 확인
    const schedule = await db.prepare(`
      SELECT task_id, status
      FROM task_queue
      WHERE task_id = ? AND type = 'schedule'
    `).get(taskId) as { task_id: string; status: string } | undefined;

    if (!schedule) {
      // MySQL: pool manages connections
      return { success: false, error: '스케줄을 찾을 수 없습니다.' };
    }

    // 완료 상태면 취소 불가
    if (schedule.status === 'completed') {
      // MySQL: pool manages connections
      return { success: false, error: '이미 완료된 스케줄은 취소할 수 없습니다.' };
    }

    // task_queue에서 상태 업데이트
    await db.prepare(`
      UPDATE task_queue
      SET status = 'cancelled'
      WHERE task_id = ? AND type = 'schedule'
    `).run(taskId);

    console.log(`❌ 스케줄 취소: ${scheduleId}`);

    // MySQL: pool manages connections
    return { success: true };
  } catch (error: any) {
    // MySQL: pool manages connections
    return { success: false, error: error.message };
  }
}

// 스케줄 상세 정보 조회 (v5: content + content_setting 사용)
export async function getScheduleDetail(scheduleId: string) {
  // MySQL: using imported db

  const schedule = await db.prepare(`
    SELECT
      t.*,
      c.title,
      c.prompt_format as type,
      t.user_id,
      c.product_info,
      cs.settings
    FROM task t
    JOIN content c ON t.task_id = c.content_id
    LEFT JOIN content_setting cs ON t.task_id = cs.content_id
    WHERE t.task_id = ?
  `).get(scheduleId) as any;

  // MySQL: pool manages connections

  if (schedule && schedule.product_info && typeof schedule.product_info === 'string') {
    try {
      schedule.product_info = JSON.parse(schedule.product_info);
    } catch (e) {
      schedule.product_info = null;
    }
  }

  return schedule;
}
