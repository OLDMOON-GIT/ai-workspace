// BTS-14833: 한글 인코딩 깨짐 문제 수정 패치
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'trend-video-frontend/src/app/api/script-status/route.ts');

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // 이미 패치되었는지 확인
  if (content.includes('깨진 인코딩 문자 필터링')) {
    console.log('ℹ️ 이미 패치 적용됨');
    process.exit(0);
  }

  // "const message = match" 를 "let message = match"로 변경하고 인코딩 필터 추가
  const oldPattern = 'const message = match ? match[1] : line;';
  const newCode = `let message = match ? match[1] : line;

    // BTS-14833: 깨진 인코딩 문자 필터링 (CP949/EUC-KR이 UTF-8로 잘못 읽힌 경우)
    message = message
      .replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]/g, '') // 제어 문자 제거
      .replace(/\\uFFFD/g, '?') // Unicode replacement character 처리
      .replace(/[ġİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐő]/g, '') // 흔한 깨진 문자 제거
      .replace(/[\\u0080-\\u009F]/g, ''); // C1 제어 문자 제거`;

  if (content.includes(oldPattern)) {
    content = content.replace(oldPattern, newCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ 인코딩 수정 패치 성공!');
  } else {
    console.log('❌ 원본 패턴을 찾을 수 없음');
    // 파일에서 extractLogMessages 함수 찾아서 출력
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('extractLogMessages')) {
        console.log('Line ' + (i+1) + ':', lines[i]);
        for (let j = i+1; j < Math.min(i+15, lines.length); j++) {
          console.log('Line ' + (j+1) + ':', lines[j]);
        }
        break;
      }
    }
  }
} catch (err) {
  console.error('❌ 에러:', err.message);
}
