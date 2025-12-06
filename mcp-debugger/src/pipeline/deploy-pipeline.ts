/**
 * Deploy Pipeline
 * 빌드 및 배포 자동화
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

export interface BuildResult {
  success: boolean;
  duration: number;
  output: string;
  errors: string[];
  warnings: string[];
  artifacts: string[];
}

export interface DeployResult {
  success: boolean;
  duration: number;
  url?: string;
  version?: string;
  commit?: string;
  environment: string;
  output: string;
}

export interface HealthCheckResult {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}

export interface PipelineConfig {
  projectPath: string;
  buildCommand: string;
  deployCommand?: string;
  healthCheckUrl?: string;
  rollbackCommand?: string;
  environment: 'development' | 'staging' | 'production';
  timeout: number; // ms
  retries: number;
}

export interface PipelineResult {
  build: BuildResult;
  deploy?: DeployResult;
  healthCheck?: HealthCheckResult;
  rolledBack: boolean;
  overallSuccess: boolean;
}

/**
 * 쉘 명령어 실행
 */
function runCommand(
  command: string,
  cwd: string,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const [cmd, ...args] = command.split(' ');
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeout);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`Command timed out after ${timeout}ms`));
        return;
      }

      resolve({ stdout, stderr, exitCode: code || 0 });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * 빌드 실행
 */
export async function runBuild(config: PipelineConfig): Promise<BuildResult> {
  const startTime = Date.now();
  const result: BuildResult = {
    success: false,
    duration: 0,
    output: '',
    errors: [],
    warnings: [],
    artifacts: []
  };

  try {
    console.log(`🔨 Building project: ${config.projectPath}`);
    console.log(`   Command: ${config.buildCommand}`);

    const { stdout, stderr, exitCode } = await runCommand(
      config.buildCommand,
      config.projectPath,
      config.timeout
    );

    result.output = stdout + stderr;
    result.success = exitCode === 0;
    result.duration = Date.now() - startTime;

    // 에러/경고 추출
    const lines = result.output.split('\n');
    for (const line of lines) {
      if (line.match(/error/i) && !line.match(/0 errors?/i)) {
        result.errors.push(line.trim());
      }
      if (line.match(/warning/i) && !line.match(/0 warnings?/i)) {
        result.warnings.push(line.trim());
      }
    }

    // 빌드 아티팩트 찾기
    const buildDirs = ['.next', 'dist', 'build', 'out'];
    for (const dir of buildDirs) {
      const fullPath = path.join(config.projectPath, dir);
      if (fs.existsSync(fullPath)) {
        result.artifacts.push(fullPath);
      }
    }

    if (result.success) {
      console.log(`✅ Build succeeded in ${(result.duration / 1000).toFixed(2)}s`);
    } else {
      console.log(`❌ Build failed with exit code ${exitCode}`);
    }

  } catch (error: any) {
    result.output = error.message;
    result.errors.push(error.message);
    result.duration = Date.now() - startTime;
    console.log(`❌ Build error: ${error.message}`);
  }

  return result;
}

/**
 * 배포 실행
 */
export async function runDeploy(config: PipelineConfig): Promise<DeployResult> {
  const startTime = Date.now();
  const result: DeployResult = {
    success: false,
    duration: 0,
    environment: config.environment,
    output: ''
  };

  if (!config.deployCommand) {
    result.output = 'No deploy command configured';
    result.success = true;
    return result;
  }

  try {
    console.log(`🚀 Deploying to ${config.environment}...`);
    console.log(`   Command: ${config.deployCommand}`);

    const { stdout, stderr, exitCode } = await runCommand(
      config.deployCommand,
      config.projectPath,
      config.timeout
    );

    result.output = stdout + stderr;
    result.success = exitCode === 0;
    result.duration = Date.now() - startTime;

    // URL 추출 (Vercel, Netlify 등)
    const urlMatch = result.output.match(/https?:\/\/[^\s]+(?:\.vercel\.app|\.netlify\.app|\.herokuapp\.com)/);
    if (urlMatch) {
      result.url = urlMatch[0];
    }

    // 버전/커밋 추출
    const versionMatch = result.output.match(/version[:\s]+([^\s]+)/i);
    if (versionMatch) {
      result.version = versionMatch[1];
    }

    const commitMatch = result.output.match(/commit[:\s]+([a-f0-9]{7,40})/i);
    if (commitMatch) {
      result.commit = commitMatch[1];
    }

    if (result.success) {
      console.log(`✅ Deploy succeeded in ${(result.duration / 1000).toFixed(2)}s`);
      if (result.url) {
        console.log(`   URL: ${result.url}`);
      }
    } else {
      console.log(`❌ Deploy failed with exit code ${exitCode}`);
    }

  } catch (error: any) {
    result.output = error.message;
    result.duration = Date.now() - startTime;
    console.log(`❌ Deploy error: ${error.message}`);
  }

  return result;
}

/**
 * 헬스체크 실행
 */
