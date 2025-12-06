'use client';

import { useState, useEffect, useRef } from 'react';

interface Channel {
  channelId: string;
  channelName: string;
  thumbnail?: string;
}

interface ChannelSetting {
  id: string;
  channel_id: string;
  channel_name: string;
  color: string;
  posting_mode: 'fixed_interval' | 'weekday_time';
  interval_value?: number;
  interval_unit?: 'minutes' | 'hours' | 'days';
  posting_times?: string[]; // 고정 주기용 시간대 (예: ["09:00", "15:00", "21:00"])
  weekday_times?: { [weekday: string]: string[] }; // 요일별 시간대 (예: {"1": ["09:00", "12:00"], "3": ["15:00"]})
  isActive: boolean;
  categories?: string[]; // 자동 제목 생성용 카테고리 리스트
}

interface ChannelSchedule {
  task_id: string;
  title: string;
  scheduled_time: string;
  status: string;
  queue_type?: string;
  queue_status?: string;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // yellow
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export default function ChannelSettings() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [settings, setSettings] = useState<ChannelSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [editingSetting, setEditingSetting] = useState<Partial<ChannelSetting> | null>(
    null
  );
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [triggering, setTriggering] = useState(false);
  const [channelSchedules, setChannelSchedules] = useState<Record<string, ChannelSchedule[]>>({});
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());

  // 설정 편집 섹션 ref
  const editingRef = useRef<HTMLDivElement>(null);

  // 채널 목록 조회
  const fetchChannels = async () => {
    try {
      const response = await fetch('/api/youtube/channels');
      if (!response.ok) throw new Error('Failed to fetch channels');

      const data = await response.json();
      setChannels(
        data.channels?.map((ch: any) => ({
          channelId: ch.channelId,
          channelName: ch.channelTitle || ch.channelId,
          thumbnail: ch.thumbnailUrl,
        })) || []
      );
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  // 채널 설정 조회
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/automation/channel-settings');
      if (!response.ok) throw new Error('Failed to fetch settings');

      const data = await response.json();
      setSettings(data.settings || []);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // 카테고리 목록 조회
  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/automation/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');

      const data = await response.json();
      setAvailableCategories(data.categories?.map((c: any) => c.name) || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // 스케줄러 상태 조회
  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch('/api/automation/scheduler-status');
      if (!response.ok) throw new Error('Failed to fetch scheduler status');

      const data = await response.json();
      setSchedulerStatus(data.status);
    } catch (error) {
      console.error('Error fetching scheduler status:', error);
    }
  };

  // 채널별 스케줄 조회
  const fetchChannelSchedules = async (channelId: string) => {
    try {
      const response = await fetch(`/api/automation/channel-schedules?channelId=${channelId}`);
      if (!response.ok) throw new Error('Failed to fetch channel schedules');

      const data = await response.json();
      setChannelSchedules(prev => ({
        ...prev,
        [channelId]: data.schedules || []
      }));
    } catch (error) {
      console.error('Error fetching channel schedules:', error);
    }
  };

  // 스케줄 펼치기/접기 토글
  const toggleChannelExpand = async (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedChannels);
    if (newExpanded.has(channelId)) {
      newExpanded.delete(channelId);
    } else {
      newExpanded.add(channelId);
      // 처음 펼칠 때 스케줄 조회
      if (!channelSchedules[channelId]) {
        await fetchChannelSchedules(channelId);
      }
    }
    setExpandedChannels(newExpanded);
  };

  // 수동 트리거
  const handleManualTrigger = async () => {
    if (triggering) return;

    try {
      setTriggering(true);
      const response = await fetch('/api/automation/trigger-auto-schedule', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger auto-schedule');
      }

      alert(data.message || '자동 생성 완료!');
      await Promise.all([fetchSettings(), fetchSchedulerStatus()]);
    } catch (error: any) {
      console.error('Error triggering auto-schedule:', error);
      alert('오류: ' + error.message);
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    Promise.all([
      fetchChannels(),
      fetchSettings(),
      fetchCategories(),
      fetchSchedulerStatus(),
    ]);

    // 30초마다 스케줄러 상태 갱신
    const interval = setInterval(fetchSchedulerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // 채널 선택 시 설정 편집 영역으로 스크롤
  useEffect(() => {
    if (editingSetting && editingRef.current) {
      setTimeout(() => {
        editingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [editingSetting]);

  // 채널 선택
  const handleChannelSelect = (channelId: string) => {
    const existingSetting = settings.find((s) => s.channel_id === channelId);
    const channel = channels.find((c) => c.channelId === channelId);

    if (existingSetting) {
      setEditingSetting(existingSetting);
    } else if (channel) {
      // 새 설정 생성
      const usedColors = settings.map((s) => s.color);
      const availableColor =
        PRESET_COLORS.find((c) => !usedColors.includes(c)) || PRESET_COLORS[0];

      setEditingSetting({
        channel_id: channelId,
        channel_name: channel.channelName,
        color: availableColor,
        posting_mode: 'fixed_interval',
        interval_value: 1,
        interval_unit: 'days',
        posting_times: ['09:00', '15:00', '21:00'], // 기본: 하루 3번
        weekday_times: {
          '1': ['09:00', '15:00', '21:00'], // 월요일
          '3': ['09:00', '15:00', '21:00'], // 수요일
          '5': ['09:00', '15:00', '21:00'], // 금요일
        },
        isActive: true,
        categories: [], // 빈 배열로 시작
      });
    }

    setSelectedChannel(channelId);
  };

  // 설정 저장
  const handleSaveSetting = async () => {
    if (!editingSetting) return;

    console.log('💾 저장할 채널 설정:', editingSetting);

    try {
      const response = await fetch('/api/automation/channel-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSetting),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ 저장 실패:', errorData);
        throw new Error(errorData.error || 'Failed to save setting');
      }

      await fetchSettings();
      setSelectedChannel(null);
      setEditingSetting(null);
      alert('채널 설정이 저장되었습니다.');
    } catch (error: any) {
      console.error('Error saving setting:', error);
      alert(`설정 저장에 실패했습니다.\n${error.message || '알 수 없는 오류'}`);
    }
  };

  // 설정 삭제
  const handleDeleteSetting = async (channelId: string) => {
    if (!confirm('이 채널 설정을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(
        `/api/automation/channel-settings?channelId=${channelId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete setting');

      await fetchSettings();
      alert('채널 설정이 삭제되었습니다.');
    } catch (error) {
      console.error('Error deleting setting:', error);
      alert('설정 삭제에 실패했습니다.');
    }
  };

  // 요일 토글 (시간 초기화)
  const toggleWeekday = (day: number) => {
    if (!editingSetting) return;

    const weekdayTimes = editingSetting.weekday_times || {};
    const dayKey = day.toString();

    if (weekdayTimes[dayKey]) {
      // 이미 있으면 제거
      const newWeekdayTimes = { ...weekdayTimes };
      delete newWeekdayTimes[dayKey];
      setEditingSetting({ ...editingSetting, weekday_times: newWeekdayTimes });
    } else {
      // 없으면 추가 (기본 시간: 09:00, 12:00, 15:00, 18:00, 21:00)
      setEditingSetting({
        ...editingSetting,
        weekday_times: {
          ...weekdayTimes,
          [dayKey]: ['09:00', '12:00', '15:00', '18:00', '21:00'],
        },
      });
    }
  };

  // 카테고리 토글
  const toggleCategory = (category: string) => {
    if (!editingSetting) return;

    const categories = editingSetting.categories || [];
    const newCategories = categories.includes(category)
      ? categories.filter((c) => c !== category)
      : [...categories, category];

    setEditingSetting({ ...editingSetting, categories: newCategories });
  };

  // 카테고리 직접 추가
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const addCustomCategory = () => {
    if (!editingSetting || !newCategoryInput.trim()) return;

    const categories = editingSetting.categories || [];
    if (categories.includes(newCategoryInput.trim())) {
      alert('이미 추가된 카테고리입니다.');
      return;
    }

    setEditingSetting({
      ...editingSetting,
      categories: [...categories, newCategoryInput.trim()],
    });
    setNewCategoryInput('');
  };

  return (
    <div className="space-y-4">
      {/* 스케줄러 상태 및 수동 트리거 */}
      <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg shadow p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-sm font-medium opacity-90">🤖 자동화 스케줄러 상태</h3>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">상태:</span>
                {schedulerStatus?.isRunning ? (
                  <span className="text-xs bg-green-400 text-green-900 px-2 py-0.5 rounded-full font-medium">
                    ● 실행 중
                  </span>
                ) : (
                  <span className="text-xs bg-red-400 text-red-900 px-2 py-0.5 rounded-full font-medium">
                    ○ 정지됨
                  </span>
                )}
              </div>
              {schedulerStatus?.lastAutoScheduleCheck && (
                <div className="text-xs opacity-80">
                  마지막 체크: {new Date(schedulerStatus.lastAutoScheduleCheck).toLocaleString('ko-KR')}
                </div>
              )}
              {schedulerStatus?.lastAutoScheduleResult && (
                <div className="text-xs opacity-80">
                  결과: ✅ {schedulerStatus.lastAutoScheduleResult.success}개 생성,
                  ⏭️ {schedulerStatus.lastAutoScheduleResult.skipped}개 건너뜀,
                  ❌ {schedulerStatus.lastAutoScheduleResult.failed}개 실패
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleManualTrigger}
            disabled={triggering}
            className="px-4 py-2 bg-white text-purple-600 rounded-lg font-medium hover:bg-purple-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggering ? '실행 중...' : '🚀 지금 자동 생성 실행'}
          </button>
        </div>
      </div>

      {/* 채널 목록 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-bold mb-4">채널별 스케줄 설정</h2>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {channels.map((channel) => {
              const setting = settings.find((s) => s.channel_id === channel.channelId);
              const isSelected = selectedChannel === channel.channelId;
              const isExpanded = expandedChannels.has(channel.channelId);

              return (
                <div
                  key={channel.channelId}
                  className={`relative rounded-xl overflow-hidden transition-all duration-200 ${
                    isSelected
                      ? 'ring-2 ring-blue-500 shadow-lg'
                      : 'border border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                  style={{
                    borderLeft: setting ? `4px solid ${setting.color}` : undefined
                  }}
                >
                  {/* 헤더 영역 - 클릭 가능 */}
                  <div
                    onClick={() => handleChannelSelect(channel.channelId)}
                    className={`p-4 cursor-pointer ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 채널 썸네일 */}
                      {channel.thumbnail ? (
                        <img
                          src={channel.thumbnail}
                          alt={channel.channelName}
                          className="w-12 h-12 rounded-full ring-2 ring-white shadow"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-gray-500 text-lg font-bold">
                          {channel.channelName.charAt(0)}
                        </div>
                      )}

                      {/* 채널 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900 truncate">{channel.channelName}</h3>
                          {setting?.categories && setting.categories.length > 0 && (
                            <span className="shrink-0 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">
                              AUTO
                            </span>
                          )}
                        </div>

                        {/* 스케줄 요약 - 한 줄로 */}
                        {setting ? (
                          <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                            {setting.posting_mode === 'fixed_interval' ? (
                              <>
                                <span className="font-medium text-blue-600">
                                  {setting.interval_value === 1 ? '매일' : `${setting.interval_value}일마다`}
                                </span>
                                <span className="text-gray-400">·</span>
                                <span>
                                  {setting.posting_times?.length || 0}회/일
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-purple-600">요일별</span>
                                <span className="text-gray-400">·</span>
                                <span>
                                  {Object.keys(setting.weekday_times || {}).map(d => WEEKDAY_LABELS[parseInt(d)]).join('')}
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-gray-400">설정 없음 - 클릭하여 설정</div>
                        )}
                      </div>

                      {/* 편집 아이콘 */}
                      <button className="shrink-0 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* 설정이 있을 때만 표시되는 상세 영역 */}
                  {setting && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {/* 빠른 정보 바 */}
                      <div className="px-4 py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          {/* 업로드 시간 */}
                          {setting.posting_mode === 'fixed_interval' && setting.posting_times && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <span className="text-gray-400">⏰</span>
                              <span>{setting.posting_times.slice(0, 3).join(', ')}</span>
                              {setting.posting_times.length > 3 && (
                                <span className="text-gray-400">+{setting.posting_times.length - 3}</span>
                              )}
                            </div>
                          )}
                          {/* 카테고리 */}
                          {setting.categories && setting.categories.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">🏷️</span>
                              <span className="text-gray-600">{setting.categories.length}개</span>
                            </div>
                          )}
                        </div>

                        {/* 액션 버튼들 */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => toggleChannelExpand(channel.channelId, e)}
                            className={`px-2 py-1 rounded font-medium transition ${
                              isExpanded
                                ? 'bg-purple-100 text-purple-700'
                                : 'hover:bg-gray-200 text-gray-600'
                            }`}
                          >
                            {isExpanded ? '△ 접기' : '▽ 스케줄'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/api/youtube/oauth-start?channelId=${channel.channelId}`, '_blank');
                            }}
                            className="px-2 py-1 rounded hover:bg-blue-100 text-blue-600 font-medium transition"
                          >
                            재인증
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSetting(channel.channelId);
                            }}
                            className="px-2 py-1 rounded hover:bg-red-100 text-red-500 transition"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* 스케줄 목록 (펼쳤을 때) */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-1 border-t border-gray-200 bg-white">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700">등록된 스케줄</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchChannelSchedules(channel.channelId);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              새로고침
                            </button>
                          </div>
                          {!channelSchedules[channel.channelId] ? (
                            <div className="text-xs text-gray-400 text-center py-4">불러오는 중...</div>
                          ) : !Array.isArray(channelSchedules[channel.channelId]) || channelSchedules[channel.channelId].length === 0 ? (
                            <div className="text-xs text-gray-400 text-center py-4">등록된 스케줄이 없습니다</div>
                          ) : (
                            <div className="space-y-1.5 max-h-52 overflow-y-auto">
                              {channelSchedules[channel.channelId].map((schedule) => {
                                const statusColor =
                                  schedule.queue_status === 'processing' ? 'bg-blue-500' :
                                  schedule.queue_status === 'waiting' ? 'bg-amber-500' :
                                  schedule.queue_status === 'completed' ? 'bg-emerald-500' :
                                  schedule.queue_status === 'failed' ? 'bg-red-500' :
                                  'bg-gray-400';

                                const statusText =
                                  schedule.queue_status === 'processing' ? '처리중' :
                                  schedule.queue_status === 'waiting' ? schedule.queue_type?.toUpperCase() :
                                  schedule.queue_status === 'completed' ? '완료' :
                                  schedule.queue_status === 'failed' ? '실패' :
                                  '예약';

                                return (
                                  <div
                                    key={schedule.task_id}
                                    className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                                  >
                                    {/* 상태 뱃지 */}
                                    <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold text-white rounded ${statusColor}`}>
                                      {statusText}
                                    </span>

                                    {/* 제목 */}
                                    <span className="flex-1 text-xs text-gray-800 truncate font-medium">
                                      {schedule.title || '제목 없음'}
                                    </span>

                                    {/* 예정 시간 */}
                                    {schedule.scheduled_time && (
                                      <span className="shrink-0 text-[11px] text-gray-500">
                                        {new Date(schedule.scheduled_time).toLocaleDateString('ko-KR', {
                                          month: 'numeric',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 설정 편집 */}
      {editingSetting && (
        <div ref={editingRef} className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-bold mb-4">
            {editingSetting.channel_name} 설정
          </h3>

          <div className="space-y-4">
            {/* 색상 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">달력 색상</label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() =>
                      setEditingSetting({ ...editingSetting, color })
                    }
                    className={`w-8 h-8 rounded-full border-2 ${
                      editingSetting.color === color
                        ? 'border-gray-800'
                        : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* 주기 모드 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">주기 설정 방식</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={editingSetting.posting_mode === 'fixed_interval'}
                    onChange={() =>
                      setEditingSetting({
                        ...editingSetting,
                        posting_mode: 'fixed_interval',
                      })
                    }
                  />
                  <span className="text-sm">고정 주기</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={editingSetting.posting_mode === 'weekday_time'}
                    onChange={() =>
                      setEditingSetting({
                        ...editingSetting,
                        posting_mode: 'weekday_time',
                      })
                    }
                  />
                  <span className="text-sm">요일/시간 지정</span>
                </label>
              </div>
            </div>

            {/* 고정 주기 설정 */}
            {editingSetting.posting_mode === 'fixed_interval' && (
              <div className="space-y-4">
                {/* 주기 선택 (프리셋) */}
                <div>
                  <label className="block text-sm font-medium mb-2">업로드 주기</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '매일', value: 1 },
                      { label: '2일마다', value: 2 },
                      { label: '3일마다', value: 3 },
                      { label: '5일마다', value: 5 },
                      { label: '7일마다', value: 7 },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() =>
                          setEditingSetting({
                            ...editingSetting,
                            interval_value: preset.value,
                            interval_unit: 'days',
                          })
                        }
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                          editingSetting.interval_value === preset.value && editingSetting.interval_unit === 'days'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {/* 직접 입력 */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-sm text-gray-600">또는 직접 입력:</span>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={editingSetting.interval_value || 1}
                      onChange={(e) =>
                        setEditingSetting({
                          ...editingSetting,
                          interval_value: parseInt(e.target.value) || 1,
                          interval_unit: 'days',
                        })
                      }
                      className="w-20 px-3 py-1 border rounded text-center"
                    />
                    <span className="text-sm text-gray-600">일마다</span>
                  </div>
                </div>

                {/* 시간대 선택 */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    업로드 시간 (하루에 여러 번 가능)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(editingSetting.posting_times || []).map((time, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full"
                      >
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => {
                            const newTimes = [...(editingSetting.posting_times || [])];
                            newTimes[idx] = e.target.value;
                            setEditingSetting({ ...editingSetting, posting_times: newTimes });
                          }}
                          className="bg-transparent border-none text-sm font-medium"
                        />
                        <button
                          onClick={() => {
                            const newTimes = (editingSetting.posting_times || []).filter(
                              (_, i) => i !== idx
                            );
                            setEditingSetting({ ...editingSetting, posting_times: newTimes });
                          }}
                          className="text-blue-600 hover:text-red-600 ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newTimes = [...(editingSetting.posting_times || []), '12:00'];
                        setEditingSetting({ ...editingSetting, posting_times: newTimes });
                      }}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-sm font-medium"
                    >
                      ➕ 시간 추가
                    </button>
                  </div>
                  {/* 프리셋 시간 */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-gray-500 w-full">빠른 선택:</span>
                    {[
                      { label: '오전만', times: ['09:00', '11:00'] },
                      { label: '하루 3번', times: ['09:00', '15:00', '21:00'] },
                      { label: '하루 5번', times: ['09:00', '12:00', '15:00', '18:00', '21:00'] },
                      { label: '저녁만', times: ['19:00', '21:00'] },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() =>
                          setEditingSetting({ ...editingSetting, posting_times: preset.times })
                        }
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 요일/시간 설정 */}
            {editingSetting.posting_mode === 'weekday_time' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">요일별 업로드 시간 설정</label>
                  <div className="space-y-3">
                    {WEEKDAY_LABELS.map((label, weekday) => {
                      const dayKey = weekday.toString();
                      const isActive = editingSetting.weekday_times && editingSetting.weekday_times[dayKey];
                      const times = isActive ? editingSetting.weekday_times?.[dayKey] || [] : [];

                      return (
                        <div key={weekday} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <button
                              onClick={() => toggleWeekday(weekday)}
                              className={`px-4 py-2 rounded font-semibold ${
                                isActive
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {label}요일 {isActive ? '✓' : ''}
                            </button>
                            {isActive && (
                              <button
                                onClick={() => {
                                  const weekdayTimes = editingSetting.weekday_times || {};
                                  setEditingSetting({
                                    ...editingSetting,
                                    weekday_times: {
                                      ...weekdayTimes,
                                      [dayKey]: [...times, '18:00'],
                                    },
                                  });
                                }}
                                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-sm"
                              >
                                ➕ 시간 추가
                              </button>
                            )}
                          </div>
                          {isActive && (
                            <div className="space-y-2 pl-4">
                              {times.map((time, timeIndex) => (
                                <div key={timeIndex} className="flex gap-2 items-center">
                                  <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => {
                                      const weekdayTimes = editingSetting.weekday_times || {};
                                      const newTimes = [...times];
                                      newTimes[timeIndex] = e.target.value;
                                      setEditingSetting({
                                        ...editingSetting,
                                        weekday_times: {
                                          ...weekdayTimes,
                                          [dayKey]: newTimes,
                                        },
                                      });
                                    }}
                                    className="px-3 py-2 border rounded"
                                  />
                                  <button
                                    onClick={() => {
                                      const weekdayTimes = editingSetting.weekday_times || {};
                                      const newTimes = times.filter((_, i) => i !== timeIndex);
                                      if (newTimes.length === 0) {
                                        // 마지막 시간이면 요일 자체를 제거
                                        const updated = { ...weekdayTimes };
                                        delete updated[dayKey];
                                        setEditingSetting({
                                          ...editingSetting,
                                          weekday_times: updated,
                                        });
                                      } else {
                                        setEditingSetting({
                                          ...editingSetting,
                                          weekday_times: {
                                            ...weekdayTimes,
                                            [dayKey]: newTimes,
                                          },
                                        });
                                      }
                                    }}
                                    className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                                  >
                                    ❌
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* 카테고리 선택 (완전 자동화용) */}
            <div className="pt-4 border-t">
              <div className="mb-2">
                <label className="block text-sm font-medium mb-1">
                  자동 제목 생성 카테고리
                  <span className="ml-2 text-xs text-gray-500">
                    (주기 도래 시 선택한 카테고리에서 제목 자동 생성)
                  </span>
                </label>
              </div>

              {/* 등록된 카테고리 버튼들 */}
              <div className="flex flex-wrap gap-2 mb-3">
                {availableCategories.length === 0 ? (
                  <div className="text-sm text-yellow-400 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded">
                    ⚠️ 등록된 카테고리가 없습니다.
                    <a href="#category-management" className="ml-2 underline hover:text-yellow-300">
                      카테고리 관리 탭에서 먼저 카테고리를 등록해주세요.
                    </a>
                  </div>
                ) : (
                  availableCategories.map((category) => (
                    <button
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        editingSetting.categories?.includes(category)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {category}
                    </button>
                  ))
                )}
              </div>

              {/* 사용자 정의 카테고리 추가 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomCategory();
                    }
                  }}
                  placeholder="직접 입력 (예: 운동, 재테크)"
                  className="flex-1 px-3 py-2 border rounded text-sm"
                />
                <button
                  onClick={addCustomCategory}
                  className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                >
                  추가
                </button>
              </div>

              {/* 선택된 카테고리 표시 */}
              {editingSetting.categories && editingSetting.categories.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 rounded">
                  <div className="text-xs font-medium text-blue-900 mb-2">
                    선택된 카테고리 ({editingSetting.categories.length}개)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingSetting.categories.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                      >
                        {cat}
                        <button
                          onClick={() => toggleCategory(cat)}
                          className="hover:text-blue-600"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 저장 버튼 */}
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSaveSetting}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setSelectedChannel(null);
                  setEditingSetting(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
