/**
 * BTS-3061: Python script exit code 4294967295 재시도 로직 추가 패치
 *
 * exit code 4294967295는 unsigned 32-bit에서 -1을 의미함
 * Python 프로세스가 비정상 종료될 때 발생 (Chrome 연결 끊김, 시스템 리소스 부족 등)
 *
 * 이 패치는 비정상 종료 시 최대 2회 재시도하는 로직을 추가함
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'trend-video-frontend/src/workers/unified-worker.js');

// 원본 코드 (찾을 패턴)
const oldCode = `      const startMsg = \`🎨 이미지 생성 시작 (모드: \${imageMode}, 비율: \${aspectRatio})\`;
      console.log(\`\${emoji} [\${type}] \${startMsg}\`);
      await this.appendLog(taskId, type, startMsg);
      appendToLogFile(taskId, 'image', startMsg); // BTS-0000028: 시작 로그 파일 저장

      return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python', pythonArgs, {
          cwd: backendPath,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true  // 이미지 크롤링 완료 시 콘솔 창 자동 숨김
        });

        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
          const text = data.toString();
          process.stdout.write(\`\${emoji} \${text}\`);
          this.appendLog(taskId, type, text.trim()).catch(() => {});
          appendToLogFile(taskId, 'image', text.trim());
        });

        pythonProcess.stderr.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          process.stderr.write(\`\${emoji} ⚠️ \${text}\`);
          this.appendLog(taskId, type, \`⚠️ \${text.trim()}\`).catch(() => {});
          appendToLogFile(taskId, 'image', \`⚠️ \${text.trim()}\`);
        });

        pythonProcess.on('close', async (code) => {
          if (code === 0) {
            const successMsg = '✅ 이미지 생성 완료';
            console.log(\`\${emoji} [\${type}] \${successMsg}\`);
            await this.appendLog(taskId, type, successMsg).catch(() => {});
            appendToLogFile(taskId, 'image', successMsg); // BTS-0000028: 성공 로그 파일 저장
            resolve();
          } else {
            reject(new Error(\`Python script exited with code \${code}\\n\${errorOutput}\`));
          }
        });

        pythonProcess.on('error', (error) => reject(new Error(\`Failed to start: \${error.message}\`)));
      });`;

// 새 코드 (교체할 패턴)
const newCode = `      const startMsg = \`🎨 이미지 생성 시작 (모드: \${imageMode}, 비율: \${aspectRatio})\`;
      console.log(\`\${emoji} [\${type}] \${startMsg}\`);
      await this.appendLog(taskId, type, startMsg);
      appendToLogFile(taskId, 'image', startMsg); // BTS-0000028: 시작 로그 파일 저장

      // ✅ BTS-3061: 비정상 종료(exit code 4294967295) 시 재시도 로직 추가
      const MAX_IMAGE_RETRIES = 2;
      let lastError = null;

      for (let imageRetry = 0; imageRetry <= MAX_IMAGE_RETRIES; imageRetry++) {
        if (imageRetry > 0) {
          const retryMsg = \`🔄 이미지 생성 재시도 \${imageRetry}/\${MAX_IMAGE_RETRIES}...\`;
          console.log(\`\${emoji} [\${type}] \${retryMsg}\`);
          await this.appendLog(taskId, type, retryMsg);
          appendToLogFile(taskId, 'image', retryMsg);
          // 재시도 전 잠시 대기 (Chrome 안정화)
          await this.sleep(5000);
        }

        try {
          await new Promise((resolve, reject) => {
            const pythonProcess = spawn('python', pythonArgs, {
              cwd: backendPath,
              shell: true,
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true  // 이미지 크롤링 완료 시 콘솔 창 자동 숨김
            });

            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
              const text = data.toString();
              process.stdout.write(\`\${emoji} \${text}\`);
              this.appendLog(taskId, type, text.trim()).catch(() => {});
              appendToLogFile(taskId, 'image', text.trim());
            });

            pythonProcess.stderr.on('data', (data) => {
              const text = data.toString();
              errorOutput += text;
              process.stderr.write(\`\${emoji} ⚠️ \${text}\`);
              this.appendLog(taskId, type, \`⚠️ \${text.trim()}\`).catch(() => {});
              appendToLogFile(taskId, 'image', \`⚠️ \${text.trim()}\`);
            });

            pythonProcess.on('close', async (code) => {
              if (code === 0) {
                const successMsg = '✅ 이미지 생성 완료';
                console.log(\`\${emoji} [\${type}] \${successMsg}\`);
                await this.appendLog(taskId, type, successMsg).catch(() => {});
                appendToLogFile(taskId, 'image', successMsg); // BTS-0000028: 성공 로그 파일 저장
                resolve();
              } else {
                // ✅ BTS-3061: exit code 4294967295 (=-1) 특별 처리
                let errorMsg;
                if (code === 4294967295 || code === -1) {
                  errorMsg = \`Python 프로세스 비정상 종료 (exit code: \${code}). Chrome 연결 끊김 또는 시스템 리소스 부족 가능성\`;
                  console.error(\`\${emoji} [\${type}] ⚠️ \${errorMsg}\`);
                } else {
                  errorMsg = \`Python script exited with code \${code}\`;
                }
                reject(new Error(\`\${errorMsg}\\n\${errorOutput}\`));
              }
            });

            pythonProcess.on('error', (error) => reject(new Error(\`Failed to start Python: \${error.message}\`)));
          });

          // 성공 시 함수 종료
          return;

        } catch (retryError) {
          lastError = retryError;
          const failMsg = \`❌ 실패 (시도 \${imageRetry + 1}/\${MAX_IMAGE_RETRIES + 1}): \${retryError.message}\`;
          console.error(\`\${emoji} [\${type}] \${failMsg}\`);
          await this.appendLog(taskId, type, failMsg).catch(() => {});
          appendToLogFile(taskId, 'image', failMsg);

          // 재시도 가능한 에러인지 확인 (비정상 종료 = 재시도 가능)
          const isRetryable = retryError.message.includes('4294967295') ||
                              retryError.message.includes('비정상 종료') ||
                              retryError.message.includes('exit code: -1');

          if (!isRetryable || imageRetry >= MAX_IMAGE_RETRIES) {
            break; // 재시도 불가능하거나 최대 재시도 횟수 도달
          }
        }
      }

      // 모든 재시도 실패 시 에러 throw
      throw lastError || new Error('이미지 생성 실패 (알 수 없는 오류)');`;

// 파일 읽기
const content = fs.readFileSync(filePath, 'utf-8');

// 이미 패치되었는지 확인
if (content.includes('BTS-3061')) {
  console.log('✅ BTS-3061 패치가 이미 적용되어 있습니다.');
  process.exit(0);
}

// 패턴 찾기
if (!content.includes(oldCode)) {
  console.error('❌ 원본 코드 패턴을 찾을 수 없습니다.');
  console.error('파일이 이미 수정되었거나 버전이 다를 수 있습니다.');
  process.exit(1);
}

// 교체
const newContent = content.replace(oldCode, newCode);

// 저장
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('✅ BTS-3061 패치 적용 완료!');
console.log('   - exit code 4294967295 발생 시 최대 2회 재시도');
console.log('   - 더 명확한 에러 메시지 제공');
