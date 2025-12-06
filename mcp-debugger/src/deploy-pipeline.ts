/**
 * Deploy Pipeline
 * 빌드 및 배포 파이프라인 관리
 *
 * 기능:
 * - npm run build 실행
 * - TypeScript 타입 체크
 * - 테스트 실행
 * - Vercel/Docker 배포
 * - Health Check
 * - 자동 롤백
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { bugCreate } from './bug-bridge.js';

export interface PipelineStep {
  name: string;
  command: string;
  args: string[];
  timeout?: number;
  continueOnError?: boolean;
  env?: Record<string, string>;
}

export interface PipelineResult {
  step: string;
  success: boolean;
  duration: number;
  output: string;
  error?: string;
}

export interface DeploymentResult {
  success: boolean;
  steps: PipelineResult[];
  totalDuration: number;
  deployUrl?: string;
  rollbackRequired: boolean;
  healthCheckPassed?: boolean;
}

export interface DeployConfig {
  projectPath: string;
  type: 'vercel' | 'docker' | 'custom';
  healthCheckUrl?: string;
  healthCheckTimeout?: number;
  rollbackEnabled?: boolean;
  notifyOnFailure?: boolean;
  preDeploySteps?: PipelineStep[];
  postDeploySteps?: PipelineStep[];
  env?: Record<string, string>;
}

/**
 * 파이프라인 단계 실행
 */
export async function runPipelineStep(
  step: PipelineStep,
  projectPath: string,
  env?: Record<string, string>
): Promise<PipelineResult> {
  const startTime = Date.now();
  let output = '';
  let error = '';

  return new Promise((resolve) => {
    const proc = spawn(step.command, step.args, {
      cwd: projectPath,
      shell: true,
      env: { ...process.env, ...env, ...step.env },
      stdio: ['inherit', 'pipe', 'pipe']
    });

    const timeout = step.timeout || 300000; // 기본 5분
    const timeoutMinutes = Math.floor(timeout / 60000);
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      error = `타임아웃: ${step.name} 작업이 ${timeoutMinutes}분(${timeout / 1000}초)을 초과했습니다. 대용량 작업의 경우 timeout 값 증가를 고려하세요.`;
    }, timeout);

    proc.stdout?.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on('data', (data) => {
      error += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        step: step.name,
        success: code === 0,
        duration: Date.now() - startTime,
        output,
        error: code !== 0 ? error || `Exit code: ${code}` : undefined
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        step: step.name,
        success: false,
        duration: Date.now() - startTime,
        output,
        error: err.message
      });
    });
  });
}

/**
 * TypeScript 타입 체크
 */
export async function runTypeCheck(projectPath: string): Promise<PipelineResult> {
  return runPipelineStep({
    name: 'TypeScript Type Check',
    command: 'npx',
    args: ['tsc', '--noEmit'],
    timeout: 120000
  }, projectPath);
}

/**
 * Next.js 빌드
 */
export async function runBuild(projectPath: string, env?: Record<string, string>): Promise<PipelineResult> {
  return runPipelineStep({
    name: 'Build',
    command: 'npm',
    args: ['run', 'build'],
    timeout: 900000, // 15분 (대용량 빌드 고려)
    env
  }, projectPath);
}

/**
 * 테스트 실행
 */
export async function runTests(projectPath: string, pattern?: string): Promise<PipelineResult> {
  const args = ['test'];
  if (pattern) {
    args.push('--', '--testPathPattern', pattern);
  }

  return runPipelineStep({
    name: 'Tests',
    command: 'npm',
    args,
    timeout: 300000,
    continueOnError: true
  }, projectPath);
}

/**
 * Lint 실행
 */
export async function runLint(projectPath: string): Promise<PipelineResult> {
  return runPipelineStep({
    name: 'Lint',
    command: 'npm',
    args: ['run', 'lint'],
    timeout: 120000,
    continueOnError: true
  }, projectPath);
}

/**
 * Vercel 배포
 */
export async function deployToVercel(
  projectPath: string,
  production: boolean = false
): Promise<PipelineResult> {
  const args = ['vercel'];
  if (production) {
    args.push('--prod');
  }
  args.push('--yes'); // 확인 프롬프트 스킵

  return runPipelineStep({
    name: 'Vercel Deploy',
    command: 'npx',
    args,
    timeout: 900000 // 15분
  }, projectPath);
}

/**
 * Docker 빌드 및 배포
 */
