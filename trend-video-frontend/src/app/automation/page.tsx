'use client';

import { useEffect, useState, Suspense, useRef, useMemo, useTransition, useCallback } from 'react';
import { filterImages } from '@/lib/utils/imageFilterUtils';
import { useRouter, useSearchParams } from 'next/navigation';
import ScheduleCalendar from '@/components/automation/ScheduleCalendar';
import ChannelSettings from '@/components/automation/ChannelSettings';
import CategoryManagement from '@/components/automation/CategoryManagement';
import MediaUploadBox from '@/components/MediaUploadBox';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ko } from 'date-fns/locale';
import YouTubeUploadButton from '@/components/YouTubeUploadButton';
import {
  getSelectedChannel,
  getSelectedCategory,
  getSelectedType,
  getSelectedModel,
  getSelectedMediaMode,
  getSelectedPrivacy,
  getDefaultModelByType,
  getDefaultTtsByType,
  getDefaultMediaModeByType,
  getModelForCurrentType,
  getCurrentTimeForInput,
  getDefaultScheduleTime,
  validateTitle
} from '@/lib/utils/automationUtils';
import type {
  NewTitleForm,
  EditTitleForm,
  TitleItem,
  ScheduleItem,
  SchedulerStatus,
  AutomationSettings,
  YouTubeChannel,
  ProgressInfo,
  ProductData,
  AutomationPrefillData,
  PoolTitleItem,
  PoolStats,
  LogItem,
  MainTabType,
  QueueTabType,
  ScheduleManagementTabType
} from '@/types/automation';
import { STATUS_LABELS, isFailedStatus, isProcessingStatus, QUEUE_TAB_STATUS_MAP, QUEUE_TAB_LABELS } from '@/types/automation';

// 스케줄이 특정 큐 탭에 해당하는지 확인 (SQL에서 tabType 필드로 계산됨)
function matchesQueueTab(schedule: any, tab: QueueTabType): boolean {
  if (!schedule) return false;

  // SQL에서 계산된 tabType 컬럼 사용
  // tabType = failed/completed/cancelled (status 기반) 또는 schedule/script/image/video/youtube (type 기반)
  return schedule.tabType === tab;
}

function AutomationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [titles, setTitles] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [allSchedules, setAllSchedules] = useState<any[]>([]); // 전체 스케줄 데이터
  const [displayLimit, setDisplayLimit] = useState(100); // 표시할 항목 수 (100개씩)
  const [newTitle, setNewTitle] = useState(() => {
    const selectedType = getSelectedType();
    return {
      title: '',
      promptFormat: selectedType,
      category: getSelectedCategory(),
      tags: '',
      productUrl: '',
      scheduleTime: (() => {
        // 현재 시간 + 3분을 기본값으로 설정
        const now = new Date(Date.now() + 3 * 60 * 1000);
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      })(),
      channel: '',
      scriptMode: 'chrome',
      mediaMode: getSelectedMediaMode(), // UI에서는 저장된 값 사용
      aiModel: getDefaultModelByType(selectedType), // ✅ 타입에 따른 모델 자동 설정
      youtubeSchedule: 'immediate',
      youtubePublishAt: '',
      youtubePrivacy: getSelectedPrivacy(),
      ttsVoice: getDefaultTtsByType(selectedType), // ✅ 타입에 따른 TTS 자동 설정 (롱폼=순복, 숏폼/상품=선희)
      ttsSpeed: '+0%', // TTS 속도
      autoConvert: selectedType === 'longform' // 롱폼→숏폼 자동변환 (롱폼일 때 기본 체크)
    };
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [recentTitles, setRecentTitles] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string>('');
  const [expandedLogsFor, setExpandedLogsFor] = useState<string | null>(null);
  const [logsMap, setLogsMap] = useState<Record<string, any[]>>({});
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const logOffsetsRef = useRef<Record<string, number>>({}); // 각 taskId별 로그 offset 추적 (append 방식)
  const [mainTab, setMainTabState] = useState<'queue' | 'schedule-management' | 'monitoring' | 'title-pool'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_main_tab');
      if (saved && ['queue', 'schedule-management', 'monitoring', 'title-pool'].includes(saved)) {
        return saved as 'queue' | 'schedule-management' | 'monitoring' | 'title-pool';
      }
    }
    return 'queue';
  });
  const setMainTab = (tab: 'queue' | 'schedule-management' | 'monitoring' | 'title-pool') => {
    setMainTabState(tab);
    localStorage.setItem('automation_main_tab', tab);
  };
  const [queueTab, setQueueTab] = useState<'schedule' | 'script' | 'image' | 'video' | 'youtube' | 'failed' | 'completed' | 'cancelled'>('schedule');
  const [scheduleManagementTab, setScheduleManagementTab] = useState<'channel-settings' | 'category-management' | 'calendar'>('channel-settings');
  const [serverCounts, setServerCounts] = useState<Record<string, number> | null>(null); // 서버에서 받은 counts (탭 변경 최적화용)
  const [progressMap, setProgressMap] = useState<Record<string, { scriptProgress?: number; videoProgress?: number }>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null); // 업로드 중인 스케줄 ID
  const [uploadedImagesFor, setUploadedImagesFor] = useState<Record<string, File[]>>({}); // 스케줄별 업로드된 이미지
  const [uploadedVideosFor, setUploadedVideosFor] = useState<Record<string, File[]>>({}); // 스케줄별 업로드된 동영상
  const [isManualSortFor, setIsManualSortFor] = useState<Record<string, boolean>>({}); // 스케줄별 수동 정렬 여부
  const [draggingCardIndexFor, setDraggingCardIndexFor] = useState<Record<string, number | null>>({}); // 스케줄별 드래그 중인 카드 인덱스
  const [uploadBoxOpenFor, setUploadBoxOpenFor] = useState<Record<string, boolean>>({}); // 스케줄별 업로드 박스 열림 여부
  const [downloadMenuFor, setDownloadMenuFor] = useState<Record<string, boolean>>({}); // 다운로드 메뉴 열림 여부
  const [isSubmitting, setIsSubmitting] = useState(false); // 제목 추가 중복 방지
  const [currentProductData, setCurrentProductData] = useState<any>(null); // 현재 상품 정보
  const [availableProducts, setAvailableProducts] = useState<any[]>([]); // 선택된 카테고리에 해당하는 상품 목록
  const [fetchingProducts, setFetchingProducts] = useState(false); // 상품 목록 로딩 중
  const [testModalOpen, setTestModalOpen] = useState(false); // 테스트 모달 열림 여부
  const [testLogs, setTestLogs] = useState<string[]>([]); // 테스트 로그
  const [testInProgress, setTestInProgress] = useState(false); // 테스트 진행 중
  const [testMode, setTestMode] = useState<'test' | 'instant'>('test'); // 테스트 모드 또는 즉시 실행 모드

  // 샘플링 기능
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [sampleTitles, setSampleTitles] = useState<{category: string; title: string; score: number}[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState<Set<number>>(new Set());
  const [instantTriggerLoading, setInstantTriggerLoading] = useState(false); // 즉시 제목생성 중
  const [samplingType, setSamplingType] = useState<'longform' | 'shortform'>('longform'); // 샘플링 타입
  const [samplingAutoConvert, setSamplingAutoConvert] = useState(false); // 롱폼→숏폼 자동변환
  const productsCache = useRef<Record<string, any[]>>({}); // 쿠팡 상품 목록 캐시 (카테고리별)
  const manuallyClosedLogs = useRef(false); // 사용자가 수동으로 로그를 닫았는지 추적
  const isEditingRef = useRef(false); // 수정 중 여부 (폴링 건너뛰기용)
  const hasAutoExpandedLast = useRef(false); // 최초 자동 펼침 완료 여부
  const [channelSettings, setChannelSettings] = useState<any[]>([]); // 채널별 설정 (카테고리 포함)

  // 재시도 미리보기 모달
  const [retryPreviewModal, setRetryPreviewModal] = useState<{
    taskId: string;
    title: string;
    preview: any;
  } | null>(null);

  // 제목 풀 관련
  const [poolTitles, setPoolTitles] = useState<any[]>([]);
  const [poolStats, setPoolStats] = useState<any[]>([]);
  const [poolCategory, setPoolCategory] = useState<string>('all');
  const [poolMinScore, setPoolMinScore] = useState(90);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolHasMore, setPoolHasMore] = useState(false);
  const [poolTotal, setPoolTotal] = useState(0);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateLogs, setGenerateLogs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [crawlingFor, setCrawlingFor] = useState<string | null>(null); // 크롤링 중인 title ID
  const [crawlLogs, setCrawlLogs] = useState<Record<string, string[]>>({}); // title별 크롤링 로그
  const [imageCrawlModal, setImageCrawlModal] = useState<{
    scriptId: string;
    titleId: string;
    title: string;
    format: string;
  } | null>(null); // 이미지 크롤링 모달 상태
  const [queueTabLocked, setQueueTabLocked] = useState(false); // 사용자가 탭을 직접 선택했는지 여부
  const [showScrollTop, setShowScrollTop] = useState(false); // 위로가기 버튼 표시 여부
  const [crawledImagesMap, setCrawledImagesMap] = useState<Record<string, any>>({}); // taskId별 크롤링된 이미지 목록
  const [allTaskImagesMap, setAllTaskImagesMap] = useState<Record<string, any[]>>({}); // taskId별 전체 이미지 목록
  const [expandedImageTasks, setExpandedImageTasks] = useState<Set<string>>(new Set()); // 이미지 확장 표시된 task
  const prevSchedulesRef = useRef<any[]>([]); // 이전 스케줄 상태 (단계 전환 감지용)
  const pendingTabRef = useRef<QueueTabType | null>(null); // 자동 탭 전환 디바운싱용
  const autoTransitionTimerRef = useRef<NodeJS.Timeout | null>(null); // 자동 탭 전환 타이머
  const autoSwitchTimerRef = useRef<NodeJS.Timeout | null>(null); // 탭 잠금 해제 타이머
  // 대본 수정 모달 상태
  const [scriptEditModal, setScriptEditModal] = useState<{
    taskId: string;
    title: string;
    scenes: any[];
    loading: boolean;
  } | null>(null);
  const [scriptEditSaving, setScriptEditSaving] = useState(false);
  const handleQueueTabChange = (tab: QueueTabType) => {
    // ⭐ 사용자가 탭을 클릭하면 자동 전환 20초 일시 잠금
    setQueueTabLocked(true);

    // ✨ React 18 startTransition으로 부드러운 탭 전환 (깜박임 제거)
    startTransition(() => {
      setQueueTab(tab);
    });

    // 자동 전환 타이머들 클리어
    if (autoSwitchTimerRef.current) {
      clearTimeout(autoSwitchTimerRef.current);
    }
    if (autoTransitionTimerRef.current) {
      clearTimeout(autoTransitionTimerRef.current);
    }
    pendingTabRef.current = null;

    // 20초 후 자동 전환 재개
    autoSwitchTimerRef.current = setTimeout(() => {
      console.log('🔓 자동 탭 전환 재개 (20초 경과)');
      setQueueTabLocked(false);
    }, 20000);
  };

  const setQueueTabSystem = (tab: QueueTabType) => {
    // 락이 걸려있으면 자동 전환 무시 (사용자가 수동 선택한 탭 유지)
    if (queueTabLocked) return;

    // 🚀 5초 디바운싱: 여러 건이 연속 전환되어도 마지막 것으로만 이동
    pendingTabRef.current = tab;

    // 이전 자동 전환 타이머 클리어
    if (autoTransitionTimerRef.current) {
      clearTimeout(autoTransitionTimerRef.current);
    }

    // 5초 후 마지막 대기 탭으로 전환
    autoTransitionTimerRef.current = setTimeout(() => {
      if (pendingTabRef.current && !queueTabLocked) {
        console.log(`🔄 자동 탭 전환: ${pendingTabRef.current} (5초 디바운싱)`);
        // ✨ 부드러운 자동 전환 (깜박임 제거)
        startTransition(() => {
          setQueueTab(pendingTabRef.current!);
        });
        pendingTabRef.current = null;
      }
    }, 5000);
  };

  // 🚀 탭 전환 트랜지션 (깜빡임 방지)
  const [isPending, startTransition] = useTransition();

  // 🚀 카운트 메모이제이션 (매 렌더링마다 filter 방지)
  const queueCounts = useMemo(() => {
    const counts = {
      schedule: 0,
      script: 0,
      image: 0,
      video: 0,
      youtube: 0,
      failed: 0,
      completed: 0,
      cancelled: 0,
    };

    // 방어 코드: 배열 확인 - allSchedules 사용!
    const safeSchedules = Array.isArray(allSchedules) ? allSchedules : [];

    // ⭐ 단순화된 카운트 로직: type과 status 기반
    for (const s of safeSchedules) {
      if (matchesQueueTab(s, 'schedule')) counts.schedule++;
      else if (matchesQueueTab(s, 'script')) counts.script++;
      else if (matchesQueueTab(s, 'image')) counts.image++;
      else if (matchesQueueTab(s, 'video')) counts.video++;
      else if (matchesQueueTab(s, 'youtube')) counts.youtube++;
      else if (matchesQueueTab(s, 'failed')) counts.failed++;
      else if (matchesQueueTab(s, 'completed')) counts.completed++;
      else if (matchesQueueTab(s, 'cancelled')) counts.cancelled++;
    }

    return counts;
  }, [allSchedules]);

  // 🚀 탭별 필터링된 제목 목록 (클라이언트 사이드)
  const filteredTitles = useMemo(() => {
    if (!Array.isArray(titles) || titles.length === 0) return [];

    // titles가 이미 모든 queue 정보를 포함하고 있음 (getAllSchedules)
    const filtered = titles.filter((title: any) => {
      const matches = matchesQueueTab(title, queueTab);
      if (!matches && titles.length <= 10) {
        // 디버깅: 10개 이하일 때만 로그 출력
        console.log(`[Filter] taskId=${title.taskId}, tabType=${title.tabType}, status=${title.status}, type=${title.type}, currentTab=${queueTab}, matches=${matches}`);
      }
      return matches;
    });

    console.log(`🔍 [Filter Result] queueTab=${queueTab}, total=${titles.length}, filtered=${filtered.length}`);
    return filtered;
  }, [titles, queueTab]);

  // 🚀 100개씩 표시 + 더보기
  const displayedTitles = useMemo(() => {
    return filteredTitles.slice(0, displayLimit);
  }, [filteredTitles, displayLimit]);

  const hasMore = filteredTitles.length > displayLimit;

  // 🚀 스마트 탭 전환 (깜빡임 방지: 탭 즉시 전환 후 백그라운드 데이터 갱신)
  const handleQueueTabChangeSmooth = useCallback((tab: QueueTabType) => {
    setQueueTabLocked(true);

    // 1. 탭 즉시 전환 (깜빡임 방지 - 사용자 피드백 우선)
    startTransition(() => {
      setQueueTab(tab);
    });

    // 2. 백그라운드에서 counts 확인 및 데이터 갱신 (비동기)
    (async () => {
      try {
        const res = await fetch('/api/automation/schedules/counts');
        if (res.ok) {
          const data = await res.json();
          const newCounts = data.counts;

          // counts가 변경되었으면 전체 데이터 로드 (탭 전환과 무관하게 처리)
          if (!serverCounts || JSON.stringify(serverCounts) !== JSON.stringify(newCounts)) {
            console.log('📊 Counts 변경 감지, 백그라운드 데이터 로드');
            setServerCounts(newCounts);
            // fetchData 대신 조용히 데이터만 갱신 (loading 상태 변경 없이)
            fetchDataSilent();
          }
        }
      } catch (error) {
        console.error('Counts 확인 실패:', error);
      }
    })();
  }, [serverCounts]);

  function handleTitleChange(value: string) {
    setNewTitle(prev => ({ ...prev, title: value }));
    setTitleError(validateTitle(value));
  }

  useEffect(() => {
    fetchData();
    loadRecentTitles();
    fetchChannels();
    fetchCategories();

    // 상품관리에서 왔는지 체크
    // ⚠️ CRITICAL: 쿠팡 상품 관리 페이지에서 전달된 상품 정보 처리
    //
    // 📋 프로세스: 쿠팡 상품 페이지 → 자동화 페이지
    // 1. 쿠팡 상품 페이지에서 "🤖 자동화" 버튼 클릭
    // 2. 상품 정보 localStorage에 저장 (automation_prefill)
    //    - 베스트셀러의 경우: 내 목록 추가 → 딥링크 발급 → 자동화 전달
    //    - 내 목록의 경우: 이미 발급된 딥링크 포함하여 전달
    // 3. 자동화 페이지로 이동 (?fromProduct=true)
    // 4. 이 코드에서 localStorage 읽어서 폼 자동 채우기
    //
    // productData 구조:
    // - UI 표시용 키: productName, productImage, productUrl, productPrice, productId
    // - 백엔드 대본용 키: title, thumbnail, product_link, description
    //
    // ⚠️ 중요:
    // - productUrl/product_link는 딥링크여야 함 (수익화 필수)
    // - productData는 대본 생성 시 프롬프트에 포함됨
    // - current_product_data는 영상 생성 시 사용됨
    //
    // 📖 상세 문서: /AUTOMATION_PRODUCT_FLOW.md
    const fromProduct = searchParams.get('fromProduct');
    if (fromProduct === 'true') {
      // localStorage에서 상품 정보 읽기
      const prefillData = localStorage.getItem('automation_prefill');
      if (prefillData) {
        try {
          const data = JSON.parse(prefillData);
          console.log('🛍️ [상품관리 → 자동화] 정보 자동 입력:', data);

          // productData를 별도로 저장 (대본 생성 시 프롬프트에 포함)
          if (data.productData) {
            const productDataStr = JSON.stringify(data.productData);
            localStorage.setItem('current_product_data', productDataStr);
            console.log('✅ productData 저장 완료 (딥링크 포함):', {
              productUrl: data.productData.productUrl,
              product_link: data.productData.product_link
            });
          }

          // 폼 열기 + 정보 채우기 (자동 시작 X - 사용자가 확인 후 수동 저장)
          setShowAddForm(true);
          const productType = data.type || 'product';
          setNewTitle(prev => ({
            ...prev,
            title: data.title ? `[광고] ${data.title}` : '[광고] ',
            promptFormat: productType,
            category: data.category || '상품',
            tags: data.tags || '',
            productUrl: data.productUrl || '', // ⭐ 딥링크
            scriptMode: 'chrome',
            mediaMode: 'crawl', // ⭐ 상품: 이미지 크롤링 고정
            aiModel: 'gemini', // ⭐ 상품: Gemini 고정
            youtubeSchedule: 'immediate'
          }));
          // 사용자가 선택한 타입과 모델을 localStorage에 저장 (다음 생성 시 기본값으로 사용)
          localStorage.setItem('automation_selected_type', productType);
          localStorage.setItem('automation_selected_model', getDefaultModelByType(productType));
          // 상품 정보 UI 미리보기 표시
          setCurrentProductData(data.productData);

          // 일회성 데이터이므로 사용 후 삭제
          localStorage.removeItem('automation_prefill');

        } catch (error) {
          console.error('❌ 상품 정보 파싱 실패:', error);
        }
      }

      // ⭐ URL에서 ?fromProduct=true 파라미터 제거 (새로고침 시 중복 처리 방지)
      router.replace('/automation', { scroll: false });
    }
  }, [searchParams, router]);

  // 진행중인 작업을 따라 탭 자동 전환 (단계 전환 감지)
  // ⚠️ queueTab을 의존성에서 제거하여 무한 루프 방지
  const queueTabRef = useRef(queueTab);
  queueTabRef.current = queueTab;

  // 상태→탭 매핑 헬퍼
  const getTabForStatus = (status: string): QueueTabType | null => {
    if (matchesQueueTab(status, 'script')) return 'script';
    if (matchesQueueTab(status, 'image')) return 'image';
    if (matchesQueueTab(status, 'video')) return 'video';
    if (matchesQueueTab(status, 'youtube')) return 'youtube';
    if (matchesQueueTab(status, 'schedule')) return 'schedule';
    if (matchesQueueTab(status, 'failed')) return 'failed';
    if (matchesQueueTab(status, 'completed')) return 'completed';
    return null;
  };

  // 새 제목 추가 폼이 열릴 때마다 localStorage에서 최신 선택 값 불러오기
  useEffect(() => {
    if (showAddForm) {
      const selectedType = getSelectedType();
      setNewTitle(prev => ({
        ...prev,
        promptFormat: selectedType,
        category: getSelectedCategory(),
        mediaMode: getSelectedMediaMode(),
        aiModel: getDefaultModelByType(selectedType),
        youtubePrivacy: getSelectedPrivacy(),
        ttsVoice: getDefaultTtsByType(selectedType),
        autoConvert: selectedType === 'longform'
      }));
    }
  }, [showAddForm]);

  // 스크롤 위치 감지 - 위로가기 버튼 표시
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 탭 변경 시 displayLimit 리셋
  useEffect(() => {
    setDisplayLimit(100);
  }, [queueTab]);

  // 🚀 5초마다 counts 폴링 - 변경 감지 시 자동 조회 및 탭 포커싱
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    async function pollCounts() {
      try {
        const res = await fetch('/api/automation/schedules/counts');
        if (!res.ok) return;

        const data = await res.json();
        const newCounts = data.counts;

        // 첫 로드면 저장 + 우선순위 기반 탭 자동 선택
        if (!serverCounts) {
          setServerCounts(newCounts);

          // 🎯 최초 로딩 시 카운트 기반 탭 자동 선택 (우선순위: schedule → script → image → video → youtube → failed → completed → cancelled)
          if (mainTab === 'queue') {
            const tabPriority: QueueTabType[] = ['schedule', 'script', 'image', 'video', 'youtube', 'failed', 'completed', 'cancelled'];
            const targetTab = tabPriority.find(tab => (newCounts[tab] || 0) > 0) || 'schedule';

            console.log(`🎯 최초 로딩 - 자동 탭 선택: ${targetTab} (count: ${newCounts[targetTab] || 0})`);
            startTransition(() => {
              setQueueTab(targetTab);
            });
          }

          return;
        }

        // counts 변경 감지
        const hasChanged = JSON.stringify(serverCounts) !== JSON.stringify(newCounts);
        if (hasChanged) {
          console.log('📊 Counts 변경 감지, 전체 데이터 로드');
          setServerCounts(newCounts);
          fetchData();

          // 🎯 증가/감소한 탭 찾아서 자동 포커싱 (카운트 변경 시 무조건 이동)
          if (mainTab === 'queue') {
            // 증가/감소한 탭 찾기
            const changedTabs: Array<{ tabType: QueueTabType; diff: number }> = [];

            (['schedule', 'script', 'image', 'video', 'youtube', 'failed', 'completed', 'cancelled'] as QueueTabType[]).forEach(tabType => {
              const oldCount = serverCounts[tabType] || 0;
              const newCount = newCounts[tabType] || 0;
              if (oldCount !== newCount) {
                changedTabs.push({ tabType, diff: newCount - oldCount });
              }
            });

            // 증가한 탭 우선, 없으면 감소한 탭
            const increasedTab = changedTabs.find(t => t.diff > 0);
            const targetTab = increasedTab || changedTabs[0];

            if (targetTab) {
              console.log(`🎯 카운트 변경으로 자동 이동: ${targetTab.tabType} (${targetTab.diff > 0 ? '+' : ''}${targetTab.diff})`);
              // 카운트 변경 시에는 queueTabLocked 무시하고 강제 이동
              setQueueTabLocked(false);
              startTransition(() => {
                setQueueTab(targetTab.tabType);
              });
            }
          }
        }
      } catch (error) {
        console.error('Counts 폴링 실패:', error);
      }
    }

    // 5초마다 폴링
    intervalId = setInterval(pollCounts, 5000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [serverCounts, queueTabLocked, mainTab]);

  // 위로 스크롤 함수
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!Array.isArray(schedules) || schedules.length === 0) return;
    // 사용자가 탭을 직접 선택했으면 자동 전환 안함
    if (queueTabLocked) {
      prevSchedulesRef.current = schedules;
      return;
    }
    // ⚠️ queue 탭이 아니면 자동 전환 안함 (다른 탭 사용 중 방해 금지)
    if (mainTab !== 'queue') {
      prevSchedulesRef.current = schedules;
      return;
    }

    const currentTab = queueTabRef.current;
    const prevSchedules = prevSchedulesRef.current;

    // ⭐ 단계 전환 감지: 이전 상태와 현재 상태 비교
    // processing 상태였던 작업이 다음 단계로 넘어갔는지 확인
    for (const schedule of schedules) {
      const prevSchedule = prevSchedules.find((s: any) => s.taskId === schedule.taskId);
      if (!prevSchedule) continue;

      const prevTab = getTabForStatus(prevSchedule.status);
      const currentScheduleTab = getTabForStatus(schedule.status);

      // 단계가 전환되었고, 이전 단계 탭에 있었다면 → 새 단계 탭으로 이동
      // ⚠️ queueTabLocked가 true면 자동 전환 안함 (사용자가 탭 선택한 경우)
      if (prevTab && currentScheduleTab && prevTab !== currentScheduleTab && prevTab === currentTab) {
        // 실패/완료로의 전환은 추적하지 않음 (실패/완료 탭으로 자동이동 안함)
        if (currentScheduleTab !== 'failed' && currentScheduleTab !== 'completed') {
          console.log(`🔄 [단계전환] ${schedule.title?.substring(0, 20)}... : ${prevTab} → ${currentScheduleTab}`);
          setQueueTabSystem(currentScheduleTab); // ⚠️ setQueueTab → setQueueTabSystem 변경 (락 존중)
          prevSchedulesRef.current = schedules;
          return;
        }
      }
    }

    // 이전 스케줄 상태 저장
    prevSchedulesRef.current = schedules;

    // 현재 탭에 해당하는 항목 수 계산
    const currentTabItems = schedules.filter((s: any) => matchesQueueTab(s.status, currentTab));

    // 현재 탭에 항목이 있으면 유지
    if (currentTabItems.length > 0) return;

    // 현재 탭이 비어있으면 진행중인 작업이 있는 탭으로 이동
    const scriptItems = schedules.filter((s: any) => matchesQueueTab(s.status, 'script'));
    const imageItems = schedules.filter((s: any) => matchesQueueTab(s.status, 'image'));
    const videoItems = schedules.filter((s: any) => matchesQueueTab(s.status, 'video'));
    const youtubeItems = schedules.filter((s: any) => matchesQueueTab(s.status, 'youtube'));
    const scheduledItems = schedules.filter((s: any) => matchesQueueTab(s.status, 'schedule'));

    // 진행중인 작업 우선순위: script → image → video → youtube → scheduled
    if (scriptItems.length > 0 && currentTab !== 'script') {
      console.log(`🔄 ${currentTab} → 대본큐 자동 전환`);
      setQueueTabSystem('script');
    } else if (imageItems.length > 0 && currentTab !== 'image') {
      console.log(`🔄 ${currentTab} → 이미지큐 자동 전환`);
      setQueueTabSystem('image');
    } else if (videoItems.length > 0 && currentTab !== 'video') {
      console.log(`🔄 ${currentTab} → 영상큐 자동 전환`);
      setQueueTabSystem('video');
    } else if (youtubeItems.length > 0 && currentTab !== 'youtube') {
      console.log(`🔄 ${currentTab} → 업로드큐 자동 전환`);
      setQueueTabSystem('youtube');
    } else if (scheduledItems.length > 0 && currentTab !== 'schedule') {
      console.log(`🔄 ${currentTab} → 예약큐 자동 전환`);
      setQueueTabSystem('schedule');
    }
  }, [schedules, queueTabLocked]); // ⚠️ queueTab 제거, titles 불필요

  // 로그 자동 스크롤 - 로그가 추가될 때 스크롤이 맨 아래에 가까우면 자동 스크롤
  useEffect(() => {
    if (!expandedLogsFor) return;

    const container = document.getElementById(`log-container-${expandedLogsFor}`);
    if (!container) return;

    // 스크롤이 맨 아래에서 100px 이내에 있으면 자동 스크롤
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    if (isNearBottom) {
      // 부드럽게 맨 아래로 스크롤
      container.scrollTop = container.scrollHeight;
    }
  }, [logsMap, expandedLogsFor]);

  // 카테고리 또는 타입 변경 시 상품 목록 불러오기 (딥링크 발급된 "내 목록"에서만)
  useEffect(() => {
    async function fetchProductsByCategory() {
      if (newTitle.promptFormat === 'product' && newTitle.category) {
        // 캐시 히트 시 API 호출 없이 반환
        if (productsCache.current[newTitle.category]) {
          setAvailableProducts(productsCache.current[newTitle.category]);
          return;
        }

        setFetchingProducts(true);
        try {
          // ⭐ 딥링크가 이미 발급된 "내 목록" 상품만 가져오기
          const response = await fetch(`/api/admin/coupang-products`);
          if (response.ok) {
            const data = await response.json();
            // 선택한 카테고리에 해당하는 상품만 필터링 (딥링크 검증)
            const filteredProducts = (data.products || [])
              .filter((p: any) => p.category_id === newTitle.category)
              .filter((p: any) => {
                // ⭐ 딥링크 검증: 'partner=' 포함 필수 (쿠팡 제휴 URL)
                if (!p.deep_link || !p.deep_link.includes('partner=')) {
                  console.warn(`⚠️ [자동화] 딥링크 없음 또는 잘못됨: ${p.product_name} (${p.deep_link})`);
                  return false;
                }
                return true;
              })
              .map((p: any) => ({
                productId: p.product_id,
                productName: p.product_name,
                productPrice: p.discount_price || p.original_price,
                productImage: p.thumbnail_url,
                productUrl: p.deep_link, // ⭐ 딥링크만 사용!
                categoryName: p.category_name
              }));

            console.log(`✅ [자동화] 카테고리 ${newTitle.category} 상품 ${filteredProducts.length}개 (모두 딥링크 검증됨)`);
            productsCache.current[newTitle.category] = filteredProducts;
            setAvailableProducts(filteredProducts);
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to fetch products from my list:', {
              status: response.status,
              statusText: response.statusText,
              error: errorData.error
            });
            setAvailableProducts([]);
          }
        } catch (error) {
          console.error('Error fetching products from my list:', error);
          setAvailableProducts([]);
        } finally {
          setFetchingProducts(false);
        }
      } else {
        setAvailableProducts([]); // 상품 타입이 아니거나 카테고리가 없으면 목록 초기화
      }
    }
    fetchProductsByCategory();
  }, [newTitle.promptFormat, newTitle.category]);

  // 제목 풀 탭 전환 시 데이터 로드
  useEffect(() => {
    if (mainTab === 'title-pool') {
      fetchTitlePool();
    }
  }, [mainTab, poolCategory, poolMinScore]);

  // titleId 파라미터 처리 (titles 로드 후)
  useEffect(() => {
    const titleId = searchParams.get('titleId');
    if (titleId && Array.isArray(titles) && titles.length > 0) {
      const targetTitle = titles.find((t: any) => t.id === titleId);
      if (targetTitle) {
        startEdit(targetTitle); // 수정 모드로 전환 + editForm 로드
      }
    }
  }, [searchParams, titles]);

  // 수정 중/로그 보는 중 상태 ref 동기화 (폴링 건너뛰기용)
  useEffect(() => {
    isEditingRef.current = !!(editingId || showAddForm || expandedLogsFor);
  }, [editingId, showAddForm, expandedLogsFor]);

  // 페이지 로드 시 첫 번째 스케줄의 탭으로 자동 포커싱
  useEffect(() => {
    if (!hasAutoExpandedLast.current && schedules.length > 0) {
      // schedules 배열에서 첫 번째 항목 가져오기
      const firstSchedule = schedules[0];
      if (firstSchedule && firstSchedule.tabType) {
        // ✨ 초기 로드도 부드럽게 (깜박임 제거)
        startTransition(() => {
          setQueueTab(firstSchedule.tabType);
        });
        hasAutoExpandedLast.current = true;
      }
    }
  }, [schedules, startTransition]);

  // 🚀 스마트 폴링: 활성 작업 수 + 탭 visibility 기반
  useEffect(() => {
    if (!Array.isArray(schedules) || schedules.length === 0) return;

    // 진행 중인 작업 수 계산 (메모이제이션된 값 재사용)
    const processingCount = queueCounts.script + queueCounts.image + queueCounts.video + queueCounts.youtube;
    const hasActiveJobs = processingCount > 0 || queueCounts.schedule > 0;

    if (!hasActiveJobs) return;

    // 🚀 폴링 간격 최적화:
    // - 진행 중 3개+: 8초 (너무 빠르면 서버 부담)
    // - 진행 중 1-2개: 12초
    // - 예약만 있음: 20초
    let pollInterval: number;
    if (processingCount >= 3) {
      pollInterval = 8000;
    } else if (processingCount >= 1) {
      pollInterval = 12000;
    } else {
      pollInterval = 20000; // 예약 대기만 있을 때
    }

    let intervalId: NodeJS.Timeout | null = null;
    let isVisible = true;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        // 수정 중이거나 탭이 숨겨져 있으면 스킵
        if (isEditingRef.current || !isVisible) return;
        fetchData();
      }, pollInterval);
    };

    // 🚀 탭 visibility 감지 (숨겨진 탭에서 폴링 중지)
    const handleVisibility = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) {
        fetchData(); // 탭 복귀 시 즉시 업데이트
        startPolling();
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    startPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      // 자동 전환 타이머들 cleanup
      if (autoSwitchTimerRef.current) {
        clearTimeout(autoSwitchTimerRef.current);
      }
      if (autoTransitionTimerRef.current) {
        clearTimeout(autoTransitionTimerRef.current);
      }
    };
  }, [queueCounts.script, queueCounts.image, queueCounts.video, queueCounts.youtube, queueCounts.schedule]);

  // 제목 풀 탭 열 때 데이터 로드 (처음 한 번만)
  useEffect(() => {
    if (mainTab === 'title-pool') {
      fetchTitlePool();
    }
  }, [mainTab]);

  // 소재찾기에서 전달받은 제목 자동 추가
  useEffect(() => {
    const from = searchParams.get('from');
    if (from === 'material-suggestions') {
      try {
        const pendingTitles = localStorage.getItem('automation_pending_titles');
        if (pendingTitles) {
          const titlesToAdd = JSON.parse(pendingTitles);
          console.log('📥 소재찾기에서 전달받은 제목:', titlesToAdd);

          // localStorage 클리어
          localStorage.removeItem('automation_pending_titles');

          // 제목 추가 폼 표시
          setShowAddForm(true);

          // 제목이 있으면 첫 번째 제목을 입력 폼에 설정
          if (titlesToAdd.length > 0) {
            setNewTitle(prev => ({
              ...prev,
              title: titlesToAdd[0]
            }));

            // 나머지 제목들은 순차적으로 추가
            if (titlesToAdd.length > 1) {
              setTimeout(async () => {
                for (let i = 1; i < titlesToAdd.length; i++) {
                  await addTitle(titlesToAdd[i], true);
                  await new Promise(resolve => setTimeout(resolve, 500)); // 500ms 대기
                }
                await fetchData();
                alert(`✅ ${titlesToAdd.length}개 제목이 자동으로 추가되었습니다!`);
              }, 1000);
            } else {
              alert(`✅ 1개 제목이 입력 폼에 추가되었습니다. 설정 후 등록하세요!`);
            }
          }
        }
      } catch (error) {
        console.error('제목 자동 추가 오류:', error);
      }
    }
  }, [searchParams]);

  async function fetchChannels() {
    try {
      const response = await fetch('/api/youtube/channels');
      const data = await response.json();
      console.log('📺 유튜브 채널 조회 결과:', data);

      if (data.channels && data.channels.length > 0) {
        console.log('✅ 연결된 채널:', data.channels.length, '개');
        setChannels(data.channels);

        // 채널 설정도 API 응답에 포함되어 있음 (통합 API)
        if (data.channelSettings) {
          setChannelSettings(data.channelSettings);
          console.log('✅ 채널 설정 로드:', data.channelSettings.length, '개');
        }

        // 채널 선택 우선순위:
        // 1. localStorage에 저장된 채널
        // 2. 기본 채널 (isDefault가 true)
        // 3. 첫 번째 채널
        if (!newTitle.channel) {
          const savedChannelId = getSelectedChannel();
          // ⭐ channelId (실제 YouTube 채널 ID)를 사용해야 함 - id는 내부 UUID
          const savedChannel = data.channels.find((ch: any) => ch.channelId === savedChannelId);
          const defaultChannel = data.channels.find((ch: any) => ch.isDefault);
          const selectedChannelId = savedChannel?.channelId || defaultChannel?.channelId || data.channels[0].channelId;

          console.log('📌 선택된 채널:', {
            saved: savedChannelId,
            default: defaultChannel?.channelTitle,
            selected: selectedChannelId
          });

          setNewTitle(prev => ({ ...prev, channel: selectedChannelId }));
        }
      } else {
        console.warn('⚠️ 연결된 유튜브 채널이 없습니다');
        setChannels([]);
      }
    } catch (error) {
      console.error('❌ 채널 조회 실패:', error);
      setChannels([]);
    }
  }

  async function fetchCategories() {
    try {
      const response = await fetch('/api/automation/categories');
      const data = await response.json();
      if (data.categories && data.categories.length > 0) {
        setCategories(data.categories.map((c: any) => c.name));
        console.log('✅ 카테고리 로드:', data.categories.length, '개');
      } else {
        setCategories([]);
      }
    } catch (error) {
      console.error('❌ 카테고리 조회 실패:', error);
      setCategories([]);
    }
  }

  function loadRecentTitles() {
    try {
      const saved = localStorage.getItem('automation_recent_titles');
      if (saved) {
        setRecentTitles(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load recent titles:', error);
    }
  }

  function saveRecentTitle(title: string) {
    try {
      const saved = localStorage.getItem('automation_recent_titles');
      const recent = saved ? JSON.parse(saved) : [];
      const updated = [title, ...recent.filter((t: string) => t !== title)].slice(0, 4);
      localStorage.setItem('automation_recent_titles', JSON.stringify(updated));
      setRecentTitles(updated);
    } catch (error) {
      console.error('Failed to save recent title:', error);
    }
  }

  async function fetchTitlePool(loadMore = false) {
    try {
      setPoolLoading(true);

      const offset = loadMore ? poolTitles.length : 0;
      const params = new URLSearchParams({
        category: poolCategory,
        minScore: poolMinScore.toString(),
        limit: '50',
        offset: offset.toString()
      });
      const res = await fetch(`/api/title-pool?${params}`);

      if (res.ok) {
        const data = await res.json();
        setPoolStats(data.stats || []);
        if (loadMore) {
          // 중복 제거: 기존 ID 목록과 비교
          setPoolTitles(prev => {
            const existingIds = new Set(prev.map((t: any) => t.titleId));
            const newTitles = (data.titles || []).filter((t: any) => !existingIds.has(t.titleId));
            return [...prev, ...newTitles];
          });
        } else {
          setPoolTitles(data.titles || []);
        }
        setPoolHasMore(data.pagination?.hasMore || false);
        setPoolTotal(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch title pool:', error);
    } finally {
      setPoolLoading(false);
    }
  }

  // 더보기 - fetchPoolTitles alias
  const fetchPoolTitles = () => fetchTitlePool(false);

  async function generateTitlePool() {
    setGenerateModalOpen(true);
    setGenerateLogs([]);
    setIsGenerating(true);

    try {
      // 미사용 제목 조회
      const response = await fetch(`/api/title-pool/generate?category=${poolCategory}&limit=50&minScore=${poolMinScore}`);

      if (!response.ok) {
        setGenerateLogs(['❌ 미사용 제목 조회 실패']);
        setIsGenerating(false);
        return;
      }

      const { titles, stats, total } = await response.json();

      // 통계 표시
      const logLines: string[] = [];
      logLines.push('📊 제목 풀 현황');
      logLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (stats && stats.length > 0) {
        stats.forEach((stat: any) => {
          logLines.push(`📂 ${stat.category}: ${stat.unused}개 미사용 / ${stat.total}개 (평균 ${stat.avgScore}점)`);
        });
      }

      logLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logLines.push(`🎯 미사용 제목 ${total}개 조회됨 (${poolMinScore}점 이상)`);
      logLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 제목 목록 표시
      if (titles && titles.length > 0) {
        titles.forEach((item: any, idx: number) => {
          logLines.push(`${idx + 1}. [${item.score}점] ${item.title}`);
          logLines.push(`   └─ ${item.aiModel} | ${item.createdAt?.split('T')[0] || ''}`);
        });
      } else {
        logLines.push('⚠️ 미사용 제목이 없습니다. 자동화 실행 시 AI가 새로 생성합니다.');
      }

      setGenerateLogs(logLines);
      setIsGenerating(false);

    } catch (error: any) {
      console.error('Failed to get unused titles:', error);
      setGenerateLogs([`❌ 조회 실패: ${error.message}`]);
      setIsGenerating(false);
    }
  }

  // 🚀 스마트 데이터 머지 (변경분만 업데이트 → 깜빡임 방지)
  const smartMerge = useCallback(<T extends { id?: string; taskId?: string }>(
    prev: T[],
    next: T[],
    idKey: 'id' | 'taskId' = 'id'
  ): T[] => {
    if (!prev.length) return next;
    if (!next.length) return [];

    // 변경 감지
    const prevMap = new Map(prev.map(item => [item[idKey], item]));
    const nextMap = new Map(next.map(item => [item[idKey], item]));

    let hasChange = prev.length !== next.length;

    if (!hasChange) {
      for (const [key, nextItem] of nextMap) {
        const prevItem = prevMap.get(key);
        if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(nextItem)) {
          hasChange = true;
          break;
        }
      }
    }

    // 변경 없으면 이전 참조 유지 (리렌더 방지)
    return hasChange ? next : prev;
  }, []);

  async function fetchData() {
    try {
      const [statusRes, schedulesRes, countsRes] = await Promise.all([
        fetch('/api/automation/scheduler'),
        fetch('/api/automation/schedules'),  // 모든 정보 포함 (task + content + queue)
        fetch('/api/automation/schedules/counts')  // counts만 가져오기
      ]);

      // 스케줄러 상태 응답 처리
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status?.status) {
          setSchedulerStatus(status.status);
          setSettings(status.status.settings || {});
        } else {
          console.warn('⚠️ 스케줄러 상태 응답 형식이 잘못되었습니다:', status);
        }
      } else {
        console.warn(`⚠️ 스케줄러 상태 조회 실패 (${statusRes.status})`);
      }

      const schedulesData = await schedulesRes.json();
      const schedules = schedulesData.schedules || [];

      // 🚀 getAllSchedules가 모든 정보를 포함하므로 titles = schedules
      setTitles(prev => smartMerge(prev, schedules, 'taskId'));
      setAllSchedules(prev => smartMerge(prev, schedules, 'taskId'));
      setSchedules(schedules); // schedules는 호환성 유지

      // 🚀 counts 업데이트
      if (countsRes.ok) {
        const countsData = await countsRes.json();
        setServerCounts(countsData.counts || null);
      }

      // 현재 열려있는 로그가 있으면 refresh (failed 상태 전환 시 에러 로그 표시용)
      if (expandedLogsFor) {
        fetchLogs(expandedLogsFor);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  // 🚀 조용한 데이터 갱신 (loading 상태 변경 없음 - 탭 전환 시 깜빡임 방지용)
  async function fetchDataSilent() {
    try {
      const schedulesRes = await fetch('/api/automation/schedules');
      const schedulesData = await schedulesRes.json();
      const schedules = schedulesData.schedules || [];

      // 🚀 smartMerge로 변경분만 업데이트 (깜빡임 최소화)
      setTitles(prev => smartMerge(prev, schedules, 'taskId'));
      setAllSchedules(prev => smartMerge(prev, schedules, 'taskId'));
      setSchedules(schedules);
    } catch (error) {
      console.error('Failed to fetch data silently:', error);
    }
  }

  async function toggleScheduler() {
    const action = schedulerStatus?.isRunning ? 'stop' : 'start';
    try {
      const response = await fetch('/api/automation/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        let errorMsg = `Failed to ${action} scheduler`;
        try {
          const data = await response.json();
          errorMsg = data?.error || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      await fetchData();
    } catch (error) {
      console.error(`Failed to ${action} scheduler:`, error);
    }
  }

  async function addTitle(customTitle?: string, autoMode: boolean = false) {
    // 중복 제출 방지 (강화) - 자동 모드는 예외
    if (isSubmitting && !autoMode) {
      console.warn('⚠️ 이미 제목 추가 중입니다. 중복 제출을 방지합니다.');
      return;
    }

    const titleToAdd = customTitle || newTitle.title;

    if (!titleToAdd || !newTitle.promptFormat) {
      if (!autoMode) {
        alert('제목과 타입은 필수입니다');
      }
      return;
    }

    if (titleError && !autoMode) {
      alert(titleError);
      return;
    }

    // 🔍 과거 시간 검증 (제목 추가 전에!)
    if (newTitle.scheduleTime) {
      const scheduledDate = new Date(newTitle.scheduleTime);
      const now = new Date();
      if (scheduledDate < now) {
        alert('⚠️ 과거 시간으로 스케줄을 설정할 수 없습니다.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // 상품 정보가 있으면 포함 (product, product-info 모두)
      let productData = null;
      if (newTitle.promptFormat === 'product' || newTitle.promptFormat === 'product-info') {
        // 1. 현재 페이지에서 입력한 상품 정보 우선
        if (currentProductData) {
          // ⭐ productUrl 검증 (딥링크여야 함!)
          const isDeeplink = currentProductData.productUrl &&
            (currentProductData.productUrl.includes('partner=') || currentProductData.productUrl.includes('link.coupang.com/a/'));
          if (!isDeeplink) {
            alert('❌ 상품 URL이 딥링크가 아닙니다.\n\n제휴 마크(partner=) 또는 link.coupang.com/a/ 형식이어야 합니다.\n\n내 목록에서 상품을 다시 선택해주세요.');
            setIsSubmitting(false);
            return;
          }
          productData = JSON.stringify(currentProductData);
          console.log('✅ [자동화] currentProductData 사용 (딥링크 검증됨):', currentProductData.productUrl);
        }
        // 2. localStorage에서 가져온 상품 정보 (상품관리에서 넘어온 경우)
        else {
          const savedProductData = localStorage.getItem('current_product_data');
          if (savedProductData) {
            const parsedData = JSON.parse(savedProductData);
            // ⭐ productUrl 검증 (딥링크여야 함!)
            const isDeeplink = parsedData.productUrl &&
              (parsedData.productUrl.includes('partner=') || parsedData.productUrl.includes('link.coupang.com/a/'));
            if (!isDeeplink) {
              alert('❌ 상품 URL이 딥링크가 아닙니다.\n\n제휴 마크(partner=) 또는 link.coupang.com/a/ 형식이어야 합니다.\n\n내 목록에서 상품을 다시 선택해주세요.');
              setIsSubmitting(false);
              return;
            }
            productData = savedProductData; // 이미 JSON 문자열
            localStorage.removeItem('current_product_data'); // 사용 후 삭제
            console.log('✅ [자동화] localStorage productData 사용 (딥링크 검증됨):', parsedData.productUrl);
          } else {
            alert('⚠️ 상품 정보가 없습니다.\n\n내 목록에서 상품을 선택해주세요.');
            setIsSubmitting(false);
            return;
          }
        }
      }

      // ⭐ 디버그: 전송 전 promptFormat 확인
      console.log(`📋 [addTitle] 전송 데이터:`, {
        title: titleToAdd?.substring(0, 30),
        promptFormat: newTitle.promptFormat,
        category: newTitle.category,
        aiModel: newTitle.aiModel
      });

      const response = await fetch('/api/automation/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleToAdd,
          promptFormat: newTitle.promptFormat,
          category: newTitle.category,
          tags: newTitle.tags,
          productUrl: newTitle.productUrl,
          productData: productData,  // 상품 정보 추가
          channel: newTitle.channel,
          scriptMode: newTitle.scriptMode,
          mediaMode: newTitle.mediaMode,
          aiModel: newTitle.aiModel,
          youtubeSchedule: newTitle.youtubeSchedule,
          youtubePublishAt: newTitle.youtubePublishAt,
          ttsVoice: newTitle.ttsVoice || getDefaultTtsByType(newTitle.promptFormat),  // TTS 음성 (롱폼=순복, 숏폼/상품=선희)
          ttsSpeed: newTitle.ttsSpeed || '+0%',  // TTS 속도
          autoConvert: newTitle.autoConvert || false,  // 롱폼→숏폼 자동변환
          skipDuplicateCheck: true  // ⭐ 수동 추가 시 중복/저점수 체크 건너뛰기
        })
      });

      if (!response.ok) throw new Error('Failed to add title');

      const data = await response.json();
      const titleId = data.titleId;

      // ⭐ titleId가 null이면 (중복/저점수) 스케줄 추가 건너뛰기
      if (!titleId) {
        console.log('⚠️ 제목이 추가되지 않았습니다 (중복 또는 저점수)');
        if (!autoMode) {
          alert('⚠️ 제목이 추가되지 않았습니다.\n중복된 제목이거나 90점 미만일 수 있습니다.');
        }
        setIsSubmitting(false);
        return;
      }

      // 스케줄 시간이 입력되었거나 상품 타입이면 스케줄 추가 (테스트 버튼은 강제 실행)
      if (newTitle.scheduleTime || newTitle.promptFormat === 'product' || newTitle.promptFormat === 'product-info') {
        // 상품 타입이고 스케줄 시간이 없으면 현재 시간으로 설정 (즉시 실행)
        // ⭐ MySQL datetime 형식으로 변환: 'YYYY-MM-DD HH:MM:SS'
        const scheduleDate = newTitle.scheduleTime ? new Date(newTitle.scheduleTime) : new Date();
        // ✅ BTS-0000025: 로컬 시간대 유지 (toISOString은 UTC 변환하므로 사용 금지)
        const year = scheduleDate.getFullYear();
        const month = String(scheduleDate.getMonth() + 1).padStart(2, '0');
        const day = String(scheduleDate.getDate()).padStart(2, '0');
        const hours = String(scheduleDate.getHours()).padStart(2, '0');
        const minutes = String(scheduleDate.getMinutes()).padStart(2, '0');
        const seconds = String(scheduleDate.getSeconds()).padStart(2, '0');
        const scheduleTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        await addScheduleToTitle(
          titleId,
          scheduleTime,
          newTitle.youtubePublishAt || undefined,
          newTitle.youtubePrivacy,
          true // 테스트 버튼은 항상 forceExecute
        );
      }

      saveRecentTitle(titleToAdd);

      // 자동 모드가 아닐 때만 폼 초기화
      if (!autoMode) {
        // 다음 제목 추가 시에도 동일한 채널 유지 (localStorage에 저장됨)
        const currentChannel = newTitle.channel;

        setNewTitle({
          title: '',
          promptFormat: getSelectedType(), // localStorage에서 불러온 타입 유지
          category: getSelectedCategory(), // localStorage에서 불러온 카테고리 유지
          tags: '',
          productUrl: '',
          scheduleTime: '',
          channel: currentChannel, // 현재 선택된 채널 유지
          scriptMode: 'chrome',
          mediaMode: getSelectedMediaMode(), // localStorage에서 불러온 미디어 모드 유지
          youtubeSchedule: 'immediate',
          youtubePublishAt: '',
          youtubePrivacy: getSelectedPrivacy(), // localStorage에서 불러온 공개 설정 유지
          aiModel: getDefaultModelByType(getSelectedType()), // ✅ 타입에 따른 모델 자동 설정
          ttsVoice: getDefaultTtsByType(getSelectedType()), // ✅ 타입에 따른 TTS 자동 설정 (롱폼=순복, 숏폼/상품=선희)
          ttsSpeed: '+0%', // TTS 속도 초기화
          autoConvert: getSelectedType() === 'longform' // 롱폼→숏폼 자동변환 (롱폼일 때 기본 체크)
        });
        setShowAddForm(false);
        setCurrentProductData(null); // 상품정보 초기화
      }

      await fetchData();

      if (!autoMode) {
        // 즉시 실행 판단: 스케줄 시간이 없고 상품 타입인 경우만 즉시 실행
        const isImmediateExecution = !newTitle.scheduleTime &&
          (newTitle.promptFormat === 'product' || newTitle.promptFormat === 'product-info');

        if (isImmediateExecution) {
          // 즉시 실행 (상품 자동 실행): 진행 큐 → 대본 탭으로 자동 전환
          setQueueTab('script');
        } else {
          // 일반 제목 추가 또는 예약 실행: 예약 큐 탭으로 자동 전환
          setQueueTab('schedule');
        }
      }
    } catch (error) {
      console.error('Failed to add title:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteTitle(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/automation/titles?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete title');

      await fetchData();
    } catch (error) {
      console.error('Failed to delete title:', error);
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/automation/schedules?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete schedule');

      await fetchData();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  }

  function viewPipelineDetails(scheduleId: string) {
    router.push(`/automation/pipeline/${scheduleId}`);
  }

  function startEdit(title: any) {
    console.log('🔍 [startEdit] 수신된 title 객체:', {
      category: title.category,
      channel: title.channel,
      youtubeChannel: title.youtubeChannel,
      전체객체: title
    });

    const safeSchedules = Array.isArray(allSchedules) ? allSchedules : [];
    const titleSchedules = safeSchedules.filter(s => s.taskId === title.id);
    setEditingId(title.id);

    // ⭐⭐⭐ CRITICAL: category와 channel 명확히 분리! ⭐⭐⭐
    // category = title.category (카테고리)
    // channel = title.youtubeChannel (채널 ID, UCNh_... 형식)
    const actualCategory = title.category || '';
    const actualChannelId = title.youtubeChannel || title.channel || '';

    console.log('✅ [수정 폼] 필드 분리:', {
      actualCategory,
      actualChannelId
    });

    // ⭐ product_info에서 상품 정보 추출 (통일 구조: { productId, title, price, thumbnail, deepLink, category })
    // ⚠️ product_url 컬럼 삭제됨 - product_info.deepLink 사용
    let productUrl = '';
    let productData = null;

    // product_info 또는 product_data 둘 다 처리
    const rawProductInfo = title.product_info || title.product_data;
    if (rawProductInfo) {
      try {
        const parsed = typeof rawProductInfo === 'string'
          ? JSON.parse(rawProductInfo)
          : rawProductInfo;

        // 레거시 nested 구조 호환 ({ url, data } 또는 flat 구조)
        const source = parsed.data || parsed;

        // 통일 구조로 정규화
        productData = {
          productId: source.productId || `prod_${Date.now()}`,
          title: source.title || source.productName || '',
          price: source.price ?? source.productPrice ?? 0,
          thumbnail: source.thumbnail || source.productImage || '',
          deepLink: source.deepLink || source.productUrl || source.product_link || parsed.url || '',
          category: source.category || '상품'
        };
        productUrl = productData.deepLink;
        console.log('✅ [수정 폼] 상품 정보 로드:', productData);
      } catch (e) {
        console.error('❌ product_info 파싱 실패:', e);
      }
    }

    // ⭐ 채널 ID로 채널 정보 찾기 (리스트 화면과 동일한 로직)
    const matchedChannel = channels.find((c: any) =>
      c.id === actualChannelId || c.channelId === actualChannelId
    );

    // ⚠️ 매칭 실패 시 빈 문자열 유지!
    // ⚠️⚠️⚠️ 중요: channelId (실제 YouTube ID)를 먼저 사용! id는 내부 UUID임!
    const finalChannelId = matchedChannel?.channelId || matchedChannel?.id || '';

    console.log('🔍 [수정 폼] 채널 매칭:', {
      actualChannelId,
      matchedChannel: matchedChannel?.channel_name,
      finalChannelId,
      availableChannels: channels.map(ch => ({ id: ch.channel_id, name: ch.channel_name })),
      '⚠️주의': matchedChannel ? '매칭 성공' : '매칭 실패! 빈 문자열 사용'
    });

    // ⭐⭐⭐ editForm 설정 - 명확한 필드명 사용 ⭐⭐⭐
    const promptFormat = title.promptFormat || title.prompt_format || 'longform';

    // promptFormat에 따른 기본 TTS 음성 설정
    const defaultTtsVoice = promptFormat === 'longform' ? 'ko-KR-SoonBokNeural' : 'ko-KR-SunHiNeural';

    console.log('🔍 [startEdit] TTS 음성 설정:', {
      'title 전체': title,
      'title.ttsVoice': title.ttsVoice,
      'title.tts_voice': title.tts_voice,
      'defaultTtsVoice': defaultTtsVoice,
      '최종값 (||)': title.ttsVoice || title.tts_voice || defaultTtsVoice,
      '최종값 (??)': title.ttsVoice ?? title.tts_voice ?? defaultTtsVoice,
      'typeof ttsVoice': typeof title.ttsVoice,
      'typeof tts_voice': typeof title.tts_voice
    });

    setEditForm({
      id: title.id || title.taskId,
      title: title.title || '',
      promptFormat: promptFormat,
      category: actualCategory, // ⭐ 카테고리는 title.category만 사용!
      tags: title.tags || '',
      aiModel: title.ai_model || title.aiModel || 'claude',
      scriptMode: title.scriptMode || title.script_mode || 'chrome',
      mediaMode: title.mediaMode || title.media_mode || 'crawl',
      ttsVoice: title.ttsVoice ?? title.tts_voice ?? defaultTtsVoice, // ⭐ ?? 사용 (null/undefined만 체크)
      ttsSpeed: title.ttsSpeed ?? title.tts_speed ?? '+0%', // ⭐ ?? 사용
      autoConvert: title.autoCreateShortform ?? title.autoConvert ?? title.auto_create_shortform ?? false,
      product_data: productData,
      product_url: productUrl,
      channel_id: finalChannelId, // ⭐ 채널 ID
      schedules: titleSchedules
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function saveEdit() {
    try {
      console.log('📝 [수정 저장] 시작:', editForm);

      const payload = {
        id: editForm.id,
        title: editForm.title,
        promptFormat: editForm.promptFormat,
        category: editForm.category,
        tags: editForm.tags,
        productUrl: editForm.product_url,
        channelId: editForm.channel_id,
        scriptMode: editForm.scriptMode,
        mediaMode: editForm.mediaMode,
        aiModel: editForm.aiModel,
        ttsVoice: editForm.ttsVoice, // ⭐ editForm.ttsVoice 사용
        ttsSpeed: editForm.ttsSpeed, // ⭐ editForm.ttsSpeed 사용
        autoConvert: editForm.autoConvert // ⭐ editForm.autoConvert 사용 (auto_create_shortform 아님!)
      };

      console.log('📤 [수정 저장] API 전송 데이터:', payload);

      // 제목 업데이트 (모든 필드 포함)
      const response = await fetch('/api/automation/titles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ [수정 저장] API 실패:', error);
        alert(`저장 실패: ${error.error || '알 수 없는 오류'}`);
        return;
      }

      console.log('✅ [수정 저장] 성공');
      cancelEdit();
      await fetchData();
    } catch (error) {
      console.error('❌ [수정 저장] 실패:', error);
      alert(`저장 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  async function addScheduleToTitle(titleId: string, scheduledTime: string, youtubePublishTime?: string, youtubePrivacy?: string, forceExecute?: boolean) {
    try {
      const response = await fetch('/api/automation/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleId,
          scheduledTime,
          youtubePublishTime: youtubePublishTime || null,
          youtubePrivacy: youtubePrivacy || 'public',
          forceExecute: forceExecute || false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to add schedule');
        return;
      }

      await fetchData();
    } catch (error) {
      console.error('Failed to add schedule:', error);
      alert('스케줄 추가 중 오류가 발생했습니다.');
    }
  }

  async function updateSchedule(scheduleId: string, scheduledTime: string) {
    try {
      // 과거 시간 검증
      const scheduledDate = new Date(scheduledTime);
      const now = new Date();
      if (scheduledDate < now) {
        alert('⚠️ 과거 시간으로 스케줄을 설정할 수 없습니다.');
        return;
      }

      // ⭐ MySQL datetime 형식으로 변환: 'YYYY-MM-DD HH:MM:SS'
      // ✅ BTS-0000025: 로컬 시간대 유지
      const year = scheduledDate.getFullYear();
      const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
      const day = String(scheduledDate.getDate()).padStart(2, '0');
      const hours = String(scheduledDate.getHours()).padStart(2, '0');
      const minutes = String(scheduledDate.getMinutes()).padStart(2, '0');
      const seconds = String(scheduledDate.getSeconds()).padStart(2, '0');
      const mysqlDatetime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      const response = await fetch('/api/automation/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scheduleId,
          scheduledTime: mysqlDatetime
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to update schedule');
        return;
      }

      await fetchData();
      setEditingScheduleId(null);
    } catch (error) {
      console.error('Failed to update schedule:', error);
      alert('스케줄 수정 중 오류가 발생했습니다.');
    }
  }

  async function updateSettings(newSettings: any) {
    try {
      const response = await fetch('/api/automation/scheduler', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: newSettings
        })
      });

      if (!response.ok) throw new Error('Failed to update settings');

      await fetchData();
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  }

  async function fetchLogs(taskId: string) {
    const isFirstLoad = !logsMap[taskId];
    if (isFirstLoad) setIsLoadingLogs(true);

    try {
      // logOffset으로 새 로그만 요청 (append 방식, 대역폭 절약)
      let currentOffset = logOffsetsRef.current[taskId] || 0;
      let hasMore = true;

      // BTS-3353: hasMore가 true인 동안 계속 fetch하여 전체 로그 로드
      while (hasMore) {
        const response = await fetch(`/api/automation/logs?taskId=${taskId}&logOffset=${currentOffset}`);
        const data = await response.json();

        if (data.logs && data.logs.length > 0) {
          // 새 로그만 append
          setLogsMap(prev => {
            const prevLogs = prev[taskId] || [];
            return { ...prev, [taskId]: [...prevLogs, ...data.logs] };
          });
          // offset 업데이트
          currentOffset = data.logOffset || (currentOffset + data.logs.length);
          logOffsetsRef.current[taskId] = currentOffset;

          // 🎨 이미지 크롤링 진행 상황 파싱 (BTS-0000037 복원)
          parseImageCrawlingProgress(taskId, data.logs);
        }

        // 더 가져올 로그가 있는지 확인
        hasMore = data.hasMore === true;
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      if (isFirstLoad) setIsLoadingLogs(false);
    }
  }

  // 🎨 이미지 크롤링 로그를 파싱하여 crawledImagesMap 업데이트
  function parseImageCrawlingProgress(taskId: string, logs: any[]) {
    const updates: Record<string, { status: string; sceneNumber?: string }> = {};

    logs.forEach((log) => {
      const msg = log.message || '';

      // 패턴 1: "📌 scene_00_hook 입력 중 (시도 1/3)..." → uploading
      const inputMatch = msg.match(/📌\s+(scene_[^\s]+)\s+입력\s+중/i);
      if (inputMatch) {
        const sceneId = inputMatch[1].toLowerCase();
        updates[sceneId] = { status: 'uploading', sceneNumber: sceneId };
      }

      // 패턴 2: "✅ scene_00_hook 입력 완료 (정책 위반 없음)" → generating
      const completeMatch = msg.match(/✅\s+(scene_[^\s]+)\s+입력\s+완료/i);
      if (completeMatch) {
        const sceneId = completeMatch[1].toLowerCase();
        updates[sceneId] = { status: 'generating', sceneNumber: sceneId };
      }

      // 패턴 3: "📥 scene_00_hook의 이미지 수집 중..." → downloading
      const collectMatch = msg.match(/📥\s+(scene_[^\s]+).*이미지\s+수집/i);
      if (collectMatch) {
        const sceneId = collectMatch[1].toLowerCase();
        updates[sceneId] = { status: 'downloading', sceneNumber: sceneId };
      }

      // 패턴 4: "✅ 저장 완료: scene_00_hook.jpeg" → completed
      const saveMatch = msg.match(/✅\s+저장\s+완료:\s+(scene_[^.\s]+)/i);
      if (saveMatch) {
        const sceneId = saveMatch[1].toLowerCase();
        updates[sceneId] = { status: 'completed', sceneNumber: sceneId };
      }

      // 패턴 5: "⚠️ scene_00_hook 입력 실패" → failed
      const failMatch = msg.match(/⚠️.*?(scene_[^\s]+).*(실패|오류|에러)/i);
      if (failMatch) {
        const sceneId = failMatch[1].toLowerCase();
        updates[sceneId] = { status: 'failed', sceneNumber: sceneId };
      }
    });

    // crawledImagesMap 업데이트 (변경사항이 있을 때만)
    if (Object.keys(updates).length > 0) {
      setCrawledImagesMap(prev => ({
        ...prev,
        [taskId]: {
          ...(prev[taskId] || {}),
          ...updates
        }
      }));
    }
  }

  // script_id와 video_id로 진행 상황 조회 (진행 중인 작업만)
  async function fetchProgress(title: any, schedule: any) {
    try {
      // 완료/실패/취소된 작업은 체크 안 함
      if (!schedule || ['completed', 'failed', 'cancelled'].includes(schedule.status)) {
        return;
      }

      const progress: { scriptProgress?: number; videoProgress?: number } = {};

      // 대본 생성 진행률 조회 (script_id가 있고 아직 영상 생성 전일 때만)
      if (title.scriptId && !title.videoId && schedule.status !== 'image_processing') {
        const scriptRes = await fetch(`/api/scripts/status/${title.scriptId}`);
        if (scriptRes.ok) {
          const scriptData = await scriptRes.json();
          progress.scriptProgress = scriptData.progress || 0;
        }
      }

      // 영상 생성 진행률 조회 (video_id가 있을 때만)
      if (title.videoId) {
        const videoRes = await fetch(`/api/generate-video?taskId=${title.videoId}`);
        if (videoRes.ok) {
          const videoData = await videoRes.json();
          progress.videoProgress = videoData.progress || 0;
        }
      }

      if (Object.keys(progress).length > 0) {
        setProgressMap(prev => ({ ...prev, [title.id]: progress }));
      }
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
  }

  // 완료/실패된 제목의 로그만 처리 (한 번만 로드, 폴링 없음)
  useEffect(() => {
    if (!expandedLogsFor || !Array.isArray(schedules)) return;

    // task_schedule.status 기준으로 확인
    const expandedSchedule = schedules.find((s: any) => s.taskId === expandedLogsFor);
    const isCompletedOrFailed = expandedSchedule && (expandedSchedule.status === 'completed' || isFailedStatus(expandedSchedule.status));

    // 완료/실패된 경우에만 한 번 로드 (활성 제목은 아래 useEffect에서 처리)
    if (isCompletedOrFailed) {
      fetchLogs(expandedLogsFor);
      console.log('📋 로그 로드 (작업 완료/실패):', expandedLogsFor);
    }
  }, [expandedLogsFor, schedules]);

  // 진행 중인 제목들의 로그 및 진행 상황 자동 업데이트 (통합 폴링)
  useEffect(() => {
    if (!Array.isArray(titles) || titles.length === 0 || !Array.isArray(schedules) || schedules.length === 0) return;

    // ⭐ 실제로 진행 중인(processing) 스케줄만 폴링 - 예약된 것은 폴링 불필요!
    const activeTitles = titles.filter((t: any) => {
      const sch = schedules.find((s: any) => s.taskId === t.id);
      return sch && sch.status === 'processing'; // scheduled 제외!
    });

    // BTS-3352: 현재 열려있는 로그가 processing 상태인지 확인
    const expandedSchedule = expandedLogsFor ? schedules.find((s: any) => s.taskId === expandedLogsFor) : null;
    const isExpandedProcessing = expandedSchedule && expandedSchedule.status === 'processing';
    const needsExpandedPolling = isExpandedProcessing && !activeTitles.find((t: any) => t.id === expandedLogsFor);

    // 진행 중인 작업이 없고, 열린 로그도 폴링 불필요하면 종료
    if (activeTitles.length === 0 && !needsExpandedPolling) {
      manuallyClosedLogs.current = false;
      return;
    }

    // 진행 중인 작업이 있고, 현재 열린 로그가 없거나 진행 중인 작업의 로그가 아니면 자동으로 열기
    // 단, 사용자가 수동으로 닫은 경우는 자동 열기 하지 않음
    if (!manuallyClosedLogs.current && activeTitles.length > 0) {
      if (!expandedLogsFor || !activeTitles.find((t: any) => t.id === expandedLogsFor)) {
        setExpandedLogsFor(activeTitles[0].id);
      }
    }

    // 즉시 로드 + 5초마다 업데이트 (3초 → 5초로 변경하여 부하 감소)
    const updateLogs = () => {
      activeTitles.forEach((t: any) => {
        const schedule = schedules.find((s: any) => s.taskId === t.id);
        fetchLogs(t.id);
        fetchProgress(t, schedule);
      });
      // BTS-3352: 현재 열려있는 로그가 activeTitles에 없지만 processing 상태면 별도로 폴링
      if (needsExpandedPolling) {
        fetchLogs(expandedLogsFor!);
      }
    };

    // 즉시 한 번 실행
    updateLogs();

    // 5초마다 폴링
    const interval = setInterval(updateLogs, 5000);

    return () => clearInterval(interval);
  }, [titles, schedules, expandedLogsFor]);

  // 이미지 크롤링 중인 작업의 이미지 목록 폴링
  useEffect(() => {
    if (!Array.isArray(schedules) || schedules.length === 0) return;

    // type='image' AND status='processing'인 스케줄만 찾기
    const imageProcessingSchedules = schedules.filter((s: any) =>
      s.queueType === 'image' && s.status === 'processing'
    );

    if (imageProcessingSchedules.length === 0) {
      return;
    }

    const fetchImages = async () => {
      for (const schedule of imageProcessingSchedules) {
        try {
          const res = await fetch(`/api/tasks/${schedule.taskId}/images`);
          if (res.ok) {
            const data = await res.json();
            setCrawledImagesMap(prev => ({
              ...prev,
              [schedule.taskId]: data
            }));
          }
        } catch (error) {
          console.error(`Failed to fetch images for ${schedule.taskId}:`, error);
        }
      }
    };

    // 즉시 한 번 실행
    fetchImages();

    // 3초마다 폴링
    const interval = setInterval(fetchImages, 3000);

    return () => clearInterval(interval);
  }, [schedules]);

  // 로그가 업데이트될 때 자동으로 스크롤을 맨 아래로 이동
  useEffect(() => {
    Object.keys(logsMap).forEach(titleId => {
      const logContainer = document.getElementById(`log-container-${titleId}`);
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    });
  }, [logsMap]);

  function toggleLogs(titleId: string) {
    if (expandedLogsFor === titleId) {
      // 사용자가 수동으로 닫음
      manuallyClosedLogs.current = true;
      setExpandedLogsFor(null);
    } else {
      // 사용자가 수동으로 열음 - 수동 닫기 플래그 초기화
      manuallyClosedLogs.current = false;
      setExpandedLogsFor(titleId);
      // 로그가 없으면 즉시 로드
      if (!logsMap[titleId]) {
        fetchLogs(titleId);
      }
    }
  }

  // 재시도 함수 (실패한 구간부터 재시작) - 미리보기 모달 표시
  async function retryFailed(titleId: string, titleObj: any) {
    try {
      // 1. preview API 호출해서 폴더 상태 확인
      const res = await fetch('/api/automation/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: titleId, preview: true })
      });
      const data = await res.json();

      console.log('[Retry Preview]', data);

      if (!res.ok) {
        // 에러 상태도 파일 정보가 있으면 모달 표시
        if (data.files) {
          setRetryPreviewModal({
            taskId: titleId,
            title: titleObj.title,
            preview: { ...data, error: data.error }
          });
        } else {
          alert(data.error || '재시도할 수 없습니다.');
        }
        return;
      }

      // 2. 미리보기 모달 표시
      setRetryPreviewModal({
        taskId: titleId,
        title: titleObj.title,
        preview: data
      });

    } catch (error: any) {
      console.error('[Retry] Error:', error);
      alert('재시도 정보 조회 실패: ' + error.message);
    }
  }

  // 실제 재시도 실행
  async function executeRetry(taskId: string, forceType?: string) {
    try {
      console.log(`🔄 [executeRetry] 재시도 실행: taskId=${taskId}, forceType=${forceType}`);
      const res = await fetch('/api/automation/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, forceType, preview: false })  // ⭐ preview: false 명시
      });
      const data = await res.json();
      console.log(`✅ [executeRetry] 응답:`, data);

      if (!res.ok) {
        alert(data.error || '재시도 실패');
        return;
      }

      // 재시도 타입의 큐 탭으로 먼저 이동 (사용자에게 바로 표시)
      setMainTab('queue');
      setQueueTab(data.retryFromType as any); // 직접 탭 전환 (락 무시)

      setRetryPreviewModal(null);
      alert(`✅ ${data.retryFromType}부터 재시도합니다.`);
      await fetchData();

    } catch (error: any) {
      console.error('[Retry Execute] Error:', error);
      alert('재시도 실패: ' + error.message);
    }
  }

  async function forceExecute(titleId: string, title: string) {
    // 확인 메시지
    if (!confirm(`"${title}"\n\n즉시 실행하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch('/api/automation/force-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId })
      });

      const data = await response.json();

      if (response.ok) {
        await fetchData();
        setMainTab('queue'); // 큐 탭으로 이동
        setQueueTabLocked(false); // 락 해제 (시스템 자동 전환 허용)
        setQueueTab('script'); // 대본 탭으로 직접 전환
      } else {
        alert(`❌ 실행 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Force execute error:', error);
      alert('강제 실행 중 오류가 발생했습니다.');
    }
  }

  // 대본 로드 함수 (모달용)
  async function loadScriptForEdit(taskId: string, title: string) {
    setScriptEditModal({ taskId, title, scenes: [], loading: true });
    try {
      const res = await fetch(`/api/scripts/${taskId}/story`);
      if (res.ok) {
        const data = await res.json();
        setScriptEditModal({ taskId, title, scenes: data.scenes || [], loading: false });
      } else {
        alert('❌ 대본을 불러올 수 없습니다');
        setScriptEditModal(null);
      }
    } catch (e) {
      console.error('대본 로드 오류:', e);
      alert('❌ 대본 로드 중 오류 발생');
      setScriptEditModal(null);
    }
  }

  // 대본 저장 함수
  async function saveScriptEdit() {
    if (!scriptEditModal) return;
    setScriptEditSaving(true);
    try {
      const res = await fetch(`/api/scripts/${scriptEditModal.taskId}/story`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: scriptEditModal.scenes })
      });
      if (res.ok) {
        alert('✅ 대본이 저장되었습니다');
        setScriptEditModal(null);
      } else {
        const errData = await res.json();
        alert(`❌ 저장 실패: ${errData.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      console.error('대본 저장 오류:', e);
      alert('❌ 대본 저장 중 오류 발생');
    } finally {
      setScriptEditSaving(false);
    }
  }

  // ⚠️ ID 규칙: 폴더는 script_id(UUID)로 생성됨
  async function handleOpenFolder(videoId: string | null, scriptId: string | null, status: string, taskId?: string | null) {
    try {
      // scriptId를 우선 사용 (폴더가 script_id로 생성되므로)
      // scriptId가 없으면 taskId fallback (하위 호환성)
      const folderId = scriptId || taskId;
      if (!folderId) {
        alert('폴더를 열 수 없습니다: 프로젝트 ID를 찾을 수 없습니다');
        return;
      }

      const url = `/api/open-folder?projectId=${folderId}`;

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`폴더 열기 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.error('폴더 열기 실패:', error);
      alert('폴더 열기 중 오류가 발생했습니다.');
    }
  }

  async function handleDownload(scriptId: string, type: 'video' | 'script' | 'materials' | 'all', title: string) {
    try {
      const typeLabels = {
        video: '영상',
        script: '대본',
        materials: '재료',
        all: '전체'
      };

      console.log(`📥 ${typeLabels[type]} 다운로드 시작:`, scriptId);

      // API 호출하여 파일 다운로드
      const url = `/api/automation/download?scriptId=${encodeURIComponent(scriptId)}&type=${type}&title=${encodeURIComponent(title)}`;

      const response = await fetch(url, {
        credentials: 'include'
      });

      // 에러 응답 체크
      if (!response.ok) {
        const contentType = response.headers.get('Content-Type');
        if (contentType?.includes('application/json')) {
          const error = await response.json();
          const errorMsg = error.error || '알 수 없는 오류';
          const details = error.details ? `\n\n상세: ${error.details}` : '';
          alert(`다운로드 실패: ${errorMsg}${details}`);
          return;
        }
        alert(`다운로드 실패: ${response.status} ${response.statusText}`);
        return;
      }

      // Content-Type이 JSON인 경우 (에러 응답)
      const contentType = response.headers.get('Content-Type');
      if (contentType?.includes('application/json') && !contentType?.includes('attachment')) {
        const data = await response.json();
        if (data.error) {
          const errorMsg = data.error;
          const details = data.details ? `\n\n상세: ${data.details}` : '';
          alert(`다운로드 실패: ${errorMsg}${details}`);
          return;
        }
      }

      // 파일 다운로드
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;

      // Content-Disposition에서 파일명 추출
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : `${title}_${type}.zip`;

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      console.log(`✅ ${typeLabels[type]} 다운로드 완료`);
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  }

  // 이미지 크롤링 모달 열기
  function openImageCrawlModal(scriptId: string, titleId: string, title: string, format: string) {
    setImageCrawlModal({ scriptId, titleId, title, format });
  }

  // 실제 이미지 크롤링 실행
  async function executeImageCrawling(imageMode: 'imagefx' | 'whisk' | 'flow') {
    if (!imageCrawlModal) return;

    const { scriptId, titleId, title, format } = imageCrawlModal;
    setImageCrawlModal(null); // 모달 닫기

    try {
      const modeLabel = imageMode === 'imagefx' ? 'ImageFX + Whisk' : imageMode === 'flow' ? 'Flow' : 'Whisk';
      console.log(`🎬 [ImageCrawl] Starting crawl for format: ${format}, mode: ${modeLabel}`);
      setCrawlingFor(titleId);
      setCrawlLogs(prev => ({ ...prev, [titleId]: [`🚀 이미지 크롤링 시작... (포맷: ${format}, 모드: ${modeLabel})`] }));

      // story.json 읽기
      const storyRes = await fetch(`/api/automation/get-story?scriptId=${scriptId}`);
      if (!storyRes.ok) {
        throw new Error('story.json을 불러올 수 없습니다');
      }

      const storyData = await storyRes.json();
      console.log('📖 Story 데이터:', JSON.stringify(storyData, null, 2));

      // story.json 구조: { storyJson: { scenes: [...] } } 또는 { story: { scenes: [...] } } 또는 { scenes: [...] }
      const scenes = storyData.storyJson?.scenes || storyData.story?.scenes || storyData.scenes || [];

      if (!scenes || scenes.length === 0) {
        console.error('❌ Scenes 데이터 없음. 받은 데이터:', storyData);
        throw new Error(`크롤링할 씬 데이터가 없습니다. (${JSON.stringify(Object.keys(storyData))})`);
      }

      setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `📋 ${scenes.length}개 씬 발견`] }));

      // 이미지 크롤링 API 호출 (BTS-0000034: imageMode 전달)
      const response = await fetch('/api/images/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes,
          contentId: scriptId,
          format,
          imageMode  // BTS-0000034: 'imagefx' | 'whisk' | 'flow'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '크롤링 실패');
      }

      const taskId = result.taskId;
      setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `✅ 크롤링 작업 생성: ${taskId}`, '⏳ 실시간 로그 수신 중...'] }));

      // 실시간 로그 폴링
      let lastLogCount = 0;
      let pollCount = 0;
      const maxPolls = 120; // 최대 10분 (5초 간격)

      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          const statusRes = await fetch(`/api/images/crawl?taskId=${taskId}`);

          if (!statusRes.ok) {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), '❌ 상태 확인 실패'] }));
            setCrawlingFor(null);
            return;
          }

          const status = await statusRes.json();

          // 새로운 로그만 추가
          if (status.logs && status.logs.length > lastLogCount) {
            const newLogs = status.logs.slice(lastLogCount);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), ...newLogs] }));
            lastLogCount = status.logs.length;
          }

          // 완료 또는 실패 시 폴링 중단
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), '✅ 이미지 크롤링 완료! 자동으로 영상 제작을 시작합니다.'] }));

            // 로그 파일에서 전체 로그 읽어오기
            try {
              const logsRes = await fetch(`/api/images/logs?scriptId=${scriptId}`);
              if (logsRes.ok) {
                const logsData = await logsRes.json();
                if (logsData.logs && logsData.logs.length > 0) {
                  setCrawlLogs(prev => ({
                    ...prev,
                    [titleId]: [
                      '📋 ===== 전체 이미지 크롤링 로그 =====',
                      ...logsData.logs,
                      '📋 ===== 로그 끝 ====='
                    ]
                  }));
                }
              }
            } catch (logError) {
              console.error('로그 파일 읽기 실패:', logError);
            }

            setCrawlingFor(null);

            // 🚀 이미지 크롤링 완료 후 자동으로 영상 제작 시작
            // scheduleId 찾기
            const safeSchedules = Array.isArray(allSchedules) ? allSchedules : [];
            const titleSchedules = safeSchedules.filter((s: any) => s.taskId === titleId);
            const schedule = titleSchedules.find((s: any) => s.scriptId === scriptId);
            if (schedule) {
              console.log('🎬 [자동 영상 제작] 이미지 크롤링 완료 → 영상 제작 시작');
              setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), '🎬 영상 제작을 자동으로 시작합니다...'] }));
              await handleVideoGeneration(titleId, schedule.id, scriptId);
            } else {
              alert('✅ 이미지 크롤링이 완료되었습니다!\n\n영상제작 버튼을 눌러 영상을 생성하세요.');
            }
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `❌ 크롤링 실패: ${status.error || '알 수 없는 오류'}`] }));
            setCrawlingFor(null);
            alert(`❌ 이미지 크롤링이 실패했습니다.\n\n${status.error || '알 수 없는 오류'}`);
          } else if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), '⏱️ 타임아웃: 작업이 너무 오래 걸립니다. 수동으로 확인해주세요.'] }));
            setCrawlingFor(null);
          }
        } catch (pollError: any) {
          console.error('폴링 에러:', pollError);
        }
      }, 5000); // 5초마다 폴링

    } catch (error: any) {
      setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `❌ ${error.message}`] }));
      alert(`❌ 크롤링 실패: ${error.message}`);
      console.error('Image crawling error:', error);
      setCrawlingFor(null);
    }
  }

  async function handleRegenerateScript(scriptId: string, titleId: string, title: string) {
    try {
      if (!confirm(`"${title}" 대본을 재생성하시겠습니까?\n\n기존 대본이 초기화되고 새로운 대본이 생성됩니다.`)) {
        return;
      }

      console.log(`🔄 대본 재생성 시작: ${scriptId}`);

      const response = await fetch('/api/automation/regenerate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scriptId, titleId })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ ${data.message}`);
        await fetchData();
      } else {
        alert(`❌ 재생성 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Regenerate script error:', error);
      alert('대본 재생성 중 오류가 발생했습니다.');
    }
  }

  async function handleRegenerateVideo(videoId: string | null, scriptId: string | null, title: string) {
    try {
      if (!videoId && !scriptId) {
        alert('재생성할 영상을 찾을 수 없습니다.');
        return;
      }

      if (!confirm(`"${title}" 영상을 재생성하시겠습니까?\n\n기존 영상이 초기화되고 새로운 영상이 생성됩니다.`)) {
        return;
      }

      console.log(`🔄 영상 재생성 시작: videoId=${videoId}, scriptId=${scriptId}`);

      const response = await fetch('/api/automation/regenerate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoId, scriptId })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ ${data.message}`);
        await fetchData();
      } else {
        alert(`❌ 재생성 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Regenerate video error:', error);
      alert('영상 재생성 중 오류가 발생했습니다.');
    }
  }

  // 영상 제작 시작 (대본과 이미지가 이미 준비된 상태에서 호출)
  async function handleVideoGeneration(titleId: string, scheduleId: string, scriptId: string) {
    try {
      console.log('📹 [영상 제작] 시작:', titleId, scheduleId, scriptId);

      // 1. story.json 가져오기
      const storyRes = await fetch(`/api/automation/get-story?scriptId=${scriptId}`, {
        credentials: 'include'
      });
      if (!storyRes.ok) {
        alert('❌ 대본 정보를 읽을 수 없습니다. 대본이 존재하는지 확인해주세요.');
        return;
      }
      const { storyJson } = await storyRes.json();

      // ⚠️ Queue Spec v4: task_schedule.status는 deprecated (task_queue만 사용)
      // 2. 영상 큐로 전환 (상태는 task_queue에서 자동 관리됨)
      setQueueTabSystem('video');
      await fetchData(); // 상태 업데이트 후 데이터 새로고침

      // 3. 타이틀 정보 가져오기
      const safeTitles = Array.isArray(titles) ? titles : [];
      const titleInfo = safeTitles.find((t: any) => t.id === titleId);
      if (!titleInfo) {
        alert('❌ 타이틀 정보를 찾을 수 없습니다.');
        return;
      }

      // 4. 영상 생성 API 호출
      const imageSource = titleInfo.mediaMode === 'upload' ? 'none' : titleInfo.mediaMode;
      const ttsVoice = titleInfo.ttsVoice || getDefaultTtsByType(titleInfo.promptFormat || titleInfo.type);
      const ttsSpeed = titleInfo.ttsSpeed || '+0%';
      console.log(`📹 [영상 생성] 설정: mediaMode=${titleInfo.mediaMode}, imageSource=${imageSource}, ttsVoice=${ttsVoice}, ttsSpeed=${ttsSpeed}`);

      const videoRes = await fetch('/api/generate-video-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'automation-system'
        },
        body: JSON.stringify({
          storyJson,
          userId: titleInfo.userId,
          imageSource,
          imageModel: titleInfo.aiModel || 'dalle3',
          videoFormat: titleInfo.type || 'shortform',
          ttsVoice,
          ttsSpeed,
          title: titleInfo.title,
          scriptId
        })
      });

      const videoData = await videoRes.json();
      if (videoRes.ok) {
        console.log('✅ [영상 제작] 성공:', videoData.taskId);
        alert(`✅ 영상 제작이 시작되었습니다!\n\nTask ID: ${videoData.taskId}`);
      } else {
        console.error('❌ [영상 제작] 실패:', videoData.error);
        alert(`❌ 영상 제작 실패: ${videoData.error || '알 수 없는 오류'}`);

        // 영상 제작 실패 시 스케줄 상태를 failed로 변경
        await fetch(`/api/automation/schedules`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: scheduleId,
            status: 'failed'
          })
        });
      }

      await fetchData();
    } catch (error: any) {
      console.error('❌ [영상 제작] 오류:', error);
      alert(`❌ 영상 제작 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // 미디어(이미지+동영상) 업로드 실행
  async function uploadImages(titleId: string, scheduleId: string, scriptId: string) {
    const images = uploadedImagesFor[titleId] || [];
    const videos = uploadedVideosFor[titleId] || [];

    if (images.length === 0 && videos.length === 0) {
      return;
    }

    try {
      setUploadingFor(titleId);

      const formData = new FormData();
      formData.append('scheduleId', scheduleId);
      formData.append('scriptId', scriptId);

      // 동영상 파일 먼저 추가 (scene_0부터 시작)
      videos.forEach((file) => {
        formData.append(`media`, file);
      });

      // 이미지 파일 나중에 추가
      images.forEach((file) => {
        formData.append(`media`, file);
      });

      const response = await fetch('/api/automation/upload-media', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        // 업로드 박스 닫기
        setUploadBoxOpenFor(prev => ({ ...prev, [titleId]: false }));

        // 업로드된 미디어 초기화
        setUploadedImagesFor(prev => {
          const newState = { ...prev };
          delete newState[titleId];
          return newState;
        });
        setUploadedVideosFor(prev => {
          const newState = { ...prev };
          delete newState[titleId];
          return newState;
        });

        // 로그창 자동 열기
        setExpandedLogsFor(titleId);

        await fetchData();
        setQueueTabSystem('video'); // 업로드 성공 후 영상 큐로 전환

        // 영상 제작 시작 (대본 작성/이미지 생성 건너뛰고 바로 영상 생성)
        const safeTitles2 = Array.isArray(titles) ? titles : [];
        const titleInfo = safeTitles2.find((t: any) => t.id === titleId);
        if (titleInfo) {
          console.log('📹 [영상 제작] 시작:', titleId);

          // 1. story.json 가져오기
          const storyRes = await fetch(`/api/automation/get-story?scriptId=${scriptId}`, {
            credentials: 'include'
          });
          if (!storyRes.ok) {
            console.error('❌ story.json 읽기 실패');
            return;
          }
          const { storyJson } = await storyRes.json();

          // 2. 스케줄 상태를 'video_processing'으로 변경
          const updateRes = await fetch(`/api/automation/schedules`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              id: scheduleId,
              status: 'video_processing'
            })
          });

          if (!updateRes.ok) {
            console.error('❌ 스케줄 상태 업데이트 실패');
          } else {
            console.log('✅ 스케줄 상태를 processing으로 변경');
          }

          await fetchData(); // 상태 업데이트 후 데이터 새로고침

          // ⭐ 최신 데이터 재조회 (DB에서 최신 media_mode 읽기)
          const latestTitlesRes = await fetch('/api/automation/titles', {
            credentials: 'include'
          });
          const latestTitles = latestTitlesRes.ok ? (await latestTitlesRes.json()).titles : [];
          const latestTitleInfo = latestTitles.find((t: any) => t.id === titleId) || titleInfo;

          // 3. 영상 생성 API 호출 (내부 요청 형식)
          const imageSource = latestTitleInfo.mediaMode === 'upload' ? 'none' : latestTitleInfo.mediaMode;
          const ttsVoice = latestTitleInfo.ttsVoice || getDefaultTtsByType(latestTitleInfo.promptFormat || latestTitleInfo.type);
          const ttsSpeed = latestTitleInfo.ttsSpeed || '+0%';
          console.log(`📹 [영상 생성] 설정: mediaMode=${latestTitleInfo.mediaMode}, imageSource=${imageSource}, ttsVoice=${ttsVoice}, ttsSpeed=${ttsSpeed}`);

          const videoRes = await fetch('/api/generate-video-upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Request': 'automation-system'
            },
            body: JSON.stringify({
              storyJson,
              userId: latestTitleInfo.userId,
              imageSource,
              imageModel: latestTitleInfo.aiModel || 'dalle3',
              videoFormat: latestTitleInfo.type || 'shortform',
              ttsVoice,
              ttsSpeed,
              title: latestTitleInfo.title,
              scriptId
            })
          });

          const videoData = await videoRes.json();
          if (videoRes.ok) {
            console.log('✅ [영상 제작] 성공:', videoData.taskId);
          } else {
            console.error('❌ [영상 제작] 실패:', videoData.error);

            // 영상 제작 실패 시 스케줄 상태를 failed로 변경
            try {
              await fetch(`/api/automation/schedules`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  id: scheduleId,
                  status: 'failed'
                })
              });
              await fetchData();
              setQueueTab('failed'); // 실패 탭으로 전환
            } catch (updateError) {
              console.error('❌ 상태 업데이트 실패:', updateError);
            }
          }
        }
      } else {
        console.error('❌ 업로드 실패:', data.error || '알 수 없는 오류');

        // 미디어 업로드 실패 시 스케줄 상태를 failed로 변경
        try {
          await fetch(`/api/automation/schedules`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              id: scheduleId,
              status: 'failed'
            })
          });
          await fetchData();
          setQueueTab('failed'); // 실패 탭으로 전환
        } catch (updateError) {
          console.error('❌ 상태 업데이트 실패:', updateError);
        }
      }
    } catch (error) {
      console.error('❌ Image upload error:', error);

      // 예외 발생 시 스케줄 상태를 failed로 변경
      try {
        await fetch(`/api/automation/schedules`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: scheduleId,
            status: 'failed'
          })
        });
        await fetchData();
        setQueueTab('failed'); // 실패 탭으로 전환
      } catch (updateError) {
        console.error('❌ 상태 업데이트 실패:', updateError);
      }
    } finally {
      setUploadingFor(null);
    }
  }

  if (loading) {
    return <div className="p-8">로딩 중...</div>;
  }

  // 안전한 스케줄 배열 (JSX에서 사용)
  const safeSchedules = Array.isArray(schedules) ? schedules : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 - 스케줄러 상태 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* 자동 제목 생성 */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 bg-purple-900/50 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 border border-purple-500/50">
            <span className="text-purple-300 text-xs font-medium whitespace-nowrap">🤖 자동제목</span>
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                settings?.auto_title_generation === 'true'
                  ? 'bg-red-500'
                  : 'bg-gray-500'
              }`}></div>
              <span className={`text-sm whitespace-nowrap ${
                settings?.auto_title_generation === 'true'
                  ? 'text-red-500 font-bold'
                  : 'text-gray-400 font-medium'
              }`}>
                {settings?.auto_title_generation === 'true' ? 'ON' : 'OFF'}
              </span>
              <button
                onClick={async () => {
                  const newValue = settings?.auto_title_generation !== 'true';
                  try {
                    const response = await fetch('/api/automation/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ auto_title_generation: newValue ? 'true' : 'false' })
                    });
                    if (response.ok) {
                      await fetchData();
                    }
                  } catch (error) {
                    console.error('Failed to toggle auto title generation:', error);
                  }
                }}
                className={`px-2 sm:px-2.5 py-1 rounded text-xs font-semibold transition ${
                  settings?.auto_title_generation === 'true'
                    ? 'bg-purple-700 hover:bg-purple-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {settings?.auto_title_generation === 'true' ? '중지' : '시작'}
              </button>
              <select
                value={settings?.auto_title_generation_interval || '10'}
                onChange={async (e) => {
                  try {
                    const response = await fetch('/api/automation/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ auto_title_generation_interval: e.target.value })
                    });
                    if (response.ok) {
                      await fetchData();
                    }
                  } catch (error) {
                    console.error('Failed to update interval:', error);
                  }
                }}
                className="bg-purple-800 hover:bg-purple-700 text-white text-xs px-1.5 sm:px-2 py-1 rounded border border-purple-500 cursor-pointer transition"
              >
                <option value="0.167">⚡ 10초 (테스트)</option>
                <option value="1">⚡ 1분 (테스트)</option>
                <option value="10">10분</option>
                <option value="30">30분</option>
                <option value="60">1시간</option>
                <option value="180">3시간</option>
                <option value="360">6시간</option>
                <option value="720">12시간</option>
                <option value="1440">24시간</option>
              </select>

            {/* 테스트/샘플/즉시 버튼 */}
            <button
                onClick={() => {
                  setTestMode('test');
                  setTestModalOpen(true);
                  setTestLogs([]);
                  setTestInProgress(true);

                  // 실시간 로그를 받아오는 함수
                  const runTest = async () => {
                    try {
                      const response = await fetch('/api/automation/test-generate-stream', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });

                      if (!response.ok) {
                        const error = await response.json();
                        setTestLogs(prev => [...prev, `❌ 에러: ${error.error}`]);
                        setTestInProgress(false);
                        return;
                      }

                      const reader = response.body?.getReader();
                      const decoder = new TextDecoder();

                      if (!reader) {
                        setTestLogs(prev => [...prev, '❌ 스트림을 읽을 수 없습니다']);
                        setTestInProgress(false);
                        return;
                      }

                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const text = decoder.decode(value);
                        const lines = text.split('\n').filter(line => line.trim());

                        for (const line of lines) {
                          if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                              setTestInProgress(false);
                              setTestLogs(prev => [...prev, '\n✅ 테스트 완료']);
                              await fetchData(); // 데이터 새로고침

                              // 예약 큐 탭으로 자동 이동
                              setMainTab('queue');
                              setQueueTab('schedule');
                            } else {
                              setTestLogs(prev => [...prev, data]);
                            }
                          }
                        }
                      }
                    } catch (error: any) {
                      console.error('Failed to test title generation:', error);
                      setTestLogs(prev => [...prev, `❌ 테스트 실패: ${error.message}`]);
                      setTestInProgress(false);
                    }
                  };

                  runTest();
                }}
                className="px-2 sm:px-2.5 py-1 rounded text-xs font-semibold transition bg-purple-600 hover:bg-purple-500 text-white"
                disabled={testInProgress}
              >
                <span className="hidden sm:inline">🧪 테스트</span>
                <span className="sm:hidden">🧪</span>
              </button>
              <button
                onClick={async () => {
                  setSampleLoading(true);
                  setSampleModalOpen(true);
                  setSelectedSamples(new Set());
                  try {
                    const res = await fetch('/api/title-pool/sample', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ count: 10 })
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setSampleTitles(data.titles || []);
                    } else {
                      setSampleTitles([]);
                    }
                  } catch (e) {
                    setSampleTitles([]);
                  }
                  setSampleLoading(false);
                }}
                className="px-2 sm:px-2.5 py-1 rounded text-xs font-semibold transition bg-cyan-600 hover:bg-cyan-500 text-white"
                disabled={sampleLoading}
              >
                <span className="hidden sm:inline">🎲 샘플</span>
                <span className="sm:hidden">🎲</span>
              </button>
              <button
                onClick={() => {
                  setTestMode('instant');
                  setTestModalOpen(true);
                  setTestLogs([]);
                  setTestInProgress(true);

                  const runInstant = async () => {
                    try {
                      const response = await fetch('/api/automation/trigger-auto-schedule-stream', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });

                      if (!response.ok) {
                        const error = await response.json();
                        setTestLogs(prev => [...prev, `❌ 에러: ${error.error}`]);
                        setTestInProgress(false);
                        return;
                      }

                      const reader = response.body?.getReader();
                      const decoder = new TextDecoder();

                      if (!reader) {
                        setTestLogs(prev => [...prev, '❌ 스트림 읽기 실패']);
                        setTestInProgress(false);
                        return;
                      }

                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const text = decoder.decode(value);
                        const lines = text.split('\n').filter(line => line.trim());

                        for (const line of lines) {
                          if (line.startsWith('data: ')) {
                            const message = line.slice(6);
                            if (message === '[DONE]') {
                              setTestInProgress(false);
                              fetchData();
                            } else {
                              setTestLogs(prev => [...prev, message]);
                            }
                          }
                        }
                      }
                    } catch (error: any) {
                      setTestLogs(prev => [...prev, `❌ 에러: ${error.message}`]);
                      setTestInProgress(false);
                    }
                  };

                  runInstant();
                }}
                className="px-2 sm:px-2.5 py-1 rounded text-xs font-semibold transition bg-amber-600 hover:bg-amber-500 text-white"
                disabled={testInProgress}
              >
                <span className="hidden sm:inline">⚡ 즉시</span>
                <span className="sm:hidden">⚡</span>
              </button>
          </div>

          {/* 자동화 및 큐 초기화 */}
          {/* 스케줄러 상태 (자동화 처리) */}
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 border border-slate-700">
              <span className="text-slate-300 text-xs font-medium whitespace-nowrap">⚙️ 자동화</span>
              <div className={`w-2 h-2 rounded-full animate-pulse ${schedulerStatus?.isRunning ? 'bg-red-500' : 'bg-gray-500'}`}></div>
              <span className={`text-sm whitespace-nowrap ${schedulerStatus?.isRunning ? 'text-red-500 font-bold' : 'text-gray-400 font-medium'}`}>
                {schedulerStatus?.isRunning ? 'ON' : 'OFF'}
              </span>
              <button
                onClick={toggleScheduler}
                className={`px-2 sm:px-2.5 py-1 rounded text-xs font-semibold transition ${
                  schedulerStatus?.isRunning
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {schedulerStatus?.isRunning ? '중지' : '시작'}
              </button>
            </div>

            {/* 큐 초기화 버튼 */}
            <button
              onClick={async () => {
                if (!confirm('⚠️ 큐의 모든 작업을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')) {
                  return;
                }

                try {
                  const response = await fetch('/api/automation/cleanup', {
                    method: 'DELETE'
                  });
                  const result = await response.json();

                  if (response.ok) {
                    alert(`✅ ${result.message}`);
                    await fetchData();
                  } else {
                    alert(`❌ 실패: ${result.error}`);
                  }
                } catch (error: any) {
                  console.error('큐 초기화 실패:', error);
                  alert(`❌ 큐 초기화 중 오류가 발생했습니다: ${error.message}`);
                }
              }}
              className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition bg-red-600 hover:bg-red-500 text-white"
            >
              🗑️ 전체삭제
            </button>
        </div>

        {/* 채널 연결 상태 */}
        {channels.length === 0 && (
          <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg px-3 py-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
            <span className="text-yellow-300 text-sm">⚠️ 연결된 유튜브 채널이 없습니다</span>
            <button
              onClick={() => router.push('/settings/youtube')}
              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-semibold transition"
            >
              채널 연결하기
            </button>
          </div>
        )}

        {/* 제목 리스트 관리 */}
        <div className="bg-slate-800 rounded-lg p-3 sm:p-6 mb-6 sm:mb-8 border border-slate-700">
          {/* 제목 추가 버튼/폼 */}
          {!showAddForm ? (
            <button
              onClick={() => {
                setShowAddForm(true);
                // 폼 열 때 기본 스케줄 시간 설정
                setNewTitle(prev => ({ ...prev, scheduleTime: getDefaultScheduleTime() }));
              }}
              className="mb-6 w-full px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition"
            >
              + 새 제목 추가
            </button>
          ) : (
            <div id="new-title-form" className="mb-6 p-4 bg-slate-700 rounded-lg border-2 border-green-500">
              <h3 className="text-lg font-semibold text-white mb-3">새 제목 추가</h3>
              <div className="space-y-4 mb-4">
                <div>
                  <input
                    type="text"
                    placeholder="제목"
                    value={newTitle.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className={`w-full px-4 py-2 bg-slate-600 text-white rounded-lg border focus:outline-none ${
                      titleError ? 'border-red-500' : 'border-slate-500 focus:border-blue-500'
                    }`}
                  />
                  {titleError && (
                    <p className="text-red-400 text-xs mt-1">⚠️ {titleError}</p>
                  )}
                </div>

                {/* 최근 제목 4개 */}
                {recentTitles.length > 0 && (
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-400">
                      📝 최근 사용한 제목 (클릭하여 재사용)
                    </label>
                    <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
                      <div className="flex flex-wrap gap-2">
                        {recentTitles.map((title, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleTitleChange(title)}
                            className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-600/40 hover:text-emerald-100"
                            title={title}
                          >
                            {title.length > 30 ? title.substring(0, 30) + '...' : title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <select
                    value={newTitle.promptFormat}
                    onChange={(e) => {
                      const type = e.target.value;
                      const model = getDefaultModelByType(type); // ✅ 통일된 함수 사용
                      const mediaMode = getDefaultMediaModeByType(type); // ✅ 타입별 기본 미디어 모드
                      // ⭐ 타입별 기본값 자동 설정:
                      // - 롱폼: crawl (imageFX+whisk)
                      // - 숏폼/상품: imagen3
                      // - 상품: 카테고리도 '상품'으로
                      setNewTitle(prev => ({
                        ...prev,
                        promptFormat: type,
                        aiModel: model,
                        category: type === 'product' ? '상품' : prev.category,
                        mediaMode: mediaMode,
                        autoConvert: type === 'longform' ? prev.autoConvert : false
                      }));
                      localStorage.setItem('automation_selected_type', type);
                      localStorage.setItem('automation_selected_model', model);
                      localStorage.setItem('automation_selected_media_mode', mediaMode);
                      if (type === 'product') {
                        localStorage.setItem('automation_selected_category', '상품');
                      }
                    }}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  >
                    <option value="longform">롱폼</option>
                    <option value="shortform">숏폼</option>
                    <option value="product">상품</option>
                  </select>
                  <select
                    value={newTitle.category}
                    onChange={(e) => {
                      const category = e.target.value;
                      setNewTitle(prev => ({ ...prev, category }));
                      localStorage.setItem('automation_selected_category', category);
                    }}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">🎭 카테고리 선택 (선택)</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="태그 (쉼표로 구분)"
                    value={newTitle.tags}
                    onChange={(e) => setNewTitle({ ...newTitle, tags: e.target.value })}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* 롱폼→숏폼 자동변환 옵션 (롱폼 선택 시에만) */}
                {newTitle.promptFormat === 'longform' && (
                  <label className="flex items-center gap-3 px-4 py-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition group">
                    <input
                      type="checkbox"
                      checked={newTitle.autoConvert || false}
                      onChange={(e) => setNewTitle(prev => ({ ...prev, autoConvert: e.target.checked }))}
                      className="w-5 h-5 rounded border-slate-500 bg-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-800"
                    />
                    <div>
                      <span className="text-white font-semibold group-hover:text-cyan-400 transition">
                        🔄 롱폼 완료 후 숏폼 자동생성
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        롱폼 영상 완료 시 이미지를 9:16 비율로 자동 변환하여 숏폼도 함께 생성합니다
                      </p>
                    </div>
                  </label>
                )}

                {newTitle.promptFormat === 'product' && (
                  <>
                    {/* 상품정보가 없을 때만 URL 입력 필드 표시 */}
                    {!currentProductData && (
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="쿠팡 상품 URL 입력"
                          value={newTitle.productUrl}
                          onChange={(e) => setNewTitle({ ...newTitle, productUrl: e.target.value })}
                          className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                          disabled={!!currentProductData} // Disable if a product is already selected
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!newTitle.productUrl) {
                              alert('상품 URL을 입력해주세요');
                              return;
                            }

                            try {
                              const response = await fetch('/api/coupang/deeplink', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: newTitle.productUrl })
                              });

                              if (!response.ok) {
                                throw new Error('상품 정보를 가져올 수 없습니다');
                              }

                              const data = await response.json();

                              if (data.success && data.data) {
                                const productInfo = {
                                  productName: data.data.productName || newTitle.title,
                                  productPrice: data.data.productPrice,
                                  productImage: data.data.productImage,
                                  productUrl: data.data.shortenUrl || newTitle.productUrl,
                                  productId: data.data.productId
                                };

                                setCurrentProductData(productInfo);
                                setNewTitle({
                                  ...newTitle,
                                  title: data.data.productName || newTitle.title,
                                  productUrl: data.data.shortenUrl || newTitle.productUrl
                                });
                                alert('✅ 상품 정보를 가져왔습니다');
                              } else {
                                throw new Error('상품 정보가 없습니다');
                              }
                            } catch (error: any) {
                              console.error('상품 정보 가져오기 실패:', error);
                              alert(`❌ 상품 정보 가져오기 실패: ${error.message}`);
                            }
                          }}
                          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition whitespace-nowrap"
                          disabled={!!currentProductData} // Disable if a product is already selected
                        >
                          🛍️ 상품 정보 가져오기
                        </button>
                      </div>
                    )}

                    {/* 상품정보 미리보기 */}
                    {currentProductData && (
                      <div className="rounded-lg bg-emerald-900/30 border border-emerald-500/50 p-4">
                        <div className="flex justify-between items-start mb-3">
                          <p className="text-sm font-semibold text-emerald-400">🛍️ 상품 정보</p>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentProductData(null);
                              setNewTitle({ ...newTitle, productUrl: '' });
                            }}
                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
                          >
                            초기화
                          </button>
                        </div>
                        <div className="flex gap-3">
                          {currentProductData.productImage && (
                            <img
                              src={currentProductData.productImage}
                              alt="상품 이미지"
                              className="w-20 h-20 object-cover rounded border border-emerald-500"
                            />
                          )}
                          <div className="flex-1 min-w-0 space-y-1 text-xs">
                            {currentProductData.productName && (
                              <p className="text-slate-200 font-semibold">
                                {currentProductData.productName}
                              </p>
                            )}
                            {currentProductData.productPrice && (
                              <p className="text-emerald-300">
                                {currentProductData.productPrice}
                              </p>
                            )}
                            {currentProductData.productUrl && (
                              <a
                                href={currentProductData.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline block truncate"
                              >
                                {currentProductData.productUrl}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 채널, 대본 생성, 미디어 생성 방식 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">채널</label>
                    {channels.length > 0 ? (
                      <select
                        value={newTitle.channel || channels[0].channelId}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          setNewTitle({ ...newTitle, channel: selectedId });
                          // localStorage에 선택한 채널 저장 (실제 YouTube 채널 ID)
                          localStorage.setItem('automation_selected_channel', selectedId);
                          console.log('💾 채널 선택 저장:', selectedId);
                        }}
                        className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                      >
                        {channels.map((ch: any) => (
                          <option key={ch.channelId} value={ch.channelId} className="bg-slate-700 text-white">
                            {ch.channelTitle || ch.title || ch.channelId}
                            {ch.isDefault && ' ⭐'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full px-4 py-2 bg-red-900/30 text-red-300 rounded-lg border border-red-500 text-sm">
                        ⚠️ 채널 없음
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">대본 생성</label>
                    <select
                      value={newTitle.scriptMode}
                      onChange={(e) => setNewTitle({ ...newTitle, scriptMode: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="chrome">크롬창</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">미디어 생성</label>
                    <select
                      value={newTitle.mediaMode}
                      onChange={(e) => {
                        const mediaMode = e.target.value;
                        setNewTitle({ ...newTitle, mediaMode });
                        localStorage.setItem('automation_selected_media_mode', mediaMode);
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="upload">직접 업로드</option>
                      <option value="crawl">이미지 크롤링</option>
                      <option value="dalle3">DALL-E 3</option>
                      <option value="imagen3">Imagen 3</option>
                      <option value="sora2">SORA 2</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">🤖 AI 모델</label>
                    <select
                      value={newTitle.aiModel}
                      onChange={(e) => {
                        const aiModel = e.target.value;
                        setNewTitle(prev => ({ ...prev, aiModel }));
                        localStorage.setItem('automation_selected_model', aiModel);
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="claude">Claude (기본)</option>
                      <option value="chatgpt">ChatGPT</option>
                      <option value="gemini">Gemini</option>
                      <option value="grok">Grok</option>
                    </select>
                  </div>
                </div>

                {/* TTS 설정 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">🎙️ TTS 음성</label>
                    <select
                      value={newTitle.ttsVoice || getDefaultTtsByType(newTitle.promptFormat)}
                      onChange={(e) => setNewTitle(prev => ({ ...prev, ttsVoice: e.target.value }))}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <optgroup label="한국어 여성">
                        <option value="ko-KR-SunHiNeural">선희 {newTitle.promptFormat !== 'longform' && '(기본)'}</option>
                        <option value="ko-KR-SoonBokNeural">순복 {newTitle.promptFormat === 'longform' && '(기본)'}</option>
                        <option value="ko-KR-JiMinNeural">지민</option>
                        <option value="ko-KR-YuJinNeural">유진</option>
                      </optgroup>
                      <optgroup label="한국어 남성">
                        <option value="ko-KR-InJoonNeural">인준</option>
                        <option value="ko-KR-BongJinNeural">봉진</option>
                        <option value="ko-KR-GookMinNeural">국민</option>
                        <option value="ko-KR-HyunsuNeural">현수</option>
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">⚡ TTS 속도</label>
                    <select
                      value={newTitle.ttsSpeed || '+0%'}
                      onChange={(e) => setNewTitle(prev => ({ ...prev, ttsSpeed: e.target.value }))}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="-20%">매우 느리게 (-20%)</option>
                      <option value="-10%">느리게 (-10%)</option>
                      <option value="-5%">약간 느리게 (-5%)</option>
                      <option value="+0%">보통 (기본)</option>
                      <option value="+5%">약간 빠르게 (+5%)</option>
                      <option value="+10%">빠르게 (+10%)</option>
                      <option value="+20%">매우 빠르게 (+20%)</option>
                    </select>
                  </div>
                </div>

                {/* 유튜브 업로드 설정 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">유튜브 업로드</label>
                    <select
                      value={newTitle.youtubeSchedule}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'schedule') {
                          // 현재 시간 + 3분을 기본값으로 설정 (로컬 시간)
                          const now = new Date(Date.now() + 3 * 60 * 1000);
                          const year = now.getFullYear();
                          const month = String(now.getMonth() + 1).padStart(2, '0');
                          const day = String(now.getDate()).padStart(2, '0');
                          const hours = String(now.getHours()).padStart(2, '0');
                          const minutes = String(now.getMinutes()).padStart(2, '0');
                          const defaultTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                          setNewTitle(prev => ({ ...prev, youtubeSchedule: value, youtubePublishAt: defaultTime }));
                        } else {
                          setNewTitle(prev => ({ ...prev, youtubeSchedule: value }));
                        }
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="immediate">즉시 업로드</option>
                      <option value="scheduled">예약 업로드</option>
                    </select>
                    {newTitle.youtubeSchedule === 'immediate' && (
                      <p className="text-xs text-slate-400 mt-1">영상 생성 완료 후 즉시 유튜브에 업로드됩니다</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">공개 설정</label>
                    <select
                      value={newTitle.youtubePrivacy}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewTitle(prev => ({ ...prev, youtubePrivacy: value }));
                        localStorage.setItem('automation_selected_privacy', value);
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="public">🌐 공개 (Public)</option>
                      <option value="unlisted">🔗 링크 공유 (Unlisted)</option>
                      <option value="private">🔒 비공개 (Private)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      {newTitle.youtubePrivacy === 'public' && '누구나 검색하고 볼 수 있습니다'}
                      {newTitle.youtubePrivacy === 'unlisted' && '링크가 있는 사람만 볼 수 있습니다'}
                      {newTitle.youtubePrivacy === 'private' && '본인만 볼 수 있습니다'}
                    </p>
                  </div>
                </div>

                {newTitle.youtubeSchedule === 'schedule' && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">유튜브 공개 예약 시간</label>
                    <DatePicker
                      selected={newTitle.youtubePublishAt ? new Date(newTitle.youtubePublishAt) : null}
                      onChange={(date: Date | null) => {
                        if (date) {
                          setNewTitle(prev => ({ ...prev, youtubePublishAt: date.toISOString().slice(0, 16) }));
                        }
                      }}
                      showTimeSelect
                      timeFormat="HH:mm"
                      timeIntervals={15}
                      dateFormat="yyyy-MM-dd HH:mm"
                      minDate={new Date(Date.now() + 3 * 60 * 1000)}
                      locale={ko}
                      placeholderText="날짜와 시간 선택"
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                      calendarClassName="bg-slate-700 border-slate-600"
                    />
                    <p className="text-xs text-yellow-400 mt-1">⚠️ 비디오는 즉시 업로드되고 private 상태로 유지되다가 설정한 시간에 공개됩니다 (최소 3분 이후)</p>
                  </div>
                )}

                {/* 스케줄 시간 입력 */}
                <div>
                  <label className="text-sm text-slate-300 block mb-2">
                    📅 스케줄 (선택)
                    <span className={`text-xs ml-2 ${settings?.auto_title_generation === 'true' ? 'text-green-400' : 'text-yellow-400'}`}>
                      [자동 제목 생성 {settings?.auto_title_generation === 'true' ? 'ON' : 'OFF'}]
                    </span>
                    <span className={`text-xs ml-1 ${schedulerStatus?.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                      [자동화 {schedulerStatus?.isRunning ? 'ON' : 'OFF'}]
                    </span>
                  </label>
                  <DatePicker
                    selected={newTitle.scheduleTime ? new Date(newTitle.scheduleTime) : null}
                    onChange={(date: Date | null) => {
                      if (date) {
                        setNewTitle({ ...newTitle, scheduleTime: date.toISOString().slice(0, 16) });
                      } else {
                        setNewTitle({ ...newTitle, scheduleTime: '' });
                      }
                    }}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="yyyy-MM-dd HH:mm"
                    minDate={new Date()}
                    locale={ko}
                    placeholderText="날짜와 시간 선택 (선택사항)"
                    isClearable
                    className="w-full px-4 py-2 rounded-lg border focus:outline-none bg-slate-600 text-white border-slate-500 focus:border-blue-500"
                    calendarClassName="bg-slate-700 border-slate-600"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    비워두면 제목만 추가됩니다 (과거 시간은 선택 불가)
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => addTitle()}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 sm:py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition text-base sm:text-sm"
                >
                  {isSubmitting ? '추가 중...' : '추가'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setCurrentProductData(null); // 상품정보 초기화
                    // 채널 선택은 유지 (localStorage 기반)
                    const currentChannel = newTitle.channel;
                    setNewTitle({
                      title: '',
                      promptFormat: getSelectedType(), // localStorage에서 불러온 타입 유지
                      category: getSelectedCategory(), // localStorage에서 불러온 카테고리 유지
                      tags: '',
                      productUrl: '',
                      scheduleTime: '',
                      channel: currentChannel, // 현재 선택된 채널 유지
                      scriptMode: 'chrome',
                      mediaMode: getSelectedMediaMode(), // localStorage에서 불러온 미디어 모드 유지
                      aiModel: getDefaultModelByType(getSelectedType()), // ✅ 타입에 따른 모델 자동 설정
                      youtubeSchedule: 'immediate',
                      youtubePublishAt: '',
                      youtubePrivacy: getSelectedPrivacy(), // localStorage에서 불러온 공개 설정 유지
                      ttsVoice: getDefaultTtsByType(getSelectedType()), // ✅ 타입에 따른 TTS 자동 설정
                      ttsSpeed: '+0%',
                      autoConvert: false
                    });
                  }}
                  className="flex-1 px-6 py-3 sm:py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition text-base sm:text-sm"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 메인 탭 - 모바일: 4열 세로정렬 / PC: 4열 가로정렬 크게 */}
          <div className="grid grid-cols-4 gap-1 md:gap-2 mb-4">
            <button
              onClick={() => setMainTab('queue')}
              className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg font-bold text-[10px] md:text-base transition ${
                mainTab === 'queue'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span>📋</span>
              <span className="whitespace-nowrap">자동화 큐</span>
            </button>
            <button
              onClick={() => setMainTab('schedule-management')}
              className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg font-bold text-[10px] md:text-base transition ${
                mainTab === 'schedule-management'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span>📅</span>
              <span className="whitespace-nowrap">채널별 주기관리</span>
            </button>
            <button
              onClick={() => setMainTab('monitoring')}
              className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg font-bold text-[10px] md:text-base transition ${
                mainTab === 'monitoring'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span>📊</span>
              <span className="whitespace-nowrap">현황판</span>
            </button>
            <button
              onClick={() => setMainTab('title-pool')}
              className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg font-bold text-[10px] md:text-base transition ${
                mainTab === 'title-pool'
                  ? 'bg-orange-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span>🎯</span>
              <span className="whitespace-nowrap">제목 풀</span>
            </button>
          </div>

          {/* 큐 서브 탭 (8개 탭: 예약 → 대본 → 이미지 → 영상 → 유튜브 → 중지 → 실패 → 완료) */}
          {mainTab === 'queue' && (
            <div>
              {/* 모바일/PC: 8열 한 줄 정렬 */}
              <div className="mb-2">
                <div className="grid grid-cols-8 gap-1">
                  <button
                    onClick={() => handleQueueTabChangeSmooth('schedule')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'schedule'
                        ? 'bg-blue-600 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>📅</span>
                    <span>{QUEUE_TAB_LABELS['schedule']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.schedule ?? queueCounts.schedule}</span>
                  </button>
                  <button
                    onClick={() => handleQueueTabChangeSmooth('script')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'script'
                        ? 'bg-yellow-600 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>📝</span>
                    <span>{QUEUE_TAB_LABELS['script']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.script ?? queueCounts.script}</span>
                  </button>
                  <button
                    onClick={() => handleQueueTabChangeSmooth('image')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'image'
                        ? 'bg-purple-600 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>🖼️</span>
                    <span>{QUEUE_TAB_LABELS['image']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.image ?? queueCounts.image}</span>
                  </button>
                  <button
                    onClick={() => handleQueueTabChangeSmooth('video')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'video'
                        ? 'bg-orange-600 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>🎬</span>
                    <span>{QUEUE_TAB_LABELS['video']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.video ?? queueCounts.video}</span>
                  </button>
                  <button
                    onClick={() => handleQueueTabChangeSmooth('youtube')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'youtube'
                        ? 'bg-red-500 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>📤</span>
                    <span>{QUEUE_TAB_LABELS['youtube']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.youtube ?? queueCounts.youtube}</span>
                  </button>
                  <button
                    onClick={() => handleQueueTabChangeSmooth('cancelled')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'cancelled'
                        ? 'bg-gray-600 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>🚫</span>
                    <span>{QUEUE_TAB_LABELS['cancelled']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.cancelled ?? queueCounts.cancelled ?? 0}</span>
                  </button>
                  <button
                    onClick={() => handleQueueTabChangeSmooth('failed')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'failed'
                        ? 'bg-red-700 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>❌</span>
                    <span>{QUEUE_TAB_LABELS['failed']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.failed ?? queueCounts.failed}</span>
                  </button>
                  <button
                    onClick={() => handleQueueTabChangeSmooth('completed')}
                    className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2 px-1 md:py-3 md:px-4 rounded-lg text-[10px] md:text-base font-semibold transition-all duration-200 ${
                      queueTab === 'completed'
                        ? 'bg-green-600 text-white scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span>✅</span>
                    <span>{QUEUE_TAB_LABELS['completed']}</span>
                    <span className="opacity-70 tabular-nums">{serverCounts?.completed ?? queueCounts.completed}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 채널별 주기관리 탭 */}
          {mainTab === 'schedule-management' && (
            <div>
              {/* 주기관리 서브 탭 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  onClick={() => setScheduleManagementTab('channel-settings')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    scheduleManagementTab === 'channel-settings'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  ⚙️ 채널 설정
                </button>
                <button
                  onClick={() => setScheduleManagementTab('category-management')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    scheduleManagementTab === 'category-management'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  id="category-management"
                >
                  🏷️ 카테고리 관리
                </button>
                <button
                  onClick={() => setScheduleManagementTab('calendar')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    scheduleManagementTab === 'calendar'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  📆 달력
                </button>
              </div>

              {/* 채널 설정 */}
              {scheduleManagementTab === 'channel-settings' && (
                <div>
                  <ChannelSettings />
                </div>
              )}

              {/* 카테고리 관리 */}
              {scheduleManagementTab === 'category-management' && (
                <div>
                  <CategoryManagement onCategoryChange={fetchCategories} />
                </div>
              )}

              {/* 스케줄 달력 */}
              {scheduleManagementTab === 'calendar' && (
                <div>
                  <ScheduleCalendar />
                </div>
              )}
            </div>
          )}

          {/* 제목 풀 */}
          {mainTab === 'title-pool' && (
            <div className="space-y-4">
              {/* 통계 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {poolStats.map((stat: any) => (
                  <div key={stat.category} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                    <div className="text-sm text-white mb-2">{stat.category}</div>
                    <div className="text-3xl font-bold text-white mb-2">{stat.total}</div>
                    <div className="text-sm text-slate-200">
                      미사용: {stat.unused}개 | 평균: {(Number(stat.avg_score) || 0).toFixed(1)}점
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      최고: {Number(stat.max_score) || 0}점
                    </div>
                  </div>
                ))}
              </div>

              {/* 제목 생성 버튼 */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={async () => {
                    if (!confirm('사용됨 상태인 모든 제목을 미사용으로 되돌리시겠습니까?')) return;
                    try {
                      const res = await fetch('/api/admin/title-pool/reset-all', { method: 'POST' });
                      if (res.ok) {
                        const data = await res.json();
                        alert(`${data.count}개 제목이 미사용으로 변경되었습니다.`);
                        fetchTitlePool();
                      }
                    } catch (e) {
                      console.error('모두 되돌리기 실패:', e);
                    }
                  }}
                  className="px-6 py-3 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold transition"
                >
                  ↩️ 모두 되돌리기
                </button>
                <button
                  onClick={() => generateTitlePool()}
                  disabled={isGenerating}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white rounded-lg font-bold transition"
                >
                  {isGenerating ? '⏳ 생성 중...' : '🔄 AI로 제목 생성'}
                </button>
              </div>

              {/* 필터 */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm text-white mb-2">카테고리</label>
                    <select
                      value={poolCategory}
                      onChange={(e) => setPoolCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    >
                      <option value="all">전체</option>
                      {poolStats.map((stat: any) => (
                        <option key={stat.category} value={stat.category}>
                          {stat.category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm text-white mb-2">최소 점수</label>
                    <input
                      type="number"
                      value={poolMinScore}
                      onChange={(e) => setPoolMinScore(Number(e.target.value))}
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                  </div>

                  <button
                    onClick={() => fetchTitlePool()}
                    disabled={poolLoading}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-lg font-semibold transition"
                  >
                    {poolLoading ? '조회 중...' : '🔍 조회'}
                  </button>
                </div>
              </div>

              {/* 제목 목록 */}
              <div className="bg-slate-800 rounded-lg border border-slate-700">
                <div className="p-4 border-b border-slate-700">
                  <h2 className="text-xl font-bold text-white">
                    제목 목록 ({poolTitles.length}개 / 전체 {poolTotal}개)
                  </h2>
                </div>

                {poolLoading && poolTitles.length === 0 ? (
                  <div className="p-8 text-center text-white">로딩 중...</div>
                ) : poolTitles.length === 0 ? (
                  <div className="p-8 text-center text-white">
                    제목 풀이 비어있습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">점수</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">카테고리</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">제목</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">상태</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">생성일</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">액션</th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-800">
                        {poolTitles.map((title: any, index: number) => (
                          <tr key={`pool-${title.titleId || title.id || index}`} className="border-b border-slate-700 hover:bg-slate-700">
                            <td className="px-4 py-3">
                              <span className={`font-bold ${
                                title.score >= 95 ? 'text-green-400' :
                                title.score >= 90 ? 'text-blue-400' :
                                'text-yellow-400'
                              }`}>
                                {title.score}점
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white">
                              {title.category}
                            </td>
                            <td className="px-4 py-3 text-white">
                              {title.title}
                            </td>
                            <td className="px-4 py-3">
                              {title.used === 1 ? (
                                <span className="text-xs bg-slate-600 text-slate-300 px-2 py-1 rounded">
                                  사용됨
                                </span>
                              ) : (
                                <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                                  미사용
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-white">
                              {new Date(title.createdAt).toLocaleString('ko-KR')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                {title.used === 1 && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/admin/title-pool/${title.titleId}`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ used: 0 })
                                        });
                                        if (res.ok) {
                                          // 로컬 상태만 업데이트 (깜빡임 방지)
                                          setPoolTitles(prev => prev.map(t =>
                                            t.titleId === title.titleId
                                              ? { ...t, used: 0 }
                                              : t
                                          ));
                                        }
                                      } catch (e) {
                                        console.error('되돌리기 실패:', e);
                                      }
                                    }}
                                    className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-2 py-1 rounded"
                                  >
                                    되돌리기
                                  </button>
                                )}
                                {title.used !== 1 && (
                                  <>
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/admin/title-pool/${title.titleId}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ used: 1 })
                                          });
                                          if (res.ok) {
                                            // 로컬 상태만 업데이트 (깜빡임 방지)
                                            setPoolTitles(prev => prev.map(t =>
                                              t.titleId === title.titleId
                                                ? { ...t, used: 1 }
                                                : t
                                            ));
                                          }
                                        } catch (e) {
                                          console.error('사용하기 실패:', e);
                                        }
                                      }}
                                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                                    >
                                      사용하기
                                    </button>
                                    <button
                                      onClick={async () => {
                                        try {
                                          // 자동화 등록 및 즉시 실행 (첫 번째 채널 자동 선택)
                                          const defaultChannel = channels[0]?.channelId;
                                          const res = await fetch('/api/title-pool/register', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              titleId: title.titleId,
                                              title: title.title,
                                              category: title.category,
                                              channel: defaultChannel,
                                              score: title.score
                                            })
                                          });
                                          if (res.ok) {
                                            const data = await res.json();
                                            console.log('✅ 자동화 등록 성공:', data);
                                            // 로컬 상태 업데이트 (used 마킹)
                                            setPoolTitles(prev => prev.map(t =>
                                              t.titleId === title.titleId
                                                ? { ...t, used: 1 }
                                                : t
                                            ));
                                            // 생성된 제목 목록 새로고침
                                            fetchData();
                                            alert(`✅ "${title.title}" 자동화 시작!`);
                                          } else {
                                            const errData = await res.json();
                                            alert(`❌ 등록 실패: ${errData.error || '알 수 없는 오류'}`);
                                          }
                                        } catch (e) {
                                          console.error('자동화 등록 실패:', e);
                                          alert('❌ 자동화 등록 중 오류 발생');
                                        }
                                      }}
                                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                                    >
                                      자동화
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* 더보기 버튼 */}
                    {poolHasMore && (
                      <div className="p-4 text-center border-t border-slate-700">
                        <button
                          onClick={() => fetchTitlePool(true)}
                          disabled={poolLoading}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50"
                        >
                          {poolLoading ? '로딩 중...' : `더보기 (${poolTotal - poolTitles.length}개 남음)`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 생성된 제목 목록 (video_titles) */}
              <div className="bg-slate-800 rounded-lg border border-slate-700">
                <div className="p-4 border-b border-slate-700">
                  <h2 className="text-xl font-bold text-white">
                    생성된 제목 ({titles.length}개)
                  </h2>
                </div>

                {titles.length === 0 ? (
                  <div className="p-8 text-center text-white">생성된 제목이 없습니다.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">제목</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">점수</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">카테고리</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">상태</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">모델</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">생성일</th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-800">
                        {titles.slice(0, 50).map((title: any, index: number) => (
                          <tr key={`title-${title.titleId || title.id}-${index}`} className="border-b border-slate-700 hover:bg-slate-700">
                            <td className="px-4 py-3 text-white">{title.title}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`font-bold ${
                                (title.titleScore ?? 0) >= 95 ? 'text-green-400' :
                                (title.titleScore ?? 0) >= 90 ? 'text-blue-400' :
                                (title.titleScore ?? 0) >= 80 ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                {title.titleScore ?? 0}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white">{title.category}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs text-white px-2 py-1 rounded ${
                                title.status === 'completed' ? 'bg-green-600' :
                                title.status === 'processing' ? 'bg-blue-600' :
                                matchesQueueTab(title.status, 'schedule') ? 'bg-yellow-600' :
                                isFailedStatus(title.status) ? 'bg-red-600' :
                                'bg-slate-600'
                              }`}>
                                {STATUS_LABELS[title.status] || title.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white">{title.aiModel}</td>
                            <td className="px-4 py-3 text-sm text-white">
                              {new Date(title.createdAt).toLocaleString('ko-KR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 제목 리스트 */}
          {mainTab === 'queue' && (
            <div className="space-y-3">
              {!Array.isArray(titles) || titles.length === 0 ? (
                <p className="text-slate-400">등록된 제목이 없습니다</p>
              ) : displayedTitles.length === 0 ? (
                <p className="text-slate-400">해당 탭에 표시할 항목이 없습니다</p>
              ) : (
                (() => {
                  const safeSchedules = Array.isArray(allSchedules) ? allSchedules : [];
                  return displayedTitles.map((title, idx) => {
                    const titleSchedules = safeSchedules.filter(s => s.taskId === (title.taskId || title.id));
                    const titleSchedule = titleSchedules[0] || title; // 첫 번째 스케줄 (상태 참조용), 없으면 title 자체 사용
                    // ⭐ getAllSchedule에서 이미 status를 포함하므로 title.status 직접 사용
                    const scheduleStatus = title?.status || 'pending'; // task_queue.status
                    const isEditing = editingId === (title.taskId || title.id);

                    if (isEditing) {
                      return (
                    <div key={`edit-${title.titleId || title.id}-${idx}`} className="p-4 bg-slate-700 rounded-lg border-2 border-blue-500">
                      {/* 제목 수정 폼 */}
                      <h3 className="text-white font-semibold mb-3">제목 수정</h3>
                      <div className="space-y-3 mb-4">
                        {/* 제목 */}
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">제목</label>
                          <input
                            type="text"
                            value={editForm.title || ''}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* 타입, 카테고리, 태그 */}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">타입</label>
                            <select
                              value={editForm.promptFormat || 'longform'}
                              onChange={(e) => {
                                const promptFormat = e.target.value;
                                const aiModel = getDefaultModelByType(promptFormat);
                                // ⚠️ TTS 음성은 사용자가 선택한 값 유지 (Type 변경 시에도 덮어쓰지 않음)
                                setEditForm({ ...editForm, promptFormat, aiModel });
                              }}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="longform">롱폼</option>
                              <option value="shortform">숏폼</option>
                              <option value="product">상품</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">
                              카테고리
                              <span className="ml-2 text-[10px] text-yellow-400">(현재: {editForm.category || '없음'})</span>
                            </label>
                            <select
                              value={editForm.category || ''}
                              onChange={(e) => {
                                const newCategory = e.target.value;
                                console.log('🔄 [카테고리 변경]', {
                                  이전: editForm.category,
                                  새값: newCategory
                                });
                                setEditForm({ ...editForm, category: newCategory });
                              }}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="">선택 안함</option>
                              {categories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">태그</label>
                            <input
                              type="text"
                              placeholder="태그"
                              value={editForm.tags || ''}
                              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        {/* ⚠️ CRITICAL: 수정 폼 - 상품 정보 표시 (product 타입) - 제거하면 안됩니다! */}
                        {/* ⭐ 통일 구조: { productId, title, price, thumbnail, deepLink, category } */}
                        {editForm.promptFormat === 'product' && (
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">상품 정보</label>
                            {editForm.product_data ? (
                              <div className="w-full px-4 py-3 bg-emerald-900/30 text-emerald-200 rounded-lg border border-emerald-500/50">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-emerald-400 font-semibold">상품명:</span>
                                    <p className="text-white mt-1">{editForm.product_data.title || editForm.product_data.productName || editForm.title}</p>
                                  </div>
                                  {(editForm.product_data.price || editForm.product_data.productPrice) && (
                                    <div>
                                      <span className="text-emerald-400 font-semibold">가격:</span>
                                      <p className="text-white mt-1">{(editForm.product_data.price || editForm.product_data.productPrice)?.toLocaleString()}원</p>
                                    </div>
                                  )}
                                  {(editForm.product_data.thumbnail || editForm.product_data.productImage) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">이미지:</span>
                                      <img
                                        src={editForm.product_data.thumbnail || editForm.product_data.productImage}
                                        alt="상품 이미지"
                                        className="mt-2 w-32 h-32 object-cover rounded border border-emerald-500"
                                      />
                                    </div>
                                  )}
                                  {(editForm.product_data.deepLink || editForm.product_data.productUrl) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">URL (딥링크):</span>
                                      <a
                                        href={editForm.product_data.deepLink || editForm.product_data.productUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 mt-1 text-xs break-all block underline"
                                      >
                                        {editForm.product_data.deepLink || editForm.product_data.productUrl}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="w-full px-4 py-2 bg-slate-700 text-slate-400 rounded-lg border border-slate-600 text-sm">
                                상품 정보가 없습니다
                              </div>
                            )}
                          </div>
                        )}

                        {/* ⚠️ CRITICAL: 수정 폼 - 상품 정보 표시 (product-info 타입) - 제거하면 안됩니다! */}
                        {/* ⭐ 통일 구조: { productId, title, price, thumbnail, deepLink, category } */}
                        {editForm.promptFormat === 'product-info' && (
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">상품 정보</label>
                            {editForm.product_data ? (
                              <div className="w-full px-4 py-3 bg-emerald-900/30 text-emerald-200 rounded-lg border border-emerald-500/50">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-emerald-400 font-semibold">상품명:</span>
                                    <p className="text-white mt-1">{editForm.product_data.title || editForm.product_data.productName || editForm.title}</p>
                                  </div>
                                  {(editForm.product_data.price || editForm.product_data.productPrice) && (
                                    <div>
                                      <span className="text-emerald-400 font-semibold">가격:</span>
                                      <p className="text-white mt-1">{(editForm.product_data.price || editForm.product_data.productPrice)?.toLocaleString()}원</p>
                                    </div>
                                  )}
                                  {(editForm.product_data.thumbnail || editForm.product_data.productImage) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">이미지:</span>
                                      <img
                                        src={editForm.product_data.thumbnail || editForm.product_data.productImage}
                                        alt="상품 이미지"
                                        className="mt-2 w-32 h-32 object-cover rounded border border-emerald-500"
                                      />
                                    </div>
                                  )}
                                  {(editForm.product_data.deepLink || editForm.product_data.productUrl) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">URL (딥링크):</span>
                                      <p className="text-white mt-1 text-xs break-all">{editForm.product_data.deepLink || editForm.product_data.productUrl}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="w-full px-4 py-2 bg-slate-700 text-slate-400 rounded-lg border border-slate-600 text-sm">
                                상품 정보가 없습니다
                              </div>
                            )}
                          </div>
                        )}

                        {/* 채널, 대본 생성, 미디어 생성, AI 모델 */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">채널</label>
                            {channels.length > 0 ? (
                              <select
                                value={editForm.channel_id || channels[0].channelId}
                                onChange={(e) => setEditForm({ ...editForm, channel_id: e.target.value })}
                                className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                              >
                                {channels.map((ch: any) => (
                                  <option key={ch.channelId} value={ch.channelId} className="bg-slate-700 text-white">
                                    {ch.channelTitle || ch.title || ch.channelId}
                                    {ch.isDefault && ' ⭐'}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="w-full px-4 py-2 bg-red-900/30 text-red-300 rounded-lg border border-red-500 text-xs">
                                ⚠️ 채널 없음
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">🤖 AI 모델</label>
                            <select
                              value={editForm.aiModel || (editForm.type === 'product' ? 'gemini' : 'claude')}
                              onChange={(e) => setEditForm({ ...editForm, aiModel: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="claude">Claude {editForm.type !== 'product' && '(기본)'}</option>
                              <option value="chatgpt">ChatGPT</option>
                              <option value="gemini">Gemini {editForm.type === 'product' && '(상품 기본)'}</option>
                              <option value="grok">Grok</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">대본 생성</label>
                            <select
                              value={editForm.scriptMode || 'chrome'}
                              onChange={(e) => setEditForm({ ...editForm, scriptMode: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="chrome">크롬창</option>
                              <option value="api">API</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">미디어 생성</label>
                            <select
                              value={editForm.mediaMode || 'crawl'}
                              onChange={(e) => setEditForm({ ...editForm, mediaMode: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="crawl">이미지 크롤링</option>
                              <option value="upload">직접 업로드</option>
                              <option value="dalle3">DALL-E 3</option>
                              <option value="imagen3">Imagen 3</option>
                              <option value="sora2">SORA 2</option>
                            </select>
                          </div>
                        </div>

                        {/* TTS 음성/속도 설정 */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">
                              🎙️ TTS 음성
                              <span className="ml-2 text-[10px] text-yellow-400">(현재: {editForm.ttsVoice || '없음'})</span>
                              <span className="ml-2 text-[10px] text-red-400">[promptFormat: {editForm.promptFormat}]</span>
                            </label>
                            <select
                              value={editForm.ttsVoice ?? (editForm.promptFormat === 'longform' ? 'ko-KR-SoonBokNeural' : 'ko-KR-SunHiNeural')}
                              onChange={(e) => {
                                const newVoice = e.target.value;
                                console.log('🔄 [TTS 음성 변경]', {
                                  이전: editForm.ttsVoice,
                                  새값: newVoice,
                                  promptFormat: editForm.promptFormat
                                });
                                setEditForm({ ...editForm, ttsVoice: newVoice });
                              }}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="ko-KR-SunHiNeural">선희 (여성) {editForm.promptFormat !== 'longform' && '- 기본'}</option>
                              <option value="ko-KR-SoonBokNeural">순복 (여성) {editForm.promptFormat === 'longform' && '- 기본'}</option>
                              <option value="ko-KR-InJoonNeural">인준 (남성)</option>
                              <option value="ko-KR-BongJinNeural">봉진 (남성)</option>
                              <option value="ko-KR-GookMinNeural">국민 (남성)</option>
                              <option value="ko-KR-JiMinNeural">지민 (여성)</option>
                              <option value="ko-KR-SeoHyeonNeural">서현 (여성)</option>
                              <option value="ko-KR-YuJinNeural">유진 (여성)</option>
                              <option value="ko-KR-HyunsuNeural">현수 (남성)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">⏩ TTS 속도</label>
                            <select
                              value={editForm.ttsSpeed || '+0%'}
                              onChange={(e) => setEditForm({ ...editForm, ttsSpeed: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="-20%">느리게 (-20%)</option>
                              <option value="-10%">약간 느리게 (-10%)</option>
                              <option value="+0%">보통 (기본)</option>
                              <option value="+10%">약간 빠르게 (+10%)</option>
                              <option value="+20%">빠르게 (+20%)</option>
                              <option value="+30%">매우 빠르게 (+30%)</option>
                            </select>
                          </div>
                        </div>

                        {/* 롱폼→숏폼 자동변환 옵션 (롱폼 선택 시에만) */}
                        {(editForm.promptFormat === 'longform' || editForm.type === 'longform') && (
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="checkbox"
                              id="edit-auto-convert"
                              checked={editForm.autoConvert || false}
                              onChange={(e) => setEditForm({ ...editForm, autoConvert: e.target.checked })}
                              className="w-4 h-4 rounded"
                            />
                            <label htmlFor="edit-auto-convert" className="text-sm text-slate-300 cursor-pointer">
                              🔄 롱폼 완료 후 숏폼 자동생성
                            </label>
                          </div>
                        )}
                      </div>

                      {/* 스케줄 목록 */}
                      {titleSchedules.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm text-slate-300 font-semibold mb-2">스케줄:</h4>
                          {titleSchedules.map(schedule => (
                            <div key={schedule.id} className="bg-slate-600 rounded p-2 mb-2">
                              {editingScheduleId === schedule.id ? (
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="datetime-local"
                                    id={`edit-schedule-${schedule.id}`}
                                    min={getCurrentTimeForInput()}
                                    defaultValue={(() => {
                                      const date = new Date(schedule.scheduledTime);
                                      const year = date.getFullYear();
                                      const month = String(date.getMonth() + 1).padStart(2, '0');
                                      const day = String(date.getDate()).padStart(2, '0');
                                      const hours = String(date.getHours()).padStart(2, '0');
                                      const minutes = String(date.getMinutes()).padStart(2, '0');
                                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                                    })()}
                                    className="flex-1 px-2 py-1 bg-slate-700 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-xs"
                                  />
                                  <button
                                    onClick={() => {
                                      const inputElement = document.getElementById(`edit-schedule-${schedule.id}`) as HTMLInputElement;
                                      if (inputElement && inputElement.value) {
                                        updateSchedule(schedule.id, inputElement.value);
                                        setEditingScheduleId(null);
                                      }
                                    }}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingScheduleId(null)}
                                    className="px-2 py-1 bg-slate-500 hover:bg-slate-400 text-white rounded text-xs"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center">
                                  <div className="text-xs text-slate-200 flex items-center gap-2">
                                    {new Date(schedule.scheduledTime).toLocaleString('ko-KR')}
                                    {new Date(schedule.scheduledTime) < new Date() && (
                                      <span className="px-1.5 py-0.5 bg-slate-500 text-slate-300 rounded text-[10px]">과거</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => setEditingScheduleId(schedule.id)}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                  >
                                    수정
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 로그 표시 - 로그 버튼으로 토글 가능 */}
                      {expandedLogsFor === title.id && (
                        <div id={`log-container-${title.id}`} className="mb-3 max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                          {!logsMap[title.id] || logsMap[title.id].length === 0 ? (
                            <div className="text-center text-slate-400 py-4 text-sm">
                              {scheduleStatus === 'processing' ? (
                                <div className="flex items-center justify-center gap-2">
                                  <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                                  <span>로그 로딩 중...</span>
                                </div>
                              ) : (
                                '로그가 없습니다'
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {logsMap[title.id].map((log: any, idx: number) => {
                                const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

                                // API 사용 여부 감지
                                const isUsingAPI = logMessage.includes('Claude API') ||
                                                  logMessage.includes('API 호출') ||
                                                  logMessage.includes('Using Claude API') ||
                                                  logMessage.includes('💰');
                                const isUsingLocal = logMessage.includes('로컬 Claude') ||
                                                    logMessage.includes('Local Claude') ||
                                                    logMessage.includes('python') ||
                                                    logMessage.includes('🖥️');

                                // 에러 감지
                                const isError = logMessage.includes('❌') ||
                                              logMessage.includes('에러') ||
                                              logMessage.includes('실패') ||
                                              logMessage.includes('Error') ||
                                              logMessage.includes('Failed') ||
                                              logMessage.includes('스택 트레이스');
                                const isWarning = logMessage.includes('⚠️') || logMessage.includes('Warning');
                                const isSuccess = logMessage.includes('✅') || logMessage.includes('완료') || logMessage.includes('성공');

                                return (
                                  <div
                                    key={`log-${title.id}-${idx}-${logTimestamp}`}
                                    className={`text-sm font-mono ${
                                      isError
                                        ? 'bg-red-900/30 text-red-300 border-l-4 border-red-500 p-2 rounded mb-1'
                                        : isWarning
                                        ? 'bg-yellow-900/30 text-yellow-300 p-2 rounded mb-1'
                                        : isSuccess
                                        ? 'text-green-400'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                    {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                                    {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                                    <span className={isError ? 'font-bold' : ''}>{logMessage}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 버튼 */}
                      <div className="flex gap-2">
                        {/* 중지 버튼 (진행 중 상태일 때만) */}
                        {scheduleStatus === 'processing' && (
                          <button
                            onClick={async () => {
                              if (confirm('작업을 중지하시겠습니까?')) {
                                try {
                                  const response = await fetch(`/api/automation/stop`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ titleId: title.id })
                                  });

                                  if (response.ok) {
                                    alert('✅ 작업이 중지되었습니다');
                                    await fetchData();
                                  } else {
                                    const error = await response.json();
                                    alert(`❌ 중지 실패: ${error.error}`);
                                  }
                                } catch (error) {
                                  console.error('중지 오류:', error);
                                  alert('❌ 중지 실패');
                                }
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition"
                            title="작업 중지"
                          >
                            ⏹️ 중지
                          </button>
                        )}
                        {/* 로그 버튼 - 항상 표시 */}
                        <button
                          onClick={() => toggleLogs(title.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                            expandedLogsFor === title.id
                              ? 'bg-purple-700 text-white'
                              : scheduleStatus === 'processing' || matchesQueueTab(scheduleStatus, 'schedule')
                              ? 'bg-green-600 hover:bg-green-500 text-white'
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
                          title="로그 보기/닫기"
                        >
                          {expandedLogsFor === title.id ? '📋 닫기' : '📋 로그'}
                        </button>
                        <button
                          onClick={saveEdit}
                          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition"
                        >
                          💾 저장
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-semibold transition"
                        >
                          ❌ 취소
                        </button>
                        <button
                          onClick={() => deleteTitle(title.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition"
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`card-${title.titleId || title.id}-${idx}`}
                    className="p-4 bg-slate-700 rounded-lg"
                  >
                    {/* 카드 헤더: 제목 + 타입/상태 뱃지 */}
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <h4 className="text-white font-semibold text-lg line-clamp-2 break-words flex-1 min-w-0">{title.title}</h4>

                      {/* 상태 뱃지 (최소한의 정보만) */}
                      <div className="flex gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                          title.type === 'longform' ? 'bg-blue-600/30 text-blue-300' :
                          title.type === 'shortform' ? 'bg-purple-600/30 text-purple-300' :
                          'bg-orange-600/30 text-orange-300'
                        }`}>
                          {title.type === 'longform' ? '롱폼' : title.type === 'shortform' ? '숏폼' : '상품'}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                            scheduleStatus === 'processing' ? 'bg-yellow-600/30 text-yellow-300 animate-pulse' :
                            queueTab === 'completed' ? 'bg-green-600/30 text-green-300' :
                            isFailedStatus(scheduleStatus) ? 'bg-red-600/30 text-red-300' :
                            matchesQueueTab(scheduleStatus, 'schedule') ? 'bg-blue-600/30 text-blue-300' :
                            'bg-slate-600 text-slate-300'
                          }`}
                          title={isFailedStatus(scheduleStatus) && title.error ? title.error : ''}
                        >
                          {scheduleStatus === 'processing' && '⏳'}
                          {isFailedStatus(scheduleStatus) && '❌'}
                          {matchesQueueTab(scheduleStatus, 'schedule') && '📅'}
                          {queueTab === 'completed' && '✅'}
                          {STATUS_LABELS[scheduleStatus] || scheduleStatus}
                          {isFailedStatus(scheduleStatus) && title.queueType && (() => {
                            const stageLabels: Record<string, string> = {
                              'script': ' (📝대본)',
                              'image': ' (🖼️이미지)',
                              'video': ' (🎬영상)',
                              'youtube': ' (📺유튜브)'
                            };
                            return stageLabels[title.queueType] || '';
                          })()}
                        </span>
                      </div>
                    </div>

                    {/* 부가 정보: 카테고리, 채널, 진행률 */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {title.category && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-600/30 text-green-300">
                          {title.category}
                        </span>
                      )}
                      {(() => {
                        // 채널 정보: title.channel/youtubeChannel 또는 titleSchedule?.channel/youtubeChannel에서 가져오기
                        const channelId = title.channel || title.youtubeChannel || titleSchedule?.channel || titleSchedule?.youtubeChannel;
                        const ch = channelId
                          ? channels.find((c: any) => c.id === channelId || c.channelId === channelId)
                          : channels[0]; // 미지정시 첫 번째 채널
                        const chSet = (Array.isArray(channelSettings) ? channelSettings : []).find((s: any) => s.channel_id === (channelId || ch?.channelId || ch?.id));
                        const color = chSet?.color || '#6366f1';
                        const isUnassigned = !channelId && ch;
                        if (!ch) return null;
                        return (
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${isUnassigned ? 'opacity-60' : ''}`}
                            style={{ backgroundColor: `${color}30`, color, borderLeft: `3px solid ${color}` }}
                          >
                            📺 {ch.channelTitle || ch.title}{isUnassigned ? ' (미지정)' : ''}
                          </span>
                        );
                      })()}
                      {/* 예약 실행 시간 */}
                      {(title.scheduledTime || titleSchedule?.scheduledTime) && (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-600/30 text-blue-300">
                          ⏰ 예약 {new Date(title.scheduledTime || titleSchedule?.scheduledTime).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {/* 등록 시간 (예약 대기 상태에서만) */}
                      {matchesQueueTab(scheduleStatus, 'schedule') && titleSchedule?.createdAt && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-600/50 text-slate-300">
                          📋 등록 {new Date(titleSchedule.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {/* 유튜브 예약 공개 */}
                      {titleSchedule?.youtubePublishTime && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-600/30 text-red-300">
                          📅 유튜브 {new Date(titleSchedule.youtubePublishTime).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {/* 제목 점수 */}
                      {title.titleScore != null && (
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                          title.titleScore >= 95 ? 'bg-green-600/30 text-green-300' :
                          title.titleScore >= 90 ? 'bg-blue-600/30 text-blue-300' :
                          title.titleScore >= 80 ? 'bg-yellow-600/30 text-yellow-300' :
                          'bg-red-600/30 text-red-300'
                        }`}>
                          ⭐{title.titleScore}점
                        </span>
                      )}
                      {/* 미디어 생성 모드 표시 */}
                      {titleSchedule?.mediaMode && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          titleSchedule.mediaMode === 'crawl' ? 'bg-cyan-600/30 text-cyan-300' :
                          titleSchedule.mediaMode === 'upload' ? 'bg-amber-600/30 text-amber-300' :
                          titleSchedule.mediaMode === 'dalle3' ? 'bg-pink-600/30 text-pink-300' :
                          titleSchedule.mediaMode === 'imagen3' ? 'bg-purple-600/30 text-purple-300' :
                          titleSchedule.mediaMode === 'sora2' ? 'bg-red-600/30 text-red-300' :
                          'bg-slate-600/30 text-slate-300'
                        }`}>
                          {titleSchedule.mediaMode === 'crawl' && '🖼️ 이미지크롤링'}
                          {titleSchedule.mediaMode === 'upload' && '📤 직접업로드'}
                          {titleSchedule.mediaMode === 'dalle3' && '🎨 DALL-E 3'}
                          {titleSchedule.mediaMode === 'imagen3' && '🌈 Imagen 3'}
                          {titleSchedule.mediaMode === 'sora2' && '🎬 Sora 2'}
                          {!['crawl', 'upload', 'dalle3', 'imagen3', 'sora2'].includes(titleSchedule.mediaMode) && titleSchedule.mediaMode}
                        </span>
                      )}
                      {progressMap[title.id]?.scriptProgress !== undefined && (
                        <span className="text-xs px-2 py-0.5 rounded bg-cyan-600/30 text-cyan-300">
                          📝 {progressMap[title.id].scriptProgress}%
                        </span>
                      )}
                      {progressMap[title.id]?.videoProgress !== undefined && (
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300">
                          🎬 {progressMap[title.id].videoProgress}%
                        </span>
                      )}
                      {/* AI 모델 */}
                      {(title.aiModel || titleSchedule?.aiModel) && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          (title.aiModel || titleSchedule?.aiModel) === 'gpt' ? 'bg-emerald-600/30 text-emerald-300' :
                          'bg-orange-600/30 text-orange-300'
                        }`}>
                          🤖 {(title.aiModel || titleSchedule?.aiModel) === 'gpt' ? 'GPT' : 'Claude'}
                        </span>
                      )}
                    </div>

                    {/* 각 단계별 시간 정보 - 한 줄로 표시 */}
                    {(titleSchedule?.scriptStartedAt || titleSchedule?.imageStartedAt || titleSchedule?.videoStartedAt || titleSchedule?.youtubeStartedAt) && (() => {
                      // UTC → 한국시간(KST, UTC+9) 변환
                      const toKST = (dateStr: string) => {
                        const d = new Date(dateStr);
                        // UTC로 저장된 시간이면 +9시간 추가
                        if (!dateStr.includes('+') && !dateStr.includes('Z')) {
                          d.setHours(d.getHours() + 9);
                        }
                        return d;
                      };
                      const fmt = (d: Date) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                      const dur = (ms: number) => { const m = Math.floor(ms/60000); const s = Math.floor((ms%60000)/1000); return m > 0 ? `${m}m${s}s` : `${s}s`; };
                      const stages = [
                        { e: '📝', n: '대본', s: titleSchedule?.scriptStartedAt, f: titleSchedule?.scriptCompletedAt, st: titleSchedule?.scriptStatus },
                        { e: '🖼️', n: '이미지', s: titleSchedule?.imageStartedAt, f: titleSchedule?.imageCompletedAt, st: titleSchedule?.imageStatus },
                        { e: '🎬', n: '영상', s: titleSchedule?.videoStartedAt, f: titleSchedule?.videoCompletedAt, st: titleSchedule?.videoStatus },
                        { e: '📺', n: '유튜브', s: titleSchedule?.youtubeStartedAt, f: titleSchedule?.youtubeCompletedAt, st: titleSchedule?.youtubeStatus },
                      ].filter(x => x.s);
                      if (stages.length === 0) return null;
                      return (
                        <div className="text-sm mb-2 bg-slate-800/50 rounded px-2 py-1 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                          {stages.map((x, i) => {
                            const start = toKST(x.s!);
                            const end = x.f ? toKST(x.f) : null;
                            const isP = x.st === 'processing';
                            const isF = x.st === 'failed';
                            return (
                              <span key={i} className={`${isP ? 'text-yellow-400 animate-pulse' : isF ? 'text-red-400' : 'text-slate-300'}`}>
                                {x.e}{x.n} {fmt(start)}-{end ? fmt(end) : '..'}{end && <span className="text-purple-400">({dur(end.getTime()-start.getTime())})</span>}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* 액션 버튼 영역 */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        {/* 1️⃣ 로그 버튼 - 제일 먼저, 항상 표시 */}
                        <button
                          onClick={() => toggleLogs(title.id)}
                          className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap ${
                            expandedLogsFor === title.id
                              ? 'bg-slate-500 text-white'
                              : 'bg-slate-600 hover:bg-slate-500 text-white'
                          }`}
                          title="로그 보기/닫기"
                        >
                          {expandedLogsFor === title.id ? '📋닫기' : '📋로그'}
                        </button>

                        {/* 2️⃣ 폴더 버튼 - 두 번째, script_id가 있으면 표시 (대본 생성 이후 모든 상태) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.scriptId || s.videoId);
                          // 예약 상태가 아닌 모든 상태에서 script_id가 있으면 표시
                          const showFolder = schedule && !matchesQueueTab(scheduleStatus, 'schedule');
                          return showFolder && (
                            <button
                              onClick={() => {
                                handleOpenFolder(schedule.videoId || null, schedule.scriptId || null, scheduleStatus, schedule.taskId);
                              }}
                              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium whitespace-nowrap"
                              title="폴더 열기"
                            >
                              📁폴더
                            </button>
                          );
                        })()}

                        {/* 중지 버튼 (진행 중일 때만) */}
                        {scheduleStatus === 'processing' && (
                          <button
                            onClick={async () => {
                              if (confirm('작업을 중지하시겠습니까?')) {
                                try {
                                  const response = await fetch(`/api/automation/stop`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ titleId: title.id })
                                  });

                                  if (response.ok) {
                                    alert('✅ 작업이 중지되었습니다');
                                    await fetchData();
                                  } else {
                                    const error = await response.json();
                                    alert(`❌ 중지 실패: ${error.error}`);
                                  }
                                } catch (error) {
                                  console.error('중지 오류:', error);
                                  alert('❌ 중지 실패');
                                }
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium whitespace-nowrap"
                            title="작업 중지"
                          >
                            ⏹️중지
                          </button>
                        )}

                        {/* 수정 버튼 (진행중/완료 상태가 아닐 때만) */}
                        {scheduleStatus !== 'processing' && scheduleStatus !== 'completed' && (
                          <button
                            onClick={() => startEdit(title)}
                            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium whitespace-nowrap"
                          >
                            📝수정
                          </button>
                        )}
                        <button
                          onClick={() => deleteTitle(title.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium whitespace-nowrap"
                        >
                          🗑️삭제
                        </button>
                        {/* 즉시 실행/재시도 버튼 */}
                        {queueTab === 'schedule' && (
                          <button
                            onClick={() => forceExecute(title.id, title.title)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium whitespace-nowrap"
                          >
                            ▶️즉시실행
                          </button>
                        )}
                        {(queueTab === 'failed' || queueTab === 'cancelled' || queueTab === 'completed') && (
                          <button
                            onClick={() => retryFailed(title.id, title)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium whitespace-nowrap"
                          >
                            🔄재시도
                          </button>
                        )}
                        {/* 대본 수정 버튼 - 대본 생성 이후 모든 상태에서 표시 */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.scriptId || s.taskId);
                          // 대본 생성 완료 이후 (script, image, video, youtube, completed, failed 상태) 표시
                          const showEditScript = schedule && !matchesQueueTab(scheduleStatus, 'schedule') && scheduleStatus !== 'failed';
                          return showEditScript && (
                            <button
                              onClick={() => loadScriptForEdit(schedule.taskId || schedule.scriptId, title.title)}
                              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium whitespace-nowrap"
                              title="대본 수정"
                            >
                              ✏️대본
                            </button>
                          );
                        })()}
                        {/* 대본/영상 버튼 (완료 상태일 때만) */}
                        {queueTab === 'completed' && (() => {
                          const scriptId = titleSchedules.find((s: any) => s.scriptId)?.scriptId;
                          const videoId = titleSchedules.find((s: any) => s.videoId)?.videoId;
                          return (
                            <>
                              {scriptId && (
                                <button
                                  onClick={() => {
                                    window.location.href = `/my-content?tab=scripts&id=${scriptId}`;
                                  }}
                                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium whitespace-nowrap"
                                  title="대본 보기"
                                >
                                  📄대본
                                </button>
                              )}
                              {videoId && (
                                <button
                                  onClick={() => {
                                    window.location.href = `/my-content?tab=videos&id=${videoId}`;
                                  }}
                                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium whitespace-nowrap"
                                  title="영상 보기"
                                >
                                  🎬영상
                                </button>
                              )}
                              {/* 다운로드 버튼 */}
                              {scriptId && (
                                <div className="relative">
                                  <button
                                    onClick={() => setDownloadMenuFor(prev => ({ ...prev, [title.id]: !prev[title.id] }))}
                                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium whitespace-nowrap"
                                  >
                                    📥저장
                                  </button>
                                  {downloadMenuFor[title.id] && (
                                    <div className="absolute right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[120px]">
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'video', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700 rounded-t-lg"
                                      >
                                        🎬 영상만
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'script', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                                      >
                                        📄 대본만
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'materials', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                                      >
                                        🖼️ 소재만
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'all', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700 rounded-b-lg"
                                      >
                                        📦 전체
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {/* YouTube 업로드 버튼 (영상 완료 후 - 재업로드 가능) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.videoId);
                          const hasVideo = !!schedule?.videoId;
                          const hasYouTubeUrl = !!schedule?.youtubeUrl;
                          // ⭐ youtube 탭, completed 탭, 또는 failed 탭(재업로드)에서만 표시
                          const showYouTube = hasVideo && (
                            queueTab === 'youtube' ||
                            queueTab === 'completed' ||
                            (queueTab === 'failed' && hasYouTubeUrl)  // 재업로드만
                          );

                          const scriptId = schedule?.scriptId || schedule?.videoId;
                          return showYouTube && scriptId && (
                            <YouTubeUploadButton
                              videoPath={`project_${scriptId}/output.mp4`}
                              defaultTitle={title.title}
                              taskId={scriptId}
                              onUploadSuccess={() => fetchData()}
                              isReupload={hasYouTubeUrl}
                            />
                          );
                        })()}
                        {/* 이미지 크롤링 버튼 (대본/이미지 탭에서만 표시) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.scriptId)?.scriptId;
                          // ⭐ 대본 탭 또는 이미지 탭에서만 표시
                          const showCrawl = scriptId && (
                            queueTab === 'script' ||
                            queueTab === 'image' ||
                            queueTab === 'failed'
                          );
                          return showCrawl && (
                            <button
                              onClick={() => openImageCrawlModal(scriptId, title.id, title.title, title.type)}
                              disabled={crawlingFor === title.id}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-500 text-white rounded text-sm font-medium whitespace-nowrap"
                              title="이미지 크롤링 시작"
                            >
                              {crawlingFor === title.id ? '🔄크롤링 중...' : '🖼️이미지크롤링'}
                            </button>
                          );
                        })()}
                        {/* 영상제작 버튼 (이미지 탭/실패 탭에서만 표시) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.scriptId);
                          const scriptId = schedule?.scriptId;
                          const scheduleId = schedule?.id;
                          // ⭐ 이미지 탭 또는 실패 탭에서만 표시
                          const showVideoBtn = scriptId && scheduleId && (
                            queueTab === 'image' ||
                            queueTab === 'failed'
                          );
                          return showVideoBtn && (
                            <button
                              onClick={() => {
                                // 영상 제작 시작 (이미지가 이미 업로드된 경우)
                                if (confirm(`"${title.title}"\n\n영상 제작을 시작하시겠습니까?\n\n(이미지/영상이 대본에 연결되어 있어야 합니다)`)) {
                                  handleVideoGeneration(title.id, scheduleId, scriptId);
                                }
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium whitespace-nowrap"
                              title="영상 제작 시작"
                            >
                              🎬영상제작
                            </button>
                          );
                        })()}
                        {/* 업로드 버튼 (이미지 탭/실패 탭에서만 표시) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.scriptId)?.scriptId;
                          // ⭐ 이미지 탭 또는 실패 탭에서만 표시
                          const showUpload = scriptId && (
                            queueTab === 'image' ||
                            queueTab === 'failed'
                          );
                          return showUpload && (
                            <button
                              onClick={() => setUploadBoxOpenFor(prev => ({ ...prev, [title.id]: !prev[title.id] }))}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium whitespace-nowrap"
                            >
                              {uploadBoxOpenFor[title.id] ? '📤닫기' : '📤업로드'}
                            </button>
                          );
                        })()}
                        {/* 대본 재생성 버튼 (실패 상태이고 script_id가 있을 때만, youtube_failed는 제외) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.scriptId)?.scriptId;
                          // youtube_failed는 영상까지 완료된 상태이므로 대본 재생성 불필요
                          const showRegenScript = isFailedStatus(scheduleStatus) && scheduleStatus !== 'youtube_failed';
                          return showRegenScript && scriptId && (
                            <button
                              onClick={() => handleRegenerateScript(scriptId, title.id, title.title)}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium whitespace-nowrap"
                              title="대본 재생성"
                            >
                              🔄대본
                            </button>
                          );
                        })()}
                        {/* YouTube 업로드 버튼 (youtube_failed 상태이면서 영상 완료, 아직 업로드 안 됨) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.videoId);
                          const hasVideo = !!schedule?.videoId;
                          const hasYouTubeUrl = !!schedule?.youtubeUrl;
                          const scriptId = schedule?.scriptId || schedule?.videoId;

                          return queueTab === 'failed' && hasVideo && !hasYouTubeUrl && scriptId && (
                            <YouTubeUploadButton
                              videoPath={`project_${scriptId}/output.mp4`}
                              defaultTitle={title.title}
                              taskId={scriptId}
                              onUploadSuccess={() => fetchData()}
                            />
                          );
                        })()}
                    </div>

                    {/* ⚠️ CRITICAL: 상품 정보 표시 - 제거하면 안됩니다! */}
                    {title.product_data && (
                      <div className="mb-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {/* 상품 정보 (왼쪽) */}
                        <div className="p-2 bg-slate-700/50 rounded border border-slate-600">
                          <p className="text-xs font-semibold text-emerald-400 mb-1">🛍️ 상품 정보</p>
                          {(title.product_data.productName || title.product_data.title) && (
                            <p className="text-xs text-slate-300">
                              제목: {title.product_data.productName || title.product_data.title}
                            </p>
                          )}
                          {title.product_data.productPrice && (
                            <p className="text-xs text-emerald-300">가격: {title.product_data.productPrice}</p>
                          )}
                          {(title.product_data.productImage || title.product_data.thumbnail) && (
                            <div className="mt-1">
                              <img
                                src={title.product_data.productImage || title.product_data.thumbnail}
                                alt="상품 썸네일"
                                className="w-24 h-24 object-cover rounded border border-slate-500"
                              />
                            </div>
                          )}
                          {(title.product_data.deepLink || title.product_data.productUrl || title.product_data.product_link) && (
                            <p className="text-xs text-white truncate">
                              딥링크: <a
                                href={title.product_data.deepLink || title.product_data.productUrl || title.product_data.product_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline"
                              >
                                {title.product_data.deepLink || title.product_data.productUrl || title.product_data.product_link}
                              </a>
                            </p>
                          )}
                          {title.product_data.description && (
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">설명: {title.product_data.description}</p>
                          )}
                        </div>

                        {/* 🎨 크롤링 이미지 진행 상황 (오른쪽) - BTS-0000037 복원 */}
                        {(() => {
                          const imageData = crawledImagesMap[title.id];
                          if (!imageData || Object.keys(imageData).length === 0) return null;

                          const totalScenes = Object.keys(imageData).length;
                          const completedScenes = Object.values(imageData).filter((s: any) => s.status === 'completed').length;
                          const failedScenes = Object.values(imageData).filter((s: any) => s.status === 'failed').length;
                                                      const allImages = allTaskImagesMap[title.id] || [];
                                                      const filteredImages = filterImages(allImages);                          const isExpanded = expandedImageTasks.has(title.id);

                          // 모든 이미지 로드 함수
                          const loadAllImages = async () => {
                            if (allImages.length > 0) {
                              // 이미 로드됨, 토글만
                              setExpandedImageTasks(prev => {
                                const next = new Set(prev);
                                if (next.has(title.id)) {
                                  next.delete(title.id);
                                } else {
                                  next.add(title.id);
                                }
                                return next;
                              });
                              return;
                            }

                            // API 호출
                            try {
                              const res = await fetch(`/api/task-images/${title.id}`);
                              if (res.ok) {
                                const data = await res.json();
                                setAllTaskImagesMap(prev => ({
                                  ...prev,
                                  [title.id]: data.files || []
                                }));
                                setExpandedImageTasks(prev => new Set(prev).add(title.id));
                              }
                            } catch (error) {
                              console.error('이미지 로드 실패:', error);
                            }
                          };

                          return (
                            <div className="p-2 bg-slate-700/50 rounded border border-slate-600">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-semibold text-purple-400">
                                  🖼️ 이미지 크롤링 ({completedScenes}/{totalScenes})
                                </p>
                                <button
                                  onClick={loadAllImages}
                                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                                >
                                  {isExpanded ? '접기' : '모든 이미지 보기'}
                                </button>
                              </div>
                              <div className="grid grid-cols-5 gap-2 mt-1">
                                {Object.entries(imageData).map(([sceneId, scene]: [string, any]) => {
                                  const statusEmoji =
                                    scene.status === 'completed' ? '✅' :
                                    scene.status === 'failed' ? '❌' :
                                    scene.status === 'downloading' ? '⬇️' :
                                    scene.status === 'generating' ? '⏳' :
                                    scene.status === 'uploading' ? '⬆️' : '⏸️';

                                  const statusColor =
                                    scene.status === 'completed' ? 'border-emerald-500' :
                                    scene.status === 'failed' ? 'border-red-500' :
                                    scene.status === 'downloading' ? 'border-blue-500' :
                                    scene.status === 'generating' ? 'border-amber-500' :
                                    scene.status === 'uploading' ? 'border-purple-500' : 'border-slate-500';

                                  const bgColor =
                                    scene.status === 'completed' ? 'bg-emerald-600' :
                                    scene.status === 'failed' ? 'bg-red-600' :
                                    scene.status === 'downloading' ? 'bg-blue-600' :
                                    scene.status === 'generating' ? 'bg-amber-600' :
                                    scene.status === 'uploading' ? 'bg-purple-600' : 'bg-slate-600';

                                  // 이미지 URL
                                  const imageUrl = `/api/task-images/${title.id}/${sceneId}.jpeg`;

                                  return (
                                    <div
                                      key={sceneId}
                                      className={`relative rounded border-2 ${statusColor} overflow-hidden aspect-square`}
                                      title={`${sceneId}: ${scene.status}`}
                                    >
                                      {scene.status === 'completed' ? (
                                        <img
                                          src={imageUrl}
                                          alt={sceneId}
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            // 이미지 로드 실패 시 fallback
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <div className={`w-full h-full ${bgColor} flex items-center justify-center`}>
                                          <span className="text-sm">{statusEmoji}</span>
                                        </div>
                                      )}
                                      {/* 상태 뱃지 */}
                                      <div className={`absolute bottom-0 right-0 ${bgColor} px-1 text-xs opacity-90`}>
                                        {statusEmoji}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {failedScenes > 0 && (
                                <p className="text-xs text-red-400 mt-1">⚠️ {failedScenes}개 실패</p>
                              )}

                              {/* 모든 이미지 표시 */}
                              {isExpanded && allImages.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-600">
                                  <p className="text-xs font-semibold text-slate-300 mb-2">
                                    📁 전체 파일 ({allImages.length}개)
                                  </p>
                                  <div className="grid grid-cols-4 gap-2">
                                {filteredImages.map((image: any, imgIdx: number) => (
                                    <div key={image.filename} className="relative group">
                                        {image.type === 'image' ? (
                                            <img
                                                src={image.url}
                                                alt={image.filename}
                                                className="w-24 h-24 object-cover rounded-md border border-slate-700"
                                                onClick={() => window.open(image.url, '_blank')}
                                            />
                                        ) : (
                                            <a
                                                href={image.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex w-24 h-24 items-center justify-center bg-slate-800 rounded-md border border-slate-700 text-slate-400 text-xs text-center p-1"
                                            >
                                                {image.filename}
                                            </a>
                                        )}
                                        <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1 rounded">
                                            {image.filename}
                                        </span>
                                    </div>
                                ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {title.tags && (
                      <p className="text-xs text-slate-500 mb-3">🏷️ {title.tags}</p>
                    )}
                    {/* YouTube 정보 (완료 상태일 때만 표시) */}
                    {queueTab === 'completed' && (() => {
                      const schedule = titleSchedules.find((s: any) => s.youtubeUrl || s.youtubeUploadId);
                      if (!schedule) return null;

                      // 채널 ID로 채널 이름 찾기
                      const channelInfo = channels.find((ch: any) => ch.channelId === title.channel || ch.id === title.channel);
                      const channelName = channelInfo?.channelTitle || '채널 정보 없음';

                      return (
                        <div className="mb-3 p-2 bg-red-900/30 rounded border border-red-500/30">
                          <p className="text-xs font-semibold text-red-400 mb-1">📺 YouTube</p>
                          {title.channel && (
                            <p className="text-xs text-slate-300">채널: {channelName}</p>
                          )}
                          {schedule.youtubeUrl && (
                            <p className="text-xs truncate flex items-center gap-2">
                              링크: <a
                                href={schedule.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-400 hover:text-red-300 underline"
                              >
                                {schedule.youtubeUrl}
                              </a>
                              {schedule.youtubeUploadCount > 1 && (
                                <span className="ml-2 text-yellow-400 font-semibold">(재업로드)</span>
                              )}
                              <button
                                onClick={async () => {
                                  if (!confirm('YouTube에서도 삭제됩니다. 삭제하시겠습니까?')) return;

                                  try {
                                    const res = await fetch('/api/youtube/delete', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ youtubeUrl: schedule.youtubeUrl })
                                    });

                                    const data = await res.json();

                                    if (data.success) {
                                      alert('YouTube 비디오가 삭제되었습니다');
                                      fetchSchedules(); // 목록 새로고침
                                    } else {
                                      alert(`삭제 실패: ${data.error}`);
                                    }
                                  } catch (error: any) {
                                    alert(`삭제 오류: ${error.message}`);
                                  }
                                }}
                                className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium whitespace-nowrap"
                                title="YouTube에서 삭제"
                              >
                                🗑️삭제
                              </button>
                            </p>
                          )}
                          {schedule.youtubeUploadId && !schedule.youtubeUrl && (
                            <p className="text-xs text-slate-400">업로드 ID: {schedule.youtubeUploadId}</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* 이미지 업로드 섹션 (업로드 버튼을 눌렀을 때만 표시) */}
                    {uploadBoxOpenFor[title.id] && (queueTab === 'image' || queueTab === 'failed') && titleSchedules.find((s: any) => s.scriptId)?.scriptId && (
                      <div className="mb-3 p-6 bg-purple-900/30 border-2 border-purple-500 rounded-lg">
                        <h5 className="text-purple-300 font-bold text-lg mb-3 flex items-center gap-2">
                          <span className="text-3xl">📤</span>
                          <span>미디어 업로드가 필요합니다</span>
                        </h5>
                        <p className="text-sm text-slate-300 mb-4">
                          대본 생성이 완료되었습니다. 영상 제작을 위해 이미지 또는 동영상을 업로드해주세요.
                        </p>

                        {/* 미디어 업로드 박스 (이미지 + 동영상) */}
                        <div className="mb-4">
                          <MediaUploadBox
                            uploadedImages={uploadedImagesFor[title.id] || []}
                            uploadedVideos={uploadedVideosFor[title.id] || []}
                            onImagesChange={(files) => {
                              setUploadedImagesFor(prev => ({ ...prev, [title.id]: files }));
                            }}
                            onVideosChange={(files) => {
                              setUploadedVideosFor(prev => ({ ...prev, [title.id]: files }));
                            }}
                            acceptJson={false}
                            acceptImages={true}
                            acceptVideos={true}
                            mode={title.type === 'longform' ? 'longform' : 'shortform'}
                            maxImages={50}
                          />

                          {/* 업로드 버튼 */}
                          {((uploadedImagesFor[title.id] && uploadedImagesFor[title.id].length > 0) || (uploadedVideosFor[title.id] && uploadedVideosFor[title.id].length > 0)) && (() => {
                            // 현재 title에 대한 대본 생성 schedule 찾기 (scriptId가 있는 가장 최신 것)
                            const schedulesWithScript = titleSchedules
                              .filter((s: any) => s.scriptId)
                              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                            const scriptSchedule = schedulesWithScript[0];

                            // 디버그 로그
                            console.log('[Upload Button] Title:', title.id, title.title);
                            console.log('[Upload Button] All titleSchedules:', titleSchedules);
                            console.log('[Upload Button] Schedules with script_id:', schedulesWithScript);
                            console.log('[Upload Button] Selected schedule:', scriptSchedule);

                            if (!scriptSchedule?.scriptId) {
                              return (
                                <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-sm text-red-200">
                                  <div className="font-bold mb-2">⚠️ script_id를 찾을 수 없습니다</div>
                                  <div className="text-xs">대본 생성이 완료되지 않았거나, 스케줄에 script_id가 저장되지 않았을 수 있습니다.</div>
                                  <div className="text-xs mt-2 font-mono bg-black/30 p-2 rounded">
                                    디버그: {titleSchedules.length}개 스케줄 중 script_id 있는 것: {schedulesWithScript.length}개
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <button
                                onClick={() => {
                                  uploadImages(title.id, scriptSchedule.id, scriptSchedule.scriptId);
                                }}
                                disabled={uploadingFor === title.id}
                                className={`w-full px-4 py-3 rounded-lg font-bold text-lg transition mt-4 ${
                                  uploadingFor === title.id
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
                                }`}
                              >
                                {uploadingFor === title.id ? '⏳ 업로드 중...' : '🚀 영상 제작'}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* 스케줄 목록 */}
                    {titleSchedules.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-400 font-semibold mb-2">📅 등록된 스케줄:</p>
                        <div className="space-y-1">
                          {titleSchedules.map((schedule: any, scheduleIndex: number) => (
                            <div key={`${schedule.id}-${scheduleIndex}`} className="bg-slate-600 rounded px-3 py-2">
                              {editingScheduleId === schedule.id ? (
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="datetime-local"
                                    id={`edit-schedule-regular-${schedule.id}`}
                                    min={getCurrentTimeForInput()}
                                    defaultValue={(() => {
                                      const date = new Date(schedule.scheduledTime);
                                      const year = date.getFullYear();
                                      const month = String(date.getMonth() + 1).padStart(2, '0');
                                      const day = String(date.getDate()).padStart(2, '0');
                                      const hours = String(date.getHours()).padStart(2, '0');
                                      const minutes = String(date.getMinutes()).padStart(2, '0');
                                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                                    })()}
                                    className="flex-1 px-2 py-1 bg-slate-700 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-xs"
                                  />
                                  <button
                                    onClick={() => {
                                      const inputElement = document.getElementById(`edit-schedule-regular-${schedule.id}`) as HTMLInputElement;
                                      if (inputElement && inputElement.value) {
                                        updateSchedule(schedule.id, inputElement.value);
                                      }
                                    }}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingScheduleId(null)}
                                    className="px-2 py-1 bg-slate-500 hover:bg-slate-400 text-white rounded text-xs"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-green-400 flex items-center gap-2">
                                    {new Date(schedule.scheduledTime).toLocaleString('ko-KR')}
                                    {schedule.status !== 'pending' && ` (${schedule.status})`}
                                    {new Date(schedule.scheduledTime) < new Date() && (
                                      <span className="px-1.5 py-0.5 bg-slate-500 text-slate-300 rounded text-[10px]">과거</span>
                                    )}
                                  </span>
                                  <button
                                    onClick={() => setEditingScheduleId(schedule.id)}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                  >
                                    수정
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 로그 표시 - 로그 버튼으로 토글 */}
                    {expandedLogsFor === title.id && (
                      <div id={`log-container-${title.id}`} className="max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                        {!logsMap[title.id] || logsMap[title.id].length === 0 ? (
                          <div className="text-center text-slate-400 py-4 text-sm">
                            {scheduleStatus === 'processing' ? (
                              <div className="flex items-center justify-center gap-2">
                                <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                                <span>로그 로딩 중...</span>
                              </div>
                            ) : matchesQueueTab(scheduleStatus, 'schedule') ? (
                              '예약됨 - 실행 대기 중'
                            ) : (
                              '로그가 없습니다'
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {logsMap[title.id].map((log: any, idx: number) => {
                              const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                              const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

                              // API 사용 여부 감지
                              const isUsingAPI = logMessage.includes('Claude API') ||
                                                logMessage.includes('API 호출') ||
                                                logMessage.includes('Using Claude API') ||
                                                logMessage.includes('💰');
                              const isUsingLocal = logMessage.includes('로컬 Claude') ||
                                                  logMessage.includes('Local Claude') ||
                                                  logMessage.includes('python') ||
                                                  logMessage.includes('🖥️');

                              // 에러 감지
                                const isError = logMessage.includes('❌') ||
                                              logMessage.includes('에러') ||
                                              logMessage.includes('실패') ||
                                              logMessage.includes('Error') ||
                                              logMessage.includes('Failed') ||
                                              logMessage.includes('스택 트레이스');
                                const isWarning = logMessage.includes('⚠️') || logMessage.includes('Warning');
                                const isSuccess = logMessage.includes('✅') || logMessage.includes('완료') || logMessage.includes('성공');

                              return (
                                <div
                                  key={idx}
                                  className={`text-sm font-mono ${
                                    isError
                                      ? 'bg-red-900/30 text-red-300 border-l-4 border-red-500 p-2 rounded mb-1'
                                      : isWarning
                                      ? 'bg-yellow-900/30 text-yellow-300 p-2 rounded mb-1'
                                      : isSuccess
                                      ? 'text-green-400'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                  {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                                  {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                                  <span className={isError ? 'font-bold' : ''}>{logMessage}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
                })()
              )}

              {/* 더보기 버튼 */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => setDisplayLimit(prev => prev + 100)}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors duration-200"
                  >
                    더보기 (+100개)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* 제목 생성 로그 모달 */}
      {generateModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg shadow-2xl border border-slate-700 max-w-4xl w-full max-h-[80vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">🔄 미사용 제목 풀</h3>
              <button
                onClick={() => setGenerateModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* 로그 영역 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-sm">
              {generateLogs.length === 0 && isGenerating && (
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                  <span>제목 생성 시작 중...</span>
                </div>
              )}
              {generateLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`mb-1 ${
                    log.includes('❌') || log.includes('실패')
                      ? 'text-red-400'
                      : log.includes('✅') || log.includes('완료') || log.includes('성공')
                      ? 'text-green-400'
                      : log.includes('⚠️')
                      ? 'text-yellow-400'
                      : log.includes('🎯') || log.includes('💾')
                      ? 'text-cyan-400'
                      : log.includes('📂') || log.includes('📊')
                      ? 'text-blue-400'
                      : log.includes('━')
                      ? 'text-slate-600'
                      : log.includes('🚀') || log.includes('🎉')
                      ? 'text-purple-400'
                      : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>

            {/* 모달 푸터 */}
            <div className="p-4 border-t border-slate-700 flex justify-between items-center">
              <div className="text-sm text-slate-400">
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-500"></div>
                    제목 생성 진행 중...
                  </span>
                ) : (
                  <span>제목 생성 완료</span>
                )}
              </div>
              <div className="flex gap-2">
                {!isGenerating && (
                  <button
                    onClick={() => {
                      setGenerateModalOpen(false);
                      fetchTitlePool(); // 새로고침
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition"
                  >
                    새로고침
                  </button>
                )}
                <button
                  onClick={() => setGenerateModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 대본 수정 모달 */}
      {scriptEditModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg shadow-2xl border border-slate-700 max-w-5xl w-full max-h-[90vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">✏️ 대본 수정 - {scriptEditModal.title}</h3>
              <button
                onClick={() => setScriptEditModal(null)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* 대본 내용 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950">
              {scriptEditModal.loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  <span className="ml-3 text-slate-400">대본 로딩 중...</span>
                </div>
              ) : scriptEditModal.scenes.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  대본이 없습니다
                </div>
              ) : (
                <div className="space-y-6">
                  {scriptEditModal.scenes.map((scene: any, idx: number) => (
                    <div key={idx} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="bg-purple-600 text-white px-2 py-1 rounded text-sm font-bold">
                          씬 {idx + 1}
                        </span>
                        {scene.scene_type && (
                          <span className="bg-slate-600 text-slate-300 px-2 py-1 rounded text-xs">
                            {scene.scene_type}
                          </span>
                        )}
                      </div>
                      {/* 나레이션 */}
                      <div className="mb-3">
                        <label className="text-xs text-slate-400 block mb-1">나레이션</label>
                        <textarea
                          value={scene.narration || ''}
                          onChange={(e) => {
                            const newScenes = [...scriptEditModal.scenes];
                            newScenes[idx] = { ...newScenes[idx], narration: e.target.value };
                            setScriptEditModal({ ...scriptEditModal, scenes: newScenes });
                          }}
                          className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:outline-none focus:border-blue-500 min-h-[80px] resize-y"
                          placeholder="나레이션 내용"
                        />
                      </div>
                      {/* 이미지 프롬프트 */}
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">이미지 프롬프트</label>
                        <textarea
                          value={scene.image_prompt || scene.imagePrompt || ''}
                          onChange={(e) => {
                            const newScenes = [...scriptEditModal.scenes];
                            newScenes[idx] = { ...newScenes[idx], image_prompt: e.target.value, imagePrompt: e.target.value };
                            setScriptEditModal({ ...scriptEditModal, scenes: newScenes });
                          }}
                          className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:outline-none focus:border-blue-500 min-h-[60px] resize-y"
                          placeholder="이미지 프롬프트"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => setScriptEditModal(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
              >
                취소
              </button>
              <button
                onClick={saveScriptEdit}
                disabled={scriptEditSaving || scriptEditModal.loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded transition"
              >
                {scriptEditSaving ? '저장 중...' : '💾 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 테스트 로그 모달 */}
      {testModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg shadow-2xl border border-slate-700 max-w-4xl w-full max-h-[80vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">
                {testMode === 'instant' ? '⚡ 즉시 실행' : '🧪 자동 제목 생성 테스트'}
              </h3>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* 로그 영역 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-sm">
              {testLogs.length === 0 && testInProgress && (
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span>테스트 시작 중...</span>
                </div>
              )}
              {testLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`mb-1 ${
                    log.includes('❌') || log.includes('실패')
                      ? 'text-red-400'
                      : log.includes('✅') || log.includes('성공')
                      ? 'text-green-400'
                      : log.includes('⚠️')
                      ? 'text-yellow-400'
                      : log.includes('🔍') || log.includes('📋')
                      ? 'text-blue-400'
                      : log.includes('🤖')
                      ? 'text-purple-400'
                      : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>

            {/* 모달 푸터 */}
            <div className="p-4 border-t border-slate-700 flex justify-between items-center">
              <div className="text-sm text-slate-400">
                {testInProgress ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                    테스트 진행 중...
                  </span>
                ) : (
                  <span>테스트 완료</span>
                )}
              </div>
              <button
                onClick={() => setTestModalOpen(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 샘플링 모달 */}
      {sampleModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl border border-cyan-500/30 max-w-xl w-full max-h-[85vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-cyan-600/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎲</span>
                <h3 className="text-base font-bold text-white">AI 제목 샘플링</h3>
                <span className="text-xs text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded-full">패턴 조합</span>
              </div>
              <button onClick={() => setSampleModalOpen(false)} className="text-slate-400 hover:text-white transition text-lg">✕</button>
            </div>

            {/* 컨텐츠 */}
            <div className="flex-1 overflow-y-auto p-3">
              {sampleLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-500 border-t-transparent"></div>
                  <span className="text-sm">제목 생성 중...</span>
                </div>
              ) : sampleTitles.length === 0 ? (
                <div className="text-center text-slate-400 py-12">샘플이 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {sampleTitles.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      onClick={() => {
                        const newSet = new Set(selectedSamples);
                        if (newSet.has(idx)) newSet.delete(idx);
                        else newSet.add(idx);
                        setSelectedSamples(newSet);
                      }}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        selectedSamples.has(idx)
                          ? 'bg-cyan-500/20 ring-2 ring-cyan-500 shadow-lg shadow-cyan-500/20'
                          : 'bg-slate-800/80 hover:bg-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* 체크박스 */}
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                          selectedSamples.has(idx)
                            ? 'bg-cyan-500 text-white'
                            : 'bg-slate-700 border border-slate-600'
                        }`}>
                          {selectedSamples.has(idx) && <span className="text-xs font-bold">✓</span>}
                        </div>
                        {/* 제목 */}
                        <p className="flex-1 text-sm text-white leading-relaxed">{item.title}</p>
                        {/* 점수 */}
                        <div className={`text-xs font-bold px-2 py-1 rounded shrink-0 ${
                          item.score >= 70 ? 'bg-green-500/20 text-green-400' :
                          item.score >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-slate-600/50 text-slate-400'
                        }`}>
                          {item.score}점
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/50 space-y-3">
              {/* 타입 선택 + 자동변환 옵션 */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">타입:</span>
                  <select
                    value={samplingType}
                    onChange={(e) => {
                      const type = e.target.value as 'longform' | 'shortform';
                      setSamplingType(type);
                      // 숏폼 선택 시 자동변환 체크 해제
                      if (type === 'shortform') {
                        setSamplingAutoConvert(false);
                      }
                    }}
                    className="px-2 py-1 text-xs bg-slate-700 text-white rounded border border-slate-600 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="longform">롱폼</option>
                    <option value="shortform">숏폼</option>
                  </select>
                </div>
                {/* 롱폼 선택 시에만 자동변환 옵션 표시 */}
                {samplingType === 'longform' && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={samplingAutoConvert}
                      onChange={(e) => setSamplingAutoConvert(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-800"
                    />
                    <span className="text-xs text-slate-300 group-hover:text-white transition">
                      🔄 롱폼→숏폼 자동변환
                    </span>
                  </label>
                )}
              </div>

              {/* 버튼 영역 */}
              <div className="flex justify-between items-center gap-3">
                <div className="text-xs text-slate-400">
                  {selectedSamples.size > 0
                    ? <span className="text-cyan-400 font-semibold">{selectedSamples.size}개 선택</span>
                    : '클릭해서 선택'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSampleModalOpen(false)}
                    className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                  >
                    닫기
                  </button>
                {selectedSamples.size > 0 && (
                  <button
                    onClick={() => {
                      // 선택된 첫 번째 제목을 폼에 설정
                      const firstIdx = Array.from(selectedSamples)[0];
                      const sample = sampleTitles[firstIdx];
                      const targetCategory = sample.category || '시니어사연';

                      // 해당 카테고리를 가진 채널 찾기
                      let matchingChannelId = newTitle.channel;
                      const settingsArray = Array.isArray(channelSettings) ? channelSettings : [];
                      const matchingSetting = settingsArray.find(
                        (s: any) => s.categories && s.categories.includes(targetCategory)
                      );
                      if (matchingSetting) {
                        // 채널 ID로 채널 찾기
                        const matchingChannel = channels.find(
                          (ch: any) => ch.channelId === matchingSetting.channel_id || ch.id === matchingSetting.channel_id
                        );
                        if (matchingChannel) {
                          matchingChannelId = matchingChannel.id;
                          console.log(`📌 카테고리 "${targetCategory}"에 맞는 채널 자동 선택:`, matchingChannel.channelTitle);
                        }
                      }

                      // newTitle 폼에 제목, 카테고리, 채널, 타입, 자동변환 설정
                      const model = getDefaultModelByType(samplingType);
                      setNewTitle(prev => ({
                        ...prev,
                        title: sample.title,
                        category: targetCategory,
                        channel: matchingChannelId,
                        promptFormat: samplingType,
                        aiModel: model,
                        autoConvert: samplingAutoConvert, // 롱폼→숏폼 자동변환
                        scheduleTime: getDefaultScheduleTime()
                      }));
                      // localStorage에도 저장
                      localStorage.setItem('automation_selected_type', samplingType);
                      localStorage.setItem('automation_selected_model', model);

                      // 폼 열기
                      setShowAddForm(true);

                      // 모달 닫기
                      setSampleModalOpen(false);

                      // 폼 영역으로 스크롤
                      setTimeout(() => {
                        const formEl = document.getElementById('new-title-form');
                        if (formEl) {
                          formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, 100);

                      // 여러 개 선택 시 알림
                      if (selectedSamples.size > 1) {
                        alert(`첫 번째 제목이 폼에 추가되었습니다. 나머지 ${selectedSamples.size - 1}개는 순차적으로 추가해주세요.`);
                      }
                    }}
                    className="px-4 py-1.5 text-sm bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-semibold rounded-lg transition shadow-lg shadow-cyan-500/30"
                  >
                    ✅ 폼에 추가
                  </button>
                )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 재시도 미리보기 모달 */}
      {retryPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-slate-800 shadow-2xl">
            <div className="border-b border-slate-700 p-4">
              <h2 className="text-lg font-bold text-white">🔄 재시도 미리보기</h2>
              <p className="text-sm text-slate-400 mt-1 truncate">{retryPreviewModal.title}</p>
            </div>

            <div className="p-4 space-y-4">
              {/* 에러 메시지 */}
              {retryPreviewModal.preview.error && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50">
                  <p className="text-red-300 text-sm">⚠️ {retryPreviewModal.preview.error}</p>
                </div>
              )}

              {/* 현재 상태 */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-slate-700">
                  <p className="text-slate-400 text-xs mb-1">현재 단계</p>
                  <p className="text-white font-semibold">{retryPreviewModal.preview.previousType || retryPreviewModal.preview.currentType || '-'}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-700">
                  <p className="text-slate-400 text-xs mb-1">상태</p>
                  <p className="text-white font-semibold">{retryPreviewModal.preview.previousStatus || retryPreviewModal.preview.currentStatus || '-'}</p>
                </div>
              </div>

              {/* 폴더 파일 상태 */}
              {retryPreviewModal.preview.files && (
                <div className="p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                  <p className="text-slate-300 text-xs font-semibold mb-2">📁 폴더 상태</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={retryPreviewModal.preview.files.storyValid ? 'text-green-400' : 'text-red-400'}>
                        {retryPreviewModal.preview.files.storyValid ? '✅' : '❌'}
                      </span>
                      <span className="text-slate-300">story.json</span>
                      {retryPreviewModal.preview.files.hasStory && !retryPreviewModal.preview.files.storyValid && (
                        <span className="text-yellow-400">(손상)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={retryPreviewModal.preview.files.hasImages ? 'text-green-400' : 'text-slate-500'}>
                        {retryPreviewModal.preview.files.hasImages ? '✅' : '⬜'}
                      </span>
                      <span className="text-slate-300">이미지</span>
                      {retryPreviewModal.preview.files.hasImages && (
                        <span className="text-cyan-400">({retryPreviewModal.preview.files.imageCount}개)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={retryPreviewModal.preview.files.hasVideo ? 'text-green-400' : 'text-slate-500'}>
                        {retryPreviewModal.preview.files.hasVideo ? '✅' : '⬜'}
                      </span>
                      <span className="text-slate-300">영상</span>
                      {retryPreviewModal.preview.files.videoFileName && (
                        <span className="text-cyan-400 text-[10px]">({retryPreviewModal.preview.files.videoFileName})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={retryPreviewModal.preview.files.hasYoutubeLink ? 'text-green-400' : 'text-slate-500'}>
                        {retryPreviewModal.preview.files.hasYoutubeLink ? '✅' : '⬜'}
                      </span>
                      <span className="text-slate-300">YouTube</span>
                    </div>
                  </div>
                  {retryPreviewModal.preview.mediaMode && (
                    <p className="text-slate-400 text-xs mt-2">미디어 모드: {retryPreviewModal.preview.mediaMode}</p>
                  )}
                </div>
              )}

              {/* 재시도 시작 위치 */}
              {retryPreviewModal.preview.retryFromType && (
                <div className="p-3 rounded-lg bg-green-500/20 border border-green-500/50">
                  <p className="text-green-300 text-sm">
                    ✅ <strong>{retryPreviewModal.preview.retryFromType}</strong>부터 재시도합니다
                  </p>
                  {retryPreviewModal.preview.message && (
                    <p className="text-green-200/70 text-xs mt-1">{retryPreviewModal.preview.message}</p>
                  )}
                </div>
              )}

              {/* 강제 재시도 버튼들 */}
              {!retryPreviewModal.preview.error && (
                <div className="border-t border-slate-600 pt-3">
                  <p className="text-slate-400 text-xs mb-2">특정 단계부터 강제 재시도:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => executeRetry(retryPreviewModal.taskId, 'script')}
                      className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition"
                    >
                      📝 대본부터
                    </button>
                    <button
                      onClick={() => executeRetry(retryPreviewModal.taskId, 'image')}
                      className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
                      disabled={!retryPreviewModal.preview.files?.storyValid}
                    >
                      🖼️ 이미지부터
                    </button>
                    <button
                      onClick={() => executeRetry(retryPreviewModal.taskId, 'video')}
                      className="px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition"
                      disabled={!retryPreviewModal.preview.files?.hasImages}
                    >
                      🎬 영상부터
                    </button>
                    <button
                      onClick={() => executeRetry(retryPreviewModal.taskId, 'youtube')}
                      className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-lg transition"
                      disabled={!retryPreviewModal.preview.files?.hasVideo}
                    >
                      ▶️ 업로드부터
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 버튼 영역 */}
            <div className="flex justify-end gap-2 border-t border-slate-700 p-4">
              <button
                onClick={() => setRetryPreviewModal(null)}
                className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              >
                닫기
              </button>
              {retryPreviewModal.preview.retryFromType && !retryPreviewModal.preview.error && (
                <button
                  onClick={() => executeRetry(retryPreviewModal.taskId)}
                  className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg transition"
                >
                  🔄 재시도 실행
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 이미지 크롤링 모달 */}
      {imageCrawlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-800 shadow-2xl">
            <div className="border-b border-slate-700 p-6">
              <h2 className="text-xl font-bold text-white">이미지 생성 방식 선택</h2>
              <p className="mt-2 text-sm text-slate-300">
                "{imageCrawlModal.title}" 이미지를 어떻게 생성하시겠습니까?
              </p>
            </div>

            <div className="p-6 space-y-3">
              {/* ImageFX + Whisk */}
              <button
                onClick={() => executeImageCrawling('imagefx')}
                className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 text-left font-semibold text-white transition hover:from-purple-700 hover:to-pink-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>🎨 ImageFX + Whisk</span>
                    </div>
                    <p className="mt-1 text-xs text-white/80">
                      첫 이미지를 ImageFX로 생성하여 일관된 인물 이미지 사용
                    </p>
                  </div>
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Whisk만 사용 */}
              <button
                onClick={() => executeImageCrawling('whisk')}
                className="w-full rounded-lg bg-cyan-600 px-6 py-4 text-left font-semibold text-white transition hover:bg-cyan-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>✨ Whisk만 사용</span>
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded">기본</span>
                    </div>
                    <p className="mt-1 text-xs text-white/80">
                      Whisk만 사용하여 이미지 생성 (빠르고 간단)
                    </p>
                  </div>
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Flow - BTS-0000034 */}
              <button
                onClick={() => executeImageCrawling('flow')}
                className="w-full rounded-lg bg-gradient-to-r from-orange-600 to-red-600 px-6 py-4 text-left font-semibold text-white transition hover:from-orange-700 hover:to-red-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>🎯 Flow</span>
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded">NEW</span>
                    </div>
                    <p className="mt-1 text-xs text-white/80">
                      Google Labs Flow로 이미지 생성
                    </p>
                  </div>
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>

            <div className="border-t border-slate-700 p-6">
              <button
                onClick={() => setImageCrawlModal(null)}
                className="w-full rounded-lg bg-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 위로가기 플로팅 버튼 */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all hover:scale-110"
          title="맨 위로"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function AutomationPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
      <AutomationPageContent />
    </Suspense>
  );
}
