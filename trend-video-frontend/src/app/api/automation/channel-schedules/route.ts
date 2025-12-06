import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// GET: 채널별 스케줄 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json(
        { error: 'channelId is required' },
        { status: 400 }
      );
    }

    // MySQL: using imported db

    // 해당 채널의 스케줄 목록 조회 (최근 50개) - v5: content 테이블 중심
    const schedules = db
      .prepare(
        `
        SELECT DISTINCT
          t.task_id,
          c.title,
          s.scheduled_time,
          COALESCE(s.status, 'none') as status,
          (SELECT type FROM task_queue WHERE task_id = t.task_id ORDER BY
            CASE type
              WHEN 'youtube' THEN 5
              WHEN 'video' THEN 4
              WHEN 'image' THEN 3
              WHEN 'script' THEN 2
              WHEN 'schedule' THEN 1
            END DESC LIMIT 1
          ) as queue_type,
          (SELECT status FROM task_queue WHERE task_id = t.task_id ORDER BY
            CASE type
              WHEN 'youtube' THEN 5
              WHEN 'video' THEN 4
              WHEN 'image' THEN 3
              WHEN 'script' THEN 2
              WHEN 'schedule' THEN 1
            END DESC LIMIT 1
          ) as queue_status
        FROM task t
        JOIN content c ON t.task_id = c.content_id
        LEFT JOIN content_setting cs ON t.task_id = cs.content_id
                WHERE t.user_id = ?
          AND c.youtube_channel = ?
        ORDER BY c.created_at DESC
        LIMIT 50
      `
      )
      .all(user.userId, channelId);

    // MySQL: pool manages connections

    return NextResponse.json({ schedules });
  } catch (error: any) {
    console.error('GET /api/automation/channel-schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
