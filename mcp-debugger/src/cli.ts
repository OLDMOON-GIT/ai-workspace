#!/usr/bin/env node
/**
 * Error Worker CLI
 * 에러 큐에서 버그를 가져와 처리하는 CLI 워커
 *
 * 사용법:
 *   npm run worker -- 에러탐지해          # 에러 하나 가져오기
 *   npm run worker -- 목록                # 대기 중인 에러 목록
 *   npm run worker -- 통계                # 에러 통계
 *   npm run worker -- 해결 <id> "설명"    # 에러 해결 완료 기록
 *   npm run worker -- 무시 <id>           # 에러 무시
 *   npm run worker -- 기록                # 처리 기록
 */

import crypto from 'crypto';
import os from 'os';
import {
  claimError,
  getPendingErrors,
  getErrorById,
  updateErrorStatus,
  recordResolution,
  registerWorker,
  updateWorkerStatus,
  incrementWorkerStats,
  getActiveWorkers,
  getErrorStats,
  getResolutionHistory,
  ErrorItem
} from './db.js';

// 워커 ID 생성 (머신별 고유)
function getWorkerId(): string {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  return crypto.createHash('md5').update(`${hostname}-${username}`).digest('hex').substring(0, 8);
}

// 현재 시간
function now(): string {
  return new Date().toISOString();
}

// 에러 출력 포맷
function formatError(error: ErrorItem): string {
  const severityIcon = {
    critical: '🔴',
    error: '🟠',
    warning: '🟡'
  }[error.severity] || '⚪';

  let output = `
${severityIcon} 에러 #${error.id} [${error.error_type}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 메시지: ${error.error_message}
`;

  if (error.file_path) {
    output += `📁 파일: ${error.file_path}`;
    if (error.line_number) {
      output += `:${error.line_number}`;
    }
    output += '\n';
  }

  output += `📡 소스: ${error.source}
⏰ 발생: ${error.created_at}
`;

  if (error.stack_trace) {
    output += `
📚 스택 트레이스:
${error.stack_trace.split('\n').slice(0, 10).join('\n')}
`;
  }

  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return output;
}

