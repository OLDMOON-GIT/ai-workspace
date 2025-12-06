import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getJobsByUserId, getActiveJobsByUserId, deleteJob, findJobById } from '@/lib/db';
import { getAll } from '@/lib/mysql';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter'); // 'all' | 'active'
    const limit = parseInt(searchParams.get('limit') || '50'); // 기본값 50개로 변경
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    let allJobs;
    if (filter === 'active') {
      allJobs = await getActiveJobsByUserId(user.userId); // 모든 진행 중인 작업 가져오기
    } else {
      allJobs = await getJobsByUserId(user.userId, 999999, 0); // 모든 데이터 가져오기
    }

    // 자동화 DB에서 영상(job) ID들의 큐 상태 조회
    const queueStatusMap: Record<string, any> = {};

    try {
      const allJobIds = allJobs.map(j => j.id);

      if (allJobIds.length > 0) {
        const placeholders = allJobIds.map(() => '?').join(',');
        // task_queue + task_schedule 조인하여 상태 및 스케줄 정보 조회
        const queueRows = await getAll(`
          SELECT
            tq.task_id,
            tq.status,
            tq.type as queue_type,
            t.scheduled_time
          FROM task_queue tq
          LEFT JOIN task t ON tq.task_id = t.task_id
          WHERE tq.task_id IN (${placeholders})
            AND tq.status IN ('waiting', 'processing')
          ORDER BY tq.created_at DESC
        `, allJobIds) as any[];

        queueRows.forEach((row: any) => {
          if (row.task_id && !queueStatusMap[row.task_id]) {
            queueStatusMap[row.task_id] = {
              inQueue: true,
              queueStatus: row.status,
              queueType: row.queue_type,
              scheduledTime: row.scheduled_time
            };
          }
        });
      }
    } catch (autoError) {
      console.warn('⚠️ 자동화 큐 상태 조회 실패 (무시됨):', autoError);
    }

    // 각 영상에 자동화 큐 정보 추가
    allJobs = allJobs.map((job: any) => ({
      ...job,
      automationQueue: queueStatusMap[job.id]
    }));

    // 검색 필터링
    let filteredJobs = allJobs;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredJobs = allJobs.filter(job =>
        job.title?.toLowerCase().includes(searchLower) ||
        job.id.toLowerCase().includes(searchLower) ||
        job.status.toLowerCase().includes(searchLower)
      );
    }

    // 최신순 정렬 (createdAt 기준)
    filteredJobs.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // 최신순 (내림차순)
    });

    // 전체 개수
    const total = filteredJobs.length;

    // 페이징
    const jobs = filteredJobs.slice(offset, offset + limit);

    return NextResponse.json({
      jobs,
      total,
      hasMore: offset + limit < total
    });

  } catch (error: any) {
    console.error('❌ Error fetching videos:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: '영상 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: '작업 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 작업 존재 여부 및 권한 확인
    const job = await findJobById(taskId);
    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (job.userId !== user.userId) {
      return NextResponse.json(
        { error: '이 작업을 삭제할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 작업 삭제
    const success = await deleteJob(taskId);
    if (!success) {
      return NextResponse.json(
        { error: '작업 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '작업이 삭제되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ Error deleting video:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: '영상 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
