#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync, exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

// MCP Server 생성
const server = new Server(
  {
    name: "mcp-dev-tools",
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

function runCommand(cmd: string, cwd?: string): { stdout: string; stderr: string; success: boolean } {
  try {
    const stdout = execSync(cmd, {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });
    return { stdout, stderr: "", success: true };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
      success: false
    };
  }
}

function findProjectRoot(startPath: string): string {
  let current = startPath;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return startPath;
}

function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

// ============================================
// 코드 리뷰 도구
// ============================================

async function reviewCode(filePath: string, projectPath?: string): Promise<string> {
  const fullPath = path.resolve(filePath);

  if (!fs.existsSync(fullPath)) {
    return `❌ 파일을 찾을 수 없습니다: ${fullPath}`;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const ext = getFileExtension(fullPath);
  const lines = content.split("\n");

  const results: string[] = [];
  results.push(`# 코드 리뷰 리포트: ${path.basename(fullPath)}`);
  results.push(`📁 경로: ${fullPath}`);
  results.push(`📏 라인 수: ${lines.length}`);
  results.push(`📅 리뷰 시간: ${new Date().toLocaleString("ko-KR")}`);
  results.push("");

  // 1. 기본 코드 분석
  results.push("## 📊 기본 분석");
  results.push("");

  // 파일 크기 체크
  const stats = fs.statSync(fullPath);
  if (stats.size > 100000) {
    results.push(`⚠️ 파일 크기가 큽니다 (${Math.round(stats.size/1024)}KB) - 분할 고려`);
  }

  // 라인 길이 체크
  const longLines = lines.filter((line, idx) => line.length > 120);
  if (longLines.length > 0) {
    results.push(`⚠️ 120자 초과 라인: ${longLines.length}개`);
  }

  // 2. TypeScript/JavaScript 분석
  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    results.push("");
    results.push("## 🔍 코드 품질 체크");
    results.push("");

    // console.log 체크
    const consoleLogs = lines.filter(line => line.includes("console.log"));
    if (consoleLogs.length > 0) {
      results.push(`⚠️ console.log 발견: ${consoleLogs.length}개 (프로덕션에서 제거 권장)`);
    }

    // TODO/FIXME 체크
    const todos = lines.filter(line => line.includes("TODO") || line.includes("FIXME"));
    if (todos.length > 0) {
      results.push(`📝 TODO/FIXME 발견: ${todos.length}개`);
      todos.slice(0, 5).forEach((line, idx) => {
        const lineNum = lines.indexOf(line) + 1;
        results.push(`   - Line ${lineNum}: ${line.trim().substring(0, 80)}`);
      });
    }

    // any 타입 체크 (TypeScript)
    if ([".ts", ".tsx"].includes(ext)) {
      const anyTypes = lines.filter(line => /:\s*any\b/.test(line));
      if (anyTypes.length > 0) {
        results.push(`⚠️ 'any' 타입 사용: ${anyTypes.length}개 (타입 명시 권장)`);
      }
    }

    // 빈 catch 블록 체크
    const emptyCatch = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
    if (emptyCatch) {
      results.push(`❌ 빈 catch 블록 발견: ${emptyCatch.length}개 (에러 처리 필요)`);
    }

    // 하드코딩된 문자열 체크
    const hardcodedUrls = lines.filter(line =>
      /['"]https?:\/\/[^'"]+['"]/.test(line) &&
      !line.includes("localhost") &&
      !line.trim().startsWith("//")
    );
    if (hardcodedUrls.length > 0) {
      results.push(`⚠️ 하드코딩된 URL 발견: ${hardcodedUrls.length}개 (환경변수 사용 권장)`);
    }

    // 중복 import 체크
    const imports = lines.filter(line => line.trim().startsWith("import "));
    const importSources = imports.map(line => {
      const match = line.match(/from\s+['"]([^'"]+)['"]/);
      return match ? match[1] : null;
    }).filter(Boolean);
    const duplicateImports = importSources.filter((item, index) => importSources.indexOf(item) !== index);
    if (duplicateImports.length > 0) {
      results.push(`⚠️ 중복 import 발견: ${[...new Set(duplicateImports)].join(", ")}`);
    }
  }

  // 3. ESLint 실행 (설치되어 있는 경우)
  const projectRoot = projectPath || findProjectRoot(fullPath);
  const eslintPath = path.join(projectRoot, "node_modules", ".bin", "eslint");

  if (fs.existsSync(eslintPath) || fs.existsSync(eslintPath + ".cmd")) {
    results.push("");
    results.push("## 🔧 ESLint 분석");
    results.push("");

    const eslintCmd = process.platform === "win32" ? `"${eslintPath}.cmd"` : eslintPath;
    const eslintResult = runCommand(`${eslintCmd} "${fullPath}" --format stylish`, projectRoot);

    if (eslintResult.success && !eslintResult.stdout.trim()) {
      results.push("✅ ESLint 오류 없음");
    } else if (eslintResult.stdout) {
      results.push("```");
      results.push(eslintResult.stdout.trim());
      results.push("```");
    } else if (eslintResult.stderr) {
      results.push(`⚠️ ESLint 실행 오류: ${eslintResult.stderr}`);
    }
  }

  // 4. 함수 복잡도 분석
  results.push("");
  results.push("## 📈 함수 분석");
  results.push("");

  const functionMatches = content.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g);
  if (functionMatches) {
    results.push(`📦 함수 개수: ${functionMatches.length}개`);

    // 긴 함수 체크
    const functionPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=)/g;
    let match;
    const longFunctions: string[] = [];

    while ((match = functionPattern.exec(content)) !== null) {
      const funcName = match[1] || match[2];
      const startIdx = match.index;
      let braceCount = 0;
      let started = false;
      let endIdx = startIdx;

      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === "{") {
          braceCount++;
          started = true;
        } else if (content[i] === "}") {
          braceCount--;
          if (started && braceCount === 0) {
            endIdx = i;
            break;
          }
        }
      }

      const funcContent = content.substring(startIdx, endIdx);
      const funcLines = funcContent.split("\n").length;

      if (funcLines > 50) {
        longFunctions.push(`${funcName} (${funcLines}줄)`);
      }
    }

    if (longFunctions.length > 0) {
      results.push(`⚠️ 50줄 초과 함수 (분할 권장):`);
      longFunctions.forEach(f => results.push(`   - ${f}`));
    }
  }

  // 5. 보안 체크
  results.push("");
  results.push("## 🔒 보안 체크");
  results.push("");

  const securityIssues: string[] = [];

  // eval 사용 체크
  if (content.includes("eval(")) {
    securityIssues.push("❌ eval() 사용 발견 - 보안 위험");
  }

  // innerHTML 체크
  if (content.includes("innerHTML") && !content.includes("dangerouslySetInnerHTML")) {
    securityIssues.push("⚠️ innerHTML 사용 - XSS 취약점 가능성");
  }

  // 비밀번호/키 하드코딩 체크
  if (/(?:password|secret|api_key|apikey)\s*[=:]\s*['"][^'"]+['"]/i.test(content)) {
    securityIssues.push("❌ 하드코딩된 비밀번호/키 발견");
  }

  if (securityIssues.length === 0) {
    results.push("✅ 명백한 보안 이슈 없음");
  } else {
    securityIssues.forEach(issue => results.push(issue));
  }

  // 6. 요약
  results.push("");
  results.push("## 📋 요약");
  results.push("");

  const warnings = results.filter(r => r.startsWith("⚠️")).length;
  const errors = results.filter(r => r.startsWith("❌")).length;

  if (errors === 0 && warnings === 0) {
    results.push("✅ 전체적으로 양호한 코드입니다!");
  } else {
    results.push(`- 오류: ${errors}개`);
    results.push(`- 경고: ${warnings}개`);
  }

  return results.join("\n");
}

