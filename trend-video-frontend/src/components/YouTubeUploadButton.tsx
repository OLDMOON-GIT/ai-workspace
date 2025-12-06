'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

interface YouTubeUploadButtonProps {
  videoPath: string;
  thumbnailPath?: string;
  defaultTitle?: string;
  taskId: string;
  onUploadStart?: () => void;
  onUploadSuccess?: (data: { videoId: string; videoUrl: string }) => void;
  onUploadError?: (error: string) => void;
  isReupload?: boolean; // 재업로드 여부
}

interface YouTubeChannel {
  id: string;
  channelId: string;
  channelTitle: string;
  isDefault: boolean;
}

export default function YouTubeUploadButton({
  videoPath,
  thumbnailPath,
  defaultTitle = '',
  taskId,
  onUploadStart,
  onUploadSuccess,
  onUploadError,
  isReupload = false
}: YouTubeUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'success' | 'error' | ''>('');
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [pinnedComment, setPinnedComment] = useState(''); // 고정 댓글
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [mounted, setMounted] = useState(false);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [scheduleType, setScheduleType] = useState<'now' | 'scheduled'>('now');
  const [isAuthError, setIsAuthError] = useState(false); // 인증 오류 여부
  const [authErrorChannelId, setAuthErrorChannelId] = useState<string>(''); // 인증 실패한 채널
  const [publishAt, setPublishAt] = useState(() => {
    // 기본값: 현재 + 3분
    const defaultTime = new Date(Date.now() + 3 * 60 * 1000);
    return defaultTime.toISOString().slice(0, 16);
  });

  useEffect(() => {
    setMounted(true);
    // localStorage에서 저장된 설정 불러오기 (공개 설정, 태그만)
    // ⚠️ description은 localStorage에서 불러오지 않음 (영상마다 다르게 설정해야 함)
    const savedPrivacy = localStorage.getItem('youtube_privacy_setting');
    if (savedPrivacy && ['public', 'unlisted', 'private'].includes(savedPrivacy)) {
      setPrivacy(savedPrivacy as 'public' | 'unlisted' | 'private');
    }

    const savedTitle = localStorage.getItem('youtube_last_title');
    if (savedTitle && !defaultTitle) {
      setTitle(savedTitle);
    }

    // ✅ FIX: description은 localStorage에서 불러오지 않음
    // 숏폼/롱폼마다 설명이 달라야 하므로 항상 비워두고
    // 상품 타입인 경우에만 story.json에서 자동 로드됨

    // ✅ FIX: tags는 localStorage에서 불러오지 않음 (숏폼/롱폼/상품 혼용 방지)
  }, []);

  // 상품 타입일 때 youtube_description 자동 로드
  useEffect(() => {
    const loadProductDescription = async () => {
      if (!taskId) return;

      try {
        console.log('🔍 상품 설명 로드 시도 - taskId:', taskId);

        // ⭐ taskId로 직접 story.json 가져오기
        const res = await fetch(`/api/jobs/${taskId}/story`);
        if (!res.ok) {
          console.log('⚠️ story.json 없음:', res.status);
          return;
        }

        const data = await res.json();
        console.log('📦 story.json 응답:', data.success ? 'success' : 'failed');

        if (!data.success || !data.story) return;

        // youtube_description.text 확인
        if (data.story.youtube_description && data.story.youtube_description.text) {
          const youtubeDesc = data.story.youtube_description.text;
          // ✅ 문자열 "\n"을 실제 줄바꿈으로 변환
          const formattedDesc = youtubeDesc.replace(/\\n/g, '\n');
          console.log('✅ 상품 YouTube 설명 자동 로드 (길이:', formattedDesc.length, '자)');
          setDescription(formattedDesc);
          // ⭐ 상품: 댓글에도 동일한 설명 설정
          setPinnedComment(formattedDesc);
        } else {
          console.log('ℹ️ youtube_description 없음');
        }
      } catch (error) {
        console.error('❌ YouTube 설명 로드 실패:', error);
      }
    };

    loadProductDescription();
  }, [taskId]);

  // ⭐ 설명이 변경되면 해시태그 자동 추출해서 태그에 넣기
  useEffect(() => {
    if (!description) return;

    const hashtagMatches = description.match(/#[^\s#]+/g);
    if (hashtagMatches && hashtagMatches.length > 0) {
      const extractedTags = hashtagMatches.map((tag: string) => tag.replace('#', '')).join(', ');
      console.log('🏷️ 설명에서 태그 자동 추출:', extractedTags);
      setTags(extractedTags);
    }
  }, [description]);

  const loadChannels = async () => {
    try {
      setLoadingChannels(true);
      const res = await fetch('/api/youtube/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);

        let shortformChannelSelected = false;
        let descriptionSet = false; // 설명이 설정되었는지 추적
        try {
          // ⭐ 1. 새 API로 롱폼 URL + 채널 ID 조회 (DB 기반 - story.json보다 우선)
          console.log('🔍 롱폼 URL/채널 조회 중 (taskId):', taskId);
          const longformRes = await fetch(`/api/jobs/${taskId}/longform-url`);
          if (longformRes.ok) {
            const longformData = await longformRes.json();
            if (longformData.success && longformData.longformUrl) {
              const longformUrl = longformData.longformUrl;
              console.log('🎬 DB에서 롱폼 YouTube URL 발견:', longformUrl);

              const newDescription = `🎬 전체 영상 보기: ${longformUrl}\n\n구독과 좋아요 부탁드립니다 ❤️`;
              setDescription(newDescription);
              const newComment = `🎬 전체 영상 보러가기 👉 ${longformUrl}`;
              setPinnedComment(newComment);
              descriptionSet = true;
              console.log('✅ 숏폼 설명/댓글에 롱폼 링크 자동 추가됨');
            }

            // ⭐ 롱폼 채널 ID로 채널 자동 선택
            if (longformData.success && longformData.longformChannelId) {
              const matchingChannel = data.channels?.find((ch: YouTubeChannel) => ch.channelId === longformData.longformChannelId);
              if (matchingChannel) {
                setSelectedChannelId(matchingChannel.id);
                console.log('✅ 숏폼 업로드: 롱폼 채널 자동 선택됨 (API) -', matchingChannel.channelTitle);
                shortformChannelSelected = true;
              } else {
                console.log('⚠️ 롱폼 채널 ID가 있지만 매칭 채널 없음:', longformData.longformChannelId);
              }
            }
          }

          // ⭐ 2. story.json에서 상품 설명, 채널 ID 확인
          const storyRes = await fetch(`/api/jobs/${taskId}/story`);
          if (storyRes.ok) {
            const storyResponse = await storyRes.json();
            const storyData = storyResponse.story;

            if (storyData) {
              // 상품: youtube_description 있으면 설명/댓글 자동 설정 (롱폼 링크가 없을 때만)
              if (storyData.youtube_description?.text && !descriptionSet) {
                const youtubeDesc = storyData.youtube_description.text.replace(/\\n/g, '\n');
                console.log('🛍️ 상품 설명 발견 (길이:', youtubeDesc.length, '자)');
                setDescription(youtubeDesc);
                setPinnedComment(youtubeDesc);

                const hashtagMatches = youtubeDesc.match(/#[^\s#]+/g);
                if (hashtagMatches && hashtagMatches.length > 0) {
                  const extractedTags = hashtagMatches.map((tag: string) => tag.replace('#', '')).join(', ');
                  setTags(extractedTags);
                }
              }

              // 별도 tags 필드가 있으면 사용
              if (storyData.youtube_description?.tags) {
                const tagsArray = storyData.youtube_description.tags;
                if (Array.isArray(tagsArray) && tagsArray.length > 0) {
                  setTags(tagsArray.join(', '));
                }
              }

              // 채널 자동 선택 (API에서 채널이 선택되지 않은 경우에만 - fallback)
              if (!shortformChannelSelected && storyData.metadata?.longform_channel_id) {
                const longformChannelId = storyData.metadata.longform_channel_id;
                const matchingChannel = data.channels?.find((ch: YouTubeChannel) => ch.channelId === longformChannelId);
                if (matchingChannel) {
                  setSelectedChannelId(matchingChannel.id);
                  console.log('✅ 숏폼 업로드: 롱폼 채널 자동 선택됨 (story.json fallback) -', matchingChannel.channelTitle);
                  shortformChannelSelected = true;
                }
              }
            }
          }
        } catch (err) {
          console.warn('⚠️ 숏폼 정보 로드 실패 (기본값 사용):', err);
        }

        if (shortformChannelSelected) return;

        // 기본 채널 자동 선택
        const defaultChannel = data.channels?.find((ch: YouTubeChannel) => ch.isDefault);
        if (defaultChannel) {
          setSelectedChannelId(defaultChannel.id);
        } else if (data.channels?.length > 0) {
          setSelectedChannelId(data.channels[0].id);
        }
      }
    } catch (error) {
      console.error('채널 목록 로딩 실패:', error);
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleUploadClick = async () => {
    setShowModal(true);
    // 모달 열 때마다 예약 시간을 3분 후로 리셋
    const defaultTime = new Date(Date.now() + 3 * 60 * 1000);
    setPublishAt(defaultTime.toISOString().slice(0, 16));
    await loadChannels();
  };

  const addLog = (log: string) => {
    setUploadLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
  };

  const handleCancelUpload = async () => {
    // 이미 중지 중이면 무시
    if (!isUploading || uploadStatus !== 'uploading') {
      return;
    }

    try {
      // 중지 상태로 즉시 변경하여 중복 클릭 방지
      setUploadStatus('error');
      setIsUploading(false);
      addLog('🛑 업로드 중지 요청 중...');

      const res = await fetch(`/api/youtube/upload?taskId=${taskId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success || res.ok) {
        addLog('✅ 업로드가 중지되었습니다.');
        toast.success('YouTube 업로드가 중지되었습니다.');
      } else {
        addLog(`❌ 중지 실패: ${data.error || '알 수 없는 오류'}`);
        toast.error('중지 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error: any) {
      const errorMessage = error?.message || '알 수 없는 오류';
      addLog(`❌ 중지 중 오류: ${errorMessage}`);
      toast.error('중지 중 오류가 발생했습니다.');
    }
  };

  // 채널 재연결 (OAuth)
  const handleReconnect = async () => {
    try {
      const channelId = authErrorChannelId || selectedChannelId;
      if (!channelId) {
        toast.error('채널 정보가 없습니다');
        return;
      }

      addLog('🔄 채널 재연결 시작...');
      toast.loading('YouTube 인증 페이지로 이동 중...', { id: 'reauth' });

      const res = await fetch(`/api/youtube/oauth-start?reauth=true&channelId=${channelId}`, {
        method: 'GET'
      });

      const data = await res.json();
      if (data.authUrl) {
        toast.dismiss('reauth');
        window.open(data.authUrl, '_blank', 'width=600,height=700');
        addLog('📱 새 창에서 YouTube 인증을 완료해주세요');
        toast.success('새 창에서 YouTube 인증을 완료해주세요', { duration: 5000 });
      } else {
        toast.error(`재연결 실패: ${data.error || '알 수 없는 오류'}`, { id: 'reauth' });
        addLog(`❌ 재연결 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (error: any) {
      toast.error(`재연결 오류: ${error.message}`, { id: 'reauth' });
      addLog(`❌ 재연결 오류: ${error.message}`);
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error('제목을 입력해주세요');
      return;
    }

    if (!selectedChannelId) {
      toast.error('YouTube 채널을 선택해주세요');
      return;
    }

    if (scheduleType === 'scheduled') {
      if (!publishAt) {
        toast.error('예약 시간을 선택해주세요');
        return;
      }

      // 예약 시간이 현재로부터 최소 3분 이후인지 확인
      const publishTime = new Date(publishAt).getTime();
      const minTime = Date.now() + 3 * 60 * 1000; // 3분 후

      if (publishTime < minTime) {
        toast.error('예약 시간은 최소 3분 이후로 설정해야 합니다');
        return;
      }
    }

    let progressInterval: NodeJS.Timeout | null = null;
    let messageTimer: NodeJS.Timeout | null = null;

    try {
      setIsUploading(true);
      setShowModal(false);
      setShowProgressModal(true);
      setUploadLogs([]);
      setUploadProgress(0);
      setUploadStatus('uploading');
      setIsAuthError(false); // 인증 오류 상태 초기화
      setAuthErrorChannelId('');

      if (scheduleType === 'scheduled') {
        addLog('⏰ 예약 업로드 시작 (비디오는 지금 업로드, 예약 시간에 자동 공개)');
      } else {
        addLog('YouTube 업로드 시작');
      }

      // 업로드 시작 콜백 호출
      if (onUploadStart) {
        onUploadStart();
      }

      const tagList = tags.split(',').map(t => t.trim()).filter(t => t);

      addLog('업로드 요청 준비 중...');
      addLog(`제목: ${title}`);
      addLog(`공개 설정: ${privacy}`);
      if (scheduleType === 'scheduled') {
        addLog(`⏰ 예약 공개 시간: ${new Date(publishAt).toLocaleString('ko-KR')}`);
      }

      // 90% 이후 메시지 추가를 위한 타이머
      messageTimer = setTimeout(() => {
        addLog('📤 YouTube 서버에 업로드 중... (비디오 크기에 따라 시간이 소요될 수 있습니다)');
      }, 15000); // 15초 후

      // 진행률 시뮬레이션 (업로드 중 증가)
      progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 98) {
            return 98; // 98%에서 멈춤 (완료 시 100으로 설정)
          }
          // 점진적으로 증가 (빠르게 시작, 아주 느리게 증가)
          const increment = prev < 30 ? 10 : prev < 60 ? 5 : prev < 90 ? 2 : 0.2;
          return Math.min(prev + increment, 98);
        });
      }, 1000);

      // publishAt을 ISO 8601 형식으로 변환
      const publishAtISO = scheduleType === 'scheduled' && publishAt
        ? new Date(publishAt).toISOString()
        : undefined;

      const res = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath,
          thumbnailPath,
          title,
          description,
          pinnedComment, // ⭐ 고정 댓글 전달
          tags: tagList,
          privacy,
          channelId: selectedChannelId,
          taskId,
          publishAt: publishAtISO
        })
      });

      // API 응답 받으면 타이머 중지
      if (progressInterval) clearInterval(progressInterval);
      if (messageTimer) clearTimeout(messageTimer);

      addLog('서버 응답 대기 중...');

      const data = await res.json();

      console.log('📥 Upload API Response:', { status: res.status, data });

      if (data.success) {
        setUploadStatus('success');
        setUploadProgress(100);

        if (scheduleType === 'scheduled') {
          addLog('✅ YouTube 업로드 완료! (예약 시간에 자동 공개됩니다)');
          addLog(`🔒 현재 상태: Private (${new Date(publishAt).toLocaleString('ko-KR')}에 공개)`);
        } else {
          addLog('✅ YouTube 업로드 완료!');
        }

        addLog(`비디오 ID: ${data.videoId}`);
        addLog(`URL: ${data.videoUrl}`);

        // 성공 시 설정 저장 (description 제외 - 영상마다 달라야 함)
        localStorage.setItem('youtube_privacy_setting', privacy);
        localStorage.setItem('youtube_last_title', title);
        // ✅ FIX: description은 저장하지 않음 (롱폼/숏폼 혼용 방지)
        // ✅ FIX: tags 저장 안 함 (숏폼/롱폼/상품 혼용 방지)
if (onUploadSuccess) {
          onUploadSuccess({ videoId: data.videoId, videoUrl: data.videoUrl });
        }

        // 3초 후 모달 닫기
        setTimeout(() => {
          setShowProgressModal(false);
        }, 3000);
      } else {
        setUploadStatus('error');
        if (progressInterval) clearInterval(progressInterval);
        if (messageTimer) clearTimeout(messageTimer);
        const errorMsg = data.error || '업로드 실패';
        const detailsMsg = data.details || '';

        // 인증 오류 감지
        const authErrorPatterns = ['인증 실패', '토큰', 'invalid_grant', 'expired', 'revoked', 'auth'];
        const isAuth = authErrorPatterns.some(p =>
          errorMsg.toLowerCase().includes(p.toLowerCase()) ||
          detailsMsg.toLowerCase().includes(p.toLowerCase())
        );
        if (isAuth) {
          setIsAuthError(true);
          setAuthErrorChannelId(selectedChannelId);
          addLog('');
          addLog('💡 채널 연결이 만료되었습니다. 아래 버튼을 눌러 재연결하세요.');
        }

        addLog(`❌ 업로드 실패: ${errorMsg}`);
        if (detailsMsg) {
          addLog(`   상세: ${detailsMsg}`);
        }

        // 토큰 경로나 credentials 경로 정보가 있으면 표시
        if (data.tokenPath) {
          addLog(`   토큰 경로: ${data.tokenPath}`);
        }
        if (data.credentialsPath) {
          addLog(`   Credentials 경로: ${data.credentialsPath}`);
        }

        if (data.stdout) {
          addLog('Python stdout:');
          data.stdout.split('\n').forEach((line: string) => {
            if (line.trim()) addLog(`  ${line}`);
          });
        }
        if (data.stderr) {
          addLog('Python stderr:');
          data.stderr.split('\n').forEach((line: string) => {
            if (line.trim()) addLog(`  ${line}`);
          });
        }

        console.warn('❌ Upload API Error:', {
          error: errorMsg,
          details: detailsMsg,
          fullData: data
        });
        if (onUploadError) {
          onUploadError(errorMsg);
        }
      }
    } catch (error: any) {
      if (progressInterval) clearInterval(progressInterval);
      if (messageTimer) clearTimeout(messageTimer);
      setUploadStatus('error');
      const errorMessage = error?.message || error?.toString() || '알 수 없는 오류';
      addLog(`❌ 오류 발생: ${errorMessage}`);

      console.warn('YouTube 업로드 실패:', {
        message: errorMessage,
        error: error
      });
      if (onUploadError) {
        onUploadError(errorMessage);
      }
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      if (messageTimer) clearTimeout(messageTimer);
      setIsUploading(false);
    }
  };

  const modalContent = showModal && mounted ? (
    createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99999] p-2">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-700/50">
            {/* 헤더 */}
            <div className="bg-red-600 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <span className="text-white font-semibold">YouTube 업로드</span>
              </div>
              <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
              {/* 채널 & 공개설정 - 2열 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">채널</label>
                  {loadingChannels ? (
                    <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-400 text-sm">로딩...</div>
                  ) : channels.length === 0 ? (
                    <div className="px-3 py-2 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-xs">채널 없음</div>
                  ) : (
                    <select
                      value={selectedChannelId}
                      onChange={(e) => setSelectedChannelId(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.channelTitle}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">공개 설정</label>
                  <select
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as any)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                  >
                    <option value="public">공개</option>
                    <option value="unlisted">일부 공개</option>
                    <option value="private">비공개</option>
                  </select>
                </div>
              </div>

              {/* 제목 */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-gray-400">제목</label>
                  <span className="text-xs text-gray-500">{title.length}/100</span>
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="영상 제목"
                  maxLength={100}
                />
              </div>

              {/* 설명 */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-gray-400">설명</label>
                  <span className="text-xs text-gray-500">{description.length}/5000</span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-y"
                  placeholder="영상 설명"
                  maxLength={5000}
                />
              </div>

              {/* 고정 댓글 */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-gray-400">📌 고정 댓글</label>
                  <span className="text-xs text-gray-500">{pinnedComment.length}/10000</span>
                </div>
                <textarea
                  value={pinnedComment}
                  onChange={(e) => setPinnedComment(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-800 border border-yellow-600/50 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 resize-y"
                  placeholder="업로드 후 자동으로 고정 댓글이 달립니다"
                  maxLength={10000}
                />
              </div>

              {/* 태그 */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">태그</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="쉼표로 구분"
                />
              </div>

              {/* 업로드 시점 */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">업로드 시점</label>
                <div className="flex bg-gray-800 rounded border border-gray-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setScheduleType('now')}
                    className={`flex-1 py-1.5 text-sm font-medium transition-all ${
                      scheduleType === 'now' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    즉시
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleType('scheduled');
                      const defaultTime = new Date(Date.now() + 3 * 60 * 1000);
                      setPublishAt(defaultTime.toISOString().slice(0, 16));
                    }}
                    className={`flex-1 py-1.5 text-sm font-medium transition-all ${
                      scheduleType === 'scheduled' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    예약
                  </button>
                </div>
                {scheduleType === 'scheduled' && (
                  <input
                    type="datetime-local"
                    value={publishAt}
                    onChange={(e) => setPublishAt(e.target.value)}
                    min={new Date(Date.now() + 3 * 60 * 1000).toISOString().slice(0, 16)}
                    className="w-full mt-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                )}
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700 flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                disabled={isUploading}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-all"
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading || channels.length === 0}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-all flex items-center justify-center gap-1.5"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>업로드 중</span>
                  </>
                ) : (
                  <span>업로드</span>
                )}
              </button>
            </div>
          </div>
        </div>,
      document.body
    )
  ) : null;

  const progressModal = showProgressModal && mounted ? (
    createPortal(
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99999] p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {/* 헤더 */}
          <div className={`p-6 border-b border-gray-200 dark:border-gray-700 ${
            uploadStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
            uploadStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
            'bg-blue-50 dark:bg-blue-900/20'
          }`}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {uploadStatus === 'uploading' && (
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                )}
                {uploadStatus === 'success' && '✅'}
                {uploadStatus === 'error' && '❌'}
                YouTube 업로드 {uploadStatus === 'uploading' ? '진행 중' : uploadStatus === 'success' ? '완료' : '실패'}
              </h2>
              {uploadStatus !== 'uploading' && (
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 진행바 */}
            {uploadStatus === 'uploading' && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">업로드 진행률</span>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 transition-all duration-500 ease-out rounded-full flex items-center justify-end pr-1"
                    style={{ width: `${uploadProgress}%` }}
                  >
                    {uploadProgress > 10 && (
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 로그 영역 */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
            <div className="font-mono text-sm space-y-1">
              {uploadLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`${
                    log.includes('✅') ? 'text-green-600 dark:text-green-400 font-semibold' :
                    log.includes('❌') ? 'text-red-600 dark:text-red-400' :
                    log.includes('⚠️') ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {log}
                </div>
              ))}
              {uploadLogs.length === 0 && (
                <div className="text-gray-500 dark:text-gray-400">로그 대기 중...</div>
              )}
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {uploadStatus === 'uploading' ? (
              <button
                onClick={handleCancelUpload}
                className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>🛑</span>
                <span>업로드 중지</span>
              </button>
            ) : isAuthError ? (
              <div className="flex gap-3">
                <button
                  onClick={handleReconnect}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <span>🔗</span>
                  <span>채널 재연결</span>
                </button>
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  닫기
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowProgressModal(false)}
                className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <>
      <button
        onClick={handleUploadClick}
        className={`px-3 py-1.5 ${
          isReupload
            ? 'bg-orange-600 hover:bg-orange-500'
            : 'bg-red-600 hover:bg-red-500'
        } text-white rounded text-sm font-medium whitespace-nowrap`}
      >
        {isReupload ? '🔄재업로드' : '📤YouTube'}</button>

      {modalContent}
      {progressModal}
    </>
  );
}
