'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ChannelStats {
  channelId: string;
  channelName: string;
  totalVideos: number;
  completedVideos: number;
  failedVideos: number;
  pendingVideos: number;
  processingVideos: number;
}

interface TotalStats {
  totalChannels: number;
  totalVideos: number;
  totalCompleted: number;
  totalFailed: number;
  totalPending: number;
  totalProcessing: number;
}

interface VideoItem {
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

type StatusFilter = 'all' | 'completed' | 'failed' | 'pending' | 'processing';

export default function ChannelStatsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [channelStats, setChannelStats] = useState<ChannelStats[]>([]);
  const [totalStats, setTotalStats] = useState<TotalStats | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChannelStats();
  }, []);

  useEffect(() => {
    if (selectedChannel) {
      fetchChannelVideos(selectedChannel);
    }
  }, [selectedChannel, statusFilter]);

  const fetchChannelStats = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/channel-stats', {
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '채널 통계 조회 실패');
      }

      const data = await response.json();
      setChannelStats(data.channelStats);
      setTotalStats(data.totalStats);
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes('관리자 권한') || err.message.includes('로그인')) {
        router.push('/');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChannelVideos = async (channelId: string) => {
    try {
      setVideosLoading(true);
      const params = new URLSearchParams({
        channelId,
        limit: '100',
      });

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/admin/channel-stats/videos?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '영상 목록 조회 실패');
      }

      const data = await response.json();
      setVideos(data.videos);
    } catch (err: any) {
      console.error('영상 목록 조회 실패:', err);
    } finally {
      setVideosLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { text: string; className: string }> = {
      completed: { text: '완료', className: 'bg-green-500/20 text-green-400' },
      failed: { text: '실패', className: 'bg-red-500/20 text-red-400' },
      pending: { text: '대기', className: 'bg-yellow-500/20 text-yellow-400' },
      waiting: { text: '대기', className: 'bg-yellow-500/20 text-yellow-400' },
      draft: { text: '임시저장', className: 'bg-gray-500/20 text-gray-400' },
      processing: { text: '처리중', className: 'bg-blue-500/20 text-blue-400' },
      script: { text: '대본생성', className: 'bg-purple-500/20 text-purple-400' },
      image: { text: '이미지생성', className: 'bg-indigo-500/20 text-indigo-400' },
      video: { text: '영상생성', className: 'bg-pink-500/20 text-pink-400' },
      youtube: { text: '업로드중', className: 'bg-red-500/20 text-red-400' },
    };

    const badge = statusMap[status] || { text: status, className: 'bg-gray-500/20 text-gray-400' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        {badge.text}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
              &larr; 관리자 대시보드로 돌아가기
            </Link>
            <h1 className="text-3xl font-bold text-white">채널별 영상 통계</h1>
            <p className="text-slate-400 mt-1">YouTube 채널별 영상 분류 및 통계 현황</p>
          </div>
          <button
            onClick={fetchChannelStats}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            새로고침
          </button>
        </div>

        {/* 전체 통계 요약 */}
        {totalStats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-3xl font-bold text-white">{totalStats.totalChannels}</div>
              <div className="text-sm text-slate-400">총 채널</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-3xl font-bold text-white">{totalStats.totalVideos}</div>
              <div className="text-sm text-slate-400">총 영상</div>
            </div>
            <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
              <div className="text-3xl font-bold text-green-400">{totalStats.totalCompleted}</div>
              <div className="text-sm text-green-400/70">완료</div>
            </div>
            <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
              <div className="text-3xl font-bold text-blue-400">{totalStats.totalProcessing}</div>
              <div className="text-sm text-blue-400/70">처리중</div>
            </div>
            <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20">
              <div className="text-3xl font-bold text-yellow-400">{totalStats.totalPending}</div>
              <div className="text-sm text-yellow-400/70">대기</div>
            </div>
            <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
              <div className="text-3xl font-bold text-red-400">{totalStats.totalFailed}</div>
              <div className="text-sm text-red-400/70">실패</div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 채널 목록 */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
              <h2 className="text-xl font-bold text-white mb-4">채널 목록</h2>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {channelStats.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">등록된 채널이 없습니다</p>
                ) : (
                  channelStats.map((channel) => (
                    <button
                      key={channel.channelId}
                      onClick={() => setSelectedChannel(channel.channelId)}
                      className={`w-full text-left p-4 rounded-xl transition ${
                        selectedChannel === channel.channelId
                          ? 'bg-purple-600/30 border-purple-500'
                          : 'bg-white/5 hover:bg-white/10 border-transparent'
                      } border`}
                    >
                      <div className="font-medium text-white truncate">{channel.channelName}</div>
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="text-slate-400">총 {channel.totalVideos}개</span>
                        {channel.completedVideos > 0 && (
                          <span className="text-green-400">{channel.completedVideos} 완료</span>
                        )}
                        {channel.failedVideos > 0 && (
                          <span className="text-red-400">{channel.failedVideos} 실패</span>
                        )}
                      </div>
                      {/* 진행률 바 */}
                      <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full flex">
                          <div
                            className="bg-green-500"
                            style={{ width: `${(channel.completedVideos / channel.totalVideos) * 100}%` }}
                          />
                          <div
                            className="bg-blue-500"
                            style={{ width: `${(channel.processingVideos / channel.totalVideos) * 100}%` }}
                          />
                          <div
                            className="bg-yellow-500"
                            style={{ width: `${(channel.pendingVideos / channel.totalVideos) * 100}%` }}
                          />
                          <div
                            className="bg-red-500"
                            style={{ width: `${(channel.failedVideos / channel.totalVideos) * 100}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 영상 목록 */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">
                  {selectedChannel
                    ? `${channelStats.find((c) => c.channelId === selectedChannel)?.channelName || '채널'} 영상 목록`
                    : '채널을 선택하세요'}
                </h2>
                {selectedChannel && (
                  <div className="flex gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
                    >
                      <option value="all">전체</option>
                      <option value="completed">완료</option>
                      <option value="processing">처리중</option>
                      <option value="pending">대기</option>
                      <option value="failed">실패</option>
                    </select>
                  </div>
                )}
              </div>

              {!selectedChannel ? (
                <div className="text-center py-20 text-slate-400">
                  왼쪽에서 채널을 선택하면 해당 채널의 영상 목록이 표시됩니다.
                </div>
              ) : videosLoading ? (
                <div className="text-center py-20 text-slate-400">로딩 중...</div>
              ) : videos.length === 0 ? (
                <div className="text-center py-20 text-slate-400">해당 조건의 영상이 없습니다.</div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {videos.map((video) => (
                    <div
                      key={video.contentId}
                      className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-white truncate">{video.title}</h3>
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                            {video.promptFormat && (
                              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                                {video.promptFormat}
                              </span>
                            )}
                            {video.category && (
                              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">
                                {video.category}
                              </span>
                            )}
                            <span>{formatDate(video.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(video.status)}
                          {video.youtubeUrl && (
                            <a
                              href={video.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
                              title="YouTube에서 보기"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                              </svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
