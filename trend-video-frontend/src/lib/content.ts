/**
 * @fileoverview script_content 컬럼 삭제 대응 리팩토링
 * @refactored 2025-11-28
 * @see .claude/REFACTORING_SPEC.md - 변경 스펙 문서 (수정 전 필독!)
 * @warning script_content 컬럼은 삭제됨. DB에서 읽으면 에러 발생.
 *          대본은 tasks/{id}/story.json 파일에서 읽어야 함.
 */
// 통합 Content 관리 (Queue Spec v3 schema)
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from './sqlite';
// ⭐ 중앙화된 타입 정의 사용 (src/types/content.ts)
import type {
  Content,
  ContentType,
  ContentFormat,
  ContentStatus,
  ProductInfo,
  TokenUsage,
  CreateContentOptions,
  ContentUpdateFields
} from '@/types/content';

// ============================================================
// ⚠️ ID 규칙 (큐 스펙 v3 - 통합 키 시스템):
// ============================================================
//
// 🔑 핵심: task_id = content_id (동일한 UUID)
//
// - task 생성 시 content + content_setting 동시 생성
// - task.task_id = content.content_id = content_setting.content_id
// - 하나의 작업 = 하나의 ID로 모든 테이블 연결
//
// 테이블 관계:
// - task: 작업 정의 (제목, 타입, 상태)
// - content: 콘텐츠 정보 (user_id, ai_model, product_info 등)
// - content_setting: 제작 설정 (script_mode, media_mode, channel, tts 등)
// - task_queue: 큐 상태 관리
// - task_schedule: 예약 스케줄
//
// 폴더 구조: tasks/{task_id}/
// - story.json, video.mp4, thumbnail.png 등
// ============================================================

// Re-export for backward compatibility
export type { Content, ContentType, ContentFormat, ContentStatus, ProductInfo, TokenUsage };

// ==================== 로컬 시간 헬퍼 ====================
/** 로컬 시간을 YYYY-MM-DD HH:mm:ss 형식으로 반환 */
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ==================== Content 생성 ====================

/**
 * 콘텐츠 생성 (Queue Spec v3)
 * @param userId - 사용자 ID
 * @param title - 콘텐츠 제목
 * @param options - 생성 옵션
 * @deprecated type parameter removed in v3 - content type determined by scriptContent/videoPath presence
 */
export async function createContent(
  userId: string,
  title: string,
  options?: CreateContentOptions & { type?: ContentType }
): Promise<Content> {
  // ⭐ 외부에서 ID를 지정할 수 있음 (영상 생성 시 taskId 사용)
  const contentId = options?.id || crypto.randomUUID();
  const now = getLocalDateTime();  // 로컬 시간 사용

  // productInfo가 있으면 category를 "상품"으로 자동 설정
  const category = options?.productInfo ? '상품' : (options?.category || undefined);

  // productInfo를 JSON 문자열로 변환
  const productInfoJson = options?.productInfo ? JSON.stringify(options.productInfo) : null;

  // ⭐ Backward compatibility: options.content → scriptContent
  const scriptContent = options?.scriptContent || options?.content || null;

  // prompt_format 결정: options에서 가져오거나 productInfo 있으면 'product'
  const promptFormat = options?.promptFormat || options?.format || (options?.productInfo ? 'product' : null);

  // content 테이블에 직접 삽입 - PK: content_id only (v3)
  // ⭐ 삭제된 컬럼: type, format, tts_voice, use_claude_local, script_content,
  // content, video_path(폴더에서 탐색)
  // ⚠️ content 컬럼 삭제됨 - 대본은 tasks/{id}/story.json에서 읽음
  const stmt = await db.prepare(`
    INSERT INTO content (
      content_id, user_id, title, original_title,
      youtube_url,
      status, input_tokens, output_tokens, ai_model,
      source_content_id,
      product_info, category, prompt_format, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      youtube_url = VALUES(youtube_url),
      input_tokens = COALESCE(VALUES(input_tokens), input_tokens),
      output_tokens = COALESCE(VALUES(output_tokens), output_tokens),
      ai_model = COALESCE(VALUES(ai_model), ai_model),
      product_info = COALESCE(VALUES(product_info), product_info),
      prompt_format = COALESCE(VALUES(prompt_format), prompt_format),
      updated_at = VALUES(updated_at)
  `);

  // ⭐ BTS-3363: 3단계 status (draft → script → video → completed)
  // - youtubeUrl 존재 → completed
  // - videoPath 존재 → video
  // - scriptContent 존재 → script
  // - 그 외 → draft (내콘텐츠에 표시 안 됨)
  const status = (options?.videoPath || options?.youtubeUrl) ? 'video' : (scriptContent ? 'script' : (promptFormat ? 'pending' : 'draft'));
                                                                                  
    await stmt.run(                                                               
      contentId,                                                                  
      userId,                                                                     
      title,                                                                      
      options?.originalTitle || null,
    options?.youtubeUrl || null,
    status,
    options?.tokenUsage?.input_tokens || null,
    options?.tokenUsage?.output_tokens || null,
    options?.aiModel || null,
    options?.sourceContentId || null,
    productInfoJson,
    category,
    promptFormat,
    now,
    now
  );

  return {
    id: contentId,  // 하위 호환성
    contentId,      // ⭐ 새 필드 (= task_id = script_id = video_id)
    userId,
    title,
    originalTitle: options?.originalTitle,
    content: scriptContent || undefined,
    youtubeUrl: options?.youtubeUrl || undefined,
    status,  // ⭐ 위에서 계산된 status 사용
    progress: calculateProgress(status, undefined, contentId),  // ⭐ 로그 기반 계산
    tokenUsage: options?.tokenUsage,
    aiModel: options?.aiModel,
    sourceContentId: options?.sourceContentId,
    productInfo: options?.productInfo,
    category,
    promptFormat: promptFormat || undefined,  // ⭐ 숏폼/롱폼 정보
    createdAt: now,
    updatedAt: now
  };
}

