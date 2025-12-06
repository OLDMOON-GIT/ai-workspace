import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  addSchedule,
  getAllSchedule,
  updateScheduleStatus,
  getPipelineDetails,
  getAutomationSettings
} from '@/lib/automation';

// ⭐ 로컬 시간대 그대로 MySQL datetime 형식으로 변환
function toMysqlDatetime(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

// GET: 모든 스케줄 가져오기
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('id');

    if (scheduleId) {
      // 특정 스케줄의 상세 정보 (파이프라인 포함)
      const details = await getPipelineDetails(scheduleId);
      return NextResponse.json({ details });
    }

    const schedules = await getAllSchedule();
    return NextResponse.json({ schedules });
  } catch (error: any) {
    console.error('GET /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 새 스케줄 추가
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId, scheduledTime, youtubePublishTime, youtubePrivacy, forceExecute } = body;

    if (!titleId || !scheduledTime) {
      return NextResponse.json({ error: 'Title ID and scheduled time are required' }, { status: 400 });
    }

    // ✅ 자동 제목 생성 OFF여도 수동 스케줄 등록은 허용
    // (자동 생성 기능만 OFF, 수동 등록은 가능)

    // 시간 유효성 검사
    const scheduledDate = new Date(scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
    }

    // ✅ 과거 시간도 등록 허용 (목록에서 '과거' 표시됨)

    // YouTube 업로드 시간 변환
    let mysqlYoutubePublishTime: string | undefined;
    if (youtubePublishTime) {
      const publishDate = new Date(youtubePublishTime);
      if (isNaN(publishDate.getTime())) {
        return NextResponse.json({ error: 'Invalid YouTube publish time' }, { status: 400 });
      }
      // ⭐ MySQL datetime 형식으로 변환: 'YYYY-MM-DD HH:MM:SS' (로컬 시간대 그대로)
      mysqlYoutubePublishTime = toMysqlDatetime(publishDate);
    }

    // ⭐ MySQL datetime 형식으로 변환: 'YYYY-MM-DD HH:MM:SS' (로컬 시간대 그대로)
    const sqliteDatetime = toMysqlDatetime(scheduledDate);

    const scheduleId = await addSchedule({
      titleId,
      scheduledTime: sqliteDatetime,
      youtubePublishTime: mysqlYoutubePublishTime,
      youtubePrivacy: youtubePrivacy || 'public'
    });

    return NextResponse.json({ success: true, scheduleId });
  } catch (error: any) {
    console.error('POST /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 스케줄 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('id');

    if (!scheduleId) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    const db = (await import('@/lib/mysql')).default;
    // v6: schedule_id = task_id, task_schedule 제거됨
    await db.query('UPDATE task SET scheduled_time = NULL WHERE task_id = ?', [scheduleId]);
    await db.query('DELETE FROM task_queue WHERE task_id = ? AND type = \'schedule\'', [scheduleId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 스케줄 상태 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, scheduledTime, youtubePublishTime } = body;

    if (!id) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    const db = (await import('@/lib/mysql')).default;

    let mysqlScheduledTime: string | undefined;
    let mysqlYoutubeTime: string | undefined;

    if (scheduledTime !== undefined) {
      // 과거 시간 체크
      const scheduledDate = new Date(scheduledTime);
      if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
      }
      const now = new Date();
      if (scheduledDate < now) {
        return NextResponse.json({ error: '과거 시간으로 스케줄을 설정할 수 없습니다' }, { status: 400 });
      }
      // ⭐ MySQL datetime 형식: 'YYYY-MM-DD HH:MM:SS' (로컬 시간대 그대로)
      mysqlScheduledTime = toMysqlDatetime(scheduledDate);
    }
    if (youtubePublishTime !== undefined) {
      // ⭐ MySQL datetime 형식으로 변환: 'YYYY-MM-DD HH:MM:SS' (로컬 시간대 그대로)
      const publishDate = new Date(youtubePublishTime);
      mysqlYoutubeTime = toMysqlDatetime(publishDate);
    }

    // v6: schedule_id = task_id, task_schedule 제거됨
    // scheduled_time만 task 테이블에, youtube_publish_time은 content 테이블에
    if (mysqlScheduledTime) {
      await db.query('UPDATE task SET scheduled_time = ?, updated_at = NOW() WHERE task_id = ?', [mysqlScheduledTime, id]);
    }
    if (mysqlYoutubeTime) {
      await db.query('UPDATE content SET youtube_publish_time = ?, updated_at = NOW() WHERE content_id = ?', [mysqlYoutubeTime, id]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