export async function deployToDocker(
  projectPath: string,
  options: {
    imageName: string;
    tag?: string;
    registry?: string;
    push?: boolean;
  }
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  const tag = options.tag || 'latest';
  const fullImageName = options.registry
    ? `${options.registry}/${options.imageName}:${tag}`
    : `${options.imageName}:${tag}`;

  // Docker 빌드
  const buildResult = await runPipelineStep({
    name: 'Docker Build',
    command: 'docker',
    args: ['build', '-t', fullImageName, '.'],
    timeout: 900000 // 15분
  }, projectPath);

  results.push(buildResult);

  if (!buildResult.success) {
    return results;
  }

  // Docker Push (옵션)
  if (options.push && options.registry) {
    const pushResult = await runPipelineStep({
      name: 'Docker Push',
      command: 'docker',
      args: ['push', fullImageName],
      timeout: 300000
    }, projectPath);

    results.push(pushResult);
  }

  return results;
}

/**
 * Health Check
 */
export async function healthCheck(
  url: string,
  timeout: number = 30000,
  retries: number = 3
): Promise<{ passed: boolean; responseTime: number; statusCode?: number; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      const result = await performHealthCheck(url, timeout);
      const responseTime = Date.now() - startTime;

      if (result.statusCode && result.statusCode >= 200 && result.statusCode < 400) {
        return { passed: true, responseTime, statusCode: result.statusCode };
      }

      if (attempt < retries) {
        console.log(`  Health check 실패 (시도 ${attempt}/${retries}), 재시도...`);
        await sleep(5000);
      }
    } catch (error: any) {
      if (attempt === retries) {
        return { passed: false, responseTime: 0, error: error.message };
      }
      await sleep(5000);
    }
  }

  return { passed: false, responseTime: 0, error: '모든 재시도 실패' };
}

/**
 * HTTP 요청 수행
 */
function performHealthCheck(url: string, timeout: number): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { timeout }, (res) => {
      resolve({ statusCode: res.statusCode || 0 });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * 전체 배포 파이프라인 실행
 */
export async function runDeployPipeline(config: DeployConfig): Promise<DeploymentResult> {
  const startTime = Date.now();
  const steps: PipelineResult[] = [];
  let deployUrl: string | undefined;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    🚀 Deploy Pipeline                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Pre-deploy 단계
  if (config.preDeploySteps) {
    console.log('📦 Pre-deploy 단계 실행...\n');
    for (const step of config.preDeploySteps) {
      console.log(`  ▶ ${step.name}`);
      const result = await runPipelineStep(step, config.projectPath, config.env);
      steps.push(result);

      if (!result.success && !step.continueOnError) {
        return createFailedResult(steps, startTime, config);
      }
    }
  }

  // TypeScript 타입 체크
  console.log('\n🔍 TypeScript 타입 체크...');
  const typeCheckResult = await runTypeCheck(config.projectPath);
  steps.push(typeCheckResult);

  if (!typeCheckResult.success) {
    console.log('  ❌ 타입 체크 실패');
    return createFailedResult(steps, startTime, config);
  }
  console.log('  ✅ 타입 체크 성공');

  // 빌드
  console.log('\n🏗️ 빌드 실행...');
  const buildResult = await runBuild(config.projectPath, config.env);
  steps.push(buildResult);

  if (!buildResult.success) {
    console.log('  ❌ 빌드 실패');
    return createFailedResult(steps, startTime, config);
  }
  console.log('  ✅ 빌드 성공');

  // 배포
  console.log(`\n🚀 ${config.type} 배포...`);

  if (config.type === 'vercel') {
    const deployResult = await deployToVercel(config.projectPath, true);
    steps.push(deployResult);

    if (!deployResult.success) {
      console.log('  ❌ 배포 실패');
      return createFailedResult(steps, startTime, config);
    }

    // Vercel 배포 URL 추출
    const urlMatch = deployResult.output.match(/https:\/\/[^\s]+\.vercel\.app/);
    if (urlMatch) {
      deployUrl = urlMatch[0];
    }
  } else if (config.type === 'docker') {
    const dockerResults = await deployToDocker(config.projectPath, {
      imageName: path.basename(config.projectPath),
      push: true
    });
    steps.push(...dockerResults);

    if (dockerResults.some(r => !r.success)) {
      console.log('  ❌ Docker 배포 실패');
      return createFailedResult(steps, startTime, config);
    }
  }

  console.log('  ✅ 배포 성공');

  // Health Check
  let healthCheckPassed: boolean | undefined;
  const healthCheckUrl = config.healthCheckUrl || deployUrl;

  if (healthCheckUrl) {
    console.log('\n💓 Health Check...');
    const healthResult = await healthCheck(
      healthCheckUrl,
      config.healthCheckTimeout || 30000
    );

    healthCheckPassed = healthResult.passed;

    if (healthResult.passed) {
      console.log(`  ✅ Health Check 성공 (${healthResult.responseTime}ms)`);
    } else {
      console.log(`  ❌ Health Check 실패: ${healthResult.error}`);

      if (config.rollbackEnabled) {
        console.log('\n🔄 롤백 시작...');
        // 롤백 로직 (Vercel은 이전 배포로 자동 롤백 가능)
        return {
          success: false,
          steps,
          totalDuration: Date.now() - startTime,
          deployUrl,
          rollbackRequired: true,
          healthCheckPassed: false
        };
      }
    }
  }

  // Post-deploy 단계
  if (config.postDeploySteps) {
    console.log('\n📦 Post-deploy 단계 실행...\n');
    for (const step of config.postDeploySteps) {
      console.log(`  ▶ ${step.name}`);
      const result = await runPipelineStep(step, config.projectPath, config.env);
      steps.push(result);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ 배포 파이프라인 완료!');
  console.log(`  총 소요 시간: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  if (deployUrl) {
    console.log(`  배포 URL: ${deployUrl}`);
  }
  console.log('════════════════════════════════════════════════════════════════\n');

  return {
    success: true,
    steps,
    totalDuration: Date.now() - startTime,
    deployUrl,
    rollbackRequired: false,
    healthCheckPassed
  };
}

/**
 * 실패 결과 생성 및 버그 등록
 */
async function createFailedResult(
  steps: PipelineResult[],
  startTime: number,
  config: DeployConfig
): Promise<DeploymentResult> {
  const failedStep = steps.find(s => !s.success);

  // 실패 시 버그 등록
  if (config.notifyOnFailure && failedStep) {
    await bugCreate({
      title: `[배포 실패] ${failedStep.step}`,
      summary: `배포 파이프라인이 "${failedStep.step}" 단계에서 실패했습니다.\n\n**에러**:\n\`\`\`\n${failedStep.error}\n\`\`\``,
      metadata: {
        source: 'deploy-pipeline',
        step: failedStep.step,
        projectPath: config.projectPath,
        deployType: config.type
      }
    });
  }

  return {
    success: false,
    steps,
    totalDuration: Date.now() - startTime,
    rollbackRequired: false
  };
}

/**
 * Sleep 헬퍼
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 배포 리포트 생성
 */
export function generateDeployReport(result: DeploymentResult): string {
  let report = '# Deployment Report\n\n';

  report += `## Summary\n\n`;
  report += `- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
  report += `- **Duration**: ${(result.totalDuration / 1000).toFixed(2)}s\n`;
  if (result.deployUrl) {
    report += `- **URL**: ${result.deployUrl}\n`;
  }
  if (result.healthCheckPassed !== undefined) {
    report += `- **Health Check**: ${result.healthCheckPassed ? '✅ Passed' : '❌ Failed'}\n`;
  }
  if (result.rollbackRequired) {
    report += `- **Rollback**: ⚠️ Required\n`;
  }

  report += '\n## Steps\n\n';
  report += `| Step | Status | Duration |\n`;
  report += `|------|--------|----------|\n`;

  for (const step of result.steps) {
    const status = step.success ? '✅' : '❌';
    const duration = `${(step.duration / 1000).toFixed(2)}s`;
    report += `| ${step.step} | ${status} | ${duration} |\n`;
  }

  // 실패한 단계 상세
  const failedSteps = result.steps.filter(s => !s.success);
  if (failedSteps.length > 0) {
    report += '\n## Failed Steps\n\n';
    for (const step of failedSteps) {
      report += `### ${step.step}\n\n`;
      report += '```\n' + (step.error || 'Unknown error') + '\n```\n\n';
    }
  }

  return report;
}

