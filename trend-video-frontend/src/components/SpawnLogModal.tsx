'use client';

import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface SpawnLogModalProps {
  taskId: string;
  title: string;
  onClose: () => void;
  onComplete?: (success: boolean) => void;
}

/**
 * BTS-3201: Spawn 실시간 로그 모달
 * - script.log를 실시간 폴링
 * - 진행 상황 표시 (시작/완료/실패)
 */
export default function SpawnLogModal({ taskId, title, onClose, onComplete }: SpawnLogModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'running' | 'completed' | 'failed'>('running');
  const [error, setError] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    // 시작 시 로그 초기화
    setLogs([]);
    offsetRef.current = 0;
    setStatus('running');
    setError(null);

    // 폴링 시작 (1초 간격)
    const pollLogs = async () => {
      try {
        const res = await fetch(`/api/automation/spawn-log?taskId=${taskId}&offset=${offsetRef.current}`);
        if (!res.ok) {
          throw new Error('로그 조회 실패');
        }
        const data = await res.json();

        // 새 로그 추가
        if (data.logs && data.logs.length > 0) {
          setLogs(prev => [...prev, ...data.logs]);
          offsetRef.current = data.offset;
        }

        // 상태 업데이트
        if (data.status === 'completed') {
          setStatus('completed');
          onComplete?.(true);
          // 완료 시 폴링 중지
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } else if (data.status === 'failed') {
          setStatus('failed');
          onComplete?.(false);
          // 실패 시 폴링 중지
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (e: any) {
        console.error('Log polling error:', e);
        setError(e.message);
      }
    };

    // 즉시 한번 실행
    pollLogs();

    // 1초 간격으로 폴링
    intervalRef.current = setInterval(pollLogs, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [taskId, onComplete]);

  // 새 로그가 추가될 때 자동 스크롤
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // 상태에 따른 스타일
  const getStatusStyle = () => {
    switch (status) {
      case 'running':
        return 'text-blue-400 animate-pulse';
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Claude AI가 대본을 생성하고 있습니다...';
      case 'completed':
        return '대본 생성이 완료되었습니다!';
      case 'failed':
        return '대본 생성에 실패했습니다.';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
    }
  };

  // 로그 레벨에 따른 색상
  const getLogColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-400';
      case 'warn':
      case 'warning':
        return 'text-yellow-400';
      case 'spawn':
        return 'text-blue-400';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col border border-slate-700">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getStatusIcon()}</span>
            <div>
              <h3 className="text-lg font-semibold text-white">Spawn 대본 생성</h3>
              <p className="text-sm text-slate-400 truncate max-w-[400px]">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2"
          >
            ✕
          </button>
        </div>

        {/* 상태 표시 */}
        <div className={`px-4 py-3 border-b border-slate-700 ${getStatusStyle()}`}>
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>

        {/* 로그 컨테이너 */}
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-slate-900 space-y-1"
          style={{ minHeight: '300px', maxHeight: '400px' }}
        >
          {logs.length === 0 && status === 'running' && (
            <div className="text-slate-500 text-center py-8">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-slate-500 border-t-blue-400 rounded-full mb-2"></div>
              <p>로그를 불러오는 중...</p>
            </div>
          )}
          {logs.map((log, idx) => (
            <div key={idx} className={`${getLogColor(log.level)} leading-relaxed`}>
              {log.timestamp && (
                <span className="text-slate-500 mr-2">[{log.timestamp}]</span>
              )}
              {log.level && (
                <span className="text-slate-400 mr-2">[{log.level.toUpperCase()}]</span>
              )}
              <span>{log.message}</span>
            </div>
          ))}
          {error && (
            <div className="text-red-400 mt-4">
              <span className="font-bold">오류:</span> {error}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-between items-center p-4 border-t border-slate-700 bg-slate-800/50">
          <span className="text-xs text-slate-500">
            Task ID: {taskId}
          </span>
          <div className="flex gap-2">
            {status !== 'running' && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition text-sm"
              >
                닫기
              </button>
            )}
            {status === 'running' && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition text-sm"
              >
                백그라운드로 이동
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
