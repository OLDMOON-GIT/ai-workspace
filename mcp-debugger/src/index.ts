#!/usr/bin/env node
/**
 * MCP Debugger Server
 *
 * 에러 큐를 관리하고 CLI 워커가 버그를 처리할 수 있도록 하는 MCP 서버
 * DB는 ~/.mcp-debugger/error-queue.db에 저장되어 어느 워크스페이스에서든 사용 가능
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  addError,
  addErrorManually,
  getErrorById,
  getPendingErrors,
  claimError,
  updateErrorStatus,
  recordResolution,
  getErrorStats,
  getResolutionHistory,
  registerWorker,
  getActiveWorkers,
  addProject,
  getProjects,
  removeProject,
  addLogSource,
  getLogSources,
  removeLogSource,
  ErrorItem
} from './db.js';

// MCP Server 생성
const server = new Server(
  {
    name: "mcp-debugger",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 에러 포맷팅 함수
function formatError(error: ErrorItem): string {
  const severityIcon = {
    critical: '🔴 CRITICAL',
    error: '🟠 ERROR',
    warning: '🟡 WARNING'
  }[error.severity] || '⚪ UNKNOWN';

  let output = `
## 에러 #${error.id} - ${severityIcon}

**타입**: ${error.error_type}
**메시지**: ${error.error_message}
**상태**: ${error.status}
**소스**: ${error.source}
**발생시간**: ${error.created_at}
`;

  if (error.file_path) {
    output += `**파일**: ${error.file_path}`;
    if (error.line_number) {
      output += `:${error.line_number}`;
    }
    output += '\n';
  }

  if (error.stack_trace) {
    output += `
**스택 트레이스**:
\`\`\`
${error.stack_trace}
\`\`\`
`;
  }

  return output;
}

// MCP 도구 등록
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ==================== 에러 관리 ====================
      {
        name: "add_error",
        description: "새 에러를 큐에 추가합니다. 수동으로 발견한 버그나 이슈를 등록할 때 사용합니다.",
        inputSchema: {
          type: "object",
          properties: {
            error_type: {
              type: "string",
              description: "에러 타입 (예: runtime_error, type_error, sql_error, logic_error)"
            },
            error_message: {
              type: "string",
              description: "에러 메시지"
            },
            file_path: {
              type: "string",
              description: "에러가 발생한 파일 경로 (선택)"
            },
            line_number: {
              type: "number",
              description: "에러가 발생한 라인 번호 (선택)"
            },
            project: {
              type: "string",
              description: "프로젝트 이름 (선택)"
            },
            severity: {
              type: "string",
              enum: ["warning", "error", "critical"],
              description: "심각도 (기본: error)"
            }
          },
          required: ["error_type", "error_message"]
        }
      },
      {
        name: "get_pending_errors",
        description: "대기 중인 에러 목록을 조회합니다. 처리해야 할 버그 목록을 확인할 때 사용합니다.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "조회할 최대 개수 (기본: 10)"
            }
          }
        }
      },
      {
        name: "get_error_detail",
        description: "특정 에러의 상세 정보를 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {
            error_id: {
              type: "number",
              description: "에러 ID"
            }
          },
          required: ["error_id"]
        }
      },
      {
        name: "claim_error",
        description: "에러를 가져와 처리를 시작합니다. 에러 큐에서 가장 우선순위가 높은 에러를 할당받습니다.",
        inputSchema: {
          type: "object",
          properties: {
            worker_id: {
              type: "string",
              description: "워커 식별자 (선택, 기본값 자동 생성)"
            }
          }
        }
      },
      {
        name: "resolve_error",
        description: "에러를 해결 완료로 표시합니다. 버그를 수정한 후 호출합니다.",
        inputSchema: {
          type: "object",
          properties: {
            error_id: {
              type: "number",
              description: "에러 ID"
            },
            description: {
              type: "string",
              description: "해결 방법 설명"
            },
            changes_made: {
              type: "string",
              description: "변경 내용 (선택)"
            }
          },
          required: ["error_id"]
        }
      },
      {
        name: "ignore_error",
        description: "에러를 무시 처리합니다. 수정이 필요 없거나 중복된 에러일 때 사용합니다.",
        inputSchema: {
          type: "object",
          properties: {
            error_id: {
              type: "number",
              description: "에러 ID"
            },
            reason: {
              type: "string",
              description: "무시 사유"
            }
          },
          required: ["error_id"]
        }
      },

      // ==================== 통계 및 리포트 ====================
      {
        name: "get_error_stats",
        description: "에러 큐의 통계 정보를 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_resolution_history",
        description: "에러 처리 기록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "조회할 최대 개수 (기본: 10)"
            }
          }
        }
      },
      {
        name: "generate_report",
        description: "종합 디버깅 리포트를 생성합니다.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },

      // ==================== 프로젝트 관리 ====================
      {
        name: "add_project",
        description: "모니터링할 프로젝트를 등록합니다.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "프로젝트 이름"
            },
            path: {
              type: "string",
              description: "프로젝트 경로"
            },
            description: {
              type: "string",
              description: "프로젝트 설명 (선택)"
            }
          },
          required: ["name", "path"]
        }
      },
      {
        name: "list_projects",
        description: "등록된 프로젝트 목록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "remove_project",
        description: "프로젝트 등록을 해제합니다.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "프로젝트 이름"
            }
          },
          required: ["name"]
        }
      },

      // ==================== 로그 소스 관리 ====================
      {
        name: "add_log_source",
        description: "모니터링할 로그 파일을 등록합니다.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "로그 소스 이름"
            },
            path: {
              type: "string",
              description: "로그 파일 경로"
            },
            project: {
              type: "string",
              description: "연관 프로젝트 이름 (선택)"
            }
          },
          required: ["name", "path"]
        }
      },
      {
        name: "list_log_sources",
        description: "등록된 로그 소스 목록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {
            project: {
              type: "string",
              description: "특정 프로젝트의 로그 소스만 조회 (선택)"
            }
          }
        }
      },
      {
        name: "remove_log_source",
        description: "로그 소스 등록을 해제합니다.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "로그 파일 경로"
            }
          },
          required: ["path"]
        }
      },

      // ==================== 워커 상태 ====================
      {
        name: "get_active_workers",
        description: "현재 활성 상태인 워커 목록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

// 도구 실행 핸들러
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ==================== 에러 관리 ====================
      case "add_error": {
        const error = addErrorManually(
          args?.error_type as string,
          args?.error_message as string,
          {
            file_path: args?.file_path as string | undefined,
            line_number: args?.line_number as number | undefined,
            project: args?.project as string | undefined,
            severity: args?.severity as 'warning' | 'error' | 'critical' | undefined
          }
        );

        if (error) {
          return {
            content: [{
              type: "text",
              text: `에러가 큐에 추가되었습니다.\n${formatError(error)}`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: "이미 동일한 에러가 큐에 있습니다. (중복 무시)"
            }]
          };
        }
      }

      case "get_pending_errors": {
        const limit = (args?.limit as number) || 10;
        const errors = getPendingErrors(limit);

        if (errors.length === 0) {
          return {
            content: [{
              type: "text",
              text: "처리 대기 중인 에러가 없습니다."
            }]
          };
        }

        let output = `## 대기 중인 에러 (${errors.length}건)\n\n`;

        for (const error of errors) {
          const icon = { critical: '🔴', error: '🟠', warning: '🟡' }[error.severity] || '⚪';
          output += `${icon} **#${error.id}** [${error.error_type}] ${error.error_message.substring(0, 80)}...\n`;
          if (error.file_path) {
            output += `   📁 ${error.file_path}${error.line_number ? ':' + error.line_number : ''}\n`;
          }
          output += '\n';
        }

        return { content: [{ type: "text", text: output }] };
      }

      case "get_error_detail": {
        const errorId = args?.error_id as number;
        const error = getErrorById(errorId);

        if (!error) {
          return {
            content: [{ type: "text", text: `에러 #${errorId}를 찾을 수 없습니다.` }],
            isError: true
          };
        }

        return { content: [{ type: "text", text: formatError(error) }] };
      }

      case "claim_error": {
        const workerId = (args?.worker_id as string) || `claude-${Date.now()}`;
        registerWorker(workerId, workerId);

        const error = claimError(workerId);

        if (!error) {
          return {
            content: [{ type: "text", text: "처리 대기 중인 에러가 없습니다." }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `에러를 할당받았습니다.\n${formatError(error)}\n\n처리 후 \`resolve_error\` 또는 \`ignore_error\`를 호출하세요.`
          }]
        };
      }

      case "resolve_error": {
        const errorId = args?.error_id as number;
        const description = (args?.description as string) || '해결됨';
        const changesMade = args?.changes_made as string | undefined;

        const error = getErrorById(errorId);
        if (!error) {
          return {
            content: [{ type: "text", text: `에러 #${errorId}를 찾을 수 없습니다.` }],
            isError: true
          };
        }

        const resolution = recordResolution({
          error_id: errorId,
          worker_id: 'claude',
          action: 'resolved',
          description: description,
          changes_made: changesMade,
          resolved: true,
          started_at: error.claimed_at || new Date().toISOString()
        });

        return {
          content: [{
            type: "text",
            text: `에러 #${errorId}가 해결 완료로 표시되었습니다.\n📝 ${description}${resolution?.duration_seconds ? `\n⏱️ 처리 시간: ${resolution.duration_seconds}초` : ''}`
          }]
        };
      }

      case "ignore_error": {
        const errorId = args?.error_id as number;
        const reason = (args?.reason as string) || '무시됨';

        const error = getErrorById(errorId);
        if (!error) {
          return {
            content: [{ type: "text", text: `에러 #${errorId}를 찾을 수 없습니다.` }],
            isError: true
          };
        }

        recordResolution({
          error_id: errorId,
          worker_id: 'claude',
          action: 'ignored',
          description: reason,
          resolved: false,
          started_at: error.claimed_at || new Date().toISOString()
        });

        updateErrorStatus(errorId, 'ignored');

        return {
          content: [{
            type: "text",
            text: `에러 #${errorId}가 무시 처리되었습니다.\n📝 사유: ${reason}`
          }]
        };
      }

      // ==================== 통계 및 리포트 ====================
      case "get_error_stats": {
        const stats = getErrorStats();

        let output = `## 에러 큐 통계\n\n`;
        output += `- **전체**: ${stats.total}건\n`;
        output += `- **대기 중**: ${stats.pending}건\n`;
        output += `- **처리 중**: ${stats.processing}건\n`;
        output += `- **해결됨**: ${stats.resolved}건\n`;
        output += `- **무시됨**: ${stats.ignored}건\n\n`;

        if (Object.keys(stats.by_severity).length > 0) {
          output += `### 심각도별 (대기 중)\n`;
          for (const [severity, count] of Object.entries(stats.by_severity)) {
            const icon = { critical: '🔴', error: '🟠', warning: '🟡' }[severity] || '⚪';
            output += `- ${icon} ${severity}: ${count}건\n`;
          }
        }

        if (Object.keys(stats.by_type).length > 0) {
          output += `\n### 타입별 (대기 중, 상위 10개)\n`;
          for (const [type, count] of Object.entries(stats.by_type)) {
            output += `- ${type}: ${count}건\n`;
          }
        }

        return { content: [{ type: "text", text: output }] };
      }

      case "get_resolution_history": {
        const limit = (args?.limit as number) || 10;
        const history = getResolutionHistory(limit);

        if (history.length === 0) {
          return {
            content: [{ type: "text", text: "처리 기록이 없습니다." }]
          };
        }

        let output = `## 처리 기록 (최근 ${limit}건)\n\n`;

        for (const record of history) {
          const icon = record.resolved ? '✅' : '⏭️';
          output += `${icon} **#${record.error_id}** [${record.error_type}]\n`;
          output += `   ${record.error_message.substring(0, 50)}...\n`;
          output += `   👤 ${record.worker_id} | ⏱️ ${record.duration_seconds || 0}초\n`;
          if (record.description) {
            output += `   📝 ${record.description}\n`;
          }
          output += '\n';
        }

        return { content: [{ type: "text", text: output }] };
      }

      case "generate_report": {
        const stats = getErrorStats();
        const history = getResolutionHistory(20);
        const workers = getActiveWorkers();

        let output = `# 디버깅 리포트\n\n`;
        output += `📅 ${new Date().toLocaleString('ko-KR')}\n\n`;

        output += `## 에러 현황\n\n`;
        output += `| 상태 | 건수 |\n|---|---|\n`;
        output += `| 전체 | ${stats.total} |\n`;
        output += `| 대기 중 | ${stats.pending} |\n`;
        output += `| 해결됨 | ${stats.resolved} |\n`;
        output += `| 무시됨 | ${stats.ignored} |\n\n`;

        if (workers.length > 0) {
          output += `## 워커 현황 (${workers.length}명 활성)\n\n`;
          for (const worker of workers) {
            const rate = worker.errors_processed > 0
              ? Math.round((worker.errors_resolved / worker.errors_processed) * 100)
              : 0;
            output += `- **${worker.name}**: ${worker.errors_resolved}/${worker.errors_processed} 해결 (${rate}%)\n`;
          }
          output += '\n';
        }

        if (history.length > 0) {
          output += `## 최근 처리 내역\n\n`;
          for (const record of history.slice(0, 5)) {
            const icon = record.resolved ? '✅' : '⏭️';
            const time = new Date(record.completed_at!).toLocaleTimeString('ko-KR');
            output += `- ${icon} ${time} - #${record.error_id} ${record.error_type}\n`;
          }
        }

        if (Object.keys(stats.by_type).length > 0) {
          const topError = Object.entries(stats.by_type)[0];
          output += `\n## 주의 필요\n\n`;
          output += `가장 많은 에러: **${topError[0]}** (${topError[1]}건)\n`;
        }

        return { content: [{ type: "text", text: output }] };
      }

      // ==================== 프로젝트 관리 ====================
      case "add_project": {
        addProject(
          args?.name as string,
          args?.path as string,
          args?.description as string | undefined
        );

        return {
          content: [{
            type: "text",
            text: `프로젝트 "${args?.name}"이(가) 등록되었습니다.\n📁 ${args?.path}`
          }]
        };
      }

      case "list_projects": {
        const projects = getProjects();

        if (projects.length === 0) {
          return {
            content: [{ type: "text", text: "등록된 프로젝트가 없습니다." }]
          };
        }

        let output = `## 등록된 프로젝트 (${projects.length}개)\n\n`;
        for (const project of projects) {
          output += `- **${project.name}**: ${project.path}\n`;
          if (project.description) {
            output += `  ${project.description}\n`;
          }
        }

        return { content: [{ type: "text", text: output }] };
      }

      case "remove_project": {
        const removed = removeProject(args?.name as string);

        if (removed) {
          return {
            content: [{
              type: "text",
              text: `프로젝트 "${args?.name}"이(가) 제거되었습니다.`
            }]
          };
        } else {
          return {
            content: [{ type: "text", text: `프로젝트 "${args?.name}"을(를) 찾을 수 없습니다.` }],
            isError: true
          };
        }
      }

      // ==================== 로그 소스 관리 ====================
      case "add_log_source": {
        addLogSource(
          args?.name as string,
          args?.path as string,
          args?.project as string | undefined
        );

        return {
          content: [{
            type: "text",
            text: `로그 소스 "${args?.name}"이(가) 등록되었습니다.\n📁 ${args?.path}`
          }]
        };
      }

      case "list_log_sources": {
        const sources = getLogSources(args?.project as string | undefined);

        if (sources.length === 0) {
          return {
            content: [{ type: "text", text: "등록된 로그 소스가 없습니다." }]
          };
        }

        let output = `## 등록된 로그 소스 (${sources.length}개)\n\n`;
        for (const source of sources) {
          const status = source.enabled ? '✅' : '❌';
          output += `- ${status} **${source.name}**: ${source.path}\n`;
          if (source.project) {
            output += `  프로젝트: ${source.project}\n`;
          }
        }

        return { content: [{ type: "text", text: output }] };
      }

      case "remove_log_source": {
        const removed = removeLogSource(args?.path as string);

        if (removed) {
          return {
            content: [{
              type: "text",
              text: `로그 소스가 제거되었습니다.\n📁 ${args?.path}`
            }]
          };
        } else {
          return {
            content: [{ type: "text", text: `로그 소스를 찾을 수 없습니다: ${args?.path}` }],
            isError: true
          };
        }
      }

      // ==================== 워커 상태 ====================
      case "get_active_workers": {
        const workers = getActiveWorkers();

        if (workers.length === 0) {
          return {
            content: [{ type: "text", text: "활성 워커가 없습니다." }]
          };
        }

        let output = `## 활성 워커 (${workers.length}명)\n\n`;
        for (const worker of workers) {
          const statusIcon = worker.status === 'processing' ? '⚙️' : '😴';
          output += `- ${statusIcon} **${worker.name}**\n`;
          output += `  상태: ${worker.status}\n`;
          output += `  처리: ${worker.errors_resolved}/${worker.errors_processed} 해결\n`;
          output += `  마지막 활동: ${worker.last_heartbeat}\n\n`;
        }

        return { content: [{ type: "text", text: output }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `오류 발생: ${error.message}` }],
      isError: true
    };
  }
});

// 서버 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Debugger 서버가 시작되었습니다.");
}

main().catch(console.error);
