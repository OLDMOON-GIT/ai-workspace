/**
 * @fileoverview script_content 컬럼 삭제 대응 리팩토링
 * @refactored 2025-11-28
 * @see .claude/REFACTORING_SPEC.md - 변경 스펙 문서 (수정 전 필독!)
 * @warning script_content 컬럼은 삭제됨. DB에서 읽으면 에러 발생.
 *          대본은 tasks/{id}/story.json 파일에서 읽어야 함.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';
import db from '@/lib/sqlite';

/**
 * GET /api/automation/get-story?scriptId=xxx
 * 자동화 폴더의 story.json 파일을 읽어서 반환
 * 파일이 없으면 404 에러 (script_content 컬럼 삭제됨)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId is required' }, { status: 400 });
    }

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const cleanScriptId = scriptId.replace(/^(task_|title_|script_)/, '');

    let actualFolderId = cleanScriptId;
    try {
      const lookupDb = new Database(path.join(process.cwd(), 'data', 'database.sqlite'), { readonly: true });

      const job = lookupDb.prepare(`
        SELECT content_id FROM content
        WHERE source_content_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(cleanScriptId) as any;

      if (job && job.content_id) {
        actualFolderId = job.content_id;
        console.log(`✅ contents 테이블에서 폴더 발견: ${cleanScriptId} → ${actualFolderId}`);
      } else {
        const directPath = path.join(backendPath, 'tasks', cleanScriptId, 'story.json');
        try {
          await fs.access(directPath);
          console.log(`✅ 직접 폴더에서 story.json 발견: ${cleanScriptId}`);
        } catch {
          console.log(`⚠️ jobs 매핑 없음, contentId 그대로 사용: ${cleanScriptId}`);
        }
      }

      lookupDb.close();
    } catch (lookupError: any) {
      console.log(`⚠️ jobs 조회 실패, contentId 그대로 사용: ${lookupError.message}`);
    }

    const projectDir = path.join(backendPath, 'tasks', actualFolderId);
    const storyPath = path.join(projectDir, 'story.json');

    try {
      const storyContent = await fs.readFile(storyPath, 'utf-8');
      const storyJson = JSON.parse(storyContent);

      console.log('✅ story.json 파일 읽기 성공:', storyPath);
      return NextResponse.json({
        success: true,
        storyJson
      });
    } catch (fileError: any) {
      console.log('⚠️ story.json 파일 없음:', fileError.message);
    }

    return NextResponse.json({
      error: 'story.json 파일을 찾을 수 없습니다. 대본을 먼저 생성해주세요.',
      scriptId
    }, { status: 404 });

  } catch (error: any) {
    console.error('GET /api/automation/get-story error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