// 명령어 처리
async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || '에러탐지해';

  const workerId = getWorkerId();
  const workerName = `worker-${workerId}`;

  // 워커 등록
  registerWorker(workerId, workerName);

  switch (command) {
    case '에러탐지해':
    case 'fetch':
    case 'claim':
    case 'get': {
      console.log(`\n🤖 워커 ${workerName} 에러 탐지 중...`);

      const error = claimError(workerId);

      if (!error) {
        console.log('✅ 대기 중인 에러가 없습니다!');
        updateWorkerStatus(workerId, 'idle');
        return;
      }

      updateWorkerStatus(workerId, 'processing', error.id);
      console.log(formatError(error));

      console.log(`
💡 처리 후 다음 명령어 사용:
   npm run worker -- 해결 ${error.id} "수정 내용 설명"
   npm run worker -- 무시 ${error.id}
`);
      break;
    }

    case '목록':
    case 'list':
    case 'ls': {
      const limit = parseInt(args[1]) || 10;
      const errors = getPendingErrors(limit);

      console.log(`\n📋 대기 중인 에러 (${errors.length}건)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      if (errors.length === 0) {
        console.log('✅ 처리할 에러가 없습니다!');
      } else {
        for (const error of errors) {
          const severityIcon = { critical: '🔴', error: '🟠', warning: '🟡' }[error.severity] || '⚪';
          console.log(`${severityIcon} #${error.id} [${error.error_type}] ${error.error_message.substring(0, 60)}...`);
          if (error.file_path) {
            console.log(`   📁 ${error.file_path}${error.line_number ? ':' + error.line_number : ''}`);
          }
          console.log('');
        }
      }
      break;
    }

    case '상세':
    case 'detail':
    case 'show': {
      const errorId = parseInt(args[1]);
      if (!errorId) {
        console.error('❌ 에러 ID를 지정해주세요: npm run worker -- 상세 <id>');
        process.exit(1);
      }

      const error = getErrorById(errorId);
      if (!error) {
        console.error(`❌ 에러 #${errorId}를 찾을 수 없습니다.`);
        process.exit(1);
      }

      console.log(formatError(error));
      break;
    }

    case '해결':
    case 'resolve':
    case 'done': {
      const errorId = parseInt(args[1]);
      const description = args.slice(2).join(' ') || '해결됨';

      if (!errorId) {
        console.error('❌ 에러 ID를 지정해주세요: npm run worker -- 해결 <id> "설명"');
        process.exit(1);
      }

      const error = getErrorById(errorId);
      if (!error) {
        console.error(`❌ 에러 #${errorId}를 찾을 수 없습니다.`);
        process.exit(1);
      }

      const resolution = recordResolution({
        error_id: errorId,
        worker_id: workerId,
        action: 'resolved',
        description: description,
        resolved: true,
        started_at: error.claimed_at || now()
      });

      incrementWorkerStats(workerId, true);
      updateWorkerStatus(workerId, 'idle');

      console.log(`✅ 에러 #${errorId} 해결 완료!`);
      console.log(`   📝 ${description}`);
      if (resolution?.duration_seconds) {
        console.log(`   ⏱️  처리 시간: ${resolution.duration_seconds}초`);
      }
      break;
    }

    case '무시':
    case 'ignore':
    case 'skip': {
      const errorId = parseInt(args[1]);

      if (!errorId) {
        console.error('❌ 에러 ID를 지정해주세요: npm run worker -- 무시 <id>');
        process.exit(1);
      }

      const error = getErrorById(errorId);
      if (!error) {
        console.error(`❌ 에러 #${errorId}를 찾을 수 없습니다.`);
        process.exit(1);
      }

      recordResolution({
        error_id: errorId,
        worker_id: workerId,
        action: 'ignored',
        description: '무시됨',
        resolved: false,
        started_at: error.claimed_at || now()
      });

      updateErrorStatus(errorId, 'ignored');
      incrementWorkerStats(workerId, false);
      updateWorkerStatus(workerId, 'idle');

      console.log(`⏭️  에러 #${errorId} 무시됨`);
      break;
    }

    case '통계':
    case 'stats': {
      const stats = getErrorStats();

      console.log(`
📊 에러 큐 통계
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 전체 에러: ${stats.total}건
   ⏳ 대기 중: ${stats.pending}건
   ⚙️  처리 중: ${stats.processing}건
   ✅ 해결됨: ${stats.resolved}건
   ⏭️  무시됨: ${stats.ignored}건
`);

      if (Object.keys(stats.by_severity).length > 0) {
        console.log('📈 심각도별 (대기 중):');
        for (const [severity, count] of Object.entries(stats.by_severity)) {
          const icon = { critical: '🔴', error: '🟠', warning: '🟡' }[severity] || '⚪';
          console.log(`   ${icon} ${severity}: ${count}건`);
        }
      }

      if (Object.keys(stats.by_type).length > 0) {
        console.log('\n📋 타입별 (대기 중, 상위 10개):');
        for (const [type, count] of Object.entries(stats.by_type)) {
          console.log(`   - ${type}: ${count}건`);
        }
      }

      // 활성 워커 표시
      const workers = getActiveWorkers();
      if (workers.length > 0) {
        console.log('\n👥 활성 워커:');
        for (const worker of workers) {
          const statusIcon = worker.status === 'processing' ? '⚙️' : '😴';
          console.log(`   ${statusIcon} ${worker.name}: ${worker.errors_resolved}/${worker.errors_processed} 해결`);
        }
      }

      break;
    }

    case '기록':
    case 'history':
    case 'log': {
      const limit = parseInt(args[1]) || 10;
      const history = getResolutionHistory(limit);

      console.log(`\n📜 처리 기록 (최근 ${limit}건)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      if (history.length === 0) {
        console.log('처리 기록이 없습니다.');
      } else {
        for (const record of history) {
          const icon = record.resolved ? '✅' : '⏭️';
          console.log(`${icon} #${record.error_id} [${record.error_type}]`);
          console.log(`   ${record.error_message.substring(0, 50)}...`);
          console.log(`   👤 ${record.worker_id} | ⏱️ ${record.duration_seconds || 0}초`);
          if (record.description) {
            console.log(`   📝 ${record.description}`);
          }
          console.log('');
        }
      }
      break;
    }

    case '리포트':
    case 'report': {
      const stats = getErrorStats();
      const history = getResolutionHistory(20);
      const workers = getActiveWorkers();

      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    📊 디버깅 리포트                          ║
║                    ${new Date().toLocaleString('ko-KR')}                        ║
╚══════════════════════════════════════════════════════════════╝

📌 에러 현황
   전체: ${stats.total}건
   대기 중: ${stats.pending}건 (🔴 ${stats.by_severity['critical'] || 0} / 🟠 ${stats.by_severity['error'] || 0} / 🟡 ${stats.by_severity['warning'] || 0})
   해결됨: ${stats.resolved}건
   무시됨: ${stats.ignored}건

👥 워커 현황 (${workers.length}명 활성)
`);

      for (const worker of workers) {
        const rate = worker.errors_processed > 0
          ? Math.round((worker.errors_resolved / worker.errors_processed) * 100)
          : 0;
        console.log(`   ${worker.name}: ${worker.errors_resolved}/${worker.errors_processed} 해결 (${rate}%)`);
      }

      if (history.length > 0) {
        console.log('\n📜 최근 처리 내역');
        for (const record of history.slice(0, 5)) {
          const icon = record.resolved ? '✅' : '⏭️';
          const time = new Date(record.completed_at!).toLocaleTimeString('ko-KR');
          console.log(`   ${icon} ${time} - #${record.error_id} ${record.error_type}`);
        }
      }

      // 가장 많은 에러 타입
      if (Object.keys(stats.by_type).length > 0) {
        const topError = Object.entries(stats.by_type)[0];
        console.log(`\n⚠️  가장 많은 에러: ${topError[0]} (${topError[1]}건)`);
      }

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      break;
    }

    case '도움말':
    case 'help':
    case '-h':
    case '--help': {
      console.log(`
🛠️  Error Worker CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

명령어:
  에러탐지해, fetch    대기 중인 에러 하나 가져오기
  목록, list [n]       대기 중인 에러 목록 (기본 10건)
  상세, show <id>      특정 에러 상세 보기
  해결, done <id> "설명"   에러 해결 완료 기록
  무시, skip <id>      에러 무시 (처리 안 함)
  통계, stats          에러 큐 통계
  기록, history [n]    처리 기록 (기본 10건)
  리포트, report       종합 리포트 생성
  도움말, help         이 도움말

예시:
  npm run worker -- 에러탐지해
  npm run worker -- 목록 20
  npm run worker -- 해결 5 "SQL 쿼리 수정"
  npm run worker -- 무시 3
  npm run worker -- 리포트
`);
      break;
    }

    default: {
      console.error(`❌ 알 수 없는 명령어: ${command}`);
      console.log('도움말: npm run worker -- 도움말');
      process.exit(1);
    }
  }
}

main().catch(console.error);
