'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Bug = {
  id: string;
  title: string;
  summary?: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  logPath?: string | null;
  screenshotPath?: string | null;
  videoPath?: string | null;
  tracePath?: string | null;
  resolutionNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
  assignedTo?: string | null;
  metadata?: any;
};

type StatusKey = Bug['status'] | 'all';

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'open', label: '열림' },
  { key: 'in_progress', label: '진행 중' },
  { key: 'resolved', label: '해결됨' },
  { key: 'closed', label: '닫힘' }
];

const STATUS_BADGE: Record<Bug['status'], string> = {
  open: 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
  in_progress: 'bg-blue-500/20 text-blue-100 border border-blue-500/30',
  resolved: 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/30',
  closed: 'bg-slate-500/20 text-slate-100 border border-slate-500/30'
};

const STATUS_LABEL: Record<Bug['status'], string> = {
  open: '열림',
  in_progress: '진행 중',
  resolved: '해결됨',
  closed: '닫힘'
};

const EMPTY_COUNTS: Record<StatusKey, number> = {
  all: 0,
  open: 0,
  in_progress: 0,
  resolved: 0,
  closed: 0
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function LinkBadge({ path, label }: { path?: string | null; label: string }) {
  if (!path) {
    return <span className="text-xs text-slate-500">-</span>;
  }
  return (
    <a
      href={path}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-slate-700/60 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600 transition"
    >
      {label}
    </a>
  );
}

export default function AdminBugsPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [status, setStatus] = useState<StatusKey>('open');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<StatusKey, number>>(EMPTY_COUNTS);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [recordingEnabled, setRecordingEnabled] = useState<boolean | null>(null);
  const [recordingSaving, setRecordingSaving] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'include' });
        const data = await response.json();
        if (!data.user || !data.user.isAdmin) {
          alert('관리자 권한이 필요합니다.');
          router.push('/');
          return;
        }
        setIsAuthorized(true);
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/auth');
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!isAuthorized) return;
    const loadRecording = async () => {
      try {
        const res = await fetch('/api/bugs/recording', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setRecordingEnabled(!!data.enabled);
        }
      } catch (error) {
        console.error('녹화 설정 로드 실패:', error);
      }
    };
    loadRecording();
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          status,
          page: String(page),
          pageSize: String(pageSize)
        });
        if (debouncedSearch) {
          params.set('q', debouncedSearch);
        }
        const res = await fetch(`/api/bugs?${params.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setBugs(data.bugs || []);
          setTotal(data.total || 0);
          setStatusCounts(data.statusCounts || EMPTY_COUNTS);
        } else {
          console.error('버그 목록 로드 실패:', await res.text());
        }
      } catch (error) {
        console.error('버그 목록 로드 오류:', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [status, page, debouncedSearch, isAuthorized, pageSize, reloadKey]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">🛠️ 버그 리포트</h1>
            <p className="mt-2 text-slate-300">MySQL bugs 테이블에서 바로 조회합니다.</p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            ← 관리자 홈
          </Link>
        </div>

        <div className="mb-6 flex w-full gap-2 justify-end">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="ID, 제목, 요약 검색..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-purple-500 md:w-80"
          />
          <button
            onClick={() => {
              setPage(1);
              setReloadKey((prev) => prev + 1);
            }}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            새로고침
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
          <span className="font-semibold text-white">UI 테스트 녹화</span>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={recordingEnabled ?? false}
              disabled={recordingEnabled === null || recordingSaving}
              onChange={async (e) => {
                const next = e.target.checked;
                setRecordingSaving(true);
                try {
                  const res = await fetch('/api/bugs/recording', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ enabled: next })
                  });
                  if (res.ok) {
                    setRecordingEnabled(next);
                  } else {
                    console.error('녹화 설정 저장 실패:', await res.text());
                  }
                } catch (error) {
                  console.error('녹화 설정 저장 오류:', error);
                } finally {
                  setRecordingSaving(false);
                }
              }}
              className="h-4 w-4 accent-purple-500"
            />
            <span className="text-xs text-slate-300">
              {recordingEnabled ? 'ON - 실패 시 영상/트레이스 캡처' : 'OFF - 영상 녹화 없이 실행'}
            </span>
            {recordingSaving && <span className="text-xs text-slate-400">저장 중...</span>}
          </label>
        </div>

        <div className="mb-6 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => {
                setStatus(option.key);
                setPage(1);
              }}
              className={`rounded-2xl border p-4 shadow-lg transition-all text-left ${
                status === option.key
                  ? 'border-purple-500 bg-gradient-to-br from-purple-600/30 to-purple-700/20 ring-2 ring-purple-500/50'
                  : 'border-white/5 bg-gradient-to-br from-slate-800/70 to-slate-900/80 hover:border-purple-500/30 hover:from-slate-800/90 hover:to-slate-900/90'
              }`}
            >
              <div className={`text-sm ${status === option.key ? 'text-purple-200 font-semibold' : 'text-slate-400'}`}>
                {option.label}
              </div>
              <div className={`mt-1 text-3xl font-bold ${status === option.key ? 'text-white' : 'text-white'}`}>
                {statusCounts[option.key] ?? 0}
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4 shadow-xl backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">버그 목록</h2>
              <p className="text-sm text-slate-400">
                최신순 정렬 · 페이지 {page}/{totalPages} · {total}건
              </p>
            </div>
            {isLoading && <div className="text-sm text-slate-400">불러오는 중...</div>}
          </div>

          <div className="space-y-3">
            {bugs.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                버그가 없습니다.
              </div>
            )}
            {bugs.map((bug) => {
              // 메타 정보 파싱
              const content = bug.metadata?.full_content || bug.summary || '';
              const metaInfo: any = {};

              // 발생일 추출
              const dateMatch = content.match(/발생일[:\s]*(.+?)(?:\n|$)/);
              if (dateMatch) metaInfo.date = dateMatch[1].trim();

              // 우선순위 추출
              const priorityMatch = content.match(/우선순위[:\s]*[^*]*\*\*([^*]+)\*\*/);
              if (priorityMatch) metaInfo.priority = priorityMatch[1].trim();

              // 심각도 추출 (우선순위와 동일하게 처리)
              const severityMatch = content.match(/심각도[:\s]*[^*]*\*\*([^*]+)\*\*/);
              if (severityMatch) metaInfo.severity = severityMatch[1].trim();

              // 관련 파일 추출
              const fileMatch = content.match(/관련 파일[:\s]*`([^`]+)`/);
              if (fileMatch) metaInfo.file = fileMatch[1].trim();

              // 심각도 색상 결정
              const severityColor =
                metaInfo.severity?.includes('CRITICAL') ? 'text-red-400 font-bold' :
                metaInfo.severity?.includes('HIGH') ? 'text-orange-400 font-semibold' :
                metaInfo.severity?.includes('MEDIUM') ? 'text-yellow-400' :
                metaInfo.severity?.includes('LOW') ? 'text-blue-400' :
                metaInfo.severity?.includes('MINOR') ? 'text-slate-400' :
                'text-slate-400';

              return (
                <div
                  key={bug.id}
                  className="rounded-xl border border-slate-800 bg-slate-800/30 p-4 hover:bg-slate-800/50 transition"
                >
                  {/* 헤더: ID, 제목, 상태, 메타 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-purple-300">{bug.id}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[bug.status]}`}>
                          {STATUS_LABEL[bug.status]}
                        </span>
                        {(metaInfo.severity || metaInfo.priority) && (
                          <span className={`text-xs ${severityColor}`}>
                            {metaInfo.severity || metaInfo.priority}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-white text-base mb-1">{bug.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        {metaInfo.date && <span>📅 {metaInfo.date}</span>}
                        {metaInfo.file && <span className="font-mono">📁 {metaInfo.file}</span>}
                        {bug.assignedTo && <span>👤 {bug.assignedTo}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDate(bug.createdAt)}
                    </div>
                  </div>

                {/* 내용 */}
                {(() => {
                  let displayContent = bug.metadata?.full_content || bug.summary;
                  if (!displayContent) return null;

                  // "## 📋 기본 정보" 섹션 제거 (다음 ## 전까지)
                  displayContent = displayContent.replace(/##\s*📋\s*기본\s*정보[\s\S]*?(?=\n##|$)/i, '');

                  // 앞뒤 공백 제거
                  displayContent = displayContent.trim();

                  if (!displayContent) return null;

                  return (
                    <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-900/50 rounded-lg p-3 mb-3 max-h-96 overflow-y-auto">
                      {displayContent}
                    </div>
                  );
                })()}

                {/* Resolution Note */}
                {bug.resolutionNote && (
                  <div className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 border border-emerald-500/30">
                    ✅ 해결: {bug.resolutionNote}
                  </div>
                )}

                {/* 푸터: 첨부파일 링크 */}
                <div className="flex items-center gap-2 text-xs">
                  <LinkBadge path={bug.logPath} label="Log" />
                  <LinkBadge path={bug.screenshotPath} label="Screenshot" />
                  <LinkBadge path={bug.videoPath} label="Video" />
                  <LinkBadge path={bug.tracePath} label="Trace" />
                </div>
              </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              총 {total}건 · 페이지 {page}/{totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-800/60"
              >
                이전
              </button>
              <button
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-800/60"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
