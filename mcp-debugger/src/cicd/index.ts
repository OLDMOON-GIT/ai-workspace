#!/usr/bin/env node
/**
 * BTS CI/CD 자동화 아키텍처 (BTS-3189)
 *
 * 핵심 구성요소:
 * 1. 입력 소스 파서
 *    - spec-parser: 기획서에서 SPEC 추출
 *    - figma-parser: Figma에서 UI 컴포넌트 추출
 *    - erd-parser: ERD에서 DB 마이그레이션 생성
 *    - arch-parser: 아키텍처에서 의존성 분석
 *
 * 2. 테스트 파이프라인
 *    - test-pipeline: 통합 테스트 실행 (Jest, Playwright, E2E)
 *    - test-reporter: 테스트 결과 모니터링 및 버그 등록
 *
 * 3. 피드백 루프
 *    - error-collector: 런타임 에러 수집 및 버그 등록
 *    - monitor.ts: 로그 패턴 감지 → 버그 등록 (기존)
 *
 * 4. 배포 파이프라인
 *    - deploy-pipeline: 빌드-배포-헬스체크-롤백
 */

// 파서 모듈
export { default as SpecParser } from './spec-parser.js';
export { default as FigmaParser } from './figma-parser.js';
export { default as ErdParser } from './erd-parser.js';
export { default as ArchParser } from './arch-parser.js';

// 테스트 모듈
export { default as TestPipeline } from './test-pipeline.js';
export { default as TestReporter } from './test-reporter.js';

// 피드백 루프
export { default as ErrorCollector, createErrorMiddleware } from './error-collector.js';

// 배포 파이프라인
export { default as DeployPipeline } from './deploy-pipeline.js';

// 전체 자동화 플로우 실행기
import SpecParser from './spec-parser.js';
import FigmaParser from './figma-parser.js';
import ErdParser from './erd-parser.js';
import ArchParser from './arch-parser.js';
import TestPipeline from './test-pipeline.js';
import DeployPipeline from './deploy-pipeline.js';
import ErrorCollector from './error-collector.js';

interface AutomationConfig {
  projectPath: string;
  specFile?: string;
  figmaSource?: string;
  erdFile?: string;
  archFile?: string;
  runTests: boolean;
  deploy: boolean;
  environment: 'development' | 'staging' | 'production';
  collectErrors: boolean;
}

export class CICDAutomation {
  private config: AutomationConfig;

  constructor(config: Partial<AutomationConfig> = {}) {
    this.config = {
      projectPath: config.projectPath || process.cwd(),
      runTests: config.runTests ?? true,
      deploy: config.deploy ?? false,
      environment: config.environment || 'development',
      collectErrors: config.collectErrors ?? true,
      ...config,
    };
  }

