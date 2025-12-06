/**
 * BTS-3096: Spawning Pool Task 통합 - 롱폼 대본 작성 지원
 *
 * SPEC 검증 내용:
 * 1. spawn_queue 테이블 스키마 정의
 * 2. spawning-pool.py에 SpawnTask 클래스 정의
 * 3. spawn_queue DB 함수들 (get/claim/complete/release)
 * 4. 메인 루프에서 BTS 버그 + 롱폼 대본 동시 처리
 * 5. spawn task 통계 분리 추적
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-3096: Spawning Pool Task 통합 - 롱폼 대본 작성 지원', () => {
  const frontendRoot = path.join(__dirname, '..', '..');
  const workspaceRoot = path.join(frontendRoot, '..');

  describe('1. spawn_queue 테이블 스키마 검증', () => {
    const schemaPath = path.join(frontendRoot, 'schema-mysql.sql');
    let schemaContent: string;

    beforeAll(() => {
      schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    });

    it('schema-mysql.sql 파일이 존재해야 함', () => {
      expect(fs.existsSync(schemaPath)).toBe(true);
    });

    it('spawn_queue 테이블이 정의되어야 함', () => {
      expect(schemaContent).toContain('CREATE TABLE IF NOT EXISTS spawn_queue');
    });

    it('spawn_queue에 필수 컬럼들이 있어야 함', () => {
      // 테이블 정의 부분만 추출
      const tableMatch = schemaContent.match(/CREATE TABLE IF NOT EXISTS spawn_queue[\s\S]*?\)\s*ENGINE/);
      expect(tableMatch).toBeTruthy();

      const tableDefinition = tableMatch![0];
      expect(tableDefinition).toContain('id INT AUTO_INCREMENT PRIMARY KEY');
      expect(tableDefinition).toContain('task_id');
      expect(tableDefinition).toContain('status');
      expect(tableDefinition).toContain('worker_type');
      expect(tableDefinition).toContain('result');
      expect(tableDefinition).toContain('created_at');
      expect(tableDefinition).toContain('updated_at');
    });

    it('task_id에 UNIQUE 제약이 있어야 함', () => {
      expect(schemaContent).toContain('uk_spawn_queue_task_id');
    });
  });

  describe('2. spawning-pool.py SpawnTask 클래스 검증', () => {
    const pythonPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonPath, 'utf-8');
    });

    it('spawning-pool.py 파일이 존재해야 함', () => {
      expect(fs.existsSync(pythonPath)).toBe(true);
    });

    it('SpawnTask 클래스가 정의되어야 함', () => {
      expect(pythonContent).toContain('class SpawnTask');
      expect(pythonContent).toContain('@dataclass');
    });

    it('SpawnTask에 필수 필드가 있어야 함', () => {
      expect(pythonContent).toContain('task_id: str');
      expect(pythonContent).toContain('title: str');
      expect(pythonContent).toContain('prompt_format: str');
      expect(pythonContent).toContain('status: str');
    });

    it('JobType Enum이 정의되어야 함', () => {
      expect(pythonContent).toContain('class JobType(Enum)');
      expect(pythonContent).toContain("BUG = 'bug'");
      expect(pythonContent).toContain("TASK = 'task'");
    });
  });

  describe('3. spawn_queue DB 함수 검증', () => {
    const pythonPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonPath, 'utf-8');
    });

    it('get_pending_spawn_tasks 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def get_pending_spawn_tasks');
      expect(pythonContent).toContain('spawn_queue');
      expect(pythonContent).toContain("status = 'pending'");
    });

    it('claim_spawn_task 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def claim_spawn_task');
      expect(pythonContent).toContain("'in_progress'");
    });

    it('complete_spawn_task 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def complete_spawn_task');
      expect(pythonContent).toContain("'completed'");
      expect(pythonContent).toContain("'failed'");
    });

    it('release_spawn_task 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def release_spawn_task');
      expect(pythonContent).toContain("'pending'");
    });
  });

  describe('4. 롱폼 대본 작성 실행 로직 검증', () => {
    const pythonPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonPath, 'utf-8');
    });

    it('build_spawn_task_prompt 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def build_spawn_task_prompt');
      expect(pythonContent).toContain('task.title');
      expect(pythonContent).toContain('task.task_id');
    });

    it('process_spawn_task 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def process_spawn_task');
      // 롱폼은 Claude 사용
      expect(pythonContent).toContain('WorkerType.CLAUDE');
    });

    it('spawn_task_thread 함수가 구현되어야 함', () => {
      expect(pythonContent).toContain('def spawn_task_thread');
      expect(pythonContent).toContain('process_spawn_task');
    });
  });

  describe('5. 메인 루프 통합 검증', () => {
    const pythonPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonPath, 'utf-8');
    });

    it('메인 루프에서 BTS 버그와 spawn task 모두 처리해야 함', () => {
      expect(pythonContent).toContain('get_open_bugs');
      expect(pythonContent).toContain('get_pending_spawn_tasks');
    });

    it('작업 타입별로 future를 관리해야 함', () => {
      // job_type으로 버그와 task 구분
      expect(pythonContent).toContain("'bug'");
      expect(pythonContent).toContain("'task'");
    });

    it('BTS 버그 우선 처리가 구현되어야 함', () => {
      // 버그 처리 후 남은 슬롯으로 spawn task 처리
      expect(pythonContent).toContain('BTS 버그 처리');
      expect(pythonContent).toContain('Spawn Queue 처리');
    });

    it('Claude 슬롯 확인 후 spawn task 할당해야 함', () => {
      expect(pythonContent).toContain('claude_available');
      expect(pythonContent).toContain("WORKER_CONFIG['claude']['count']");
    });
  });

  describe('6. spawn task 통계 분리 추적 검증', () => {
    const pythonPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonPath, 'utf-8');
    });

    it('spawn_stats가 정의되어야 함', () => {
      expect(pythonContent).toContain('spawn_stats');
    });

    it('BTS와 Spawn 통계가 분리되어 출력되어야 함', () => {
      expect(pythonContent).toContain('BTS:');
      expect(pythonContent).toContain('Spawn:');
    });

    it('최종 통계에 BTS와 Spawn 모두 표시되어야 함', () => {
      expect(pythonContent).toContain('Final BTS stats');
      expect(pythonContent).toContain('Final Spawn stats');
    });
  });

  describe('7. SPEC 문서 주석 검증', () => {
    const pythonPath = path.join(workspaceRoot, 'mcp-debugger', 'spawning-pool.py');
    let pythonContent: string;

    beforeAll(() => {
      pythonContent = fs.readFileSync(pythonPath, 'utf-8');
    });

    it('SPEC-3096 참조가 문서에 포함되어야 함', () => {
      expect(pythonContent).toContain('SPEC-3096');
    });

    it('지원 작업 타입이 문서화되어야 함', () => {
      expect(pythonContent).toContain('BTS 버그');
      expect(pythonContent).toContain('spawn_queue');
    });
  });
});
