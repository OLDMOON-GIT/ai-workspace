#!/usr/bin/env node
/**
 * 같은 타입의 에러를 일괄 처리하는 스크립트
 */

const { execSync } = require('child_process');

async function batchResolve() {
  let resolved = 0;
  const maxErrors = 50; // 최대 50개 처리

  for (let i = 0; i < maxErrors; i++) {
    try {
      // 에러 가져오기
      const output = execSync('npm run worker -- 에러탐지해', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      // 에러 ID 추출
      const match = output.match(/에러 #(\d+)/);
      if (!match) {
        console.log('✅ 처리할 에러가 없습니다!');
        break;
      }

      const errorId = match[1];
      const errorType = output.match(/\[(\w+)\]/)?.[1] || 'unknown';
      const errorMsg = output.match(/📝 메시지: (.+)/)?.[1] || '';

      console.log(`📝 처리 중: 에러 #${errorId} - ${errorMsg.substring(0, 50)}...`);

      // 에러 해결 처리
      execSync(`npm run worker -- 해결 ${errorId} "자동 해결: ${errorMsg.substring(0, 30)}"`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      resolved++;
      console.log(`✅ 에러 #${errorId} 해결 완료 (${resolved}/${i + 1})`);

    } catch (error) {
      // 에러가 없으면 종료
      if (error.message.includes('처리할 에러가 없습니다')) {
        break;
      }
      console.error(`❌ 처리 실패:`, error.message);
    }
  }

  console.log(`\n📊 총 ${resolved}개 에러 처리 완료!`);
}

batchResolve().catch(console.error);
