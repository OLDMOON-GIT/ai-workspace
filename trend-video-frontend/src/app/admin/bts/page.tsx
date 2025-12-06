'use client';

import { ChangeEvent, ClipboardEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Bug {
  id: string;
  type: 'bug' | 'spec';
  priority: string | null;
  title: string;
  summary: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'failed';
  logPath: string | null;
  screenshotPath: string | null;
  videoPath: string | null;
  tracePath: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: string | null;
  metadata: Record<string, any>;
}

interface StatusCounts {
  all: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  failed: number;
}

interface TypeCounts {
  all: number;
  bug: number;
  spec: number;
}

export default function BugsPage() {
  const router = useRouter();
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, failed: 0 });
  const [typeCounts, setTypeCounts] = useState<TypeCounts>({ all: 0, bug: 0, spec: 0 });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBug, setNewBug] = useState({ type: 'bug' as 'bug' | 'spec', title: '', summary: '', priority: 'P2' });
  const [isRefining, setIsRefining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const pageSize = 100;

  // 수정 모달 상태
  const [editingBug, setEditingBug] = useState<Bug | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editType, setEditType] = useState<'bug' | 'spec'>('bug');
  const [editPriority, setEditPriority] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>('open');
  const [editLoading, setEditLoading] = useState(false);

  // SPEC-3297: 즉시실행(Spawn) 상태
  const [spawningBugId, setSpawningBugId] = useState<string | null>(null);
  const [spawnLogs, setSpawnLogs] = useState<{ bugId: string; logs: string[] } | null>(null);

  // 자동 갱신용 ref (모달이 열려있을 때 갱신해도 모달 유지)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // BTS-3196: 설명 textarea 자동 높이 조절 ref
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editSummaryTextareaRef = useRef<HTMLTextAreaElement>(null);

  // BTS-3196: textarea 자동 높이 조절 함수
  const autoResizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 72)}px`; // 최소 높이 72px (3줄)
  }, []);

  // BTS-3196: newBug.summary 변경 시 등록 폼 textarea 높이 조절
  useEffect(() => {
    autoResizeTextarea(summaryTextareaRef.current);
  }, [newBug.summary, autoResizeTextarea]);

  // BTS-3196: editSummary 변경 시 수정 모달 textarea 높이 조절
  useEffect(() => {
    autoResizeTextarea(editSummaryTextareaRef.current);
  }, [editSummary, autoResizeTextarea]);

  useEffect(() => {
    checkAuth();
  }, []);

  // 필터/검색 조건 변경 시 초기 로딩
  useEffect(() => {
    isInitialLoadRef.current = true;
    fetchBugs();
  }, [statusFilter, typeFilter, page, searchQuery]);

  // 5초마다 자동 갱신 (깜빡임 없이 백그라운드 갱신)
  useEffect(() => {
    // 5초마다 자동 갱신
    refreshIntervalRef.current = setInterval(() => {
      fetchBugsSilent();
    }, 5000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [statusFilter, typeFilter, page, searchQuery]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  // 백그라운드 갱신 (로딩 스피너 표시 안함, 깜빡임 없음)
  const fetchBugsSilent = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        type: typeFilter,
        page: String(page),
        pageSize: String(pageSize)
      });
      if (searchQuery) {
        params.set('q', searchQuery);
      }

      const response = await fetch(`/api/bugs?${params}`, { credentials: 'include' });
      if (!response.ok) return; // 실패 시 조용히 무시

      const data = await response.json();
      setBugs(data.bugs || []);
      setTotal(data.total || 0);
      setStatusCounts(data.statusCounts || { all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, failed: 0 });
      setTypeCounts(data.typeCounts || { all: 0, bug: 0, spec: 0 });
    } catch {
      // 백그라운드 갱신 에러는 조용히 무시
    }
  }, [statusFilter, typeFilter, page, pageSize, searchQuery]);

  // 초기 로딩 (로딩 스피너 표시)
  const fetchBugs = async () => {
    try {
      // 초기 로딩 시에만 로딩 스피너 표시
      if (isInitialLoadRef.current) {
        setIsLoading(true);
      }

      const params = new URLSearchParams({
        status: statusFilter,
        type: typeFilter,
        page: String(page),
        pageSize: String(pageSize)
      });
      if (searchQuery) {
        params.set('q', searchQuery);
      }

      const response = await fetch(`/api/bugs?${params}`, { credentials: 'include' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch bugs: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      setBugs(data.bugs || []);
      setTotal(data.total || 0);
      setStatusCounts(data.statusCounts || { all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, failed: 0 });
      setTypeCounts(data.typeCounts || { all: 0, bug: 0, spec: 0 });
    } catch (error) {
      console.error('Error fetching bugs:', error);
    } finally {
      setIsLoading(false);
      isInitialLoadRef.current = false;
    }
  };

  const deleteBug = async (bugId: string | number) => {
    if (!confirm(`${bugId}를 삭제하시겠습니까?`)) return;
    try {
      const numericId = String(bugId).replace('BTS-', '');
      const response = await fetch(`/api/bugs/${numericId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete bug');
      fetchBugs();
    } catch (error) {
      console.error('Error deleting bug:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const updateBugStatus = async (bugId: string | number, newStatus: string) => {
    try {
      const numericId = String(bugId).replace('BTS-', '');

      // SPEC-3251: 재등록(다시등록) 시 reopenCount 증가
      const currentBug = bugs.find(b => String(b.id).replace('BTS-', '') === numericId);
      const isReopen = newStatus === 'open' && currentBug &&
        ['in_progress', 'resolved', 'closed', 'failed'].includes(currentBug.status);

      const body: any = { status: newStatus };
      if (isReopen) {
        const currentReopenCount = currentBug?.metadata?.reopenCount || 0;
        body.metadata = {
          ...(currentBug?.metadata || {}),
          reopenCount: currentReopenCount + 1,
          lastReopenedAt: new Date().toISOString()
        };
      }

      const response = await fetch(`/api/bugs/${numericId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to update bug');
      fetchBugs();
    } catch (error) {
      console.error('Error updating bug:', error);
      alert('상태 업데이트에 실패했습니다.');
    }
  };


  const openEditModal = (bug: Bug) => {
    setEditingBug(bug);
    setEditTitle(bug.title);
    setEditSummary(bug.summary || '');
    setEditType(bug.type);
    setEditPriority(bug.priority);
    setEditStatus(bug.status);
  };

  const closeEditModal = () => {
    setEditingBug(null);
  };

  const saveEdit = async () => {
    if (!editingBug) return;
    setEditLoading(true);
    try {
      const numericId = String(editingBug.id).replace('BTS-', '');
      const response = await fetch(`/api/bugs/${numericId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: editTitle,
          summary: editSummary || null,
          type: editType,
          priority: editPriority,
          status: editStatus
        })
      });
      if (!response.ok) throw new Error('Failed to update');
      closeEditModal();
      fetchBugs();
      alert('수정되었습니다.');
    } catch (error) {
      console.error('Error:', error);
      alert('수정에 실패했습니다.');
    } finally {
      setEditLoading(false);
    }
  };

  // SPEC-3297: 즉시실행(Spawn) 함수 - Automation 페이지의 spawnExecute와 동일
  const spawnExecute = async (bug: Bug) => {
    const bugId = String(bug.id);
    const title = bug.title;

    if (!confirm(`"${title}"\n\n즉시실행(Spawn)으로 대본 작성을 시작하시겠습니까?\n\n※ SPEC 제목이 영상 제목으로 사용됩니다.`)) {
      return;
    }

    setSpawningBugId(bugId);
    setSpawnLogs({ bugId, logs: [
      `🚀 Spawn 시작`,
      `📝 제목: ${title}`,
      `⏳ Claude CLI 호출 중...`,
    ]});

    try {
      // UUID 생성 (taskId로 사용)
      const taskId = crypto.randomUUID();

      // spawn-task API 호출
      const spawnRes = await fetch('/api/automation/spawn-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          title,
          promptFormat: 'longform',  // 기본 롱폼
          productInfo: null
        })
      });

      const spawnData = await spawnRes.json();

      if (spawnRes.ok && spawnData.success) {
        setSpawnLogs(prev => prev ? {
          ...prev,
          logs: [
            ...prev.logs,
            `✅ 대본 생성 완료!`,
            `📁 저장: ${spawnData.storyPath}`,
            `🎬 씬 개수: ${spawnData.sceneCount}개`,
            `📊 taskId: ${taskId}`,
          ]
        } : null);

        // 성공 시 버그 상태를 resolved로 변경
        const numericId = bugId.replace('BTS-', '');
        await fetch(`/api/bugs/${numericId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            status: 'resolved',
            resolutionNote: `Spawn 즉시실행 완료 - taskId: ${taskId}, storyPath: ${spawnData.storyPath}`
          })
        });

        setSpawnLogs(prev => prev ? {
          ...prev,
          logs: [...prev.logs, `✅ 버그 상태: resolved로 변경됨`]
        } : null);

        fetchBugs();
      } else {
        setSpawnLogs(prev => prev ? {
          ...prev,
          logs: [
            ...prev.logs,
            `❌ 대본 생성 실패`,
            `오류: ${spawnData.error || spawnData.message || '알 수 없는 오류'}`,
          ]
        } : null);
      }
    } catch (error: any) {
      console.error('Spawn execute error:', error);
      setSpawnLogs(prev => prev ? {
        ...prev,
        logs: [
          ...prev.logs,
          `❌ 오류 발생`,
          `${error.message || '알 수 없는 오류'}`,
        ]
      } : null);
    } finally {
      setSpawningBugId(null);
    }
  };

  const getStatusBadge = (status: Bug['status']) => {
    const configs = {
      open: { label: 'Open', bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500' },
      in_progress: { label: 'In Progress', bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500' },
      resolved: { label: 'Resolved', bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500' },
      closed: { label: 'Closed', bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500' },
      failed: { label: 'Failed', bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'border-pink-500' }
    };
    const config = configs[status] || configs.open;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
        {config.label}
      </span>
    );
  };

  const refineWithAI = async () => {
    if (!newBug.title.trim()) {
      alert('제목을 입력해주세요');
      return;
    }
    setIsRefining(true);
    try {
      const response = await fetch('/api/bugs/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: newBug.title, summary: newBug.summary, type: newBug.type })
      });
      if (!response.ok) throw new Error('Refine 실패');
      const data = await response.json();
      setNewBug(prev => ({
        ...prev,
        title: data.title || prev.title,
        summary: data.summary || prev.summary
      }));
    } catch (error) {
      console.error('AI refine error:', error);
      alert('AI 정제에 실패했습니다');
    } finally {
      setIsRefining(false);
    }
  };

  const createBug = async () => {
    if (!newBug.title.trim()) {
      alert('제목을 입력해주세요');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: newBug.type,
          title: newBug.title,
          summary: newBug.summary,
          priority: newBug.priority,
          status: 'open',
          screenshotPath: screenshotPath || null
        })
      });
      if (!response.ok) throw new Error('버그 등록 실패');
      setNewBug({ type: 'bug', title: '', summary: '', priority: 'P2' });
      setScreenshotFile(null);
      setScreenshotPath(null);
      setFileInputKey(prev => prev + 1);
      setShowCreateForm(false);
      fetchBugs();
    } catch (error) {
      console.error('Create bug error:', error);
      alert('버그 등록에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 스크린샷 파일 선택 핸들러
  const handleScreenshotChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    // 10MB 제한
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB 이하여야 합니다.');
      return;
    }

    setScreenshotFile(file);
    setScreenshotPath(null);
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/bugs/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) throw new Error('업로드 실패');

      const data = await response.json();
      setScreenshotPath(data.path);
    } catch (error) {
      console.error('Screenshot upload error:', error);
      alert('스크린샷 업로드에 실패했습니다.');
      setScreenshotFile(null);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // 스크린샷 삭제
  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPath(null);
    setFileInputKey(prev => prev + 1); // input 초기화
  };

  // BTS-3195: 이미지 업로드 공통 함수
  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB 이하여야 합니다.');
      return;
    }

    setScreenshotFile(file);
    setScreenshotPath(null);
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/bugs/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) throw new Error('업로드 실패');

      const data = await response.json();
      setScreenshotPath(data.path);
    } catch (error) {
      console.error('Screenshot upload error:', error);
      alert('스크린샷 업로드에 실패했습니다.');
      setScreenshotFile(null);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // BTS-3195: 클립보드 붙여넣기 핸들러 (Ctrl+V)
  const handlePaste = async (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await uploadImage(file);
        }
        return;
      }
    }
  };

  // BTS-3195: 드래그앤드롭 핸들러
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type.startsWith('image/')) {
      await uploadImage(file);
    } else {
      alert('이미지 파일만 업로드 가능합니다.');
    }
  };

  const getTypeBadge = (type: Bug['type']) => {
    const configs = {
      bug: { label: 'Bug', bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500' },
      spec: { label: 'Spec', bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500' }
    };
    const config = configs[type] || configs.bug;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
        {config.label}
      </span>
    );
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header - BTS-0002984: 모바일 반응형 */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl sm:text-3xl font-bold text-white">Bug Tracking System</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex-1 sm:flex-none rounded-lg bg-purple-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              {showCreateForm ? '취소' : '+ 등록'}
            </button>
            <Link
              href="/admin/architecture"
              className="flex-1 sm:flex-none text-center rounded-lg bg-blue-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              아키텍처
            </Link>
            <Link
              href="/diagrams/bts-architecture"
              className="flex-1 sm:flex-none text-center rounded-lg bg-indigo-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              BTS 아키텍처
            </Link>
            <Link
              href="/admin"
              className="flex-1 sm:flex-none text-center rounded-lg bg-slate-700 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              뒤로
            </Link>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-6 rounded-xl border border-purple-500/30 bg-slate-800/70 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold text-white mb-4">버그/SPEC 등록</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">유형</label>
                <select
                  value={newBug.type}
                  onChange={(e) => setNewBug(prev => ({ ...prev, type: e.target.value as 'bug' | 'spec' }))}
                  className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="bug">Bug</option>
                  <option value="spec">Spec</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">우선순위</label>
                <select
                  value={newBug.priority}
                  onChange={(e) => setNewBug(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="P1">P1 (긴급)</option>
                  <option value="P2">P2 (보통)</option>
                  <option value="P3">P3 (낮음)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-300 mb-1">제목</label>
                <input
                  type="text"
                  value={newBug.title}
                  onChange={(e) => setNewBug(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="버그 제목 또는 SPEC 제목"
                  className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-300 mb-1">설명</label>
                <textarea
                  ref={summaryTextareaRef}
                  value={newBug.summary}
                  onChange={(e) => setNewBug(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="상세 설명 (선택)"
                  rows={3}
                  className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none resize-none overflow-hidden"
                  style={{ minHeight: '72px' }}
                />
              </div>
              {/* 스크린샷 업로드 - BTS-3195: Ctrl+V 붙여넣기 및 드래그앤드롭 지원 */}
              <div
                className="md:col-span-2"
                onPaste={handlePaste}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label className="block text-sm text-slate-300 mb-1">스크린샷 (선택)</label>
                {/* 드래그앤드롭 영역 */}
                <div
                  className={`relative border-2 border-dashed rounded-lg p-4 mb-2 transition-colors ${
                    isDraggingOver
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="text-center text-slate-400 text-sm">
                    {isUploadingImage ? (
                      <span>업로드 중...</span>
                    ) : (
                      <>
                        <p>이미지를 드래그하거나 <kbd className="px-1 py-0.5 bg-slate-700 rounded text-xs">Ctrl+V</kbd>로 붙여넣기</p>
                        <p className="text-xs mt-1">또는 아래 버튼으로 선택</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    key={fileInputKey}
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshotChange}
                    className="hidden"
                    id="screenshot-input"
                  />
                  <label
                    htmlFor="screenshot-input"
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition ${
                      isUploadingImage
                        ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-purple-500'
                    }`}
                  >
                    {isUploadingImage ? (
                      <>업로드 중...</>
                    ) : (
                      <>이미지 선택</>
                    )}
                  </label>
                  {screenshotPath && (
                    <div className="flex items-center gap-2">
                      <a
                        href={screenshotPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-400 hover:underline"
                      >
                        {screenshotFile?.name || '업로드됨'}
                      </a>
                      <button
                        type="button"
                        onClick={removeScreenshot}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
                {screenshotPath && (
                  <div className="mt-2">
                    <img
                      src={screenshotPath}
                      alt="Screenshot preview"
                      className="max-h-40 rounded-lg border border-slate-600"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={refineWithAI}
                disabled={isRefining || isUploadingImage || isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
              >
                {isRefining ? 'AI 정제 중...' : 'AI 정제'}
              </button>
              <button
                onClick={createBug}
                disabled={isSubmitting || isUploadingImage || isRefining || !newBug.title.trim()}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
              >
                {isSubmitting ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </div>
        )}

        {/* Filters - BTS-0002984: 모바일 반응형 개선 */}
        <div className="mb-6 rounded-xl border border-white/10 bg-slate-800/50 p-3 sm:p-4 backdrop-blur">
          {/* 유형 필터 */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3">
            <span className="text-xs sm:text-sm text-slate-400 font-medium w-full sm:w-auto mb-1 sm:mb-0">유형:</span>
            {(['all', 'bug', 'spec'] as const).map((type) => (
              <button
                key={type}
                onClick={() => { setTypeFilter(type); setPage(1); }}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                  typeFilter === type
                    ? type === 'bug' ? 'bg-orange-600 text-white' : type === 'spec' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {type === 'all' ? '전체' : type === 'bug' ? 'Bug' : 'Spec'} ({typeCounts[type]})
              </button>
            ))}
          </div>

          {/* 상태 필터 - 모바일에서 스크롤 가능 */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 overflow-x-auto pb-1">
            <span className="text-xs sm:text-sm text-slate-400 font-medium w-full sm:w-auto mb-1 sm:mb-0">상태:</span>
            {(['all', 'open', 'in_progress', 'failed', 'resolved', 'closed'] as const).map((status) => {
              const cfg: Record<string, { label: string; bg: string }> = {
                all: { label: '전체', bg: 'bg-purple-600' },
                open: { label: 'Open', bg: 'bg-red-600' },
                in_progress: { label: '진행', bg: 'bg-yellow-600' },
                failed: { label: '실패', bg: 'bg-pink-600' },
                resolved: { label: '해결', bg: 'bg-green-600' },
                closed: { label: '종료', bg: 'bg-slate-500' }
              };
              return (
                <button
                  key={status}
                  onClick={() => { setStatusFilter(status); setPage(1); }}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                    statusFilter === status
                      ? `${cfg[status].bg} text-white`
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {cfg[status].label} ({statusCounts[status]})
                </button>
              );
            })}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="ID, 제목, 설명으로 검색..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full rounded-lg bg-slate-700 border border-slate-600 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
          />
        </div>

        {/* Bug List */}
        {isLoading ? (
          <div className="text-center text-white py-12">로딩 중...</div>
        ) : bugs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-12 text-center backdrop-blur">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg text-slate-400">해당 조건의 버그가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bugs.map((bug) => {
              // BTS-3251: 재등록된 버그 여부 확인
              const reopenCount = bug.metadata?.reopenCount || 0;
              const isReopened = reopenCount > 0;

              return (
              <div
                key={bug.id}
                className={`rounded-xl border p-4 backdrop-blur transition ${
                  isReopened
                    ? 'border-orange-500/50 bg-orange-900/20 hover:border-orange-400/70 ring-1 ring-orange-500/30'
                    : 'border-white/10 bg-slate-800/50 hover:border-purple-500/50'
                }`}
              >
                {/* BTS-0002984: 모바일 레이아웃 개선 */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                      <span className="text-xs sm:text-sm font-mono text-purple-400">{bug.id}</span>
                      {getTypeBadge(bug.type)}
                      {getStatusBadge(bug.status)}
                      {bug.priority && (
                        <span className="text-xs text-yellow-400">{bug.priority}</span>
                      )}
                      {/* BTS-3251: 재등록 버그 배지 표시 */}
                      {isReopened && (
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-600 text-white animate-pulse"
                          title={`${reopenCount}회 재등록됨 - 심혈을 기울여 해결 필요!`}
                        >
                          🔄 재등록 x{reopenCount}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base text-white font-medium break-words">{bug.title}</h3>
                    {bug.summary && (
                      <p className="text-xs sm:text-sm text-slate-400 mt-1 whitespace-pre-wrap line-clamp-3 sm:line-clamp-none">{bug.summary}</p>
                    )}
                    {/* SPEC-3110: failed 상태일 때 에러 상세 노출 */}
                    {bug.status === 'failed' && bug.resolutionNote && (
                      <div className="mt-2 p-2 rounded-lg bg-pink-900/30 border border-pink-500/30">
                        <p className="text-xs text-pink-300 font-semibold mb-1">에러 상세:</p>
                        <p className="text-xs text-pink-200 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">{bug.resolutionNote}</p>
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-2">
                      {new Date(bug.createdAt).toLocaleString('ko-KR')}
                      {bug.assignedTo && <span className="ml-2 sm:ml-3">담당: {bug.assignedTo}</span>}
                    </div>
                  </div>

                  {/* 액션 버튼 - 모바일에서 가로 스크롤 */}
                  <div className="flex gap-1.5 sm:gap-2 flex-shrink-0 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      onClick={() => openEditModal(bug)}
                      className="rounded-lg bg-slate-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-500"
                    >
                      수정
                    </button>
                    {/* SPEC-3297: Open 상태에서 즉시실행(Spawn) 버튼 */}
                    {bug.status === 'open' && (
                      <button
                        onClick={() => spawnExecute(bug)}
                        disabled={spawningBugId === String(bug.id)}
                        className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="즉시실행: 제목으로 대본 생성 (Spawn)"
                      >
                        {spawningBugId === String(bug.id) ? '실행중...' : '즉시실행'}
                      </button>
                    )}
                    {bug.status === 'in_progress' && (
                      <>
                        <button
                          onClick={() => updateBugStatus(bug.id, 'open')}
                          className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-purple-500"
                          title="버그를 다시 Open 상태로 변경"
                        >
                          다시등록
                        </button>
                        <button
                          onClick={() => updateBugStatus(bug.id, 'resolved')}
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-500"
                          title="작업을 완료하고 상태를 Resolved로 변경"
                        >
                          해결완료
                        </button>
                      </>
                    )}
                    {bug.status === 'resolved' && (
                      <>
                        <button
                          onClick={() => updateBugStatus(bug.id, 'open')}
                          className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-purple-500"
                          title="버그를 다시 Open 상태로 변경"
                        >
                          다시등록
                        </button>
                        <button
                          onClick={() => updateBugStatus(bug.id, 'closed')}
                          className="rounded-lg bg-slate-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-500"
                          title="버그를 종료하고 상태를 Closed로 변경"
                        >
                          종료
                        </button>
                      </>
                    )}
                    {bug.status === 'closed' && (
                      <button
                        onClick={() => updateBugStatus(bug.id, 'open')}
                        className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-purple-500"
                        title="버그를 다시 Open 상태로 변경"
                      >
                        다시등록
                      </button>
                    )}
                    {/* SPEC-3110: failed 상태 액션 버튼 */}
                    {bug.status === 'failed' && (
                      <button
                        onClick={() => updateBugStatus(bug.id, 'open')}
                        className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-purple-500"
                        title="버그를 다시 Open 상태로 변경하여 재시도"
                      >
                        재시도
                      </button>
                    )}
                    <button
                      onClick={() => deleteBug(bug.id)}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
                      title="버그 삭제"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                {/* Attachments */}
                {(bug.screenshotPath || bug.videoPath || bug.tracePath) && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    {/* 스크린샷 썸네일 미리보기 */}
                    {bug.screenshotPath && (
                      <div className="mb-2">
                        <a
                          href={bug.screenshotPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src={bug.screenshotPath}
                            alt="Screenshot"
                            className="max-h-32 sm:max-h-48 rounded-lg border border-slate-600 hover:border-purple-500 transition cursor-pointer"
                          />
                        </a>
                      </div>
                    )}
                    {/* 기타 첨부파일 링크 */}
                    <div className="flex gap-2">
                      {bug.videoPath && (
                        <a
                          href={bug.videoPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
                        >
                          Video
                        </a>
                      )}
                      {bug.tracePath && (
                        <a
                          href={bug.tracePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
                        >
                          Trace
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50 hover:bg-slate-600"
            >
              이전
            </button>
            <span className="text-slate-300 text-sm">
              {page} / {totalPages} (총 {total}건)
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50 hover:bg-slate-600"
            >
              다음
            </button>
          </div>
        )}

        {/* Edit Modal */}
        {editingBug && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-purple-500/30 bg-slate-800 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-white mb-4">버그/스펙 수정</h2>
              <p className="text-sm text-purple-400 mb-4">{editingBug.id}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">제목</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">요약</label>
                  <textarea
                    ref={editSummaryTextareaRef}
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:border-purple-500 focus:outline-none resize-none overflow-hidden"
                    style={{ minHeight: '72px' }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">타입</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as 'bug' | 'spec')}
                      className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value="bug">Bug</option>
                      <option value="spec">Spec</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">우선순위</label>
                    <select
                      value={editPriority || ''}
                      onChange={(e) => setEditPriority(e.target.value || null)}
                      className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">없음</option>
                      <option value="P0">P0 (Critical)</option>
                      <option value="P1">P1 (High)</option>
                      <option value="P2">P2 (Medium)</option>
                      <option value="P3">P3 (Low)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">상태</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={closeEditModal}
                  className="rounded-lg bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-500"
                >
                  취소
                </button>
                <button
                  onClick={saveEdit}
                  disabled={editLoading}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {editLoading ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SPEC-3297: Spawn 로그 모달 */}
        {spawnLogs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-orange-500/30 bg-slate-800 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">즉시실행 로그</h2>
                <span className="text-sm text-orange-400">{spawnLogs.bugId}</span>
              </div>

              <div className="bg-slate-900 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-sm">
                {spawnLogs.logs.map((log, idx) => (
                  <div key={idx} className="text-slate-300 mb-1">
                    {log}
                  </div>
                ))}
                {spawningBugId && (
                  <div className="text-orange-400 animate-pulse mt-2">⏳ 실행 중...</div>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setSpawnLogs(null)}
                  disabled={!!spawningBugId}
                  className="rounded-lg bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
