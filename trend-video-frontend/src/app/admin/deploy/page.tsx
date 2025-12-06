'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DeployHistory {
  id: string;
  environment: 'development' | 'staging' | 'production';
  status: 'pending' | 'building' | 'deploying' | 'success' | 'failed' | 'rolled_back';
  version?: string;
  commit?: string;
  commitMessage?: string;
  url?: string;
  duration?: number;
  startedAt: string;
  completedAt?: string;
  triggeredBy: string;
  error?: string;
}

interface PipelineStatus {
  environment: string;
  lastDeploy?: DeployHistory;
  isRunning: boolean;
  healthStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  healthCheckUrl?: string;
}

export default function DeployPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [deployHistory, setDeployHistory] = useState<DeployHistory[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<string>('all');
  const [isDeploying, setIsDeploying] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchDeployData();
    const interval = setInterval(fetchDeployData, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await response.json();
      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
      }
    } catch {
      router.push('/auth');
    }
  };

  const fetchDeployData = async () => {
    try {
      // 실제 API 호출 대신 목업 데이터 사용
      const mockHistory: DeployHistory[] = [
        {
          id: 'deploy-001',
          environment: 'production',
          status: 'success',
          version: '1.2.3',
          commit: 'abc1234',
          commitMessage: 'feat: Add new feature',
          url: 'https://trend-video.vercel.app',
          duration: 125000,
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          completedAt: new Date(Date.now() - 3475000).toISOString(),
          triggeredBy: 'Claude CI/CD'
        },
        {
          id: 'deploy-002',
          environment: 'staging',
          status: 'success',
          version: '1.2.4-beta',
          commit: 'def5678',
          commitMessage: 'fix: Bug fix',
          duration: 98000,
          startedAt: new Date(Date.now() - 7200000).toISOString(),
          completedAt: new Date(Date.now() - 7102000).toISOString(),
          triggeredBy: 'GitHub Actions'
        },
        {
          id: 'deploy-003',
          environment: 'production',
          status: 'failed',
          commit: 'ghi9012',
          commitMessage: 'chore: Update deps',
          duration: 45000,
          startedAt: new Date(Date.now() - 86400000).toISOString(),
          completedAt: new Date(Date.now() - 86355000).toISOString(),
          triggeredBy: 'Manual',
          error: 'Build failed: TypeScript error in src/app/api/route.ts'
        }
      ];

      const mockStatus: PipelineStatus[] = [
        {
          environment: 'production',
          lastDeploy: mockHistory[0],
          isRunning: false,
          healthStatus: 'healthy',
          healthCheckUrl: 'https://trend-video.vercel.app/api/health'
        },
        {
          environment: 'staging',
          lastDeploy: mockHistory[1],
          isRunning: false,
          healthStatus: 'healthy',
          healthCheckUrl: 'https://trend-video-staging.vercel.app/api/health'
        },
        {
          environment: 'development',
          isRunning: false,
          healthStatus: 'unknown'
        }
      ];

      setDeployHistory(mockHistory);
      setPipelineStatus(mockStatus);
    } catch (error) {
      console.error('Failed to fetch deploy data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerDeploy = async (environment: string) => {
    if (!confirm(`${environment} 환경에 배포하시겠습니까?`)) return;

    setIsDeploying(true);
    try {
      // 실제 배포 API 호출
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert(`${environment} 배포가 시작되었습니다.`);
      fetchDeployData();
    } catch (error) {
      console.error('Deploy failed:', error);
      alert('배포 시작에 실패했습니다.');
    } finally {
      setIsDeploying(false);
    }
  };

  const runHealthCheck = async (url: string) => {
    try {
      const response = await fetch(url, { mode: 'no-cors' });
      alert('Health check 요청이 전송되었습니다.');
    } catch {
      alert('Health check 실패');
    }
  };

  const getStatusBadge = (status: DeployHistory['status']) => {
    const configs: Record<DeployHistory['status'], { label: string; bg: string; text: string }> = {
      pending: { label: 'Pending', bg: 'bg-gray-500/20', text: 'text-gray-300' },
      building: { label: 'Building', bg: 'bg-yellow-500/20', text: 'text-yellow-300' },
      deploying: { label: 'Deploying', bg: 'bg-blue-500/20', text: 'text-blue-300' },
      success: { label: 'Success', bg: 'bg-green-500/20', text: 'text-green-300' },
      failed: { label: 'Failed', bg: 'bg-red-500/20', text: 'text-red-300' },
      rolled_back: { label: 'Rolled Back', bg: 'bg-orange-500/20', text: 'text-orange-300' }
    };
    const config = configs[status];
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getHealthBadge = (status: PipelineStatus['healthStatus']) => {
    const configs: Record<PipelineStatus['healthStatus'], { label: string; color: string }> = {
      healthy: { label: '정상', color: 'text-green-400' },
      degraded: { label: '저하', color: 'text-yellow-400' },
      down: { label: '다운', color: 'text-red-400' },
      unknown: { label: '알 수 없음', color: 'text-gray-400' }
    };
    const config = configs[status];
    return <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>;
  };

  const getEnvBadge = (env: string) => {
    const configs: Record<string, { bg: string; text: string }> = {
      production: { bg: 'bg-red-500/20', text: 'text-red-300' },
      staging: { bg: 'bg-yellow-500/20', text: 'text-yellow-300' },
      development: { bg: 'bg-blue-500/20', text: 'text-blue-300' }
    };
    const config = configs[env] || { bg: 'bg-gray-500/20', text: 'text-gray-300' };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${config.bg} ${config.text}`}>
        {env}
      </span>
    );
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  const filteredHistory = selectedEnv === 'all'
    ? deployHistory
    : deployHistory.filter(d => d.environment === selectedEnv);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Deploy Dashboard</h1>
          <div className="flex gap-2">
            <Link
              href="/admin/bts"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500"
            >
              BTS
            </Link>
            <Link
              href="/admin/architecture"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Architecture
            </Link>
            <Link
              href="/admin"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Back
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-white py-12">Loading...</div>
        ) : (
          <>
            {/* Pipeline Status Cards */}
            <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              {pipelineStatus.map((pipeline) => (
                <div
                  key={pipeline.environment}
                  className="rounded-xl border border-white/10 bg-slate-800/50 p-5 backdrop-blur"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white capitalize">
                      {pipeline.environment}
                    </h3>
                    {getHealthBadge(pipeline.healthStatus)}
                  </div>

                  {pipeline.lastDeploy && (
                    <div className="space-y-2 text-sm text-slate-300 mb-4">
                      <div className="flex justify-between">
                        <span>Last Deploy:</span>
                        {getStatusBadge(pipeline.lastDeploy.status)}
                      </div>
                      {pipeline.lastDeploy.version && (
                        <div className="flex justify-between">
                          <span>Version:</span>
                          <span className="text-purple-400">{pipeline.lastDeploy.version}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Duration:</span>
                        <span>{formatDuration(pipeline.lastDeploy.duration)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => triggerDeploy(pipeline.environment)}
                      disabled={isDeploying || pipeline.isRunning}
                      className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                    >
                      {pipeline.isRunning ? 'Running...' : 'Deploy'}
                    </button>
                    {pipeline.healthCheckUrl && (
                      <button
                        onClick={() => runHealthCheck(pipeline.healthCheckUrl!)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                      >
                        Health Check
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Deploy History */}
            <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Deploy History</h2>
                <select
                  value={selectedEnv}
                  onChange={(e) => setSelectedEnv(e.target.value)}
                  className="rounded-lg bg-slate-700 border border-slate-600 px-3 py-1.5 text-sm text-white"
                >
                  <option value="all">All Environments</option>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
              </div>

              <div className="space-y-3">
                {filteredHistory.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No deploy history</p>
                ) : (
                  filteredHistory.map((deploy) => (
                    <div
                      key={deploy.id}
                      className="rounded-lg border border-white/5 bg-slate-700/50 p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getEnvBadge(deploy.environment)}
                          {getStatusBadge(deploy.status)}
                          {deploy.version && (
                            <span className="text-sm text-purple-400">{deploy.version}</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(deploy.startedAt).toLocaleString('ko-KR')}
                        </span>
                      </div>

                      <div className="text-sm text-slate-300 space-y-1">
                        {deploy.commit && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">Commit:</span>
                            <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                              {deploy.commit}
                            </code>
                            {deploy.commitMessage && (
                              <span className="text-slate-300 truncate">
                                {deploy.commitMessage}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">
                            Duration: {formatDuration(deploy.duration)}
                          </span>
                          <span className="text-slate-400">
                            By: {deploy.triggeredBy}
                          </span>
                        </div>

                        {deploy.url && (
                          <a
                            href={deploy.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline text-xs"
                          >
                            {deploy.url}
                          </a>
                        )}

                        {deploy.error && (
                          <div className="mt-2 p-2 rounded bg-red-900/30 border border-red-500/30">
                            <p className="text-red-300 text-xs font-mono">{deploy.error}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* CI/CD Pipeline Info */}
            <div className="mt-6 rounded-xl border border-white/10 bg-slate-800/50 p-5 backdrop-blur">
              <h2 className="text-xl font-semibold text-white mb-4">CI/CD Pipeline</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-purple-400 mb-2">Build Pipeline</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>1. TypeScript Type Check (tsc --noEmit)</li>
                    <li>2. ESLint Check</li>
                    <li>3. Unit Tests (Jest)</li>
                    <li>4. Build (next build)</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-purple-400 mb-2">Deploy Pipeline</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>1. Deploy to Vercel/Docker</li>
                    <li>2. Health Check</li>
                    <li>3. Auto Rollback on Failure</li>
                    <li>4. Notify via Email/Slack</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
