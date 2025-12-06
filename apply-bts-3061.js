/**
 * BTS-3061 패치 적용 스크립트
 * Python exit code 4294967295 발생 시 재시도 로직 추가
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'trend-video-frontend/src/workers/unified-worker.js');
let content = fs.readFileSync(filePath, 'utf-8');

// 이미 패치 적용 여부 확인
if (content.includes('BTS-3061')) {
  console.log('BTS-3061 패치가 이미 적용되어 있습니다.');
  process.exit(0);
}

// 1단계: return new Promise를 try-catch로 감싸기 위해 변수 선언 추가
const marker1 = 'appendToLogFile(taskId, \'image\', startMsg); // BTS-0000028: 시작 로그 파일 저장';
const marker1Index = content.indexOf(marker1);

if (marker1Index === -1) {
  console.error('마커1을 찾을 수 없습니다.');
  process.exit(1);
}

// return new Promise 찾기
const returnPromisePattern = /\n      return new Promise\(\(resolve, reject\) => \{/;
const returnPromiseMatch = content.substring(marker1Index).match(returnPromisePattern);

if (!returnPromiseMatch) {
  console.error('return new Promise 패턴을 찾을 수 없습니다.');
  process.exit(1);
}

// 재시도 로직 헤더 삽입
const retryHeader = `

      // ✅ BTS-3061: 비정상 종료(exit code 4294967295) 시 재시도 로직
      const MAX_IMAGE_RETRIES = 2;
      let lastError = null;

      for (let imageRetry = 0; imageRetry <= MAX_IMAGE_RETRIES; imageRetry++) {
        if (imageRetry > 0) {
          const retryMsg = \`🔄 이미지 생성 재시도 \${imageRetry}/\${MAX_IMAGE_RETRIES}...\`;
          console.log(\`\${emoji} [\${type}] \${retryMsg}\`);
          await this.appendLog(taskId, type, retryMsg);
          appendToLogFile(taskId, 'image', retryMsg);
          await this.sleep(5000); // Chrome 안정화 대기
        }

        try {
          await new Promise((resolve, reject) => {`;

// return new Promise -> try await new Promise로 교체
const insertPoint = marker1Index + marker1.length;
// CRLF/LF 모두 지원
let oldReturnPromise = '\n\n      return new Promise((resolve, reject) => {';
let relativeIndex = content.substring(insertPoint).indexOf(oldReturnPromise);

if (relativeIndex === -1) {
  // CRLF 시도
  oldReturnPromise = '\r\n\r\n      return new Promise((resolve, reject) => {';
  relativeIndex = content.substring(insertPoint).indexOf(oldReturnPromise);
}

if (relativeIndex === -1) {
  console.error('return new Promise 위치를 찾을 수 없습니다.');
  console.log('마커 위치:', insertPoint);
  console.log('다음 50자:', JSON.stringify(content.substring(insertPoint, insertPoint + 100)));
  process.exit(1);
}

const actualInsertPoint = insertPoint + relativeIndex;
content = content.substring(0, actualInsertPoint) + retryHeader + content.substring(actualInsertPoint + oldReturnPromise.length);

// 2단계: Promise 종료 및 에러 처리 수정
// 기존: });  -> }); return; } catch ... throw lastError
// CRLF와 LF 모두 지원
let closingPattern = /        pythonProcess\.on\('error', \(error\) => reject\(new Error\(`Failed to start: \${error\.message}`\)\)\);\r?\n      \}\);/;
let closingMatch = content.match(closingPattern);

if (!closingMatch) {
  console.log('Closing 패턴 디버그:');
  const searchIdx = content.indexOf("pythonProcess.on('error'");
  if (searchIdx !== -1) {
    console.log('pythonProcess.on 위치:', searchIdx);
    console.log('해당 부분:', JSON.stringify(content.substring(searchIdx, searchIdx + 120)));
  }
}

if (!closingMatch) {
  console.error('Promise 종료 패턴을 찾을 수 없습니다.');
  process.exit(1);
}

const newClosing = `        pythonProcess.on('error', (error) => reject(new Error(\`Failed to start: \${error.message}\`)));
          });
          return; // 성공 시 함수 종료
        } catch (retryError) {
          lastError = retryError;
          const failMsg = \`❌ 실패 (시도 \${imageRetry + 1}/\${MAX_IMAGE_RETRIES + 1}): \${retryError.message}\`;
          console.error(\`\${emoji} [\${type}] \${failMsg}\`);
          await this.appendLog(taskId, type, failMsg).catch(() => {});
          appendToLogFile(taskId, 'image', failMsg);

          // ✅ BTS-3061: 비정상 종료 시에만 재시도 (exit code 4294967295 또는 -1)
          const isRetryable = retryError.message.includes('예기치 않게 종료') ||
                              retryError.message.includes('exit code: -1') ||
                              retryError.message.includes('메모리 부족') ||
                              retryError.message.includes('강제 종료');

          if (!isRetryable || imageRetry >= MAX_IMAGE_RETRIES) {
            break; // 재시도 불가능하거나 최대 재시도 횟수 도달
          }
        }
      }

      // 모든 재시도 실패 시 에러 throw
      throw lastError || new Error('이미지 생성 실패 (알 수 없는 오류)');`;

content = content.replace(closingPattern, newClosing);

// 저장
fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ BTS-3061 패치 적용 완료!');
console.log('   - exit code 4294967295 발생 시 최대 2회 재시도');
console.log('   - 5초 대기 후 Chrome 안정화');