export async function runHealthCheck(
  url: string,
  retries: number = 3,
  delayMs: number = 5000
): Promise<HealthCheckResult> {
  console.log(`🏥 Health check: ${url}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'BTS-HealthCheck/1.0' }
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        console.log(`✅ Health check passed (${responseTime}ms)`);
        return {
          success: true,
          statusCode: response.status,
          responseTime
        };
      }

      console.log(`⚠️ Health check attempt ${attempt}/${retries}: ${response.status}`);

    } catch (error: any) {
      console.log(`⚠️ Health check attempt ${attempt}/${retries}: ${error.message}`);
    }

    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`❌ Health check failed after ${retries} attempts`);
  return {
    success: false,
    error: `Health check failed after ${retries} attempts`
  };
}

/**
 * 롤백 실행
 */
export async function runRollback(config: PipelineConfig): Promise<boolean> {
  if (!config.rollbackCommand) {
    console.log('⚠️ No rollback command configured');
    return false;
  }

  try {
    console.log(`⏪ Rolling back...`);
    console.log(`   Command: ${config.rollbackCommand}`);

    const { exitCode } = await runCommand(
      config.rollbackCommand,
      config.projectPath,
      config.timeout
    );

    if (exitCode === 0) {
      console.log('✅ Rollback succeeded');
      return true;
    } else {
      console.log(`❌ Rollback failed with exit code ${exitCode}`);
      return false;
    }

  } catch (error: any) {
    console.log(`❌ Rollback error: ${error.message}`);
    return false;
  }
}

/**
 * 전체 파이프라인 실행
 */
export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const result: PipelineResult = {
    build: { success: false, duration: 0, output: '', errors: [], warnings: [], artifacts: [] },
    rolledBack: false,
    overallSuccess: false
  };

  // 1. 빌드
  result.build = await runBuild(config);

  if (!result.build.success) {
    // 빌드 실패 시 버그 등록
    await registerPipelineFailure('build', result.build, config);
    return result;
  }

  // 2. 배포 (설정된 경우)
  if (config.deployCommand) {
    result.deploy = await runDeploy(config);

    if (!result.deploy.success) {
      await registerPipelineFailure('deploy', result.deploy, config);
      return result;
    }
  }

  // 3. 헬스체크 (설정된 경우)
  if (config.healthCheckUrl) {
    result.healthCheck = await runHealthCheck(config.healthCheckUrl, config.retries);

    if (!result.healthCheck.success) {
      // 헬스체크 실패 시 롤백
      console.log('🔄 Health check failed, initiating rollback...');
      result.rolledBack = await runRollback(config);

      await registerPipelineFailure('health_check', result.healthCheck, config);
      return result;
    }
  }

  result.overallSuccess = true;
  console.log('\n🎉 Pipeline completed successfully!');

  return result;
}

/**
 * 파이프라인 실패 시 버그 등록
 */
async function registerPipelineFailure(
  stage: 'build' | 'deploy' | 'health_check',
  result: BuildResult | DeployResult | HealthCheckResult,
  config: PipelineConfig
): Promise<void> {
  try {
    const stageNames = {
      build: '빌드',
      deploy: '배포',
      health_check: '헬스체크'
    };

    let summary = '';
    if ('output' in result) {
      summary = result.output.substring(0, 1000);
    } else if ('error' in result && result.error) {
      summary = result.error;
    }

    await bugCreate({
      title: `[pipeline_failure] ${stageNames[stage]} 실패 (${config.environment})`,
      summary: `파이프라인 ${stageNames[stage]} 단계 실패\n\n${summary}`,
      priority: config.environment === 'production' ? 'P0' : 'P1',
      type: 'bug',
      metadata: {
        pipeline_stage: stage,
        environment: config.environment,
        project_path: config.projectPath,
        result,
        source: 'deploy-pipeline'
      }
    });

    console.log(`🐛 Bug registered for ${stage} failure`);

  } catch (error) {
    console.error('Failed to register pipeline failure bug:', error);
  }
}

/**
 * 파이프라인 리포트 생성
 */
export function generatePipelineReport(result: PipelineResult, config: PipelineConfig): string {
  const statusEmoji = result.overallSuccess ? '✅' : '❌';

  let report = `# Pipeline Report ${statusEmoji}

**Environment**: ${config.environment}
**Project**: ${config.projectPath}
**Timestamp**: ${new Date().toISOString()}

## Build ${result.build.success ? '✅' : '❌'}

- **Duration**: ${(result.build.duration / 1000).toFixed(2)}s
- **Errors**: ${result.build.errors.length}
- **Warnings**: ${result.build.warnings.length}
- **Artifacts**: ${result.build.artifacts.join(', ') || 'None'}

`;

  if (result.build.errors.length > 0) {
    report += `### Build Errors\n\`\`\`\n${result.build.errors.slice(0, 10).join('\n')}\n\`\`\`\n\n`;
  }

  if (result.deploy) {
    report += `## Deploy ${result.deploy.success ? '✅' : '❌'}

- **Duration**: ${(result.deploy.duration / 1000).toFixed(2)}s
- **URL**: ${result.deploy.url || 'N/A'}
- **Version**: ${result.deploy.version || 'N/A'}
- **Commit**: ${result.deploy.commit || 'N/A'}

`;
  }

  if (result.healthCheck) {
    report += `## Health Check ${result.healthCheck.success ? '✅' : '❌'}

- **Status Code**: ${result.healthCheck.statusCode || 'N/A'}
- **Response Time**: ${result.healthCheck.responseTime ? `${result.healthCheck.responseTime}ms` : 'N/A'}
${result.healthCheck.error ? `- **Error**: ${result.healthCheck.error}` : ''}

`;
  }

  if (result.rolledBack) {
    report += `## ⏪ Rollback Executed

A rollback was performed due to health check failure.

`;
  }

  report += `## Summary

| Stage | Status |
|-------|--------|
| Build | ${result.build.success ? '✅' : '❌'} |
${result.deploy ? `| Deploy | ${result.deploy.success ? '✅' : '❌'} |` : ''}
${result.healthCheck ? `| Health Check | ${result.healthCheck.success ? '✅' : '❌'} |` : ''}
| **Overall** | **${result.overallSuccess ? '✅ Success' : '❌ Failed'}** |
`;

  return report;
}

export default {
  runBuild,
  runDeploy,
  runHealthCheck,
  runRollback,
  runPipeline,
  generatePipelineReport
};
