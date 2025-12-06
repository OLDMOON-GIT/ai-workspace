import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { transaction } from '@/lib/sqlite';

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log(`🗑️ 전체 콘텐츠 삭제 요청: ${user.email}`);

    // MySQL transaction 헬퍼 사용 (같은 연결에서 실행)
    const result = await transaction(async (conn) => {
      // 1. 사용자의 모든 콘텐츠(contents 테이블) 개수 확인
      const [contentsRows] = await conn.query(
        'SELECT COUNT(*) as count FROM content WHERE user_id = ?',
        [user.userId]
      );
      const contentsCount = (contentsRows as any[])[0].count;

      // 2. tasks 테이블 개수 확인
      const [tasksRows] = await conn.query(
        'SELECT COUNT(*) as count FROM task WHERE user_id = ?',
        [user.userId]
      );
      const tasksCount = (tasksRows as any[])[0].count;

      // 3. 예약된 태스크 개수 확인
      const [schedulesRows] = await conn.query(
        'SELECT COUNT(*) as count FROM task WHERE user_id = ? AND scheduled_time IS NOT NULL',
        [user.userId]
      );
      const schedulesCount = (schedulesRows as any[])[0].count;

      console.log(`📊 삭제 대상: 대본 ${contentsCount}개, 태스크 ${tasksCount}개, 예약 ${schedulesCount}개`);

      // 개발 가이드: 삭제 순서: task_queue → task_time_log → content_setting → task → content

      // 4. task_queue 삭제
      const [deleteQueuesResult] = await conn.query(
        `DELETE FROM task_queue WHERE task_id IN (
          SELECT task_id FROM task WHERE user_id = ?
        )`,
        [user.userId]
      ) as any;

      // 5. task_time_log 삭제
      const [deleteTimeLogsResult] = await conn.query(
        `DELETE FROM task_time_log WHERE task_id IN (
          SELECT task_id FROM task WHERE user_id = ?
        )`,
        [user.userId]
      ) as any;

      // 6. content_setting 삭제
      const [deleteSettingsResult] = await conn.query(
        `DELETE FROM content_setting WHERE content_id IN (
          SELECT content_id FROM content WHERE user_id = ?
        )`,
        [user.userId]
      ) as any;

      // 7. tasks 삭제
      const [deleteTasksResult] = await conn.query(
        'DELETE FROM task WHERE user_id = ?',
        [user.userId]
      ) as any;

      // 8. 모든 콘텐츠 삭제
      const [deleteContentsResult] = await conn.query(
        'DELETE FROM content WHERE user_id = ?',
        [user.userId]
      ) as any;

      console.log(`✅ 전체 콘텐츠 삭제 완료: 콘텐츠 ${deleteContentsResult.affectedRows}개, 태스크 ${deleteTasksResult.affectedRows}개, 큐 ${deleteQueuesResult.affectedRows}개, 설정 ${deleteSettingsResult.affectedRows}개, 시간로그 ${deleteTimeLogsResult.affectedRows}개`);

      return {
        deletedScripts: deleteContentsResult.affectedRows,
        deletedJobs: deleteTasksResult.affectedRows,
        deletedSchedules: schedulesCount,
        deletedQueues: deleteQueuesResult.affectedRows,
        deletedSettings: deleteSettingsResult.affectedRows,
        deletedTimeLogs: deleteTimeLogsResult.affectedRows,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: '모든 콘텐츠가 삭제되었습니다.'
    });

  } catch (error: any) {
    console.error('Delete all content error:', error);
    return NextResponse.json(
      { error: error?.message || '전체 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