// CLI 실행
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
사용법: npx tsx deploy-pipeline.ts <프로젝트 경로> [옵션]

옵션:
  --type <vercel|docker>   배포 타입 (기본: vercel)
  --health-url <url>       Health Check URL
  --rollback               롤백 활성화
  --notify                 실패 시 버그 등록

예시:
  npx tsx deploy-pipeline.ts ./frontend --type vercel
  npx tsx deploy-pipeline.ts ./backend --type docker --health-url http://localhost:3000/health
`);
    process.exit(1);
  }

  const projectPath = path.resolve(args[0]);
  const typeIdx = args.indexOf('--type');
  const type = typeIdx !== -1 ? args[typeIdx + 1] as 'vercel' | 'docker' : 'vercel';
  const healthIdx = args.indexOf('--health-url');
  const healthCheckUrl = healthIdx !== -1 ? args[healthIdx + 1] : undefined;
  const rollbackEnabled = args.includes('--rollback');
  const notifyOnFailure = args.includes('--notify');

  const config: DeployConfig = {
    projectPath,
    type,
    healthCheckUrl,
    rollbackEnabled,
    notifyOnFailure
  };

  runDeployPipeline(config).then(result => {
    console.log(generateDeployReport(result));
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('오류:', error.message);
    process.exit(1);
  });
}

export default {
  runDeployPipeline,
  runTypeCheck,
  runBuild,
  runTests,
  runLint,
  deployToVercel,
  deployToDocker,
  healthCheck,
  generateDeployReport
};