// ============================================
// 통합 테스트 생성 도구
// ============================================

async function generateIntegrationTest(
  targetPath: string,
  testType: "api" | "component" | "function" | "auto"
): Promise<string> {
  const fullPath = path.resolve(targetPath);

  if (!fs.existsSync(fullPath)) {
    return `❌ 파일을 찾을 수 없습니다: ${fullPath}`;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const ext = getFileExtension(fullPath);
  const fileName = path.basename(fullPath, ext);

  // 자동 감지
  let detectedType = testType;
  if (testType === "auto") {
    if (fullPath.includes("/api/") || fullPath.includes("\\api\\") || fullPath.includes("route.ts")) {
      detectedType = "api";
    } else if (content.includes("export default function") && (content.includes("return (") || content.includes("return<"))) {
      detectedType = "component";
    } else {
      detectedType = "function";
    }
  }

  const results: string[] = [];
  results.push(`// 통합 테스트: ${fileName}`);
  results.push(`// 생성 시간: ${new Date().toLocaleString("ko-KR")}`);
  results.push(`// 대상 파일: ${fullPath}`);
  results.push(`// 테스트 타입: ${detectedType}`);
  results.push("");

  if (detectedType === "api") {
    // API 테스트 생성
    results.push(generateApiTest(content, fileName, fullPath));
  } else if (detectedType === "component") {
    // 컴포넌트 테스트 생성
    results.push(generateComponentTest(content, fileName));
  } else {
    // 함수 테스트 생성
    results.push(generateFunctionTest(content, fileName));
  }

  return results.join("\n");
}

function generateApiTest(content: string, fileName: string, filePath: string): string {
  const lines: string[] = [];

  // HTTP 메서드 감지
  const methods: string[] = [];
  if (content.includes("export async function GET") || content.includes("export function GET")) methods.push("GET");
  if (content.includes("export async function POST") || content.includes("export function POST")) methods.push("POST");
  if (content.includes("export async function PUT") || content.includes("export function PUT")) methods.push("PUT");
  if (content.includes("export async function DELETE") || content.includes("export function DELETE")) methods.push("DELETE");
  if (content.includes("export async function PATCH") || content.includes("export function PATCH")) methods.push("PATCH");

  // API 경로 추출
  const apiPath = filePath
    .replace(/\\/g, "/")
    .match(/app\/api\/(.+?)\/route\.[tj]s/)?.[1]
    ?.replace(/\[([^\]]+)\]/g, ":$1") || fileName;

  lines.push(`const API_BASE = 'http://localhost:3000';`);
  lines.push(`const API_ENDPOINT = '/api/${apiPath}';`);
  lines.push("");
  lines.push(`describe('API: ${apiPath}', () => {`);
  lines.push(`  let testResults = { passed: 0, failed: 0, tests: [] };`);
  lines.push("");
  lines.push(`  function addTestResult(name, passed, message) {`);
  lines.push(`    testResults.tests.push({ name, passed, message });`);
  lines.push(`    if (passed) {`);
  lines.push(`      testResults.passed++;`);
  lines.push(`      console.log(\`✅ \${name}: \${message}\`);`);
  lines.push(`    } else {`);
  lines.push(`      testResults.failed++;`);
  lines.push(`      console.error(\`❌ \${name}: \${message}\`);`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push("");

  for (const method of methods) {
    lines.push(`  test('${method} 요청 테스트', async () => {`);
    lines.push(`    try {`);
    lines.push(`      const response = await fetch(\`\${API_BASE}\${API_ENDPOINT}\`, {`);
    lines.push(`        method: '${method}',`);
    if (["POST", "PUT", "PATCH"].includes(method)) {
      lines.push(`        headers: { 'Content-Type': 'application/json' },`);
      lines.push(`        body: JSON.stringify({`);
      lines.push(`          // TODO: 요청 바디 추가`);
      lines.push(`        }),`);
    }
    lines.push(`      });`);
    lines.push("");
    lines.push(`      const data = await response.json();`);
    lines.push("");
    lines.push(`      // 상태 코드 확인`);
    lines.push(`      addTestResult('상태 코드', response.ok, \`\${response.status}\`);`);
    lines.push("");
    lines.push(`      // 응답 구조 확인`);
    lines.push(`      addTestResult('응답 존재', data !== null, '응답 데이터 존재');`);
    lines.push("");
    lines.push(`      // TODO: 추가 검증 로직`);
    lines.push(`      // addTestResult('비즈니스 로직', condition, 'message');`);
    lines.push("");
    lines.push(`    } catch (error) {`);
    lines.push(`      addTestResult('요청 실패', false, error.message);`);
    lines.push(`    }`);
    lines.push(`  });`);
    lines.push("");
  }

  // 에러 케이스 테스트
  if (methods.includes("POST") || methods.includes("PUT")) {
    lines.push(`  test('잘못된 입력 에러 처리', async () => {`);
    lines.push(`    try {`);
    lines.push(`      const response = await fetch(\`\${API_BASE}\${API_ENDPOINT}\`, {`);
    lines.push(`        method: 'POST',`);
    lines.push(`        headers: { 'Content-Type': 'application/json' },`);
    lines.push(`        body: JSON.stringify({}), // 빈 바디`);
    lines.push(`      });`);
    lines.push("");
    lines.push(`      // 400 또는 422 에러 예상`);
    lines.push(`      addTestResult('유효성 검사', response.status >= 400, \`상태: \${response.status}\`);`);
    lines.push(`    } catch (error) {`);
    lines.push(`      addTestResult('에러 처리', false, error.message);`);
    lines.push(`    }`);
    lines.push(`  });`);
    lines.push("");
  }

  lines.push(`  afterAll(() => {`);
  lines.push(`    console.log('\\n📊 테스트 결과 요약');`);
  lines.push(`    console.log(\`✅ 통과: \${testResults.passed}\`);`);
  lines.push(`    console.log(\`❌ 실패: \${testResults.failed}\`);`);
  lines.push(`  });`);
  lines.push(`});`);

  return lines.join("\n");
}

function generateComponentTest(content: string, fileName: string): string {
  const lines: string[] = [];

  // 컴포넌트 이름 추출
  const componentMatch = content.match(/export\s+(?:default\s+)?function\s+(\w+)/);
  const componentName = componentMatch ? componentMatch[1] : fileName;

  lines.push(`import { render, screen, fireEvent, waitFor } from '@testing-library/react';`);
  lines.push(`import ${componentName} from './${fileName}';`);
  lines.push("");
  lines.push(`describe('${componentName}', () => {`);
  lines.push("");
  lines.push(`  test('컴포넌트 렌더링', () => {`);
  lines.push(`    render(<${componentName} />);`);
  lines.push(`    // TODO: 렌더링 확인`);
  lines.push(`    // expect(screen.getByText('...')).toBeInTheDocument();`);
  lines.push(`  });`);
  lines.push("");

  // onClick 핸들러 감지
  if (content.includes("onClick")) {
    lines.push(`  test('클릭 이벤트 처리', async () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    `);
    lines.push(`    // TODO: 버튼 선택 및 클릭`);
    lines.push(`    // const button = screen.getByRole('button', { name: /.../ });`);
    lines.push(`    // fireEvent.click(button);`);
    lines.push(`    // await waitFor(() => expect(...).toBe(...));`);
    lines.push(`  });`);
    lines.push("");
  }

  // useState 감지
  if (content.includes("useState")) {
    lines.push(`  test('상태 변경 테스트', async () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    `);
    lines.push(`    // TODO: 상태 변경 후 UI 확인`);
    lines.push(`    // 예: 입력 후 상태 변경`);
    lines.push(`    // fireEvent.change(input, { target: { value: 'test' } });`);
    lines.push(`  });`);
    lines.push("");
  }

  // fetch/API 호출 감지
  if (content.includes("fetch(") || content.includes("axios")) {
    lines.push(`  test('API 호출 테스트', async () => {`);
    lines.push(`    // Mock fetch`);
    lines.push(`    global.fetch = jest.fn(() =>`);
    lines.push(`      Promise.resolve({`);
    lines.push(`        ok: true,`);
    lines.push(`        json: () => Promise.resolve({ /* mock data */ }),`);
    lines.push(`      })`);
    lines.push(`    );`);
    lines.push("");
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    `);
    lines.push(`    // TODO: API 호출 트리거 및 결과 확인`);
    lines.push(`    // await waitFor(() => expect(fetch).toHaveBeenCalled());`);
    lines.push(`  });`);
    lines.push("");
  }

  lines.push(`  test('스냅샷 테스트', () => {`);
  lines.push(`    const { container } = render(<${componentName} />);`);
  lines.push(`    expect(container).toMatchSnapshot();`);
  lines.push(`  });`);
  lines.push(`});`);

  return lines.join("\n");
}

function generateFunctionTest(content: string, fileName: string): string {
  const lines: string[] = [];

  // export된 함수들 추출
  const exportedFunctions = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g) || [];
  const constExports = content.match(/export\s+const\s+(\w+)\s*=/g) || [];

  lines.push(`const { `);

  const funcNames: string[] = [];
  exportedFunctions.forEach(f => {
    const match = f.match(/function\s+(\w+)/);
    if (match) funcNames.push(match[1]);
  });
  constExports.forEach(c => {
    const match = c.match(/const\s+(\w+)/);
    if (match) funcNames.push(match[1]);
  });

  lines.push(`  ${funcNames.join(",\n  ")}`);
  lines.push(`} = require('./${fileName}');`);
  lines.push("");
  lines.push(`describe('${fileName} 함수 테스트', () => {`);
  lines.push("");

  funcNames.forEach(funcName => {
    lines.push(`  describe('${funcName}', () => {`);
    lines.push(`    test('정상 케이스', () => {`);
    lines.push(`      // TODO: 입력값 정의`);
    lines.push(`      const input = {};`);
    lines.push(`      `);
    lines.push(`      // TODO: 함수 호출`);
    lines.push(`      const result = ${funcName}(input);`);
    lines.push(`      `);
    lines.push(`      // TODO: 결과 검증`);
    lines.push(`      expect(result).toBeDefined();`);
    lines.push(`    });`);
    lines.push("");
    lines.push(`    test('엣지 케이스 - null/undefined 입력', () => {`);
    lines.push(`      // expect(() => ${funcName}(null)).toThrow();`);
    lines.push(`      // 또는 expect(${funcName}(null)).toBeNull();`);
    lines.push(`    });`);
    lines.push("");
    lines.push(`    test('에러 케이스', () => {`);
    lines.push(`      // TODO: 에러 상황 테스트`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push("");
  });

  lines.push(`});`);

  return lines.join("\n");
}

// ============================================
// 테스트 실행 도구
// ============================================

async function runTests(projectPath: string, testPattern?: string): Promise<string> {
  const results: string[] = [];
  results.push(`# 테스트 실행 결과`);
  results.push(`📁 프로젝트: ${projectPath}`);
  results.push(`📅 실행 시간: ${new Date().toLocaleString("ko-KR")}`);
  results.push("");

  const projectRoot = findProjectRoot(projectPath);

  // Jest 확인
  const jestPath = path.join(projectRoot, "node_modules", ".bin", "jest");
  const hasJest = fs.existsSync(jestPath) || fs.existsSync(jestPath + ".cmd");

  if (hasJest) {
    results.push("## Jest 테스트");
    results.push("");

    const jestCmd = process.platform === "win32" ? `"${jestPath}.cmd"` : jestPath;
    const pattern = testPattern ? `--testPathPattern="${testPattern}"` : "";
    const jestResult = runCommand(`${jestCmd} ${pattern} --passWithNoTests --json`, projectRoot);

    if (jestResult.success) {
      try {
        const jsonResult = JSON.parse(jestResult.stdout);
        results.push(`✅ 통과: ${jsonResult.numPassedTests}`);
        results.push(`❌ 실패: ${jsonResult.numFailedTests}`);
        results.push(`⏭️ 스킵: ${jsonResult.numPendingTests}`);
        results.push(`⏱️ 소요 시간: ${(jsonResult.testResults?.[0]?.perfStats?.runtime || 0) / 1000}초`);

        if (jsonResult.numFailedTests > 0) {
          results.push("");
          results.push("### 실패한 테스트:");
          jsonResult.testResults?.forEach((suite: any) => {
            suite.assertionResults?.forEach((test: any) => {
              if (test.status === "failed") {
                results.push(`- ${test.fullName}`);
                results.push(`  ${test.failureMessages?.[0]?.substring(0, 200) || ""}`);
              }
            });
          });
        }
      } catch {
        results.push("```");
        results.push(jestResult.stdout);
        results.push("```");
      }
    } else {
      results.push("```");
      results.push(jestResult.stderr || jestResult.stdout);
      results.push("```");
    }
  } else {
    results.push("⚠️ Jest가 설치되어 있지 않습니다.");
    results.push("설치: npm install --save-dev jest");
  }

  // npm test 실행 시도
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    if (packageJson.scripts?.test && !hasJest) {
      results.push("");
      results.push("## npm test 실행");
      results.push("");

      const npmResult = runCommand("npm test -- --passWithNoTests", projectRoot);
      results.push("```");
      results.push(npmResult.stdout || npmResult.stderr);
      results.push("```");
    }
  }

  return results.join("\n");
}

