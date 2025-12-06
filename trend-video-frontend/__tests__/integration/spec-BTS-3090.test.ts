/**
 * BTS-3090: Spawning Pool v2 - 지능형 AI 워커 라우팅 시스템
 *
 * SPEC 검증 내용:
 * 1. prompts/prompt_dispatcher.txt - Dispatcher 프롬프트 파일 존재 및 구조
 * 2. /api/dispatcher-prompt - 프롬프트 관리 API GET/POST
 * 3. admin/prompts 페이지에 Dispatcher 프롬프트 편집 링크
 * 4. spawning-pool-v2.py - 지능형 라우팅 메인 스크립트
 * 5. 키워드 기반 빠른 라우팅 + Claude Dispatcher 폴백
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-3090: Spawning Pool v2 지능형 라우팅 시스템', () => {
  const frontendRoot = path.join(__dirname, '..', '..');
  const workspaceRoot = path.join(frontendRoot, '..');

  describe('1. prompts/prompt_dispatcher.txt 검증', () => {
    const promptPath = path.join(frontendRoot, 'prompts', 'prompt_dispatcher.txt');
    let promptContent: string;

    beforeAll(() => {
      promptContent = fs.readFileSync(promptPath, 'utf-8');
    });

    it('prompt_dispatcher.txt 파일이 존재해야 함', () => {
      expect(fs.existsSync(promptPath)).toBe(true);
    });

    it('워커 특성 섹션이 포함되어야 함', () => {
      expect(promptContent).toContain('## 워커 특성');
    });

    it('CLAUDE 워커 설명이 포함되어야 함', () => {
      expect(promptContent).toContain('### CLAUDE');
      expect(promptContent).toContain('롱폼');
      expect(promptContent).toContain('복잡한 버그');
    });

    it('GEMINI 워커 설명이 포함되어야 함', () => {
      expect(promptContent).toContain('### GEMINI');
      expect(promptContent).toContain('숏폼');
      expect(promptContent).toContain('상품');
    });

    it('CODEX 워커 설명이 포함되어야 함', () => {
      expect(promptContent).toContain('### CODEX');
      expect(promptContent).toContain('플래닝');
      expect(promptContent).toContain('아키텍처');
    });

    it('응답 형식 가이드가 포함되어야 함', () => {
      expect(promptContent).toContain('## 응답 형식');
      expect(promptContent).toContain('WORKER:');
      expect(promptContent).toContain('REASON:');
    });
  });

  describe('2. /api/dispatcher-prompt API 검증', () => {
    const apiPath = path.join(frontendRoot, 'src', 'app', 'api', 'dispatcher-prompt', 'route.ts');
    let apiContent: string;

    beforeAll(() => {
      apiContent = fs.readFileSync(apiPath, 'utf-8');
    });

    it('dispatcher-prompt API 파일이 존재해야 함', () => {
      expect(fs.existsSync(apiPath)).toBe(true);
    });

    it('GET 핸들러가 구현되어야 함', () => {
      expect(apiContent).toContain('export async function GET');
    });

    it('POST 핸들러가 구현되어야 함', () => {
      expect(apiContent).toContain('export async function POST');
    });

    it('관리자 인증 확인 로직이 있어야 함', () => {
      expect(apiContent).toContain('getCurrentUser');
      expect(apiContent).toContain('isAdmin');
    });

    it('prompt_dispatcher.txt 파일을 읽어야 함', () => {
      expect(apiContent).toContain('prompt_dispatcher.txt');
    });

    it('캐싱 로직이 구현되어야 함', () => {
      expect(apiContent).toContain('promptCache');
      expect(apiContent).toContain('lastModified');
    });

    it('백업 생성 로직이 있어야 함', () => {
      expect(apiContent).toContain('backup');
    });

    it('HTML 편집기 UI를 반환해야 함 (Accept: text/html)', () => {
      expect(apiContent).toContain('text/html');
      expect(apiContent).toContain('Dispatcher 프롬프트 편집');
    });
  });

  describe('3. admin/prompts 페이지에 Dispatcher 링크 검증', () => {
    const adminPromptsPath = path.join(frontendRoot, 'src', 'app', 'admin', 'prompts', 'page.tsx');
    let adminPromptsContent: string;

    beforeAll(() => {
      adminPromptsContent = fs.readFileSync(adminPromptsPath, 'utf-8');
    });

    it('admin/prompts 페이지가 존재해야 함', () => {
      expect(fs.existsSync(adminPromptsPath)).toBe(true);
    });

    it('Dispatcher 프롬프트 링크가 있어야 함', () => {
      expect(adminPromptsContent).toContain('/api/dispatcher-prompt');
    });

    it('Dispatcher 프롬프트 카드 UI가 있어야 함', () => {
      expect(adminPromptsContent).toContain('Dispatcher 프롬프트');
    });

    it('워커 할당 기준 설명이 있어야 함', () => {
      expect(adminPromptsContent).toContain('Claude');
      expect(adminPromptsContent).toContain('Gemini');
      expect(adminPromptsContent).toContain('Codex');
    });
  });

  describe('4. spawning-pool-v2.py 검증', () => {
    const pythonScriptPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool-v2.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonScriptPath, 'utf-8');
    });

    it('spawning-pool-v2.py 파일이 존재해야 함', () => {
      expect(fs.existsSync(pythonScriptPath)).toBe(true);
    });

    it('워커 구성이 정의되어야 함 (Claude 6, Gemini 2, Codex 2)', () => {
      expect(pythonContent).toContain('WORKER_CONFIG');
      expect(pythonContent).toMatch(/'claude':\s*{\s*'count':\s*6/);
      expect(pythonContent).toMatch(/'gemini':\s*{\s*'count':\s*2/);
      expect(pythonContent).toMatch(/'codex':\s*{\s*'count':\s*2/);
    });

    it('WorkerType Enum이 정의되어야 함', () => {
      expect(pythonContent).toContain('class WorkerType(Enum)');
      expect(pythonContent).toContain("CLAUDE = 'claude'");
      expect(pythonContent).toContain("GEMINI = 'gemini'");
      expect(pythonContent).toContain("CODEX = 'codex'");
    });

    it('dispatch_task 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def dispatch_task');
    });

    it('Claude CLI 호출 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def call_claude_cli');
      expect(pythonContent).toContain('claude --dangerously-skip-permissions');
    });

    it('Gemini CLI 호출 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def call_gemini_cli');
      expect(pythonContent).toContain('gemini');
      expect(pythonContent).toContain('--yolo');
    });

    it('Codex CLI 호출 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def call_codex_cli');
      expect(pythonContent).toContain('codex');
      expect(pythonContent).toContain('exec');
      expect(pythonContent).toContain('--dangerously-bypass-approvals-and-sandbox');
    });

    it('MySQL 연결 설정이 있어야 함', () => {
      expect(pythonContent).toContain('DB_CONFIG');
      expect(pythonContent).toContain('mysql.connector');
    });

    it('버그 claim/resolve/release 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def claim_bug');
      expect(pythonContent).toContain('def resolve_bug');
      expect(pythonContent).toContain('def release_bug');
    });

    it('메인 루프가 구현되어야 함', () => {
      expect(pythonContent).toContain('def main_loop');
      expect(pythonContent).toContain("if __name__ == '__main__'");
    });
  });

  describe('5. 키워드 기반 빠른 라우팅 검증', () => {
    const pythonScriptPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool-v2.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonScriptPath, 'utf-8');
    });

    it('Codex 키워드가 정의되어야 함', () => {
      expect(pythonContent).toContain('codex_keywords');
      expect(pythonContent).toContain("'plan'");
      expect(pythonContent).toContain("'아키텍처'");
      expect(pythonContent).toContain("'architecture'");
      expect(pythonContent).toContain("'review'");
    });

    it('Gemini 키워드가 정의되어야 함', () => {
      expect(pythonContent).toContain('gemini_keywords');
      expect(pythonContent).toContain("'숏폼'");
      expect(pythonContent).toContain("'shortform'");
      expect(pythonContent).toContain("'상품'");
      expect(pythonContent).toContain("'product'");
      expect(pythonContent).toContain("'thumbnail'");
    });

    it('Claude 키워드가 정의되어야 함', () => {
      expect(pythonContent).toContain('claude_keywords');
      expect(pythonContent).toContain("'롱폼'");
      expect(pythonContent).toContain("'longform'");
      expect(pythonContent).toContain("'복잡'");
      expect(pythonContent).toContain("'error'");
    });

    it('키워드 매칭 실패 시 Claude Dispatcher 폴백이 있어야 함', () => {
      // Dispatcher 프롬프트 호출
      expect(pythonContent).toContain('dispatch_prompt');
      expect(pythonContent).toContain('call_claude_cli');
      // 기본값 Claude 폴백
      expect(pythonContent).toContain('Default fallback');
      expect(pythonContent).toContain('WorkerType.CLAUDE');
    });

    it('RoutingDecision 데이터 클래스가 정의되어야 함', () => {
      expect(pythonContent).toContain('class RoutingDecision');
      expect(pythonContent).toContain('worker_type');
      expect(pythonContent).toContain('reason');
      expect(pythonContent).toContain('confidence');
    });
  });

  describe('6. ThreadPoolExecutor 병렬 처리 검증', () => {
    const pythonScriptPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool-v2.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonScriptPath, 'utf-8');
    });

    it('ThreadPoolExecutor를 사용해야 함', () => {
      expect(pythonContent).toContain('ThreadPoolExecutor');
    });

    it('최대 워커 수가 10개여야 함', () => {
      expect(pythonContent).toContain('MAX_WORKERS');
      // Claude 6 + Gemini 2 + Codex 2 = 10
      expect(pythonContent).toContain("sum(cfg['count'] for cfg in WORKER_CONFIG.values())");
    });

    it('워커 카운트 스레드 세이프 처리가 있어야 함', () => {
      expect(pythonContent).toContain('worker_counts_lock');
      expect(pythonContent).toContain('threading.Lock()');
    });

    it('통계 추적 기능이 있어야 함', () => {
      expect(pythonContent).toContain('stats');
      expect(pythonContent).toContain("'processed'");
      expect(pythonContent).toContain("'success'");
      expect(pythonContent).toContain("'failed'");
    });
  });
});
