#!/usr/bin/env node
/**
 * Auto Tester CLI
 * 프로젝트 관리 및 테스트 실행 CLI
 *
 * 사용법:
 *   npm run cli -- 등록 <프로젝트명> <경로> [테스트명령어]
 *   npm run cli -- 목록
 *   npm run cli -- 테스트 [프로젝트명]
 *   npm run cli -- 통계 [프로젝트명]
 *   npm run cli -- 기록 [프로젝트명] [개수]
 *   npm run cli -- 실패 [프로젝트명] [개수]
 */

import {
  addProject,
  getProjects,
  getProjectByName,
  removeProject,
  getProjectStats,
  getRecentTestRuns,
  getFailedTests,
  getTestCases
} from './db.js';
import { runAllProjectTests, runTests } from './runner.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || '도움말';

  switch (command) {
    case '등록':
    case 'add':
    case 'register': {
      const name = args[1];
      const projectPath = args[2];
      const testCommand = args[3] || 'npm test';

      if (!name || !projectPath) {
        console.error('❌ 사용법: npm run cli -- 등록 <프로젝트명> <경로> [테스트명령어]');
        process.exit(1);
      }

      const project = addProject(name, projectPath, testCommand);
      console.log(`✅ 프로젝트 등록 완료: ${project.name}`);
      console.log(`   경로: ${project.path}`);
      console.log(`   테스트: ${project.test_command}\n`);
      break;
    }

    case '목록':
    case 'list':
    case 'ls': {
      const projects = getProjects(true);

      if (projects.length === 0) {
        console.log('\n📋 등록된 프로젝트가 없습니다.\n');
      } else {
        console.log(`\n📋 등록된 프로젝트 (${projects.length}개)\n`);

        for (const project of projects) {
          const stats = getProjectStats(project.id);
          const statusIcon = stats.recent_status === 'passed' ? '✅' : stats.recent_status === 'failed' ? '❌' : '⚪';

          console.log(`${statusIcon} ${project.name}`);
          console.log(`   경로: ${project.path}`);
          console.log(`   테스트: ${project.test_command}`);
          console.log(`   통계: ${stats.passed_runs}/${stats.total_runs} 성공 (${stats.success_rate}%)`);
          if (stats.avg_duration_ms > 0) {
            console.log(`   평균 시간: ${(stats.avg_duration_ms / 1000).toFixed(2)}초`);
          }
          console.log('');
        }
      }
      break;
    }

    case '삭제':
    case 'remove':
    case 'delete': {
      const name = args[1];

      if (!name) {
        console.error('❌ 사용법: npm run cli -- 삭제 <프로젝트명>');
        process.exit(1);
      }

      if (removeProject(name)) {
        console.log(`✅ 프로젝트 삭제: ${name}\n`);
      } else {
        console.error(`❌ 프로젝트를 찾을 수 없습니다: ${name}\n`);
        process.exit(1);
      }
      break;
    }

    case '테스트':
    case 'test':
    case 'run': {
      const projectName = args[1];
      await runAllProjectTests(projectName);
      break;
    }

    case '통계':
    case 'stats': {
      const projectName = args[1];

      if (projectName) {
        const project = getProjectByName(projectName);
        if (!project) {
          console.error(`❌ 프로젝트를 찾을 수 없습니다: ${projectName}\n`);
          process.exit(1);
        }

        const stats = getProjectStats(project.id);

        console.log(`\n📊 ${project.name} 통계`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📌 총 테스트 실행: ${stats.total_runs}회`);
        console.log(`   ✅ 성공: ${stats.passed_runs}회`);
        console.log(`   ❌ 실패: ${stats.failed_runs}회`);
        console.log(`   📈 성공률: ${stats.success_rate}%`);
        if (stats.avg_duration_ms > 0) {
          console.log(`   ⏱️  평균 시간: ${(stats.avg_duration_ms / 1000).toFixed(2)}초`);
        }
        console.log(`   🔄 최근 상태: ${stats.recent_status === 'passed' ? '✅ 성공' : stats.recent_status === 'failed' ? '❌ 실패' : '⚪ 알 수 없음'}`);
        console.log('');
      } else {
        const projects = getProjects(true);

        console.log(`\n📊 전체 프로젝트 통계\n`);

        for (const project of projects) {
          const stats = getProjectStats(project.id);
          console.log(`${project.name}: ${stats.passed_runs}/${stats.total_runs} 성공 (${stats.success_rate}%)`);
        }
        console.log('');
      }
      break;
    }

    case '기록':
    case 'history':
    case 'log': {
      const projectName = args[1];
      const limit = parseInt(args[2]) || 10;

      let projectId: number | undefined;
      if (projectName) {
        const project = getProjectByName(projectName);
        if (!project) {
          console.error(`❌ 프로젝트를 찾을 수 없습니다: ${projectName}\n`);
          process.exit(1);
        }
        projectId = project.id;
      }

      const runs = getRecentTestRuns(projectId, limit);

      console.log(`\n📜 테스트 실행 기록 (최근 ${limit}건)\n`);

      if (runs.length === 0) {
        console.log('기록이 없습니다.\n');
      } else {
        for (const run of runs) {
          const icon = run.status === 'passed' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'error' ? '💥' : '⏳';
          const time = new Date(run.started_at).toLocaleString('ko-KR');

          console.log(`${icon} #${run.id} [${run.trigger}]`);
          console.log(`   시간: ${time}`);
          if (run.total_tests) {
            console.log(`   결과: ${run.passed_tests}/${run.total_tests} 성공`);
          }
          if (run.duration_ms) {
            console.log(`   시간: ${(run.duration_ms / 1000).toFixed(2)}초`);
          }
          if (run.triggered_by) {
            console.log(`   트리거: ${run.triggered_by}`);
          }
          if (run.error_message) {
            console.log(`   에러: ${run.error_message.substring(0, 100)}...`);
          }
          console.log('');
        }
      }
      break;
    }

    case '실패':
    case 'failed':
    case 'failures': {
      const projectName = args[1];
      const limit = parseInt(args[2]) || 10;

      let projectId: number | undefined;
      if (projectName) {
        const project = getProjectByName(projectName);
        if (!project) {
          console.error(`❌ 프로젝트를 찾을 수 없습니다: ${projectName}\n`);
          process.exit(1);
        }
        projectId = project.id;
      }

      const failures = getFailedTests(projectId, limit);

      console.log(`\n❌ 실패한 테스트 (최근 ${limit}건)\n`);

      if (failures.length === 0) {
        console.log('✅ 실패한 테스트가 없습니다!\n');
      } else {
        for (const test of failures) {
          const time = new Date(test.run_started_at).toLocaleTimeString('ko-KR');

          console.log(`❌ ${test.test_name}`);
          if (test.suite_name) {
            console.log(`   Suite: ${test.suite_name}`);
          }
          console.log(`   시간: ${time}`);
          if (test.error_message) {
            console.log(`   에러: ${test.error_message.substring(0, 100)}...`);
          }
          console.log('');
        }
      }
      break;
    }

    case '상세':
    case 'detail':
    case 'show': {
      const runId = parseInt(args[1]);

      if (!runId) {
        console.error('❌ 사용법: npm run cli -- 상세 <실행ID>');
        process.exit(1);
      }

      const { getTestRun } = await import('./db.js');
      const run = getTestRun(runId);

      if (!run) {
        console.error(`❌ 테스트 실행 #${runId}를 찾을 수 없습니다.\n`);
        process.exit(1);
      }

      const icon = run.status === 'passed' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'error' ? '💥' : '⏳';

      console.log(`\n${icon} 테스트 실행 #${run.id}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`상태: ${run.status}`);
      console.log(`트리거: ${run.trigger}`);
      if (run.triggered_by) {
        console.log(`파일: ${run.triggered_by}`);
      }
      console.log(`시작: ${new Date(run.started_at).toLocaleString('ko-KR')}`);
      if (run.completed_at) {
        console.log(`완료: ${new Date(run.completed_at).toLocaleString('ko-KR')}`);
      }
      if (run.duration_ms) {
        console.log(`시간: ${(run.duration_ms / 1000).toFixed(2)}초`);
      }
      if (run.total_tests) {
        console.log(`\n테스트 결과:`);
        console.log(`  총: ${run.total_tests}개`);
        console.log(`  ✅ 성공: ${run.passed_tests}개`);
        console.log(`  ❌ 실패: ${run.failed_tests}개`);
        console.log(`  ⏭️  건너뜀: ${run.skipped_tests}개`);
      }

      // 개별 테스트 케이스 표시
      const cases = getTestCases(run.id);
      if (cases.length > 0) {
        console.log(`\n테스트 케이스 (${cases.length}개):`);
        for (const testCase of cases) {
          const caseIcon = testCase.status === 'passed' ? '✅' : testCase.status === 'failed' ? '❌' : '⏭️';
          console.log(`  ${caseIcon} ${testCase.test_name}`);
          if (testCase.error_message) {
            console.log(`     에러: ${testCase.error_message.substring(0, 80)}...`);
          }
        }
      }

      if (run.error_message) {
        console.log(`\n에러 메시지:`);
        console.log(run.error_message);
      }

      console.log('');
      break;
    }

    case '인터랙티브':
    case 'interactive':
    case 'shell':
    case 'i': {
      // 인터랙티브 CLI 모드
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log(`
╔══════════════════════════════════════════════════════════════╗
║              🧪 MCP Auto Tester Interactive CLI              ║
╚══════════════════════════════════════════════════════════════╝

명령어: 등록 | 목록 | 테스트 | 통계 | 기록 | 실패 | 상세 | 도움말 | 종료
`);

      const prompt = () => {
        rl.question('tester> ', async (input) => {
          const trimmed = input.trim();
          if (!trimmed) {
            prompt();
            return;
          }

          if (['종료', 'exit', 'quit', 'q'].includes(trimmed.toLowerCase())) {
            console.log('👋 종료합니다.');
            rl.close();
            process.exit(0);
          }

          // 명령어 실행
          const newArgs = trimmed.split(/\s+/);
          process.argv = ['node', 'cli.ts', ...newArgs];

          try {
            await main();
          } catch (e) {
            // 에러 무시
          }

          console.log('');
          prompt();
        });
      };

      prompt();

      // 프로세스 유지
      await new Promise(() => {});
      break;
    }

    case '도움말':
    case 'help':
    case '-h':
    case '--help': {
      console.log(`
🧪 Auto Tester CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

인터랙티브:
  인터랙티브, i                                 인터랙티브 CLI 모드 (지속 실행)

프로젝트 관리:
  등록, add <프로젝트명> <경로> [테스트명령어]   프로젝트 등록
  목록, list                                    등록된 프로젝트 목록
  삭제, remove <프로젝트명>                     프로젝트 삭제

테스트 실행:
  테스트, test [프로젝트명]                     테스트 실행
  npm run watch                                 파일 변경 감시 및 자동 테스트

결과 조회:
  통계, stats [프로젝트명]                      테스트 통계
  기록, history [프로젝트명] [개수]             테스트 실행 기록
  실패, failed [프로젝트명] [개수]              실패한 테스트 목록
  상세, show <실행ID>                           테스트 실행 상세

예시:
  npm run cli -- 인터랙티브          # 인터랙티브 모드
  npm run cli -- 등록 my-app ./my-app "npm test"
  npm run cli -- 테스트 my-app
  npm run watch
  npm run cli -- 통계
  npm run cli -- 기록 my-app 20
`);
      break;
    }

    default: {
      console.error(`❌ 알 수 없는 명령어: ${command}`);
      console.log('도움말: npm run cli -- 도움말');
      process.exit(1);
    }
  }
}

main().catch(console.error);
