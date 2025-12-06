import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { initAutomationTables, getChannelSettings } from '@/lib/automation';
import { getAll, getOne } from '@/lib/mysql';

// 테이블 초기화 (최초 1회)
(async () => {
  try {
    await initAutomationTables();
  } catch (error) {
    console.error('Failed to initialize automation tables:', error);
  }
})();

// GET: 월별 스케줄 조회 (달력용)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    // 해당 월의 시작일과 종료일 계산
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
    const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // 해당 월의 모든 스케줄 조회 (채널 정보 포함)
    // v6: task_schedule 제거, task.scheduled_time 사용
    const schedules = await getAll(`
      SELECT
        t.task_id as scheduleId,
        t.task_id as taskId,
        t.scheduled_time as scheduledTime,
        c.youtube_publish_time as youtubePublishTime,
        COALESCE(q.status, 'pending') as state,
        c.title,
        c.prompt_format as promptFormat,
        c.youtube_channel as youtubeChannel,
        c.category,
        cs.tags
      FROM task t
      JOIN content c ON t.task_id = c.content_id
      LEFT JOIN content_setting cs ON t.task_id = cs.content_id
      LEFT JOIN task_queue q ON t.task_id = q.task_id
      WHERE t.user_id = ?
        AND t.scheduled_time IS NOT NULL
        AND t.scheduled_time >= ?
        AND t.scheduled_time < ?
      ORDER BY t.scheduled_time ASC
    `, [user.userId, startDate, endDate]);

    // 채널 설정 가져오기 (색상 정보)
    const channelSettings = await getChannelSettings(user.userId);
    const channelMap = new Map(
      channelSettings.map((setting: any) => [setting.channel_id, setting])
    );

    // 스케줄에 채널 색상 및 채널명 추가
    const schedulesWithColor = schedules.map((schedule: any) => {
      const channelSetting = channelMap.get(schedule.channel);
      return {
        ...schedule,
        color: channelSetting?.color || '#3b82f6', // 기본 파란색
        channel_name: channelSetting?.channel_name || schedule.channel // 채널명 추가
      };
    });

    return NextResponse.json({
      schedules: schedulesWithColor,
      channelSettings: channelSettings
    });
  } catch (error: any) {
    console.error('GET /api/automation/calendar error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 다음 스케줄 자동 생성
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId, channelId } = body;
    const taskId = titleId; // titleId는 이제 taskId와 동일

    if (!taskId || !channelId) {
      return NextResponse.json(
        { error: 'titleId(taskId) and channelId are required' },
        { status: 400 }
      );
    }

    const { calculateNextScheduleTime, addSchedule } = require('@/lib/automation');

    // 마지막 스케줄 조회
    // v6: task_schedule 제거, task.scheduled_time 사용
    const lastSchedule = await getOne(`
      SELECT scheduled_time
      FROM task
      WHERE task_id = ? AND scheduled_time IS NOT NULL
      ORDER BY scheduled_time DESC
      LIMIT 1
    `, [taskId]) as any;

    // 다음 스케줄 시간 계산
    const fromDate = lastSchedule
      ? new Date(lastSchedule.scheduled_time)
      : new Date();
    const nextTime = await calculateNextScheduleTime(user.userId, channelId, fromDate);

    if (!nextTime) {
      return NextResponse.json(
        { error: 'Could not calculate next schedule time. Check channel settings.' },
        { status: 400 }
      );
    }

    // 스케줄 추가 (MySQL datetime 형식: YYYY-MM-DD HH:MM:SS)
    // ✅ BTS-0000025: 로컬 시간대 유지
    const year = nextTime.getFullYear();
    const month = String(nextTime.getMonth() + 1).padStart(2, '0');
    const day = String(nextTime.getDate()).padStart(2, '0');
    const hours = String(nextTime.getHours()).padStart(2, '0');
    const minutes = String(nextTime.getMinutes()).padStart(2, '0');
    const seconds = String(nextTime.getSeconds()).padStart(2, '0');
    const sqliteDatetime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    const scheduleId = await addSchedule({
      taskId,
      scheduledTime: sqliteDatetime
    });

    return NextResponse.json({
      success: true,
      scheduleId,
      scheduledTime: sqliteDatetime
    });
  } catch (error: any) {
    console.error('POST /api/automation/calendar error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
