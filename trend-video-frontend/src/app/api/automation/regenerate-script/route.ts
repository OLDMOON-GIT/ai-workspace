import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/automation/regenerate-script
 * 대본 재생성
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scriptId, titleId, prompt } = body;

    if (!scriptId || !titleId) {
      return NextResponse.json({ error: 'scriptId and titleId are required' }, { status: 400 });
    }

    console.log(`🔄 대본 재생성 요청: scriptId=${scriptId}, titleId=${titleId}`);

    // MySQL: using imported db

    // 기존 대본 확인
    const existingScript = await db.prepare(`
      SELECT content_id as contentId, title, status
      FROM content
      WHERE content_id = ?
    `).get(scriptId) as any;

    if (!existingScript) {
      // MySQL: pool manages connections
      return NextResponse.json({ error: '기존 대본을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 기존 대본 상태를 pending으로 변경
    await db.prepare(`
      UPDATE content
      SET status = 'pending',
          error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE content_id = ?
    `).run(scriptId);

    // MySQL: pool manages connections

    console.log(`✅ 대본 재생성 준비 완료: ${scriptId}`);
    console.log(`   기존 제목: ${existingScript.title}`);
    console.log(`   상태: ${existingScript.status} → pending`);

    return NextResponse.json({
      success: true,
      message: '대본이 재생성 대기 상태로 변경되었습니다. 스케줄러가 자동으로 재생성합니다.',
      scriptId
    });

  } catch (error: any) {
    console.error('POST /api/automation/regenerate-script error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