// ==================== Content 조회 ====================

/**
 * content_id로 조회
 * @param contentId - 콘텐츠 ID
 * @param type - @deprecated type parameter removed in Queue Spec v3
 */
export async function findContentById(contentId: string, type?: ContentType): Promise<Content | null> {
  // v3: type 파라미터는 무시하고 content_id로만 조회
  const stmt = await db.prepare(`SELECT * FROM content WHERE content_id = ?`);
  const row = await stmt.get(contentId) as any;

  if (!row) return null;
  return rowToContent(row);
}

/**
 * content_id로 모든 콘텐츠 조회
 * @deprecated In Queue Spec v3, each content_id has only one record
 */
export async function findAllContentById(contentId: string): Promise<Content[]> {
  const content = await findContentById(contentId);
  return content ? [content] : [];
}

export async function getContentsByUserId(
  userId: string,
  options?: {
    type?: 'script' | 'video';  // @deprecated - kept for backward compatibility
    format?: 'longform' | 'shortform' | 'sora2';
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Content[]> {
  let query = 'SELECT * FROM content WHERE user_id = ?';
  const params: any[] = [userId];

  // ⭐ draft 상태 제외 (내콘텐츠에 표시하지 않음)
  query += ' AND status != \'draft\'';

  // ⚠️ type 필터는 v3에서 제거되었지만 하위 호환성을 위해 유지
  // script: content IS NOT NULL
  // video: 완료/실패/취소 모두 포함 (video 여부는 폴더에서 확인)
  if (options?.type) {
    if (options.type === 'script') {
      query += ' AND content IS NOT NULL';
    } else if (options.type === 'video') {
      query += ' AND status IN (\'completed\', \'failed\', \'cancelled\')';
    }
  }

  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY created_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  if (options?.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  const stmt = await db.prepare(query);
  const rows = await stmt.all(...params) as any[];

  return rows.map(row => {
    const content = rowToContent(row);

    // 로그 가져오기 (파일 기반)
    content.logs = getContentLogs(row.content_id);

    return content;
  });
}

// 진행 중인 작업 조회
export async function getActiveContentsByUserId(userId: string): Promise<Content[]> {
  return getContentsByUserId(userId, {
    status: 'pending,processing'
  });
}

// ==================== Content 업데이트 ====================

/**
 * content_id로 업데이트 (Queue Spec v3)
 * @param contentId - 콘텐츠 ID
 * @param updates - 업데이트할 필드
 * @param type - @deprecated type parameter removed in v3
 */
export async function updateContent(
  contentId: string,
  updates: ContentUpdateFields & { type?: ContentType }
): Promise<Content | null> {
  const now = getLocalDateTime();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  // ⭐ progress 컬럼 제거됨 - status로 계산
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }

  // ⚠️ content 컬럼 삭제됨 - 대본은 tasks/{id}/story.json에서 읽음
  // 하위 호환성을 위해 scriptContent는 story.json에 직접 저장
  const contentValue = (updates as any).scriptContent || updates.content;

  // ⭐ video_path 컬럼 제거됨 - 폴더에서 직접 탐색

  if (updates.youtubeUrl !== undefined) {
    fields.push('youtube_url = ?');
    values.push(updates.youtubeUrl);
  }

  if (updates.tokenUsage) {
    if (updates.tokenUsage.input_tokens !== undefined) {
      fields.push('input_tokens = ?');
      values.push(updates.tokenUsage.input_tokens);
    }
    if (updates.tokenUsage.output_tokens !== undefined) {
      fields.push('output_tokens = ?');
      values.push(updates.tokenUsage.output_tokens);
    }
  }
  if (updates.aiModel !== undefined) {
    fields.push('ai_model = ?');
    values.push(updates.aiModel);
  }

  fields.push('updated_at = ?');
  values.push(now);

  // WHERE 조건: content_id only (v3)
  values.push(contentId);

  if (fields.length > 0) {
    const stmt = await db.prepare(`
      UPDATE content
      SET ${fields.join(', ')}
      WHERE content_id = ?
    `);
    await stmt.run(...values);
  }

  const updatedContent = await findContentById(contentId);

  // ⭐ content가 업데이트되면 자동으로 프로젝트 폴더 + story.json 생성/업데이트
  // (status와 무관하게 content만 있으면 생성)
  if (updatedContent && contentValue) {
    try {
      const path = require('path');
      const fs = require('fs');

      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      // ⚠️ ID 규칙: prefix 없이 순수 ID만 사용
      const cleanContentId = contentId.replace(/^(task_|title_|script_)/, '');
      const projectDir = path.join(backendPath, 'tasks', cleanContentId);
      const storyPath = path.join(projectDir, 'story.json');

      console.log(`📁 [content.ts] story.json 생성 시도: contentId=${contentId}`);

      // 폴더 생성
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
        console.log('✅ 프로젝트 폴더 생성:', projectDir);
      }

      // story.json 파일 생성/업데이트
      let contentStr = contentValue || updatedContent.content || '';

      // JSON 정리
      contentStr = contentStr.trim();
      if (contentStr.startsWith('```json')) {
        contentStr = contentStr.substring(7).trim();
      }
      if (contentStr.endsWith('```')) {
        contentStr = contentStr.substring(0, contentStr.length - 3).trim();
      }
      const jsonStart = contentStr.indexOf('{');
      if (jsonStart > 0) {
        contentStr = contentStr.substring(jsonStart);
      }

      if (contentStr && contentStr.includes('{')) {
        const storyJson = JSON.parse(contentStr);

        // ⭐ promptFormat을 metadata에 추가 (image-worker에서 사용)
        if (updatedContent.promptFormat) {
          if (!storyJson.metadata) {
            storyJson.metadata = {};
          }
          storyJson.metadata.promptFormat = updatedContent.promptFormat;
          console.log('✅ story.json에 promptFormat 추가:', updatedContent.promptFormat);
        }

        // ⭐ content의 productInfo가 있으면 story.json에 포함
        if (updatedContent.productInfo) {
          storyJson.product_info = updatedContent.productInfo;
          // thumbnail이 있으면 추가
          if (updatedContent.productInfo.thumbnail) {
            storyJson.thumbnail = updatedContent.productInfo.thumbnail;
          }
          console.log('✅ story.json에 product_info 추가:', updatedContent.productInfo);
        }

        fs.writeFileSync(storyPath, JSON.stringify(storyJson, null, 2), 'utf-8');
        console.log('✅ story.json 파일 생성:', storyPath);
        // ⚠️ 상품설명.json 생성 제거 - story.json과 중복
      }
    } catch (error) {
      console.error('⚠️ 프로젝트 폴더/story.json 생성 실패:', error);
      // 에러가 나도 대본 업데이트는 계속 진행
    }
  }

  return updatedContent;
}

// ==================== Content 삭제 ====================

/**
 * content_id로 상태 업데이트
 * @param contentId - 콘텐츠 ID
 * @param status - 상태값
 * @param type - @deprecated type parameter removed in v3
 */
/**
 * BTS-3363: status 3단계 + 완료/실패
 * - draft: 초안 (내콘텐츠 미표시)
 * - script: 대본 완료 (대본탭)
 * - video: 영상 완료 (영상탭)
 * - completed: 전체 완료 (YouTube 업로드 포함)
 * - failed: 실패
 */
export async function updateContentStatus(
  contentId: string,
  status: 'draft' | 'script' | 'video' | 'completed' | 'failed',
  type?: ContentType
): Promise<Content | null> {
  return updateContent(contentId, { status });
}

// 상태에서 진행률 계산 (DB 저장 없이 계산)
// BTS-3363: status 3단계 (draft → script → video → completed)
// queueType: schedule(0%) -> script(10%) -> image(25%) -> video(60%) -> youtube(85%) -> completed(100%)
export function calculateProgress(status: string, queueType?: string, contentId?: string): number {
  if (status === 'completed') return 100;
  if (status === 'draft') return 0;  // BTS-3363: pending → draft
  if (status === 'script') return 25;  // BTS-3363: 대본 완료 = 25%
  if (status === 'video') return 85;   // BTS-3363: 영상 완료 = 85%

  // 단계별 범위 정의
  const stageRanges: Record<string, [number, number]> = {
    'schedule': [0, 10],
    'script': [10, 25],
    'image': [25, 60],
    'video': [60, 85],
    'youtube': [85, 99]
  };

  // ⭐ 실패/취소 시: 해당 단계까지의 진행률 반환
  if (status === 'failed' || status === 'cancelled') {
    if (queueType && stageRanges[queueType]) {
      return stageRanges[queueType][0]; // 해당 단계의 시작 진행률
    }
    return 0; // queueType이 없으면 0%
  }

  // contentId가 없으면 기본값
  if (!contentId) {
    if (queueType && stageRanges[queueType]) {
      return stageRanges[queueType][0];
    }
    return 50;
  }

  // ⭐ story.json에서 총 씬 개수 가져오기
  let totalScenes = 0;
  try {
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const storyPath = path.join(backendPath, 'tasks', contentId, 'story.json');
    if (fs.existsSync(storyPath)) {
      const storyData = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
      totalScenes = storyData.scenes?.length || 0;
    }
  } catch (e) {
    // story.json 읽기 실패
  }

  // queueType이 있으면 해당 단계 진행률 계산
  if (queueType && stageRanges[queueType]) {
    const [stageStart, stageEnd] = stageRanges[queueType];
    const stageRange = stageEnd - stageStart;

    try {
      const logs = getContentLogs(contentId, queueType as LogType);

      if (queueType === 'image') {
        // ⭐ 이미지: "저장 완료: scene_XX.jpeg" 패턴 카운트
        const completedScenes = logs.filter(l => /저장 완료.*scene_\d+/.test(l)).length;
        if (totalScenes > 0) {
          const progress = Math.min(completedScenes / totalScenes, 1);
          return Math.round(stageStart + stageRange * progress);
        }
      } else if (queueType === 'video') {
        // ⭐ 영상 제작 세부 단계 (60-85%)
        // 1단계 (60-67%): TTS 생성 - "Edge TTS 생성 중: scene_XX_audio.mp3"
        // 3단계 (67-80%): 씬 영상 생성 - "DEBUG 씬 X: FFmpeg 명령어"
        // 병합 (80-85%): "FFmpeg xfade 병합"

        const ttsCompleted = logs.filter(l => /Edge TTS 생성 중.*scene_\d+_audio\.mp3/.test(l)).length;
        const sceneVideos = logs.filter(l => /DEBUG 씬 \d+: FFmpeg 명령어/.test(l)).length;
        const isMerging = logs.some(l => /병합|xfade|최종 영상/.test(l));

        if (totalScenes > 0) {
          if (isMerging) {
            return 82;  // 병합 중
          }
          if (sceneVideos > 0) {
            // 씬 영상 생성 중 (67-80%)
            const progress = Math.min(sceneVideos / totalScenes, 1);
            return Math.round(67 + 13 * progress);
          }
          if (ttsCompleted > 0) {
            // TTS 생성 중 (60-67%)
            const progress = Math.min(ttsCompleted / totalScenes, 1);
            return Math.round(60 + 7 * progress);
          }
        }

        // 로그만 있으면 시작 단계
        if (logs.length > 0) return 62;
      } else if (queueType === 'youtube') {
        // ⭐ 유튜브 업로드 세부 단계 (85-99%)
        // 1. 업로드 시작 (85-90%)
        // 2. 업로드 완료 (90-93%)
        // 3. 썸네일 업로드 (93-96%)
        // 4. 댓글 추가 (96-99%)

        if (logs.some(l => /success.*true|댓글 추가 완료/.test(l))) {
          return 98;
        }
        if (logs.some(l => /썸네일 업로드 완료/.test(l))) {
          return 96;
        }
        if (logs.some(l => /썸네일.*대기|썸네일 업로드 준비/.test(l))) {
          return 94;
        }
        if (logs.some(l => /업로드 완료.*youtu\.?be/.test(l))) {
          return 92;
        }
        if (logs.some(l => /업로드 시작/.test(l))) {
          return 88;
        }
        if (logs.length > 0) {
          return 86;
        }
      } else if (queueType === 'script') {
        // ⭐ 대본 생성 세부 단계 (10-25%)
        // 1. 대본 생성 시작 (12%)
        // 2. 프롬프트 생성 (14%)
        // 3. Python 스크립트 실행 중 (16-20%)
        // 4. story.json 저장 완료 (24%)

        if (logs.some(l => /story\.json 저장 완료|대본 저장 완료/.test(l))) {
          return 24;
        }
        if (logs.some(l => /Python 스크립트 실행 완료/.test(l))) {
          return 22;
        }
        if (logs.some(l => /브라우저 자동화|브라우저 실행/.test(l))) {
          return 18;
        }
        if (logs.some(l => /Python 스크립트 실행 시작|프롬프트.*길이/.test(l))) {
          return 16;
        }
        if (logs.some(l => /프롬프트 파일 생성/.test(l))) {
          return 14;
        }
        if (logs.some(l => /대본 생성 시작/.test(l))) {
          return 12;
        }
        if (logs.length > 0) {
          return 11;
        }
      }

      // 로그는 있지만 완료 패턴 없음
      if (logs.length > 0) {
        return stageStart + 5;
      }
    } catch (e) {
      // 로그 읽기 실패
    }

    return stageStart;
  }

  // ⭐ queueType 없으면 모든 로그 확인해서 현재 단계 추정
  try {
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskDir = path.join(backendPath, 'tasks', contentId);

    if (fs.existsSync(taskDir)) {
      // 유튜브 업로드 완료 체크
      const youtubeLog = path.join(taskDir, 'youtube_upload.log');
      if (fs.existsSync(youtubeLog)) {
        const content = fs.readFileSync(youtubeLog, 'utf-8');
        if (/성공|success|완료/i.test(content)) return 99;
        if (content.length > 0) return 90;
      }

      // 비디오 완료 체크 (mp4 파일 존재)
      const files = fs.readdirSync(taskDir);
      const hasVideo = files.some(f => f.endsWith('.mp4') && !f.startsWith('scene_'));
      if (hasVideo) return 85;

      // 이미지 진행률 체크
      const imageLog = path.join(taskDir, 'image_crawl.log');
      if (fs.existsSync(imageLog)) {
        const content = fs.readFileSync(imageLog, 'utf-8');
        const completedImages = (content.match(/저장 완료.*scene_\d+/g) || []).length;
        if (totalScenes > 0 && completedImages > 0) {
          const progress = Math.min(completedImages / totalScenes, 1);
          return Math.round(25 + 35 * progress);  // 25-60%
        }
        if (content.length > 0) return 30;
      }

      // 대본 체크 (story.json 존재)
      if (totalScenes > 0) return 25;

      // script.log 체크
      const scriptLog = path.join(taskDir, 'script.log');
      if (fs.existsSync(scriptLog)) {
        return 15;
      }
    }
  } catch (e) {
    // 파일 읽기 실패
  }

  return 10;  // 기본: 스케줄 단계
}

// content_id로 콘텐츠 삭제
export async function deleteContent(contentId: string, userId?: string): Promise<boolean> {
  // 개발 가이드: content 삭제 시 → task도 함께 삭제
  // 삭제 순서: task_queue → task_time_log → content_setting → task → content

  try {
    // 1. content 존재 여부 및 소유자 확인
    let checkStmt;
    if (userId) {
      checkStmt = await db.prepare('SELECT content_id FROM content WHERE content_id = ? AND user_id = ?');
      const content = await checkStmt.get(contentId, userId);
      if (!content) return false;
    } else {
      checkStmt = await db.prepare('SELECT content_id FROM content WHERE content_id = ?');
      const content = await checkStmt.get(contentId);
      if (!content) return false;
    }

    // 2. task_queue 삭제 (task_id = content_id)
    const deleteQueueStmt = await db.prepare('DELETE FROM task_queue WHERE task_id = ?');
    await deleteQueueStmt.run(contentId);

    // 3. task_time_log 삭제
    const deleteTimeLogStmt = await db.prepare('DELETE FROM task_time_log WHERE task_id = ?');
    await deleteTimeLogStmt.run(contentId);

    // 4. content_setting 삭제
    const deleteSettingStmt = await db.prepare('DELETE FROM content_setting WHERE content_id = ?');
    await deleteSettingStmt.run(contentId);

    // 5. task 삭제 (task_id = content_id)
    const deleteTaskStmt = await db.prepare('DELETE FROM task WHERE task_id = ?');
    await deleteTaskStmt.run(contentId);

    // 6. content 삭제
    let deleteContentStmt;
    let result;
    if (userId) {
      deleteContentStmt = await db.prepare('DELETE FROM content WHERE content_id = ? AND user_id = ?');
      result = await deleteContentStmt.run(contentId, userId);
    } else {
      deleteContentStmt = await db.prepare('DELETE FROM content WHERE content_id = ?');
      result = await deleteContentStmt.run(contentId);
    }

    console.log(`✅ [deleteContent] content 및 관련 task 삭제 완료: ${contentId}`);
    return result.changes > 0;

  } catch (error) {
    console.error(`❌ [deleteContent] 삭제 실패: ${contentId}`, error);
    throw error;
  }
}

/**
 * 특정 type의 콘텐츠만 삭제
 * @deprecated In Queue Spec v3, type column removed - use deleteContent instead
 */
export async function deleteContentByType(contentId: string, type: ContentType, userId?: string): Promise<boolean> {
  // v3: type이 없으므로 일반 deleteContent로 대체
  console.warn('[deleteContentByType] deprecated in v3 - using deleteContent instead');
  return deleteContent(contentId, userId);
}

// ==================== story.json ====================

/**
 * story.json file read
 */
/**
 * story.json 파일에서 대본 내용 읽기
 * @description DB의 script_content 컬럼이 삭제되어 파일에서 직접 읽음
 * @see .claude/REFACTORING_SPEC.md
 * @param contentId - 콘텐츠/태스크 ID
 * @returns 대본 JSON 문자열 또는 undefined
 */
export function getScriptContent(contentId: string): string | undefined {
  try {
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const storyPath = path.join(backendPath, 'tasks', contentId, 'story.json');

    if (fs.existsSync(storyPath)) {
      const content = fs.readFileSync(storyPath, 'utf-8');
      return content;
    }
  } catch (error) {
    console.error('[getScriptContent] read error:', error);
  }
  return undefined;
}

// ==================== 로그 관리 ====================

/**
 * 로그 추가 (Queue Spec v3)
 * @param contentId - 콘텐츠 ID
 * @param logMessage - 로그 메시지
 * @param type - @deprecated type parameter removed in v3
 */
// 로그 타입 → 파일명 매핑
export type LogType = 'script' | 'image' | 'video' | 'youtube';
const LOG_FILE_MAP: Record<LogType, string> = {
  script: 'script.log',
  image: 'image.log',
  video: 'video.log',
  youtube: 'youtube.log'
};

/**
 * 로그 파일 경로 반환
 */
function getLogFilePath(contentId: string, logType: LogType): string {
  // tasks 폴더는 backend에 있음
  const tasksDir = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks', contentId);
  return path.join(tasksDir, LOG_FILE_MAP[logType]);
}

/**
 * 로그 추가 (파일 기반)
 * @param contentId - 콘텐츠/태스크 ID
 * @param logMessage - 로그 메시지
 * @param logType - 로그 타입 (script, image, video, youtube)
 */
export function addContentLog(contentId: string, logMessage: string, logType: LogType = 'script'): void {
  const logPath = getLogFilePath(contentId, logType);
  const tasksDir = path.dirname(logPath);

  // 폴더가 없으면 생성
  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true });
  }

  // 한국 시간(KST)으로 표시: YYYY-MM-DD HH:mm:ss
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const logLine = `[${timestamp}] ${logMessage}\n`;

  fs.appendFileSync(logPath, logLine, 'utf-8');
}

