#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

// ============================================
// 설정
// ============================================

const DATA_DIR = "C:/Users/oldmoon/workspace/mcp-memory-manager/data";
const DB_PATH = path.join(DATA_DIR, "memory.db");
const DEV_GUIDE_PATH = "C:/Users/oldmoon/workspace/DEVELOPMENT_GUIDE.md";
const FEATURE_LIST_PATH = "C:/Users/oldmoon/workspace/trend-video-frontend/기능목록.md";

// 데이터 디렉토리 생성
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================
// 데이터베이스 초기화
// ============================================

const db = new Database(DB_PATH);

db.exec(`
  -- 대화 기억 테이블
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,          -- mistake, important, pattern, solution, tip
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,                        -- JSON array
    occurrence_count INTEGER DEFAULT 1,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_added_to_guide INTEGER DEFAULT 0,
    related_files TEXT               -- JSON array
  );

  -- 실수 패턴 테이블
  CREATE TABLE IF NOT EXISTS mistake_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    solution TEXT,
    occurrences INTEGER DEFAULT 1,
    examples TEXT,                   -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 문서 업데이트 로그
  CREATE TABLE IF NOT EXISTS doc_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_path TEXT NOT NULL,
    section TEXT,
    content_added TEXT NOT NULL,
    memory_ids TEXT,                 -- JSON array
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 태그 인덱스
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags);
  CREATE INDEX IF NOT EXISTS idx_memories_occurrence ON memories(occurrence_count DESC);
`);

// ============================================
// MCP Server 생성
// ============================================

