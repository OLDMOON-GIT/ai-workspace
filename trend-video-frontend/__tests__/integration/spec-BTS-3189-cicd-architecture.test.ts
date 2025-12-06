/**
 * SPEC-3189: BTS CI/CD 자동화 아키텍처 구현 테스트
 *
 * 핵심 구성요소 테스트:
 * 1. 입력 소스 파서 (Parser)
 * 2. 테스트 파이프라인
 * 3. 피드백 루프
 * 4. 배포 파이프라인
 */

import fs from 'fs';
import path from 'path';

// 파서 모듈 경로 (mcp-debugger/src)
const MCP_DEBUGGER_SRC = path.join(__dirname, '../../../mcp-debugger/src');

describe('SPEC-3189: BTS CI/CD 자동화 아키텍처', () => {
  describe('입력 소스 파서 (Parser) 존재 확인', () => {
    it('spec-parser.ts가 존재해야 함', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'spec-parser.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('figma-parser.ts가 존재해야 함', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'figma-parser.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('erd-parser.ts가 존재해야 함', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'erd-parser.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('arch-parser.ts가 존재해야 함', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'arch-parser.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('테스트/피드백 모듈 존재 확인', () => {
    it('test-reporter.ts가 존재해야 함', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'test-reporter.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('error-collector.ts가 존재해야 함', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'error-collector.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('monitor.ts가 존재해야 함 (로그 패턴 감지)', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'monitor.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('배포 파이프라인 모듈 존재 확인', () => {
    it('deploy-pipeline.ts가 존재해야 함', () => {
      const filePath = path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('관리 UI 페이지 존재 확인', () => {
    it('/admin/bts 페이지가 존재해야 함', () => {
      const filePath = path.join(__dirname, '../../src/app/admin/bts/page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('/admin/deploy 페이지가 존재해야 함', () => {
      const filePath = path.join(__dirname, '../../src/app/admin/deploy/page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('파서 모듈 기능 검증', () => {
    describe('spec-parser.ts', () => {
      it('parseSpecFile 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'spec-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function parseSpecFile');
      });

      it('registerSpecToBts 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'spec-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function registerSpecToBts');
      });

      it('ParsedSpec 인터페이스가 정의되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'spec-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export interface ParsedSpec');
      });
    });

    describe('figma-parser.ts', () => {
      it('parseFigmaFile 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'figma-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function parseFigmaFile');
      });

      it('generateReactComponent 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'figma-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export function generateReactComponent');
      });

      it('FigmaComponent 인터페이스가 정의되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'figma-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export interface FigmaComponent');
      });
    });

    describe('erd-parser.ts', () => {
      it('parseERDFile 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'erd-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function parseERDFile');
      });

      it('generateMigration 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'erd-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export function generateMigration');
      });

      it('generateTypeDefinitions 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'erd-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export function generateTypeDefinitions');
      });

      it('ERDTable 인터페이스가 정의되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'erd-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export interface ERDTable');
      });
    });

    describe('arch-parser.ts', () => {
      it('parseArchitectureFile 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'arch-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function parseArchitectureFile');
      });

      it('analyzeDependencies 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'arch-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export function analyzeDependencies');
      });

      it('generateArchitectureReport 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'arch-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export function generateArchitectureReport');
      });

      it('ArchComponent 인터페이스가 정의되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'arch-parser.ts'),
          'utf-8'
        );
        expect(content).toContain('export interface ArchComponent');
      });
    });
  });

  describe('테스트/피드백 모듈 기능 검증', () => {
    describe('test-reporter.ts', () => {
      it('runJestTests 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'test-reporter.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function runJestTests');
      });

      it('runPlaywrightTests 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'test-reporter.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function runPlaywrightTests');
      });

      it('generateTestReport 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'test-reporter.ts'),
          'utf-8'
        );
        expect(content).toContain('export function generateTestReport');
      });
    });

    describe('error-collector.ts', () => {
      it('collectApiError 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'error-collector.ts'),
          'utf-8'
        );
        expect(content).toContain('export function collectApiError');
      });

      it('collectReactError 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'error-collector.ts'),
          'utf-8'
        );
        expect(content).toContain('export function collectReactError');
      });

      it('registerAllNewErrors 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'error-collector.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function registerAllNewErrors');
      });

      it('setupGlobalErrorHandlers 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'error-collector.ts'),
          'utf-8'
        );
        expect(content).toContain('export function setupGlobalErrorHandlers');
      });
    });
  });

  describe('배포 파이프라인 기능 검증', () => {
    describe('deploy-pipeline.ts', () => {
      it('runDeployPipeline 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function runDeployPipeline');
      });

      it('runTypeCheck 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function runTypeCheck');
      });

      it('runBuild 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function runBuild');
      });

      it('healthCheck 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function healthCheck');
      });

      it('deployToVercel 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function deployToVercel');
      });

      it('deployToDocker 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
          'utf-8'
        );
        expect(content).toContain('export async function deployToDocker');
      });

      it('generateDeployReport 함수가 export 되어야 함', async () => {
        const content = fs.readFileSync(
          path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
          'utf-8'
        );
        expect(content).toContain('export function generateDeployReport');
      });
    });
  });

  describe('자동화 플로우 검증', () => {
    it('monitor.ts가 버그를 자동 등록해야 함 (bugCreate 또는 bug.js)', async () => {
      const content = fs.readFileSync(
        path.join(MCP_DEBUGGER_SRC, 'monitor.ts'),
        'utf-8'
      );
      // bugCreate 함수 호출 또는 bug.js CLI 사용
      const hasBugRegistration = content.includes('bugCreate') || content.includes('bug.js add');
      expect(hasBugRegistration).toBe(true);
    });

    it('error-collector.ts가 bugCreate를 호출하여 버그를 자동 등록해야 함', async () => {
      const content = fs.readFileSync(
        path.join(MCP_DEBUGGER_SRC, 'error-collector.ts'),
        'utf-8'
      );
      expect(content).toContain('bugCreate');
    });

    it('test-reporter.ts가 bugCreate를 호출하여 테스트 실패를 버그로 등록해야 함', async () => {
      const content = fs.readFileSync(
        path.join(MCP_DEBUGGER_SRC, 'test-reporter.ts'),
        'utf-8'
      );
      expect(content).toContain('bugCreate');
    });

    it('deploy-pipeline.ts가 bugCreate를 호출하여 배포 실패를 버그로 등록해야 함', async () => {
      const content = fs.readFileSync(
        path.join(MCP_DEBUGGER_SRC, 'deploy-pipeline.ts'),
        'utf-8'
      );
      expect(content).toContain('bugCreate');
    });
  });
});
