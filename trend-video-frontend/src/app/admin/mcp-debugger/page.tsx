'use client';

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Bug {
  id: string;
  type: 'bug' | 'spec';
  priority: string | null;
  title: string;
  summary: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  screenshotPath: string | null;
  createdAt: string;
  assignedTo: string | null;
}

interface StatusCounts {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

export default function McpDebuggerPage() {
  const router = useRouter();
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ open: 0, in_progress: 0, resolved: 0, closed: 0 });

  // 버그 등록 상태
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBug, setNewBug] = useState({ type: 'bug' as 'bug' | 'spec', title: '', summary: '', priority: 'P2' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  // 이미지 업로드 상태
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkAuth();
    fetchBugs();

    // 5초마다 자동 갱신
    refreshIntervalRef.current = setInterval(fetchBugsSilent, 5000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

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

  const fetchBugs = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/bugs?status=open&pageSize=10', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch bugs');

      const data = await response.json();
      setBugs(data.bugs || []);
      setStatusCounts(data.statusCounts || { open: 0, in_progress: 0, resolved: 0, closed: 0 });
    } catch (error) {
      console.error('Error fetching bugs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBugsSilent = useCallback(async () => {
    try {
      const response = await fetch('/api/bugs?status=open&pageSize=10', { credentials: 'include' });
      if (!response.ok) return;

      const data = await response.json();
      setBugs(data.bugs || []);
      setStatusCounts(data.statusCounts || { open: 0, in_progress: 0, resolved: 0, closed: 0 });
    } catch {
      // 무시
    }
  }, []);

  // 스크린샷 파일 선택 핸들러
  const handleScreenshotChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPath(null);
    setFileInputKey(prev => prev + 1);
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
      alert('버그가 등록되었습니다.');
    } catch (error) {
      console.error('Create bug error:', error);
      alert('버그 등록에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: Bug['status']) => {
    const configs = {
      open: { label: 'Open', bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500' },
      in_progress: { label: 'In Progress', bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500' },
      resolved: { label: 'Resolved', bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500' },
      closed: { label: 'Closed', bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500' }
    };
    const config = configs[status];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
        {config.label}
      </span>
    );
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">MCP Debugger Console</h1>
            <p className="mt-1 text-sm text-slate-400">
              버그 등록 및 현황 모니터링
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              {showCreateForm ? '취소' : '+ 버그 등록'}
            </button>
            <Link
              href="/admin/bts"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              BTS 전체
            </Link>
            <Link
              href="/admin"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              뒤로
            </Link>
          </div>
        </div>

        {/* 버그 등록 폼 */}
        {showCreateForm && (
          <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4">버그/SPEC 등록</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">유형</label>
                <select
                  value={newBug.type}
                  onChange={(e) => setNewBug(prev => ({ ...prev, type: e.target.value as 'bug' | 'spec' }))}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
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
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="P0">P0 (Critical)</option>
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
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-300 mb-1">설명</label>
                <textarea
                  value={newBug.summary}
                  onChange={(e) => setNewBug(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="상세 설명 (선택)"
                  rows={3}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none resize-none"
                />
              </div>

              {/* 스크린샷 업로드 - SPEC-3000 */}
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-300 mb-1">스크린샷 (선택)</label>
                <div className="flex items-center gap-4">
                  <input
                    key={fileInputKey}
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshotChange}
                    className="hidden"
                    id="console-screenshot-input"
                  />
                  <label
                    htmlFor="console-screenshot-input"
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition ${
                      isUploadingImage
                        ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:border-emerald-500'
                    }`}
                  >
                    {isUploadingImage ? (
                      <>⏳ 업로드 중...</>
                    ) : (
                      <>📷 이미지 선택</>
                    )}
                  </label>
                  {screenshotPath && (
                    <div className="flex items-center gap-2">
                      <a
                        href={screenshotPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-emerald-400 hover:underline"
                      >
                        {screenshotFile?.name || '업로드됨'}
                      </a>
                      <button
                        type="button"
                        onClick={removeScreenshot}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        ❌ 삭제
                      </button>
                    </div>
                  )}
                </div>
                {screenshotPath && (
                  <div className="mt-2">
                    <img
                      src={screenshotPath}
                      alt="Screenshot preview"
                      className="max-h-48 rounded-lg border border-slate-600"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={refineWithAI}
                disabled={isRefining}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {isRefining ? '🤖 AI 정제 중...' : '🤖 AI 정제'}
              </button>
              <button
                onClick={createBug}
                disabled={isSubmitting || isUploadingImage || !newBug.title.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSubmitting ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </div>
        )}

        {/* 상태 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <div className="text-3xl font-bold text-red-400">{statusCounts.open}</div>
            <div className="text-sm text-slate-400">Open</div>
          </div>
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">{statusCounts.in_progress}</div>
            <div className="text-sm text-slate-400">In Progress</div>
          </div>
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
            <div className="text-3xl font-bold text-green-400">{statusCounts.resolved}</div>
            <div className="text-sm text-slate-400">Resolved</div>
          </div>
          <div className="rounded-xl border border-slate-500/30 bg-slate-500/10 p-4 text-center">
            <div className="text-3xl font-bold text-slate-400">{statusCounts.closed}</div>
            <div className="text-sm text-slate-400">Closed</div>
          </div>
        </div>

        {/* Open 버그 목록 */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4">🐛 Open 버그/SPEC ({bugs.length}건)</h2>

          {isLoading ? (
            <div className="text-center text-slate-400 py-8">로딩 중...</div>
          ) : bugs.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              <div className="text-4xl mb-2">✅</div>
              <p>처리할 버그가 없습니다!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bugs.map((bug) => (
                <div
                  key={bug.id}
                  className="rounded-lg border border-white/10 bg-slate-800/50 p-3 hover:border-emerald-500/50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-emerald-400">{bug.id}</span>
                        {getTypeBadge(bug.type)}
                        {getStatusBadge(bug.status)}
                        {bug.priority && (
                          <span className="text-xs text-yellow-400">{bug.priority}</span>
                        )}
                      </div>
                      <h3 className="text-sm text-white font-medium break-words">{bug.title}</h3>
                      {bug.summary && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{bug.summary}</p>
                      )}
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(bug.createdAt).toLocaleString('ko-KR')}
                        {bug.assignedTo && <span className="ml-2">담당: {bug.assignedTo}</span>}
                      </div>
                    </div>

                    {/* 스크린샷 썸네일 */}
                    {bug.screenshotPath && (
                      <a
                        href={bug.screenshotPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        <img
                          src={bug.screenshotPath}
                          alt="Screenshot"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-600 hover:border-emerald-500 transition"
                        />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {bugs.length > 0 && (
            <div className="mt-4 text-center">
              <Link
                href="/admin/bts"
                className="text-sm text-emerald-400 hover:underline"
              >
                전체 목록 보기 →
              </Link>
            </div>
          )}
        </div>

        {/* 가이드 섹션 */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl space-y-4">
          <h2 className="text-lg font-semibold text-white">📖 MCP Debugger 가이드</h2>

          <div className="rounded-xl bg-slate-800/60 p-3 text-sm">
            <h3 className="font-medium text-emerald-300 mb-2">1) 서버 실행</h3>
            <pre className="rounded bg-slate-700/60 px-3 py-2 text-emerald-200 text-xs overflow-auto">
{`cd mcp-debugger
npm install
npm run dev  # 또는 npm run start (빌드 후)`}
            </pre>
          </div>

          <div className="rounded-xl bg-slate-800/60 p-3 text-sm">
            <h3 className="font-medium text-emerald-300 mb-2">2) 주요 MCP 도구</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-1 text-xs">
              <li><code className="text-emerald-200">bug.create</code> / <code className="text-emerald-200">bug.list</code> / <code className="text-emerald-200">bug.claim</code> / <code className="text-emerald-200">bug.update</code></li>
              <li><code className="text-emerald-200">@디버깅</code> - 자동 할당 + 해결 안내</li>
              <li><code className="text-emerald-200">add_error</code> / <code className="text-emerald-200">get_pending_errors</code> - 에러 큐</li>
            </ul>
          </div>

          <div className="text-center">
            <a
              href="/diagrams/bts-architecture"
              className="text-emerald-300 underline decoration-emerald-400/70 hover:text-emerald-200 text-sm"
            >
              🗺️ BTS/에러처리 아키텍처 보기
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
