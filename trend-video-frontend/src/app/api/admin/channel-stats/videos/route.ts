import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAll } from '@/lib/mysql';

interface ContentRow {
  contentId: string;
  title: string;
  status: string;
  youtubeUrl: string | null;
  youtubeChannel: string | null;
  youtubePublishTime: string | null;
  promptFormat: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/admin/channel-stats/videos - 특정 채널의 영상 목록 조회
 * Query params:
 *   - channelId: 채널 ID (required, 'unknown'은 미지정 채널)
 *   - status: 상태 필터 (optional)
 *   - limit: 조회 개수 (default: 50)
 *   - offset: 오프셋 (default: 0)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    if (!user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!channelId) {
      return NextResponse.json({ error: 'channelId가 필요합니다' }, { status: 400 });
    }

    // SQL 조건 구성
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [user.userId];

    if (channelId === 'unknown') {
      conditions.push('(youtube_channel IS NULL OR youtube_channel = "")');
    } else {
      conditions.push('youtube_channel = ?');
      params.push(channelId);
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const whereClause = conditions.join(' AND ');

    // 영상 목록 조회
    const videos = await getAll<ContentRow>(
      `SELECT
         content_id as contentId,
         title,
         status,
         youtube_url as youtubeUrl,
         youtube_channel as youtubeChannel,
         youtube_publish_time as youtubePublishTime,
         prompt_format as promptFormat,
         category,
         created_at as createdAt,
         updated_at as updatedAt
       FROM content
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // 총 개수 조회
    const countResult = await getAll<{ total: number }>(
      `SELECT COUNT(*) as total FROM content WHERE ${whereClause}`,
      params
    );

    const total = countResult[0]?.total || 0;

    return NextResponse.json({
      videos,
      total,
      limit,
      offset,
      hasMore: offset + videos.length < total,
    });

  } catch (error: any) {
    console.error('채널 영상 목록 조회 실패:', error);
    return NextResponse.json({ error: '채널 영상 목록 조회 실패: ' + error.message }, { status: 500 });
  }
}
