// BTS-2972: 409 에러 무한 반복 수정 패치
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'trend-video-frontend/src/lib/automation-scheduler.ts');

let content = fs.readFileSync(filePath, 'utf-8');

// 이미 패치가 적용되어 있는지 확인
if (content.includes('BTS-2972')) {
  console.log('⚠️ 이미 패치가 적용되어 있습니다.');
  process.exit(0);
}

// 수정할 패턴 - 정규식으로 찾기
const pattern = /throw new Error\(error\.error \|\| 'Script generation failed'\);\s*\n\s*\}\s*\n\s*\n\s*const data = await response\.json\(\);/;

const replacement = `// ⭐ BTS-2972: 409 에러(다른 대본 생성 중) 특별 처리
      if (response.status === 409 && error.taskId) {
        console.log(\`⏳ [SCHEDULER] 409 Conflict - 다른 대본 생성 중: \${error.taskId}\`);
        addPipelineLog(pipelineId, 'info', \`⏳ 다른 대본이 생성 중입니다. 완료 대기 중... (\${error.taskId})\`);
        addTitleLog(queue.taskId, 'info', \`⏳ 다른 대본 생성 대기 중...\`);

        // 기존 대본 생성 완료 대기 (최대 15분)
        const conflictWaitTime = 15 * 60 * 1000;
        const conflictStartTime = Date.now();
        let conflictResolved = false;

        while (Date.now() - conflictStartTime < conflictWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10초마다 체크

          if (await isPipelineOrScheduleCancelled(pipelineId)) {
            throw new Error('Automation stopped by user');
          }

          // 기존 작업 상태 체크
          try {
            const conflictStatusRes = await fetch(\`http://localhost:\${process.env.PORT || 3000}/api/scripts/status/\${error.taskId}\`);
            if (conflictStatusRes.ok) {
              const conflictStatus = await conflictStatusRes.json();
              console.log(\`🔍 [SCHEDULER] 대기 중인 작업 상태: \${conflictStatus.status}\`);

              if (conflictStatus.status === 'completed' || conflictStatus.status === 'failed') {
                console.log(\`✅ [SCHEDULER] 기존 대본 생성 \${conflictStatus.status} - 재시도 가능\`);
                conflictResolved = true;
                break;
              }
            }
          } catch (statusError) {
            console.warn(\`⚠️ [SCHEDULER] 상태 체크 실패, 계속 대기...\`);
          }

          const elapsed = Math.floor((Date.now() - conflictStartTime) / 1000);
          console.log(\`⏳ [SCHEDULER] 대기 중... (\${elapsed}초 경과)\`);
        }

        if (conflictResolved) {
          // 충돌이 해결되면 재귀 호출하여 다시 시도
          console.log(\`🔄 [SCHEDULER] 충돌 해결됨 - 대본 생성 재시도\`);
          addTitleLog(queue.taskId, 'info', \`🔄 대기 완료, 대본 생성 재시도...\`);
          return generateScript(queue, pipelineId, maxRetry);
        } else {
          // 대기 시간 초과 - 다음 스케줄 주기에 재시도하도록 함
          console.warn(\`⚠️ [SCHEDULER] 대기 시간 초과 (15분) - 다음 주기에 재시도\`);
          addTitleLog(queue.taskId, 'warn', \`⚠️ 대기 시간 초과, 나중에 재시도됩니다\`);
          return { success: false, error: '다른 대본 생성 대기 중 시간 초과 - 나중에 재시도' };
        }
      }

      throw new Error(error.error || 'Script generation failed');
    }

    const data = await response.json();`;

if (pattern.test(content)) {
  content = content.replace(pattern, replacement);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('✅ 패치 적용 완료: BTS-2972 409 에러 처리 추가됨');
} else {
  console.error('❌ 패치 대상 코드를 찾을 수 없습니다. 파일을 직접 확인해주세요.');

  // 디버깅: 주변 코드 확인
  const match = content.match(/throw new Error\(error\.error/);
  if (match) {
    console.log('디버깅: error.error 패턴 발견됨, 정규식 조정 필요');
    const idx = content.indexOf("throw new Error(error.error || 'Script generation failed')");
    if (idx !== -1) {
      console.log('위치:', idx);
      console.log('주변 코드:', content.substring(idx - 50, idx + 150));
    }
  }
  process.exit(1);
}
