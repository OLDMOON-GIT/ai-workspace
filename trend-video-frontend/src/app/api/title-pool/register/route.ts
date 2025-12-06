import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { getSql } from '@/lib/sql-mapper';
import path from 'path';
import { executePipeline } from '@/lib/automation-scheduler';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/title-pool/register
 * 제목 풀에서 선택한 제목을 자동화 파이프라인에 등록하고 즉시 실행
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId, title, category, channel, score } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // MySQL: using imported db

    // v5: task + content + content_setting 분리
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 1. task 테이블 (scheduled_time = NULL, task_queue에 직접 추가)
    const insertTaskSql = getSql('scheduler', 'insertTask');
    await db.prepare(insertTaskSql).run(taskId, user.userId, null);

    // 2. content 테이블 (메인 데이터) - 점수 포함, youtube_channel 포함
    const insertContentSql = getSql('scheduler', 'insertContent');
    await db.prepare(insertContentSql).run(
      taskId,
      user.userId,
      title,
      'longform',
      category || '기타',
      'claude', // ai_model
      null, // product_info
      channel || null,
      score || null
    );

    // 3. content_setting 테이블 (제작 설정) - youtube_channel은 content 테이블에 있음
    const insertContentSettingSql = getSql('scheduler', 'insertContentSetting');
    await db.prepare(insertContentSettingSql).run(taskId);

    console.log(`✅ [REGISTER] Created task: ${taskId} - "${title}"`);

    // 4. task_queue는 생성하지 않음 (자동화 스케줄러가 처리)

    // 5. title_pool에서 used 마킹
    if (titleId) {
      await db.prepare('UPDATE title_pool SET used = 1 WHERE title_id = ?').run(titleId);
      console.log(`✅ [REGISTER] Marked title_pool as used: ${titleId}`);
    }

    // MySQL: pool manages connections

    // 5. 파이프라인 즉시 실행 (⭐ camelCase 사용 - automation-scheduler가 camelCase 기대)
    const schedule = {
      id: taskId,  // ⚠️ task_schedule 제거됨, taskId를 id로 사용
      taskId: taskId,  // ⭐ task_id → taskId (camelCase)
      title: title,
      promptFormat: 'longform',
      category: category || '기타',
      channel: channel,
      userId: user.userId  // ⭐ user_id → userId (camelCase)
    };

    console.log(`🚀 [REGISTER] Starting pipeline for: ${title}`);

    // 비동기로 파이프라인 실행
    setImmediate(() => {
      executePipeline(schedule).catch((error) => {
        console.error('Pipeline execution error:', error);
      });
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: '자동화 등록 및 실행 시작'
    });

  } catch (error: any) {
    console.error('POST /api/title-pool/register error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