const server = new Server(
  {
    name: "mcp-memory-manager",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================
// 유틸리티 함수들
// ============================================

function getCurrentDateTime(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function extractKeywords(text: string): string[] {
  // 한글, 영어 키워드 추출
  const words = text.match(/[가-힣]{2,}|[a-zA-Z]{3,}/g) || [];
  const stopWords = ["있습니다", "합니다", "입니다", "the", "and", "for", "this", "that"];
  return [...new Set(words.filter(w => !stopWords.includes(w.toLowerCase())))];
}

function findSimilarMemory(title: string, content: string): any {
  const keywords = extractKeywords(title + " " + content);

  const memories = db.prepare(`
    SELECT * FROM memories
    WHERE category IN ('mistake', 'important', 'pattern')
    ORDER BY last_seen DESC
    LIMIT 100
  `).all() as any[];

  for (const mem of memories) {
    const memKeywords = extractKeywords(mem.title + " " + mem.content);
    const overlap = keywords.filter(k => memKeywords.includes(k)).length;
    const similarity = overlap / Math.max(keywords.length, memKeywords.length);

    if (similarity > 0.5) {
      return mem;
    }
  }
  return null;
}

// ============================================
// 메모리 관리 함수들
// ============================================

function saveMemory(
  category: "mistake" | "important" | "pattern" | "solution" | "tip",
  title: string,
  content: string,
  tags: string[] = [],
  relatedFiles: string[] = []
): { id: number; isNew: boolean; message: string } {

  // 유사한 기억이 있는지 확인
  const similar = findSimilarMemory(title, content);

  if (similar) {
    // 기존 기억 업데이트
    db.prepare(`
      UPDATE memories
      SET occurrence_count = occurrence_count + 1,
          last_seen = CURRENT_TIMESTAMP,
          content = CASE WHEN length(?) > length(content) THEN ? ELSE content END
      WHERE id = ?
    `).run(content, content, similar.id);

    return {
      id: similar.id,
      isNew: false,
      message: `기존 기억 업데이트 (${similar.occurrence_count + 1}회 발생): ${similar.title}`
    };
  }

  // 새 기억 저장
  const result = db.prepare(`
    INSERT INTO memories (category, title, content, tags, related_files)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    category,
    title,
    content,
    JSON.stringify(tags),
    JSON.stringify(relatedFiles)
  );

  return {
    id: result.lastInsertRowid as number,
    isNew: true,
    message: `새로운 ${category} 기억 저장: ${title}`
  };
}

function searchMemories(query: string, category?: string, limit: number = 10): any[] {
  const keywords = extractKeywords(query);

  let sql = `
    SELECT *,
      (SELECT COUNT(*) FROM memories m2 WHERE m2.category = memories.category) as category_count
    FROM memories
    WHERE 1=1
  `;
  const params: any[] = [];

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  if (keywords.length > 0) {
    const keywordConditions = keywords.map(() => `(title LIKE ? OR content LIKE ? OR tags LIKE ?)`).join(" OR ");
    sql += ` AND (${keywordConditions})`;
    keywords.forEach(k => {
      params.push(`%${k}%`, `%${k}%`, `%${k}%`);
    });
  }

  sql += ` ORDER BY occurrence_count DESC, last_seen DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params) as any[];
}

function getFrequentMistakes(minOccurrences: number = 2): any[] {
  return db.prepare(`
    SELECT * FROM memories
    WHERE category = 'mistake' AND occurrence_count >= ?
    ORDER BY occurrence_count DESC, last_seen DESC
  `).all(minOccurrences) as any[];
}

function getImportantPatterns(): any[] {
  return db.prepare(`
    SELECT * FROM memories
    WHERE category IN ('important', 'pattern')
    ORDER BY occurrence_count DESC, last_seen DESC
    LIMIT 20
  `).all() as any[];
}

// ============================================
// 패턴 분석 함수들
// ============================================

function analyzeMistakePattern(mistakeName: string, description: string, solution?: string): string {
  const existing = db.prepare(`
    SELECT * FROM mistake_patterns WHERE pattern_name = ?
  `).get(mistakeName) as any;

  if (existing) {
    const examples = JSON.parse(existing.examples || "[]");
    examples.push({ description, timestamp: getCurrentDateTime() });

    db.prepare(`
      UPDATE mistake_patterns
      SET occurrences = occurrences + 1,
          solution = COALESCE(?, solution),
          examples = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE pattern_name = ?
    `).run(solution, JSON.stringify(examples.slice(-10)), mistakeName);

    return `실수 패턴 '${mistakeName}' 업데이트 (${existing.occurrences + 1}회 발생)`;
  }

  db.prepare(`
    INSERT INTO mistake_patterns (pattern_name, description, solution, examples)
    VALUES (?, ?, ?, ?)
  `).run(
    mistakeName,
    description,
    solution,
    JSON.stringify([{ description, timestamp: getCurrentDateTime() }])
  );

  return `새로운 실수 패턴 '${mistakeName}' 등록`;
}

function getMistakePatternReport(): string {
  const patterns = db.prepare(`
    SELECT * FROM mistake_patterns
    ORDER BY occurrences DESC
  `).all() as any[];

  if (patterns.length === 0) {
    return "등록된 실수 패턴이 없습니다.";
  }

  const lines: string[] = [];
  lines.push("# 실수 패턴 분석 리포트");
  lines.push(`📅 생성 시간: ${getCurrentDateTime()}`);
  lines.push("");

  patterns.forEach((p, idx) => {
    lines.push(`## ${idx + 1}. ${p.pattern_name} (${p.occurrences}회)`);
    lines.push(`**설명:** ${p.description}`);
    if (p.solution) {
      lines.push(`**해결책:** ${p.solution}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

// ============================================
// 문서 업데이트 함수들
// ============================================

function generateGuideSection(memories: any[]): string {
  const lines: string[] = [];

  const mistakes = memories.filter(m => m.category === "mistake");
  const important = memories.filter(m => m.category === "important");
  const patterns = memories.filter(m => m.category === "pattern");
  const solutions = memories.filter(m => m.category === "solution");

  if (mistakes.length > 0) {
    lines.push("### ⚠️ 자주 발생하는 실수");
    lines.push("");
    mistakes.forEach(m => {
      lines.push(`**${m.title}** (${m.occurrence_count}회 발생)`);
      lines.push(`- ${m.content}`);
      lines.push("");
    });
  }

  if (important.length > 0) {
    lines.push("### ⭐ 중요 사항");
    lines.push("");
    important.forEach(m => {
      lines.push(`- **${m.title}**: ${m.content}`);
    });
    lines.push("");
  }

  if (patterns.length > 0) {
    lines.push("### 🔄 반복 패턴");
    lines.push("");
    patterns.forEach(m => {
      lines.push(`- **${m.title}**: ${m.content}`);
    });
    lines.push("");
  }

  if (solutions.length > 0) {
    lines.push("### ✅ 해결책 모음");
    lines.push("");
    solutions.forEach(m => {
      lines.push(`**${m.title}**`);
      lines.push(`${m.content}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}

function updateDevelopmentGuide(autoAdd: boolean = false): string {
  // 가이드에 추가되지 않은 중요한 기억들 가져오기
  const unaddedMemories = db.prepare(`
    SELECT * FROM memories
    WHERE is_added_to_guide = 0
      AND (occurrence_count >= 2 OR category IN ('important', 'solution'))
    ORDER BY category, occurrence_count DESC
  `).all() as any[];

  if (unaddedMemories.length === 0) {
    return "개발 가이드에 추가할 새로운 내용이 없습니다.";
  }

  const newSection = generateGuideSection(unaddedMemories);

  if (!autoAdd) {
    // 미리보기만
    return `## 개발 가이드에 추가할 내용 (${unaddedMemories.length}개 항목)\n\n${newSection}\n\n---\n자동 추가하려면 autoAdd: true로 다시 호출하세요.`;
  }

  // 실제 파일 업데이트
  if (!fs.existsSync(DEV_GUIDE_PATH)) {
    return `❌ 개발 가이드 파일을 찾을 수 없습니다: ${DEV_GUIDE_PATH}`;
  }

  let guideContent = fs.readFileSync(DEV_GUIDE_PATH, "utf-8");

  // AI 학습 섹션 찾기 또는 생성
  const sectionHeader = "## 🤖 AI 학습 기록 (자동 생성)";
  const sectionIndex = guideContent.indexOf(sectionHeader);

  const timestamp = getCurrentDateTime();
  const newContent = `\n\n${sectionHeader}\n\n*마지막 업데이트: ${timestamp}*\n\n${newSection}`;

  if (sectionIndex === -1) {
    // 섹션이 없으면 파일 끝에 추가
    guideContent += newContent;
  } else {
    // 기존 섹션 교체
    const nextSectionMatch = guideContent.substring(sectionIndex + sectionHeader.length).match(/\n## [^#]/);
    const endIndex = nextSectionMatch
      ? sectionIndex + sectionHeader.length + (nextSectionMatch.index || 0)
      : guideContent.length;

    guideContent = guideContent.substring(0, sectionIndex) + newContent + guideContent.substring(endIndex);
  }

  fs.writeFileSync(DEV_GUIDE_PATH, guideContent, "utf-8");

  // 추가된 기억들 표시
  const ids = unaddedMemories.map(m => m.id);
  db.prepare(`
    UPDATE memories SET is_added_to_guide = 1 WHERE id IN (${ids.join(",")})
  `).run();

  // 로그 저장
  db.prepare(`
    INSERT INTO doc_updates (doc_path, section, content_added, memory_ids)
    VALUES (?, ?, ?, ?)
  `).run(DEV_GUIDE_PATH, sectionHeader, newSection, JSON.stringify(ids));

  return `✅ 개발 가이드 업데이트 완료!\n- 추가된 항목: ${unaddedMemories.length}개\n- 파일: ${DEV_GUIDE_PATH}`;
}

function getMemorySummary(): string {
  const stats = db.prepare(`
    SELECT
      category,
      COUNT(*) as count,
      SUM(occurrence_count) as total_occurrences,
      MAX(last_seen) as latest
    FROM memories
    GROUP BY category
  `).all() as any[];

  const totalMemories = db.prepare(`SELECT COUNT(*) as count FROM memories`).get() as any;
  const recentMemories = db.prepare(`
    SELECT * FROM memories
    ORDER BY last_seen DESC
    LIMIT 5
  `).all() as any[];

  const frequentMistakes = getFrequentMistakes(2);

  const lines: string[] = [];
  lines.push("# 메모리 요약 리포트");
  lines.push(`📅 생성 시간: ${getCurrentDateTime()}`);
  lines.push("");

  lines.push("## 📊 통계");
  lines.push(`- 총 기억: ${totalMemories.count}개`);
  stats.forEach(s => {
    const categoryNames: Record<string, string> = {
      mistake: "❌ 실수",
      important: "⭐ 중요",
      pattern: "🔄 패턴",
      solution: "✅ 해결책",
      tip: "💡 팁"
    };
    lines.push(`- ${categoryNames[s.category] || s.category}: ${s.count}개 (총 ${s.total_occurrences}회 발생)`);
  });
  lines.push("");

  if (frequentMistakes.length > 0) {
    lines.push("## ⚠️ 자주 반복되는 실수 (2회 이상)");
    frequentMistakes.forEach(m => {
      lines.push(`- **${m.title}** (${m.occurrence_count}회): ${m.content.substring(0, 100)}...`);
    });
    lines.push("");
  }

  if (recentMemories.length > 0) {
    lines.push("## 🕐 최근 기억");
    recentMemories.forEach(m => {
      const categoryEmoji: Record<string, string> = {
        mistake: "❌", important: "⭐", pattern: "🔄", solution: "✅", tip: "💡"
      };
      lines.push(`- ${categoryEmoji[m.category] || "📝"} [${m.last_seen}] ${m.title}`);
    });
  }

  return lines.join("\n");
}

// ============================================
// MCP 도구 등록
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "remember",
        description: "대화에서 중요한 내용을 기억합니다. 실수, 중요사항, 패턴, 해결책, 팁 등을 분류하여 저장합니다.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["mistake", "important", "pattern", "solution", "tip"],
              description: "기억 카테고리: mistake(실수), important(중요), pattern(패턴), solution(해결책), tip(팁)"
            },
            title: {
              type: "string",
              description: "기억 제목 (짧고 명확하게)"
            },
            content: {
              type: "string",
              description: "기억 내용 (상세 설명)"
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "관련 태그 (선택)"
            },
            relatedFiles: {
              type: "array",
              items: { type: "string" },
              description: "관련 파일 경로 (선택)"
            }
          },
          required: ["category", "title", "content"]
        }
      },
      {
        name: "recall",
        description: "저장된 기억을 검색합니다. 키워드나 카테고리로 검색할 수 있습니다.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "검색 키워드"
            },
            category: {
              type: "string",
              enum: ["mistake", "important", "pattern", "solution", "tip"],
              description: "카테고리 필터 (선택)"
            },
            limit: {
              type: "number",
              description: "결과 개수 (기본: 10)"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "analyze_mistakes",
        description: "반복되는 실수 패턴을 분석하고 리포트를 생성합니다.",
        inputSchema: {
          type: "object",
          properties: {
            minOccurrences: {
              type: "number",
              description: "최소 발생 횟수 (기본: 2)"
            }
          }
        }
      },
      {
        name: "record_mistake_pattern",
        description: "실수 패턴을 기록합니다. 같은 패턴이 반복되면 자동으로 카운트됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            patternName: {
              type: "string",
              description: "패턴 이름 (예: '3종 세트 누락', 'HMR 재시작 오해')"
            },
            description: {
              type: "string",
              description: "이번 발생 상황 설명"
            },
            solution: {
              type: "string",
              description: "해결책 (선택)"
            }
          },
          required: ["patternName", "description"]
        }
      },
      {
        name: "get_memory_summary",
        description: "저장된 모든 기억의 요약 리포트를 생성합니다.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "update_dev_guide",
        description: "자주 반복되는 실수와 중요 사항을 개발 가이드(DEVELOPMENT_GUIDE.md)에 자동 추가합니다.",
        inputSchema: {
          type: "object",
          properties: {
            autoAdd: {
              type: "boolean",
              description: "true면 실제 파일에 추가, false면 미리보기만 (기본: false)"
            }
          }
        }
      },
      {
        name: "get_frequent_mistakes",
        description: "자주 반복되는 실수 목록을 가져옵니다.",
        inputSchema: {
          type: "object",
          properties: {
            minOccurrences: {
              type: "number",
              description: "최소 발생 횟수 (기본: 2)"
            }
          }
        }
      },
      {
        name: "clear_memory",
        description: "특정 ID의 기억을 삭제합니다.",
        inputSchema: {
          type: "object",
          properties: {
            memoryId: {
              type: "number",
              description: "삭제할 기억 ID"
            }
          },
          required: ["memoryId"]
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
      case "remember": {
        const result = saveMemory(
          args?.category as any,
          args?.title as string,
          args?.content as string,
          (args?.tags as string[]) || [],
          (args?.relatedFiles as string[]) || []
        );
        return { content: [{ type: "text", text: result.message }] };
      }

      case "recall": {
        const memories = searchMemories(
          args?.query as string,
          args?.category as string | undefined,
          (args?.limit as number) || 10
        );

        if (memories.length === 0) {
          return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };
        }

        const results = memories.map(m => {
          const tags = JSON.parse(m.tags || "[]");
          return `**[${m.category}] ${m.title}** (${m.occurrence_count}회)\n${m.content}\n태그: ${tags.join(", ") || "없음"}\n`;
        }).join("\n---\n");

        return { content: [{ type: "text", text: `## 검색 결과 (${memories.length}개)\n\n${results}` }] };
      }

      case "analyze_mistakes": {
        const report = getMistakePatternReport();
        return { content: [{ type: "text", text: report }] };
      }

      case "record_mistake_pattern": {
        const result = analyzeMistakePattern(
          args?.patternName as string,
          args?.description as string,
          args?.solution as string | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "get_memory_summary": {
        const summary = getMemorySummary();
        return { content: [{ type: "text", text: summary }] };
      }

      case "update_dev_guide": {
        const result = updateDevelopmentGuide(args?.autoAdd as boolean || false);
        return { content: [{ type: "text", text: result }] };
      }

      case "get_frequent_mistakes": {
        const mistakes = getFrequentMistakes((args?.minOccurrences as number) || 2);

        if (mistakes.length === 0) {
          return { content: [{ type: "text", text: "반복되는 실수가 없습니다. (좋은 징조!)" }] };
        }

        const lines = mistakes.map(m =>
          `**${m.title}** (${m.occurrence_count}회)\n- ${m.content}\n- 최근: ${m.last_seen}`
        );

        return { content: [{ type: "text", text: `## 자주 반복되는 실수\n\n${lines.join("\n\n")}` }] };
      }

      case "clear_memory": {
        db.prepare(`DELETE FROM memories WHERE id = ?`).run(args?.memoryId as number);
        return { content: [{ type: "text", text: `기억 ID ${args?.memoryId} 삭제 완료` }] };
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
  console.error("MCP Memory Manager 서버가 시작되었습니다.");
}

main().catch(console.error);
