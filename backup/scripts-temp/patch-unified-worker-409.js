// BTS-2973: unified-worker.js 409 에러 처리 패치
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'trend-video-frontend/src/workers/unified-worker.js');

let content = fs.readFileSync(filePath, 'utf-8');

// 이미 패치가 적용되어 있는지 확인
if (content.includes('BTS-2973')) {
  console.log('⚠️ 이미 패치가 적용되어 있습니다.');
  process.exit(0);
}

// 정규식으로 패턴 매칭
const pattern = /lastError = new Error\(`API error \$\{response\.status\}: \$\{errorText\}`\);\s*\n\s*\n\s*\/\/ 404[^\n]*\n\s*if \(response\.status === 404/;

const replacement = `lastError = new Error(\`API error \${response.status}: \${errorText}\`);

          // ⭐ BTS-2973: 409 에러(다른 대본 생성 중) 특별 처리
          if (response.status === 409) {
            let conflictData = {};
            try { conflictData = JSON.parse(errorText); } catch (e) {}
            const conflictTaskId = conflictData.taskId;

            console.log(\`\${emoji} [\${type}] ⏳ 409 Conflict - 다른 대본 생성 중: \${conflictTaskId || '(unknown)'}\`);
            await this.appendLog(taskId, type, \`⏳ 다른 대본 생성 대기 중... (\${conflictTaskId || 'unknown'})\`);

            // 기존 대본 생성 완료 대기 (최대 15분)
            const conflictWaitTime = 15 * 60 * 1000;
            const conflictStartTime = Date.now();
            let conflictResolved = false;

            while (Date.now() - conflictStartTime < conflictWaitTime) {
              await new Promise(r => setTimeout(r, 10000)); // 10초마다 체크

              // 기존 작업 상태 체크
              if (conflictTaskId) {
                try {
                  const statusRes = await fetch(\`http://localhost:\${process.env.PORT || 2000}/api/scripts/status/\${conflictTaskId}\`);
                  if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    console.log(\`\${emoji} [\${type}] 🔍 대기 중인 작업 상태: \${statusData.status}\`);

                    if (statusData.status === 'completed' || statusData.status === 'failed') {
                      console.log(\`\${emoji} [\${type}] ✅ 기존 대본 생성 \${statusData.status} - 재시도 가능\`);
                      conflictResolved = true;
                      break;
                    }
                  }
                } catch (statusError) {
                  console.warn(\`\${emoji} [\${type}] ⚠️ 상태 체크 실패, 계속 대기...\`);
                }
              }

              const elapsed = Math.floor((Date.now() - conflictStartTime) / 1000);
              console.log(\`\${emoji} [\${type}] ⏳ 대기 중... (\${elapsed}초 경과)\`);
            }

            if (conflictResolved) {
              console.log(\`\${emoji} [\${type}] 🔄 충돌 해결됨 - 재시도\`);
              await this.appendLog(taskId, type, \`🔄 대기 완료, 재시도...\`);
              continue; // 재시도
            } else {
              console.warn(\`\${emoji} [\${type}] ⚠️ 대기 시간 초과 (15분)\`);
              await this.appendLog(taskId, type, \`⚠️ 대기 시간 초과, 나중에 재시도됩니다\`);
              throw new Error('다른 대본 생성 대기 중 시간 초과');
            }
          }

          // 404 또는 5xx 에러일 때만 재시도 (서버 일시 오류)
          if (response.status === 404`;

if (pattern.test(content)) {
  content = content.replace(pattern, replacement);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('✅ 패치 적용 완료: BTS-2973 unified-worker.js 409 에러 처리 추가됨');
} else {
  console.error('❌ 패치 대상 코드를 찾을 수 없습니다.');

  // 디버깅
  const idx = content.indexOf('API error ${response.status}');
  if (idx !== -1) {
    console.log('디버깅: API error 패턴 발견됨 위치:', idx);
    console.log('주변 코드 (200자):', content.substring(idx, idx + 200).replace(/\n/g, '\\n'));
  }
  process.exit(1);
}