// ============================================
// 프로젝트 분석 도구
// ============================================

async function analyzeProject(projectPath: string): Promise<string> {
  const fullPath = path.resolve(projectPath);
  const results: string[] = [];

  results.push(`# 프로젝트 분석: ${path.basename(fullPath)}`);
  results.push(`📁 경로: ${fullPath}`);
  results.push(`📅 분석 시간: ${new Date().toLocaleString("ko-KR")}`);
  results.push("");

  // package.json 분석
  const packageJsonPath = path.join(fullPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    results.push("## 📦 프로젝트 정보");
    results.push(`- 이름: ${pkg.name || "N/A"}`);
    results.push(`- 버전: ${pkg.version || "N/A"}`);
    results.push("");

    results.push("## 🔧 스크립트");
    if (pkg.scripts) {
      Object.entries(pkg.scripts).forEach(([name, cmd]) => {
        results.push(`- \`npm run ${name}\`: ${cmd}`);
      });
    }
    results.push("");

    results.push("## 📚 주요 의존성");
    const deps = { ...pkg.dependencies };
    const devDeps = { ...pkg.devDependencies };

    const importantDeps = ["react", "next", "express", "typescript", "jest", "eslint"];
    importantDeps.forEach(dep => {
      if (deps[dep]) results.push(`- ${dep}: ${deps[dep]}`);
      if (devDeps[dep]) results.push(`- ${dep}: ${devDeps[dep]} (dev)`);
    });
  }

  // 파일 구조 분석
  results.push("");
  results.push("## 📂 파일 통계");

  const tsFiles = await glob("**/*.{ts,tsx}", { cwd: fullPath, ignore: ["node_modules/**", "dist/**", ".next/**"] });
  const jsFiles = await glob("**/*.{js,jsx}", { cwd: fullPath, ignore: ["node_modules/**", "dist/**", ".next/**"] });
  const testFiles = await glob("**/*.{test,spec}.{ts,tsx,js,jsx}", { cwd: fullPath, ignore: ["node_modules/**"] });

  results.push(`- TypeScript: ${tsFiles.length}개`);
  results.push(`- JavaScript: ${jsFiles.length}개`);
  results.push(`- 테스트 파일: ${testFiles.length}개`);

  // 테스트 커버리지 추정
  const srcFiles = tsFiles.length + jsFiles.length - testFiles.length;
  const coverageEstimate = srcFiles > 0 ? Math.round((testFiles.length / srcFiles) * 100) : 0;
  results.push(`- 테스트 커버리지 추정: ${coverageEstimate}%`);

  // ESLint/Prettier 설정 확인
  results.push("");
  results.push("## ⚙️ 개발 도구 설정");

  const eslintConfig = [".eslintrc", ".eslintrc.js", ".eslintrc.json", "eslint.config.js"]
    .some(f => fs.existsSync(path.join(fullPath, f)));
  const prettierConfig = [".prettierrc", ".prettierrc.js", "prettier.config.js"]
    .some(f => fs.existsSync(path.join(fullPath, f)));
  const tsConfig = fs.existsSync(path.join(fullPath, "tsconfig.json"));
  const jestConfig = ["jest.config.js", "jest.config.ts"]
    .some(f => fs.existsSync(path.join(fullPath, f)));

  results.push(`- ESLint: ${eslintConfig ? "✅" : "❌"}`);
  results.push(`- Prettier: ${prettierConfig ? "✅" : "❌"}`);
  results.push(`- TypeScript: ${tsConfig ? "✅" : "❌"}`);
  results.push(`- Jest: ${jestConfig ? "✅" : "❌"}`);

  return results.join("\n");
}

