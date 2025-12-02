## Work Log – MCP 디버깅/버그 리포트 연동

- MCP Debugger
  - Added bug tools wrapping `automation/bug-db.js`: `bug.list`, `bug.claim`, `bug.update`, and shortcut `@디버깅` (claim; if `note` is passed, auto update with status/default `resolved`). Location: `mcp-debugger/src/index.ts`.
  - Build refreshed with `npm run build` (updates `dist/index.js`).

- CLI 자동화
  - `automation/auto-suite.js`: `@디버깅` / `--claim` triggers `bug-worker.js claim` after UI check; keeps bug list printing.
  - Root `package.json`: scripts `debug`/`디버깅` → `node automation/auto-suite.js @디버깅`.

- Frontend (Next)
  - API `src/app/api/bugs/route.ts`: admin-only bug listing (status filter open|in_progress|resolved|closed|all, search `q`, paging `page/pageSize`, assigned filter, counts).
  - Admin page `src/app/admin/bugs/page.tsx`: status chips + search + paginated table with links for log/screenshot/video/trace; uses `/api/bugs`.

- How to use
  - MCP: call `@디버깅` to claim; follow with `bug.update { id, status, note }` if not auto-updated. Or `bug.list { status, limit }` to browse.
  - CLI: `npm run debug -- --worker your-id` (or `npm run 디버깅`) runs UI check, lists bugs, and claims one.
  - Admin UI: start frontend, open `/admin/bugs`, filter/search, click file links to open paths/URLs.

- Checks
  - Built `mcp-debugger` (tsc). Frontend/API not runtime-tested; run `npm run dev` and hit `/admin/bugs` or curl `/api/bugs?status=open` to verify.

- Notes
  - Bug DB expected at `automation/bug-db.js` (MySQL `bugs` table). `@디버깅` auto-update only when `note` provided; otherwise it just assigns.
