import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findContentById, getContentLogs, calculateProgress } from '@/lib/content';
import { getOne } from '@/lib/mysql';

// 파일 로그에서 메시지만 추출하는 헬퍼 함수
function extractLogMessages(logs: string[]): string[] {
  return logs.map(line => {
    const match = line.match(/^\[[^\]]+\]\s*(.*)$/);
    return match ? match[1] : line;
  });
}

export async function GET(request: NextRequest) {
  console.log('=== /api/script-status 시작 ===');

  // 사용자 인증
  const user = await getCurrentUser(request);
  console.log('👤 현재 사용자:', user?.userId);

  if (!user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('🔍 대본 상태 조회:', scriptId);

    // task_* ID인 경우: 먼저 content 테이블 확인, 없으면 task_queue 확인
    if (scriptId.startsWith('task_')) {
      console.log('🔍 task_ ID 조회 시작:', scriptId);

      // 1. 먼저 content 테이블에서 직접 조회 (content_id = task_id)
      const contentResult = await getOne(`
        SELECT content_id as contentId, title, status, error, user_id as userId
        FROM content
        WHERE content_id = ?
      `, [scriptId]) as any;

      if (contentResult) {
        console.log('📦 content 테이블에서 찾음:', {
          contentId: contentResult.contentId,
          status: contentResult.status,
          title: contentResult.title
        });

        // 본인의 대본인지 확인
        if (contentResult.userId !== user.userId) {
          console.log('❌ 권한 없음:', { contentUserId: contentResult.userId, currentUserId: user.userId });
          return NextResponse.json(
            { error: '권한이 없습니다.' },
            { status: 403 }
          );
        }

        // 파일 기반 로그 가져오기 (BTS-3359: 에러 방지)
        let logs: string[] = [];
        try {
          logs = getContentLogs(scriptId, 'script');
        } catch (logError) {
          console.warn('⚠️ 로그 조회 실패 (무시됨):', logError);
        }

        return NextResponse.json({
          status: contentResult.status,
          title: contentResult.title,
          message: contentResult.error,
          logs: extractLogMessages(logs),
          taskId: contentResult.contentId
        });
      }

      // 2. content에 없으면 task_queue에서 조회
      console.log('🔍 task_queue 테이블 조회:', scriptId);
      const task = await getOne(`
        SELECT tq.task_id as taskId, c.title, tq.status, tq.error as lastError, tq.created_at as createdAt
        FROM task_queue tq
        LEFT JOIN content c ON tq.task_id = c.content_id
        WHERE tq.task_id = ?
      `, [scriptId]) as any;

      if (!task) {
        console.log('❌ task_queue/content 모두에 없음:', scriptId);
        return NextResponse.json(
          {
            error: '대본을 찾을 수 없습니다.',
            errorCode: 'TASK_NOT_FOUND',
            suggestion: '작업이 삭제되었거나 만료되었습니다. 페이지를 새로고침하세요.',
            details: { taskId: scriptId }
          },
          { status: 404 }
        );
      }

      console.log('📦 task_queue 결과:', {
        taskId: task.taskId,
        status: task.status,
        title: task.title
      });

      // 상태 매핑
      let mappedStatus = task.status;
      if (task.status === 'processing' || task.status === 'waiting') {
        mappedStatus = 'processing';
      } else if (task.status === 'completed') {
        mappedStatus = 'completed';
      } else if (task.status === 'failed') {
        mappedStatus = 'failed';
      }

      // 파일 기반 로그 가져오기 (BTS-3359: 에러 방지)
      let logs: string[] = [];
      try {
        logs = getContentLogs(scriptId, 'script');
      } catch (logError) {
        console.warn('⚠️ 로그 조회 실패 (무시됨):', logError);
      }

      return NextResponse.json({
        status: mappedStatus,
        title: task.title,
        message: task.lastError,
        logs: extractLogMessages(logs),
        taskId: task.taskId
      });
    }

    // contents 테이블에서 찾기
    console.log('🔍 findContentById 호출 (contents 테이블)...');
    const content = await findContentById(scriptId);
    console.log('📦 findContentById 결과:', content ? {
      id: content.id,
      userId: content.userId,
      title: content.title,
      status: content.status
    } : null);

    if (content) {
      // 본인의 대본인지 확인
      if (content.userId !== user.userId) {
        console.log('❌ 권한 없음:', { contentUserId: content.userId, currentUserId: user.userId });
        return NextResponse.json(
          { error: '권한이 없습니다.' },
          { status: 403 }
        );
      }

      // 로그 가져오기 (type='script') (BTS-3359: 에러 방지)
      let logs: string[] = [];
      try {
        logs = getContentLogs(scriptId, 'script');
      } catch (logError) {
        console.warn('⚠️ 로그 조회 실패 (무시됨):', logError);
      }

      const progress = calculateProgress(content.status);

      console.log('✅ 대본 상태 (contents):', {
        id: content.id,
        status: content.status,
        progress: progress,
        logsCount: logs.length
      });

      return NextResponse.json({
        status: content.status,
        title: content.title,
        content: content.content,
        progress: progress,
        logs: logs,
        error: content.error
      });
    }

    // 대본을 찾을 수 없음
    console.log('❌ 대본을 찾을 수 없음:', scriptId);
    return NextResponse.json(
      {
        error: '대본을 찾을 수 없습니다.',
        errorCode: 'SCRIPT_NOT_FOUND',
        suggestion: '대본이 생성 중이거나 이미 삭제되었을 수 있습니다.',
        details: {
          scriptId: scriptId,
          timestamp: new Date().toISOString()
        }
      },
      { status: 404 }
    );

  } catch (error: any) {
    console.error('❌ 대본 상태 조회 오류:', error);
    console.error('❌ 오류 스택:', error.stack);
    console.error('❌ 오류 코드:', error.code);
    console.error('❌ SQL 오류:', error.sqlMessage || error.message);
    return NextResponse.json(
      {
        error: '대본 상태 조회 중 오류가 발생했습니다.',
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          code: error.code,
          sqlMessage: error.sqlMessage
        } : undefined
      },
      { status: 500 }
    );
  }
}
