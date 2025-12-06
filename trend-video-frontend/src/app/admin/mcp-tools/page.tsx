'use client';

import Link from 'next/link';

const TOOL_GROUPS = [
  {
    title: 'BTS (Bug/Spec)',
    description: '버그/스펙 조회·클레임·상태 변경',
    items: [
      'bug.list (status/type/limit)',
      'bug.claim (type 필터 지원)',
      'bug.update (status/note)',
      'bug.create (type=bug|spec)',
      '@디버깅 (자동 할당 + 해결 안내)'
    ],
    link: '/admin/bts',
    badge: 'bugs DB'
  },
  {
    title: '에러 큐',
    description: '로그/테스트 실패 → error_queue 저장',
    items: [
      'add_error, get_pending_errors',
      'claim_error, resolve_error, ignore_error',
      'get_error_detail, get_error_stats, get_resolution_history',
      'generate_report',
      'log_source 관리 (add/list/remove)'
    ],
    badge: 'sqlite error_queue'
  },
  {
    title: '프로젝트/로그 소스',
    description: '프로젝트/로그 경로 관리',
    items: [
      'add_project / list_projects / remove_project',
      'add_log_source / list_log_sources / remove_log_source'
    ],
    badge: 'logging'
  }
];

const TOTAL_TOOLS = 26;

export default function McpToolsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">🧰 MCP Tools 대시보드</h1>
            <p className="mt-2 text-slate-300">
              mcp-debugger에 등록된 MCP 도구 요약입니다. (총 {TOTAL_TOOLS}개)
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            ← 관리자 홈
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {TOOL_GROUPS.map((group) => (
            <div
              key={group.title}
              className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">{group.title}</h2>
                  <p className="text-sm text-slate-300">{group.description}</p>
                </div>
                {group.link && (
                  <Link
                    href={group.link}
                    className="text-xs font-semibold text-emerald-200 underline decoration-emerald-400/70 hover:text-emerald-100"
                  >
                    바로가기
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 border border-slate-700">
                  {group.badge}
                </span>
              </div>
              <ul className="space-y-1 text-sm text-slate-200">
                {group.items.map((item) => (
                  <li key={item} className="leading-relaxed">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-slate-200 shadow-xl backdrop-blur">
          <h3 className="text-lg font-semibold text-white mb-2">요약</h3>
          <p className="text-sm text-slate-300">
            - 총 {TOTAL_TOOLS}개 MCP 도구가 등록되어 있습니다.
            <br />
            - 버그/스펙(BTS)은 MySQL bugs 테이블(type=bug|spec)로 관리합니다.
            <br />
            - 에러 큐는 SQLite error_queue에 저장되고 필요 시 BTS로 승격할 수 있습니다.
          </p>
          <a
            href="/diagrams/bts-architecture"
            className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-200 underline decoration-emerald-400/70 hover:text-emerald-100"
          >
            🗺️ BTS/에러처리 아키텍처 보기
          </a>
        </div>
      </div>
    </div>
  );
}
