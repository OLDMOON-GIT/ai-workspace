'use client';

import { useEffect, useRef } from 'react';
import { btsArchitectureMermaid } from './diagram';

export default function BTSArchitecturePage() {
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mermaid 동적 로드
    const loadMermaid = async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#3b82f6',
          primaryTextColor: '#fff',
          primaryBorderColor: '#60a5fa',
          lineColor: '#10b981',
          secondaryColor: '#8b5cf6',
          tertiaryColor: '#ec4899',
          background: '#0f172a',
          mainBkg: '#1e293b',
          secondBkg: '#334155',
          border1: '#475569',
          border2: '#64748b',
        },
        flowchart: {
          curve: 'basis',
          padding: 20,
          nodeSpacing: 50,
          rankSpacing: 80,
        },
      });

      if (mermaidRef.current) {
        mermaidRef.current.removeAttribute('data-processed');
        await mermaid.run({
          nodes: [mermaidRef.current],
        });
      }
    };

    loadMermaid();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-white bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            🐛 전체 개발 라이프사이클 (BTS)
          </h1>
          <p className="text-lg text-slate-300">
            기획 → BUG/SPEC 등록 → 개발 → 테스트 → CI/CD 전체 플로우
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
              ✅ 구현됨
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-yellow-500 animate-pulse"></span>
              ⚠️ 일부 구현
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-500"></span>
              ✗ 미구현
            </span>
          </div>
        </div>

        {/* Mermaid Diagram */}
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-800/50 p-8 shadow-2xl backdrop-blur-sm">
          <div
            ref={mermaidRef}
            className="mermaid flex items-center justify-center overflow-auto"
            style={{ minHeight: '1200px', width: '100%' }}
          >
            {btsArchitectureMermaid}
          </div>
        </div>

        {/* Feature Cards - 5 Phases */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-slate-600/30 bg-gradient-to-br from-slate-800/30 to-slate-700/10 p-6 shadow-xl opacity-60">
            <div className="text-3xl mb-3">📋</div>
            <h3 className="text-lg font-bold text-slate-300 mb-2">1. 기획/디자인</h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• 기획서 → spec 등록</li>
              <li>• Figma OAuth 연동</li>
              <li className="text-red-400">미구현</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 p-6 shadow-xl">
            <div className="text-3xl mb-3">📥</div>
            <h3 className="text-lg font-bold text-emerald-200 mb-2">2. BUG/SPEC 등록</h3>
            <ul className="text-sm text-slate-300 space-y-1">
              <li>• 로그 모니터링 (10초)</li>
              <li>• 테스트 실패 감지</li>
              <li>• MySQL bugs 등록</li>
              <li className="text-emerald-400">✅ 구현됨</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-600/30 bg-gradient-to-br from-slate-800/30 to-slate-700/10 p-6 shadow-xl opacity-60">
            <div className="text-3xl mb-3">💻</div>
            <h3 className="text-lg font-bold text-slate-300 mb-2">3. 개발</h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• @개발 CLI 팝업</li>
              <li>• 통합테스트 자동 작성</li>
              <li className="text-red-400">미구현</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-900/30 to-yellow-800/10 p-6 shadow-xl">
            <div className="text-3xl mb-3">🧪</div>
            <h3 className="text-lg font-bold text-yellow-200 mb-2">4. 테스트</h3>
            <ul className="text-sm text-slate-300 space-y-1">
              <li className="text-emerald-400">• 주기적 테스트 ✅</li>
              <li className="text-emerald-400">• @디버깅 ✅</li>
              <li className="text-red-400">• 사용자 테스트 녹화 ✗</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-600/30 bg-gradient-to-br from-slate-800/30 to-slate-700/10 p-6 shadow-xl opacity-60">
            <div className="text-3xl mb-3">🚀</div>
            <h3 className="text-lg font-bold text-slate-300 mb-2">5. CI/CD</h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• Deploy</li>
              <li>• Production Monitoring</li>
              <li className="text-red-400">미구현</li>
            </ul>
          </div>
        </div>

        {/* Data Flow */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">🔄</span>
            전체 개발 라이프사이클 플로우
          </h2>
          <div className="space-y-3 text-slate-300">
            <div className="flex items-start gap-3">
              <span className="text-slate-400 font-mono text-sm">1.</span>
              <p className="text-slate-400">📋 <span className="font-bold">기획/디자인</span>: 기획서 작성 → spec으로 bugs 등록 | Figma OAuth 연동 <span className="text-red-400">(미구현)</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 font-mono text-sm">2.</span>
              <p>📥 <span className="text-emerald-400 font-bold">BUG/SPEC 등록</span>: 로그 에러 감지 (log-monitor.js 10초마다) → MCP Debugger → MySQL bugs 테이블 <span className="text-emerald-400">(구현됨)</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-slate-400 font-mono text-sm">3.</span>
              <p className="text-slate-400">💻 <span className="font-bold">개발</span>: bugs (type:spec) → @개발 CLI 팝업 → 통합테스트 자동 작성 <span className="text-red-400">(미구현)</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-yellow-400 font-mono text-sm">4.</span>
              <p>🧪 <span className="text-yellow-400 font-bold">테스트</span>: bugs (type:bug) → <span className="text-emerald-400">@디버깅 (구현됨)</span> + 사용자 테스트 녹화 <span className="text-red-400">(미구현)</span> → 주기적 테스트 <span className="text-emerald-400">(구현됨)</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-blue-400 font-mono text-sm">5.</span>
              <p>🔄 <span className="text-blue-400 font-bold">통합테스트 수정</span>: 에러 발견 시 bugs 재등록 → @디버깅 재실행 → 반복 <span className="text-emerald-400">(구현됨)</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-slate-400 font-mono text-sm">6.</span>
              <p className="text-slate-400">🚀 <span className="font-bold">CI/CD</span>: 에러 없으면 → Deploy → Production Monitoring → 에러 시 bugs 재등록 <span className="text-red-400">(미구현)</span></p>
            </div>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">⚙️</span>
            기술 스택
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="text-2xl mb-2">📊</div>
              <div className="font-semibold text-blue-300">MySQL</div>
              <div className="text-xs text-slate-400">bugs 테이블</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="text-2xl mb-2">🔧</div>
              <div className="font-semibold text-purple-300">MCP Tools</div>
              <div className="text-xs text-slate-400">CLI/SDK</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="text-2xl mb-2">⚡</div>
              <div className="font-semibold text-emerald-300">Node.js</div>
              <div className="text-xs text-slate-400">Automation</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="text-2xl mb-2">🎨</div>
              <div className="font-semibold text-pink-300">Next.js</div>
              <div className="text-xs text-slate-400">Web UI</div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex items-center justify-center gap-4 text-sm">
          <a
            href="/admin/bts"
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            🖥️ BTS 관리 페이지
          </a>
          <a
            href="/automation"
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            🤖 자동화 설정
          </a>
        </div>
      </div>
    </div>
  );
}
