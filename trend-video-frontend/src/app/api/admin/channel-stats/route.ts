import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAll } from '@/lib/mysql';

interface ChannelStats {
  channelId: string;
  channelName: string;
  totalVideos: number;
  completedVideos: number;
  failedVideos: number;
  pendingVideos: number;
  processingVideos: number;
}

interface ContentRow {
  youtubeChannel: string | null;
  status: string;
  count: number;
}

interface ChannelSettingRow {
  channelId: string;
  channelName: string;
}

/**
 * GET /api/admin/channel-stats - 채널별 영상 통계 조회
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

    // 채널 설정 정보 가져오기 (채널 이름 매핑용)
    const channelSettings = await getAll<ChannelSettingRow>(
      `SELECT channel_id as channelId, channel_name as channelName
       FROM youtube_channel_setting
       WHERE user_id = ?`,
      [user.userId]
    );

    const channelNameMap = new Map<string, string>();
    for (const setting of channelSettings) {
      channelNameMap.set(setting.channelId, setting.channelName);
    }

    // 채널별 영상 상태 통계 조회
    const contentStats = await getAll<ContentRow>(
      `SELECT
         youtube_channel as youtubeChannel,
         status,
         COUNT(*) as count
       FROM content
       WHERE user_id = ?
       GROUP BY youtube_channel, status
       ORDER BY youtube_channel`,
      [user.userId]
    );

    // 채널별 통계 집계
    const statsMap = new Map<string, ChannelStats>();

    for (const row of contentStats) {
      const channelId = row.youtubeChannel || 'unknown';

      if (!statsMap.has(channelId)) {
        statsMap.set(channelId, {
          channelId,
          channelName: channelNameMap.get(channelId) || (channelId === 'unknown' ? '미지정' : channelId),
          totalVideos: 0,
          completedVideos: 0,
          failedVideos: 0,
          pendingVideos: 0,
          processingVideos: 0,
        });
      }

      const stats = statsMap.get(channelId)!;
      stats.totalVideos += row.count;

      switch (row.status) {
        case 'completed':
          stats.completedVideos += row.count;
          break;
        case 'failed':
          stats.failedVideos += row.count;
          break;
        case 'pending':
        case 'waiting':
        case 'draft':
          stats.pendingVideos += row.count;
          break;
        case 'processing':
        case 'script':
        case 'image':
        case 'video':
        case 'youtube':
          stats.processingVideos += row.count;
          break;
      }
    }

    // 배열로 변환하여 정렬 (영상 수 많은 순)
    const channelStats = Array.from(statsMap.values())
      .sort((a, b) => b.totalVideos - a.totalVideos);

    // 전체 통계
    const totalStats = {
      totalChannels: channelStats.length,
      totalVideos: channelStats.reduce((sum, s) => sum + s.totalVideos, 0),
      totalCompleted: channelStats.reduce((sum, s) => sum + s.completedVideos, 0),
      totalFailed: channelStats.reduce((sum, s) => sum + s.failedVideos, 0),
      totalPending: channelStats.reduce((sum, s) => sum + s.pendingVideos, 0),
      totalProcessing: channelStats.reduce((sum, s) => sum + s.processingVideos, 0),
    };

    return NextResponse.json({
      channelStats,
      totalStats,
    });

  } catch (error: any) {
    console.error('채널 통계 조회 실패:', error);
    return NextResponse.json({ error: '채널 통계 조회 실패: ' + error.message }, { status: 500 });
  }
}