  /**
   * 전체 자동화 플로우 실행
   *
   * 플로우:
   * 1. 입력 문서 파싱 → SPEC/버그 등록
   * 2. 테스트 실행 → 실패 시 버그 등록
   * 3. 배포 실행 → 실패 시 버그 등록 + 롤백
   * 4. 에러 수집 → 런타임 에러 버그 등록
   */
  async run(): Promise<{
    success: boolean;
    parsedSpecs: number;
    testsPassed: boolean;
    deployed: boolean;
    registeredBugs: number;
  }> {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         🔄 BTS CI/CD Automation (BTS-3189)                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    let parsedSpecs = 0;
    let testsPassed = true;
    let deployed = false;
    let registeredBugs = 0;

    try {
      // 1. 입력 문서 파싱
      console.log('📄 [1/4] 입력 문서 파싱\n');

      if (this.config.specFile) {
        const parser = new SpecParser();
        const specs = await parser.parseFile(this.config.specFile);
        const ids = await parser.registerSpecs(specs);
        parsedSpecs += ids.length;
        console.log(`   SPEC 파서: ${ids.length}개 등록\n`);
      }

      if (this.config.figmaSource) {
        const parser = new FigmaParser();
        const components = await parser.parseFile(this.config.figmaSource);
        const componentSpecs = parser.generateComponentSpecs(components);
        const ids = await parser.registerComponentSpecs(componentSpecs);
        parsedSpecs += ids.length;
        console.log(`   Figma 파서: ${ids.length}개 등록\n`);
      }

      if (this.config.erdFile) {
        const parser = new ErdParser();
        const schema = await parser.parseFile(this.config.erdFile);
        await parser.generateMigrationFiles(schema, './migrations');
        const ids = await parser.registerSchemaSpecs(schema);
        parsedSpecs += ids.length;
        console.log(`   ERD 파서: ${ids.length}개 등록\n`);
      }

      if (this.config.archFile) {
        const parser = new ArchParser();
        const arch = await parser.parseFile(this.config.archFile);
        const ids = await parser.registerArchSpecs(arch);
        parsedSpecs += ids.length;
        registeredBugs += ids.length;
        console.log(`   아키텍처 파서: ${ids.length}개 등록\n`);
      }

      // 2. 테스트 실행
      if (this.config.runTests) {
        console.log('🧪 [2/4] 테스트 실행\n');

        const testPipeline = new TestPipeline({
          projectPath: this.config.projectPath,
          runUnit: true,
          runIntegration: true,
          runUi: false, // Playwright는 선택적
          runE2e: false, // E2E도 선택적
          autoRegisterBugs: true,
        });

        const testResult = await testPipeline.run();
        testsPassed = testResult.success;
        registeredBugs += testResult.registeredBugs.length;

        if (!testsPassed) {
          console.log('   ⚠️  테스트 실패 - 배포 중단\n');
        }
      }

      // 3. 배포 실행
      if (this.config.deploy && testsPassed) {
        console.log('🚀 [3/4] 배포 실행\n');

        const deployPipeline = new DeployPipeline({
          projectPath: this.config.projectPath,
          environment: this.config.environment,
          rollbackEnabled: true,
          notifyOnFailure: true,
        });

        const deployResult = await deployPipeline.run();
        deployed = deployResult.success;

        if (!deployed) {
          registeredBugs += 1; // 배포 실패 버그
        }
      }

      // 4. 에러 수집 시작 (백그라운드)
      if (this.config.collectErrors) {
        console.log('🔴 [4/4] 에러 수집 시작\n');

        const collector = new ErrorCollector({
          projectPath: this.config.projectPath,
        });

        // 백그라운드에서 실행
        collector.start().catch(console.error);
        console.log('   에러 수집기 시작됨 (http://localhost:3999)\n');
      }

      return {
        success: testsPassed && (!this.config.deploy || deployed),
        parsedSpecs,
        testsPassed,
        deployed,
        registeredBugs,
      };

    } catch (error) {
      console.error('자동화 플로우 오류:', error);
      return {
        success: false,
        parsedSpecs,
        testsPassed,
        deployed,
        registeredBugs,
      };
    }
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log('BTS CI/CD 자동화 시스템 (BTS-3189)');
    console.log('');
    console.log('사용법:');
    console.log('  npx ts-node index.ts <command> [options]');
    console.log('');
    console.log('명령어:');
    console.log('  parse-spec <file>      기획서에서 SPEC 추출');
    console.log('  parse-figma <source>   Figma에서 컴포넌트 추출');
    console.log('  parse-erd <file>       ERD에서 마이그레이션 생성');
    console.log('  parse-arch <file>      아키텍처 분석');
    console.log('  test                   테스트 파이프라인 실행');
    console.log('  deploy                 배포 파이프라인 실행');
    console.log('  full                   전체 자동화 플로우 실행');
    console.log('');
    console.log('예시:');
    console.log('  npx ts-node index.ts parse-spec ./docs/spec.md --register');
    console.log('  npx ts-node index.ts test --all');
    console.log('  npx ts-node index.ts deploy --env production');
    console.log('  npx ts-node index.ts full --spec ./spec.md --deploy');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'parse-spec': {
      const file = args[1];
      if (!file) {
        console.error('파일 경로를 지정해주세요');
        process.exit(1);
      }
      const parser = new SpecParser();
      const specs = await parser.parseFile(file);
      console.log(`${specs.length}개의 SPEC 발견`);

      if (args.includes('--register')) {
        await parser.registerSpecs(specs);
      }
      break;
    }

    case 'parse-figma': {
      const source = args[1];
      if (!source) {
        console.error('Figma 소스를 지정해주세요');
        process.exit(1);
      }
      const parser = new FigmaParser();
      const components = await parser.parseFile(source);
      console.log(`${components.length}개의 컴포넌트 발견`);

      if (args.includes('--register')) {
        const specs = parser.generateComponentSpecs(components);
        await parser.registerComponentSpecs(specs);
      }
      break;
    }

    case 'parse-erd': {
      const file = args[1];
      if (!file) {
        console.error('ERD 파일을 지정해주세요');
        process.exit(1);
      }
      const parser = new ErdParser();
      const schema = await parser.parseFile(file);
      console.log(`${schema.tables.length}개의 테이블 발견`);
      await parser.generateMigrationFiles(schema, './migrations');

      if (args.includes('--register')) {
        await parser.registerSchemaSpecs(schema);
      }
      break;
    }

    case 'parse-arch': {
      const file = args[1];
      if (!file) {
        console.error('아키텍처 파일을 지정해주세요');
        process.exit(1);
      }
      const parser = new ArchParser();
      const arch = await parser.parseFile(file);
      console.log(`${arch.nodes.length}개의 노드, ${arch.edges.length}개의 엣지 발견`);

      if (args.includes('--analyze')) {
        const analysis = parser.analyzeDependencies(arch);
        console.log('분석 결과:', analysis);
      }

      if (args.includes('--register')) {
        await parser.registerArchSpecs(arch);
      }
      break;
    }

    case 'test': {
      const pipeline = new TestPipeline({
        runUnit: args.includes('--all') || args.includes('--unit'),
        runIntegration: args.includes('--all') || args.includes('--integration'),
        runUi: args.includes('--all') || args.includes('--ui'),
        runE2e: args.includes('--all') || args.includes('--e2e'),
      });
      const result = await pipeline.run();
      process.exit(result.success ? 0 : 1);
    }

    case 'deploy': {
      const envIndex = args.indexOf('--env');
      const pipeline = new DeployPipeline({
        environment: envIndex >= 0 ? args[envIndex + 1] as 'development' | 'staging' | 'production' : 'development',
      });
      const result = await pipeline.run();
      process.exit(result.success ? 0 : 1);
    }

    case 'full': {
      const specIndex = args.indexOf('--spec');
      const figmaIndex = args.indexOf('--figma');
      const erdIndex = args.indexOf('--erd');
      const archIndex = args.indexOf('--arch');
      const envIndex = args.indexOf('--env');

      const automation = new CICDAutomation({
        specFile: specIndex >= 0 ? args[specIndex + 1] : undefined,
        figmaSource: figmaIndex >= 0 ? args[figmaIndex + 1] : undefined,
        erdFile: erdIndex >= 0 ? args[erdIndex + 1] : undefined,
        archFile: archIndex >= 0 ? args[archIndex + 1] : undefined,
        deploy: args.includes('--deploy'),
        environment: envIndex >= 0 ? args[envIndex + 1] as 'development' | 'staging' | 'production' : 'development',
      });

      const result = await automation.run();
      console.log('\n최종 결과:', result);
      process.exit(result.success ? 0 : 1);
    }

    default:
      console.error(`알 수 없는 명령어: ${command}`);
      console.log('--help로 도움말을 확인하세요');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default CICDAutomation;
