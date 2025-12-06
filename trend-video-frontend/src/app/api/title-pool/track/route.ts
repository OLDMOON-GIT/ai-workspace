import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';
import path from 'path';
import fs from 'fs';

// MCP 패턴 DB 경로
const MCP_DB_PATH = path.join(process.cwd(), '..', 'mcp-title-patterns', 'data', 'patterns.db');

/**
 * 제목 선택 추적 API
 * - 프론트엔드에서 사용자가 제목을 선택하면 호출
 * - MCP 패턴 DB에 기록하여 자동 진화에 반영
 */

function getPatternDb() {
  if (!fs.existsSync(MCP_DB_PATH)) {
    return null;
  }
  return new Database(MCP_DB_PATH);
}

// POST: 선택된 제목 기록
export async function POST(request: NextRequest) {
  try {
    const { category, title, elementsUsed } = await request.json();

    if (!category || !title) {
      return NextResponse.json({ error: 'category와 title 필수' }, { status: 400 });
    }

    const db = getPatternDb();
    if (!db) {
      // MCP DB가 없으면 로컬에 기록
      console.log(`[title-track] MCP DB 없음 - 로컬 기록: ${title}`);
      return NextResponse.json({ success: true, local: true });
    }

    // 카테고리 ID 조회
    const cat = await db.prepare('SELECT id FROM category WHERE name = ?').get(category) as any;
    const categoryId = cat?.id || null;

    // generation_log에 기록 (was_selected = 1)
    await db.prepare(`
      INSERT INTO generation_log (category_id, generated_title, elements_used, was_selected, created_at)
      VALUES (?, ?, ?, 1, NOW())
    `).run(categoryId, title, elementsUsed ? JSON.stringify(elementsUsed) : null);

    // MySQL: pool manages connections

    return NextResponse.json({ success: true, tracked: true });
  } catch (error: any) {
    console.error('[title-track] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: 최근 선택 통계
export async function GET() {
  try {
    const db = getPatternDb();
    if (!db) {
      return NextResponse.json({
        available: false,
        message: 'MCP 패턴 DB가 설치되지 않았습니다'
      });
    }

    const stats = {
      totalSelections: (await db.prepare('SELECT COUNT(*) as cnt FROM generation_log WHERE was_selected = 1').get() as any).cnt,
      todaySelections: (await db.prepare(`
        SELECT COUNT(*) as cnt FROM generation_log
        WHERE was_selected = 1 AND date(created_at) = date('now')
      `).get() as any).cnt,
      topCategories: await db.prepare(`
        SELECT c.name, COUNT(*) as cnt
        FROM generation_log gl
        LEFT JOIN category c ON gl.category_id = c.id
        WHERE gl.was_selected = 1
        GROUP BY gl.category_id
        ORDER BY cnt DESC
        LIMIT 5
      `).all(),
      recentTitles: await db.prepare(`
        SELECT generated_title, created_at
        FROM generation_log
        WHERE was_selected = 1
        ORDER BY created_at DESC
        LIMIT 10
      `).all()
    };

    // MySQL: pool manages connections

    return NextResponse.json({ available: true, stats });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
