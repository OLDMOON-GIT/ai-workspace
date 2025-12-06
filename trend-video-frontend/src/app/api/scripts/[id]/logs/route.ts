import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getContentLogs, getContentLogsCount, LogType } from '@/lib/content';

const VALID_LOG_TYPES: LogType[] = ['script', 'image', 'video', 'youtube'];
const DEFAULT_LIMIT = 100;

/**
 * GET /api/scripts/[id]/logs
 *
 * 로그 lazy loading API
 * - logType: script | image | video | youtube (선택, 없으면 모든 로그)
 * - offset: 시작 위치 (기본값: 0)
 * - limit: 가져올 개수 (기본값: 100)
 *
 * 응답:
 * - logs: string[]
 * - total: number (해당 타입의 전체 개수)
 * - hasMore: boolean
 * - logType: string | null
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { id: contentId } = await params;
    const { searchParams } = new URL(request.url);

    // logType 파라미터 (선택적)
    const logTypeParam = searchParams.get('logType');
    let logType: LogType | undefined = undefined;

    if (logTypeParam) {
      if (!VALID_LOG_TYPES.includes(logTypeParam as LogType)) {
        return NextResponse.json(
          { error: `유효하지 않은 logType입니다. 가능한 값: ${VALID_LOG_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      logType = logTypeParam as LogType;
    }

    // pagination 파라미터
    const offset = parseInt(searchParams.get('offset') || '0');
    const limit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT));

    // 로그 조회
    const allLogs = getContentLogs(contentId, logType);
    const total = allLogs.length;
    const logs = allLogs.slice(offset, offset + limit);
    const hasMore = offset + logs.length < total;

    return NextResponse.json({
      logs,
      total,
      hasMore,
      logType: logType || null,
      offset,
      limit
    });

  } catch (error: any) {
    console.error('로그 조회 에러:', error);
    return NextResponse.json(
      { error: error?.message || '로그 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