/**
 * 여러 로그 추가 (파일 기반)
 * @param contentId - 콘텐츠/태스크 ID
 * @param logs - 로그 메시지 배열
 * @param logType - 로그 타입 (script, image, video, youtube)
 */
export function addContentLogs(contentId: string, logs: string[], logType: LogType = 'script'): void {
  for (const log of logs) {
    addContentLog(contentId, log, logType);
  }
}

/**
 * 로그 조회 (파일 기반)
 * @param contentId - 콘텐츠/태스크 ID
 * @param logType - 로그 타입 (script, image, video, youtube), 없으면 모든 로그 반환
 * @description BTS-3359: 파일 시스템 에러를 안전하게 처리
 */
export function getContentLogs(contentId: string, logType?: LogType): string[] {
  try {
    if (logType) {
      // 특정 타입의 로그만 반환
      const logPath = getLogFilePath(contentId, logType);
      if (!fs.existsSync(logPath)) {
        return [];
      }
      const content = fs.readFileSync(logPath, 'utf-8');
      return content.split('\n').filter(line => line.trim());
    }

    // 모든 로그 파일을 합쳐서 반환
    const allLogs: string[] = [];
    for (const lt of Object.keys(LOG_FILE_MAP) as LogType[]) {
      const logPath = getLogFilePath(contentId, lt);
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        allLogs.push(...lines);
      }
    }
    // 타임스탬프로 정렬
    return allLogs.sort();
  } catch (error) {
    console.error('[getContentLogs] 로그 조회 실패:', contentId, error);
    return [];
  }
}

