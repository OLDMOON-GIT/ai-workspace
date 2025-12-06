#!/usr/bin/env node
/**
 * Deploy Pipeline (BTS-3189)
 * 빌드-배포-헬스체크-롤백 자동화 파이프라인
 *
 * 기능:
 * 1. 빌드 (npm run build)
 * 2. Vercel/Docker 배포
 * 3. Health Check
 * 4. 자동 롤백
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { bugCreate } from '../bug-bridge.js';

interface DeployConfig {
  projectPath: string;
  environment: 'development' | 'staging' | 'production';
  provider: 'vercel' | 'docker' | 'pm2' | 'custom';
  buildCommand: string;
  deployCommand: string;
  healthCheckUrl?: string;
  healthCheckTimeout: number;
  healthCheckRetries: number;
  rollbackEnabled: boolean;
  preDeployHooks: string[];
  postDeployHooks: string[];
  notifyOnFailure: boolean;
}

interface DeployResult {
  success: boolean;
  startTime: Date;
  endTime: Date;
  stages: DeployStage[];
  deploymentUrl?: string;
  previousDeploymentId?: string;
  error?: string;
}

interface DeployStage {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration: number;
  output?: string;
  error?: string;
}

const DEFAULT_CONFIG: DeployConfig = {
  projectPath: process.cwd(),
  environment: 'development',
  provider: 'vercel',
  buildCommand: 'npm run build',
  deployCommand: 'vercel --prod',
  healthCheckTimeout: 30000,
  healthCheckRetries: 5,
  rollbackEnabled: true,
  preDeployHooks: [],
  postDeployHooks: [],
  notifyOnFailure: true,
};

export class DeployPipeline {
  private config: DeployConfig;
  private result: DeployResult;
  private aborted: boolean = false;

  constructor(config: Partial<DeployConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.result = {
      success: false,
      startTime: new Date(),
      endTime: new Date(),
      stages: [],
    };
  }

  /**
   * 배포 파이프라인 실행
   */
  async run(): Promise<DeployResult> {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              🚀 Deploy Pipeline (BTS-3189)                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  환경: ${this.config.environment}`);
    console.log(`  제공자: ${this.config.provider}`);
    console.log('');

    this.result.startTime = new Date();

    try {
      // 1. Pre-deploy hooks
      if (this.config.preDeployHooks.length > 0) {
        await this.runStage('Pre-deploy Hooks', () => this.runHooks(this.config.preDeployHooks));
      }

      // 2. 타입체크
      await this.runStage('TypeScript Check', () => this.runTypeCheck());

      // 3. 린트 (선택)
      // await this.runStage('Lint', () => this.runLint());

      // 4. 빌드
      await this.runStage('Build', () => this.runBuild());

      // 5. 배포
      await this.runStage('Deploy', () => this.runDeploy());

      // 6. Health Check
      if (this.config.healthCheckUrl) {
        await this.runStage('Health Check', () => this.runHealthCheck());
      }

      // 7. Post-deploy hooks
      if (this.config.postDeployHooks.length > 0) {
        await this.runStage('Post-deploy Hooks', () => this.runHooks(this.config.postDeployHooks));
      }

      this.result.success = true;

    } catch (error) {
      this.result.success = false;
      this.result.error = String(error);

      // 롤백 시도
      if (this.config.rollbackEnabled && this.result.previousDeploymentId) {
        console.log('\n⚠️  배포 실패, 롤백 시도 중...\n');
        await this.runStage('Rollback', () => this.runRollback());
      }

      // 실패 버그 등록
      if (this.config.notifyOnFailure) {
        await this.registerDeployFailure();
      }
    }

    this.result.endTime = new Date();
    this.printSummary();

    return this.result;
  }

  /**
   * 스테이지 실행
   */
  private async runStage(name: string, fn: () => Promise<string | void>): Promise<void> {
    if (this.aborted) return;

    const stage: DeployStage = {
      name,
      status: 'running',
      duration: 0,
    };
    this.result.stages.push(stage);

    console.log(`📋 ${name}...`);
    const startTime = Date.now();

    try {
      const output = await fn();
      stage.status = 'success';
      stage.output = output || undefined;
      stage.duration = Date.now() - startTime;
      console.log(`   ✅ 완료 (${Math.round(stage.duration / 1000)}s)\n`);
    } catch (error) {
      stage.status = 'failed';
      stage.error = String(error);
      stage.duration = Date.now() - startTime;
      console.log(`   ❌ 실패: ${stage.error.substring(0, 100)}\n`);
      throw error;
    }
  }

  /**
   * TypeScript 타입체크
   */
  private async runTypeCheck(): Promise<string> {
    try {
      const output = execSync('npx tsc --noEmit', {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output;
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      throw new Error(`TypeScript 에러:\n${err.stdout || err.stderr}`);
    }
  }

  /**
   * 빌드 실행
   */
  private async runBuild(): Promise<string> {
    try {
      const output = execSync(this.config.buildCommand, {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: this.config.environment === 'production' ? 'production' : 'development',
        },
      });
      return output;
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      throw new Error(`빌드 실패:\n${err.stderr || err.stdout}`);
    }
  }

  /**
   * 배포 실행
   */
  private async runDeploy(): Promise<string> {
    // 현재 배포 ID 저장 (롤백용)
    this.result.previousDeploymentId = await this.getCurrentDeploymentId();

    switch (this.config.provider) {
      case 'vercel':
        return this.deployVercel();
      case 'docker':
        return this.deployDocker();
      case 'pm2':
        return this.deployPm2();
      case 'custom':
        return this.deployCustom();
      default:
        throw new Error(`지원하지 않는 provider: ${this.config.provider}`);
    }
  }

  /**
   * Vercel 배포
   */
  private async deployVercel(): Promise<string> {
    const cmd = this.config.environment === 'production'
      ? 'vercel --prod --yes'
      : 'vercel --yes';

    try {
      const output = execSync(cmd, {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      // 배포 URL 추출
      const urlMatch = output.match(/https:\/\/[^\s]+\.vercel\.app/);
      if (urlMatch) {
        this.result.deploymentUrl = urlMatch[0];
        // Health Check URL이 설정되지 않았으면 배포 URL 사용
        if (!this.config.healthCheckUrl) {
          this.config.healthCheckUrl = this.result.deploymentUrl;
        }
      }

      return output;
    } catch (error) {
      const err = error as { stderr?: string };
      throw new Error(`Vercel 배포 실패:\n${err.stderr}`);
    }
  }

  /**
   * Docker 배포
   */
  private async deployDocker(): Promise<string> {
    const commands = [
      'docker build -t app:latest .',
      'docker stop app-container || true',
      'docker rm app-container || true',
      'docker run -d --name app-container -p 3000:3000 app:latest',
    ];

    let output = '';
    for (const cmd of commands) {
      output += execSync(cmd, {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }

    this.result.deploymentUrl = 'http://localhost:3000';
    return output;
  }

  /**
   * PM2 배포
   */
  private async deployPm2(): Promise<string> {
    try {
      const output = execSync('pm2 reload ecosystem.config.js --update-env', {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output;
    } catch {
      // PM2 프로세스가 없으면 새로 시작
      const output = execSync('pm2 start ecosystem.config.js', {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output;
    }
  }

  /**
   * 커스텀 배포
   */
  private async deployCustom(): Promise<string> {
    const output = execSync(this.config.deployCommand, {
      cwd: this.config.projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return output;
  }

  /**
   * Health Check
   */
  private async runHealthCheck(): Promise<string> {
    const url = this.config.healthCheckUrl!;
    const timeout = this.config.healthCheckTimeout;
    const retries = this.config.healthCheckRetries;

    for (let i = 0; i < retries; i++) {
      try {
        const status = await this.checkHealth(url, timeout);
        if (status >= 200 && status < 400) {
          return `Health check passed: ${status}`;
        }
        throw new Error(`Unexpected status: ${status}`);
      } catch (error) {
        console.log(`   ⏳ 재시도 ${i + 1}/${retries}...`);
        await this.sleep(5000); // 5초 대기
      }
    }

    throw new Error(`Health check 실패: ${url}`);
  }

  /**
   * HTTP 요청으로 상태 확인
   */
  private checkHealth(url: string, timeout: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;

      const req = client.get(url, { timeout }, (res) => {
        resolve(res.statusCode || 0);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  /**
   * 현재 배포 ID 조회
   */
  private async getCurrentDeploymentId(): Promise<string | undefined> {
    if (this.config.provider === 'vercel') {
      try {
        const output = execSync('vercel ls --json 2>/dev/null | head -1', {
          cwd: this.config.projectPath,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        const deployments = JSON.parse(output);
        return deployments[0]?.uid;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * 롤백
   */
  private async runRollback(): Promise<string> {
    if (this.config.provider === 'vercel' && this.result.previousDeploymentId) {
      const output = execSync(`vercel rollback ${this.result.previousDeploymentId}`, {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output;
    }

    if (this.config.provider === 'docker') {
      // Docker는 이전 이미지로 롤백
      const output = execSync('docker run -d --name app-container -p 3000:3000 app:previous', {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output;
    }

    throw new Error('롤백 지원 안됨');
  }

  /**
   * Hook 실행
   */
  private async runHooks(hooks: string[]): Promise<string> {
    let output = '';
    for (const hook of hooks) {
      output += execSync(hook, {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }
    return output;
  }

  /**
   * 배포 실패 버그 등록
   */
  private async registerDeployFailure(): Promise<void> {
    const failedStage = this.result.stages.find(s => s.status === 'failed');

    try {
      await bugCreate({
        type: 'bug',
        title: `[DEPLOY] ${this.config.environment} 배포 실패: ${failedStage?.name || '알 수 없는 단계'}`,
        summary: [
          `환경: ${this.config.environment}`,
          `제공자: ${this.config.provider}`,
          `실패 단계: ${failedStage?.name}`,
          '',
          '에러:',
          failedStage?.error || this.result.error || '알 수 없는 에러',
          '',
          '단계 상태:',
          ...this.result.stages.map(s => `- ${s.name}: ${s.status}`),
        ].join('\n'),
        priority: this.config.environment === 'production' ? 'P0' : 'P1',
        metadata: {
          source: 'deploy-pipeline',
          environment: this.config.environment,
          provider: this.config.provider,
          failedStage: failedStage?.name,
          stages: this.result.stages,
        },
      });

      console.log('  📝 배포 실패 버그 등록됨');
    } catch (error) {
      console.error('  ❌ 버그 등록 실패:', error);
    }
  }

  /**
   * 결과 요약 출력
   */
  private printSummary(): void {
    const duration = this.result.endTime.getTime() - this.result.startTime.getTime();

    console.log('────────────────────────────────────────────────────────────────');
    console.log('  📊 배포 결과');
    console.log('────────────────────────────────────────────────────────────────');

    for (const stage of this.result.stages) {
      const icon = stage.status === 'success' ? '✅' : stage.status === 'failed' ? '❌' : '⏭️';
      console.log(`  ${icon} ${stage.name}: ${stage.status} (${Math.round(stage.duration / 1000)}s)`);
    }

    console.log('');
    console.log(`  소요 시간: ${Math.round(duration / 1000)}초`);

    if (this.result.deploymentUrl) {
      console.log(`  배포 URL: ${this.result.deploymentUrl}`);
    }

    console.log('');
    console.log(this.result.success ? '  🎉 배포 성공!' : '  ⚠️  배포 실패');
    console.log('────────────────────────────────────────────────────────────────');
  }

  /**
   * 대기
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 중단
   */
  abort(): void {
    this.aborted = true;
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('사용법: npx ts-node deploy-pipeline.ts [options]');
    console.log('');
    console.log('옵션:');
    console.log('  --env <env>           환경 (development, staging, production)');
    console.log('  --provider <provider> 배포 제공자 (vercel, docker, pm2)');
    console.log('  --project <path>      프로젝트 경로');
    console.log('  --health-check <url>  Health check URL');
    console.log('  --no-rollback         롤백 비활성화');
    process.exit(0);
  }

  const envIndex = args.indexOf('--env');
  const providerIndex = args.indexOf('--provider');
  const projectIndex = args.indexOf('--project');
  const healthIndex = args.indexOf('--health-check');

  const config: Partial<DeployConfig> = {
    environment: envIndex >= 0 ? args[envIndex + 1] as DeployConfig['environment'] : 'development',
    provider: providerIndex >= 0 ? args[providerIndex + 1] as DeployConfig['provider'] : 'vercel',
    projectPath: projectIndex >= 0 ? args[projectIndex + 1] : process.cwd(),
    healthCheckUrl: healthIndex >= 0 ? args[healthIndex + 1] : undefined,
    rollbackEnabled: !args.includes('--no-rollback'),
  };

  const pipeline = new DeployPipeline(config);

  process.on('SIGINT', () => {
    console.log('\n중단 요청...');
    pipeline.abort();
    process.exit(1);
  });

  const result = await pipeline.run();
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

export default DeployPipeline;