// ============================================
// MCP 도구 등록
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "review_code",
        description: "코드 파일을 분석하고 품질, 보안, 스타일 이슈를 리포트합니다. ESLint가 설치되어 있으면 함께 실행합니다.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "리뷰할 파일 경로 (절대 또는 상대 경로)"
            },
            projectPath: {
              type: "string",
              description: "프로젝트 루트 경로 (선택, ESLint 설정 찾기용)"
            }
          },
          required: ["filePath"]
        }
      },
      {
        name: "generate_test",
        description: "파일을 분석하여 통합 테스트 코드를 생성합니다. API, 컴포넌트, 함수 테스트를 자동 감지합니다.",
        inputSchema: {
          type: "object",
          properties: {
            targetPath: {
              type: "string",
              description: "테스트를 생성할 파일 경로"
            },
            testType: {
              type: "string",
              enum: ["api", "component", "function", "auto"],
              description: "테스트 타입 (auto: 자동 감지)"
            }
          },
          required: ["targetPath"]
        }
      },
      {
        name: "run_tests",
        description: "Jest 테스트를 실행하고 결과를 리포트합니다.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: {
              type: "string",
              description: "테스트를 실행할 프로젝트 경로"
            },
            testPattern: {
              type: "string",
              description: "테스트 파일 패턴 (선택)"
            }
          },
          required: ["projectPath"]
        }
      },
      {
        name: "analyze_project",
        description: "프로젝트 구조, 의존성, 설정 파일을 분석합니다.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: {
              type: "string",
              description: "분석할 프로젝트 경로"
            }
          },
          required: ["projectPath"]
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
      case "review_code": {
        const result = await reviewCode(
          args?.filePath as string,
          args?.projectPath as string | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "generate_test": {
        const result = await generateIntegrationTest(
          args?.targetPath as string,
          (args?.testType as "api" | "component" | "function" | "auto") || "auto"
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "run_tests": {
        const result = await runTests(
          args?.projectPath as string,
          args?.testPattern as string | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "analyze_project": {
        const result = await analyzeProject(args?.projectPath as string);
        return { content: [{ type: "text", text: result }] };
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
  console.error("MCP Dev Tools 서버가 시작되었습니다.");
}

main().catch(console.error);
