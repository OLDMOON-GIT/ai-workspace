import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  try {
    // MySQL: using imported db

    // URL에서 id 파라미터 확인
    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('id');

    if (scriptId) {
      // 특정 스크립트 조회 (contents 테이블)
      const script = await db.prepare(`
        SELECT content_id as contentId, title, status, user_id as userId, prompt_format as promptFormat, created_at as createdAt
        FROM content
        WHERE content_id = ?
      `).get(scriptId);

      // MySQL: pool manages connections

      if (!script) {
        return NextResponse.json(
          { error: 'Script not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ script });
    } else {
      // 모든 스크립트 조회 (contents 테이블)
      const scripts = await db.prepare(`
        SELECT content_id as contentId, title, status, user_id as userId, prompt_format as promptFormat, created_at as createdAt
        FROM content
        ORDER BY created_at DESC
      `).all();

      // MySQL: pool manages connections

      return NextResponse.json({ scripts });
    }
  } catch (error) {
    console.error('Error fetching scripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scripts' },
      { status: 500 }
    );
  }
}