/**
 * 로그 개수 조회
 * @param contentId - 콘텐츠/태스크 ID
 * @param logType - 로그 타입 (script, image, video, youtube)
 */
export function getContentLogsCount(contentId: string, logType?: LogType): number {
  return getContentLogs(contentId, logType).length;
}

/**
 * 모든 로그 조회 (파일 기반)
 */
export function getAllContentLogs(contentId: string): string[] {
  return getContentLogs(contentId);
}

// ==================== 유틸리티 ====================

function rowToContent(row: any): Content {
  // product_info 파싱
  let productInfo: any = undefined;
  if (row.product_info) {
    try {
      productInfo = JSON.parse(row.product_info);
    } catch (error) {
      console.error('Failed to parse product_info:', error);
    }
  }

  // content_id 사용 (DB 컬럼명)
  const contentId = row.content_id;

  // ⭐ video_path를 폴더에서 직접 탐색 (DB 의존 제거)
  let videoPath: string | undefined = undefined;
  try {
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolder = path.join(backendPath, 'tasks', contentId);
    if (fs.existsSync(taskFolder)) {
      const files = fs.readdirSync(taskFolder);
      const videoFile = files.find(f =>
        f.endsWith('.mp4') &&
        !f.startsWith('scene_') &&
        !f.includes('_audio')
      );
      if (videoFile) {
        videoPath = path.join(taskFolder, videoFile);
      }
    }
  } catch (e) {
    // 폴더 탐색 실패 시 무시
  }

  return {
    id: contentId,      // 하위 호환성
    contentId,          // ⭐ 새 필드 (= task_id = script_id = video_id)
    userId: row.user_id,
    title: row.title,
    originalTitle: row.original_title || undefined,
    content: getScriptContent(contentId) || undefined,  // ⚠️ content 컬럼 삭제됨
    videoPath,  // 폴더에서 탐색
    youtubeUrl: row.youtube_url || undefined,
    status: row.status,
    progress: calculateProgress(row.status, row.queue_type, contentId),  // ⭐ 로그 기반 실시간 계산
    error: row.error || undefined,
    tokenUsage: row.input_tokens || row.output_tokens ? {
      input_tokens: row.input_tokens || 0,
      output_tokens: row.output_tokens || 0
    } : undefined,
    aiModel: row.ai_model || undefined,
    productInfo: productInfo,
    category: row.category || undefined,
    promptFormat: row.prompt_format || undefined,  // ⭐ 숏폼/롱폼 정보
    sourceContentId: row.source_content_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
