/**
 * YouTube 채널 설정 관리 컴포넌트
 */

'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export default function YouTubeSettings() {
  const [channels, setChannels] = useState<any[]>([]);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      setIsLoading(true);
      console.log('[YouTube Settings] Loading channels...');
      const res = await fetch('/api/youtube/channels');
      console.log('[YouTube Settings] Response status:', res.status);
      const data = await res.json();
      console.log('[YouTube Settings] Response data:', data);

      if (data.channels) {
        console.log('[YouTube Settings] Found channels:', data.channels.length);
        setChannels(data.channels);
        setHasCredentials(data.hasCredentials || false);
      } else if (data.error) {
        console.error('[YouTube Settings] API error:', data.error);
      }
    } catch (error) {
      console.error('[YouTube Settings] 채널 목록 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!hasCredentials) {
      toast.error('관리자가 YouTube API Credentials를 설정하지 않았습니다.');
      return;
    }

    try {
      setIsConnecting(true);
      toast.loading('YouTube 인증 페이지로 이동 중...', { id: 'connect' });

      // OAuth URL 가져오기
      const res = await fetch('/api/youtube/oauth-start');
      const data = await res.json();

      if (data.success && data.authUrl) {
        // 현재 창에서 OAuth URL로 이동
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || 'OAuth URL 생성 실패');
      }
    } catch (error: any) {
      toast.error(`연결 실패: ${error.message}`, { id: 'connect' });
      setIsConnecting(false);
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    if (!confirm('정말로 이 YouTube 채널 연결을 해제하시겠습니까?')) {
      return;
    }

    try {
      toast.loading('연결 해제 중...', { id: 'disconnect' });
      const res = await fetch(`/api/youtube/channels?channelId=${channelId}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 연결 해제 완료', { id: 'disconnect' });
        await loadChannels();
      } else {
        throw new Error(data.error || '연결 해제 실패');
      }
    } catch (error: any) {
      toast.error(`연결 해제 실패: ${error.message}`, { id: 'disconnect' });
    }
  };

  const handleReauthorize = async (channelId: string) => {
    if (!confirm('이 채널의 OAuth 인증을 다시 하시겠습니까?\n기존 토큰이 만료되었거나 권한 문제가 있을 때 사용하세요.')) {
      return;
    }

    try {
      setIsConnecting(true);
      toast.loading('YouTube 재인증 페이지로 이동 중...', { id: 'reauth' });

      // OAuth URL 가져오기 (channelId 전달하여 재인증임을 표시)
      const res = await fetch(`/api/youtube/oauth-start?reauth=true&channelId=${channelId}`);
      const data = await res.json();

      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || 'OAuth URL 생성 실패');
      }
    } catch (error: any) {
      toast.error(`재인증 실패: ${error.message}`, { id: 'reauth' });
      setIsConnecting(false);
    }
  };

  const handleSetDefault = async (channelId: string) => {
    try {
      toast.loading('기본 채널 설정 중...', { id: 'default' });
      const res = await fetch(`/api/youtube/channels?channelId=${channelId}`, { method: 'PATCH' });
      const data = await res.json();

      if (data.success) {
        toast.success('기본 채널로 설정되었습니다', { id: 'default' });
        await loadChannels();
      } else {
        throw new Error(data.error || '설정 실패');
      }
    } catch (error: any) {
      toast.error(`설정 실패: ${error.message}`, { id: 'default' });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold text-white mb-6">YouTube 설정</h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          <span className="ml-4 text-slate-300">로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">YouTube 채널 관리</h2>
        <button
          onClick={handleAddChannel}
          disabled={!hasCredentials || isConnecting}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>연결 중...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              <span>채널 추가</span>
            </>
          )}
        </button>
      </div>

      {!hasCredentials && (
        <div className="p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-yellow-400 mb-2">관리자 설정 필요</h3>
              <p className="text-yellow-300/90 text-sm mb-3">
                YouTube API Credentials가 설정되지 않았습니다.<br />
                관리자에게 문의하여 공통 Credentials를 설정해야 YouTube 채널 연결이 가능합니다.
              </p>
              <p className="text-xs text-yellow-300/70">
                💡 관리자는 관리자 대시보드 → YouTube Credentials 메뉴에서 설정할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-700">
          <svg className="w-16 h-16 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-lg text-slate-300 mb-2">연결된 YouTube 채널이 없습니다</p>
          <p className="text-sm text-slate-400">위의 "채널 추가" 버튼을 클릭하여 YouTube 채널을 연결하세요</p>
        </div>
      ) : (
        <div className="space-y-4">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className={`p-6 rounded-lg border transition ${
                channel.isDefault
                  ? 'bg-purple-500/10 border-purple-500/50'
                  : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start gap-4">
                {channel.thumbnailUrl && (
                  <img
                    src={channel.thumbnailUrl}
                    alt={channel.channelTitle}
                    className="w-16 h-16 rounded-full border-2 border-purple-500"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-white">{channel.channelTitle}</h3>
                    {channel.isDefault && (
                      <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-semibold rounded">
                        기본 채널
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mb-2">
                    구독자 {channel.subscriberCount?.toLocaleString() || '0'}명
                  </p>
                  {channel.description && (
                    <p className="text-sm text-slate-300 line-clamp-2">{channel.description}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`https://www.youtube.com/channel/${channel.channelId || channel.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    채널로 이동
                  </a>
                  <button
                    onClick={() => handleReauthorize(channel.id)}
                    disabled={isConnecting}
                    className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    OAuth 재설정
                  </button>
                  {!channel.isDefault && (
                    <button
                      onClick={() => handleSetDefault(channel.id)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      기본으로 설정
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveChannel(channel.id)}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    연결 해제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 사용 방법</h3>
        <div className="space-y-2 text-sm text-slate-300">
          <p>• <strong className="text-white">채널 추가:</strong> "채널 추가" 버튼을 클릭하여 여러 YouTube 채널을 연결할 수 있습니다.</p>
          <p>• <strong className="text-white">기본 채널:</strong> 영상 업로드 시 기본적으로 사용될 채널을 설정할 수 있습니다.</p>
          <p>• <strong className="text-white">채널 선택:</strong> 영상 업로드 시 원하는 채널을 선택하여 업로드할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
}
