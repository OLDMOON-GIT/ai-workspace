/**
 * @fileoverview script_content 컬럼 삭제 대응 리팩토링
 * @refactored 2025-11-28
 * @see .claude/REFACTORING_SPEC.md - 변경 스펙 문서 (수정 전 필독!)
 * @warning script_content 컬럼은 삭제됨. DB에서 읽으면 에러 발생.
 *          대본은 tasks/{id}/story.json 파일에서 읽어야 함.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import db from '@/lib/sqlite';
import path from 'path';
import { parseJsonSafely } from '@/lib/json-utils';
import { calculateProgress } from '@/lib/content';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * GET /api/scripts/status/[id]
 * 대본 생성 상태 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // MySQL: using imported db
    // ⭐ progress 컬럼 제거됨 - status로 계산 (script_content도 삭제됨)
    const dbContent = await db.prepare('SELECT status, error FROM content WHERE content_id = ?').get(id) as any;
    // MySQL: pool manages connections

    if (!dbContent) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // status가 completed인데 story.json이 유효한 JSON이 아니면 processing으로 변경
    let actualStatus = dbContent.status;
    let actualError = dbContent.error || null;

    // story.json 파일에서 읽기
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const storyPath = path.join(backendPath, 'tasks', id, 'story.json');
    const scriptContent = fs.existsSync(storyPath) ? fs.readFileSync(storyPath, 'utf-8') : null;

    if (dbContent.status === 'completed' && scriptContent) {
      const contentStr = scriptContent;

      // parseJsonSafely 사용하여 안전하게 파싱
      const parseResult = parseJsonSafely(contentStr, { logErrors: true });

      if (parseResult.success && parseResult.data) {
        // 파싱 성공
        const parsedContent = parseResult.data;

        // scenes가 없거나 비어있으면 failed로 처리 (무한 루프 방지)
        if (!parsedContent.scenes || parsedContent.scenes.length === 0) {
          console.error(`❌ Script ${id} marked as completed but has no scenes - marking as failed`);
          actualStatus = 'failed';
          actualError = 'No scenes in generated script';
          // DB에서도 failed로 업데이트
          const dbUpdate = new Database(dbPath);
          dbUpdate.prepare(`
            UPDATE content
            SET status = 'failed', error = 'No scenes in generated script', updated_at = CURRENT_TIMESTAMP
            WHERE content_id = ?
          `).run(id);
          dbUpdate.close();
        }
      } else {
        // 파싱 실패
        console.error(`❌ Script ${id} marked as completed but content is not valid JSON - marking as failed`);
        console.error(`   파싱 오류: ${parseResult.error}`);
        console.error(`   원본 내용 (처음 500자):`, contentStr.substring(0, 500));

        actualStatus = 'failed';
        actualError = `Invalid JSON content: ${parseResult.error}`;
        // DB에서도 failed로 업데이트
        const dbUpdate = new Database(dbPath);
        dbUpdate.prepare(`
          UPDATE content
          SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
          WHERE content_id = ?
        `).run(actualError, id);
        dbUpdate.close();
      }
    }

    const progress = calculateProgress(actualStatus);

    return NextResponse.json({
      status: actualStatus,
      progress: progress,
      error: actualError
    });

  } catch (error: any) {
    console.error('GET /api/scripts/status/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
