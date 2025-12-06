// BTS-14833: 로그 순서 문제 수정 패치
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'trend-video-frontend/src/lib/content.ts');

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // 이미 패치되었는지 확인
  if (content.includes('BTS-14833: 안정적인 정렬')) {
    console.log('ℹ️ 이미 패치 적용됨');
    process.exit(0);
  }

  // 기존 패턴 - 줄바꿈 무시하고 매칭
  const oldPattern = /\/\/ 모든 로그 파일을 합쳐서 반환\s+const allLogs: string\[\] = \[\];\s+for \(const lt of Object\.keys\(LOG_FILE_MAP\) as LogType\[\]\) \{\s+const logPath = getLogFilePath\(contentId, lt\);\s+if \(fs\.existsSync\(logPath\)\) \{\s+const content = fs\.readFileSync\(logPath, 'utf-8'\);\s+const lines = content\.split\('\\n'\)\.filter\(line => line\.trim\(\)\);\s+allLogs\.push\(\.\.\.lines\);\s+\}\s+\}\s+\/\/ 타임스탬프로 정렬\s+return allLogs\.sort\(\);/;

  const newCode = `// 모든 로그 파일을 합쳐서 반환 (BTS-14833: 안정적인 정렬)
    const allLogs: { line: string; timestamp: string; typeOrder: number; lineIndex: number }[] = [];
    const typeOrderMap: Record<LogType, number> = { script: 0, image: 1, video: 2, youtube: 3 };
    let globalIndex = 0;

    for (const lt of Object.keys(LOG_FILE_MAP) as LogType[]) {
      const logPath = getLogFilePath(contentId, lt);
      if (fs.existsSync(logPath)) {
        const fileContent = fs.readFileSync(logPath, 'utf-8');
        const lines = fileContent.split('\\n').filter(line => line.trim());
        for (const line of lines) {
          // 타임스탬프 추출 [YYYY-MM-DD HH:mm:ss]
          const tsMatch = line.match(/^\\[([^\\]]+)\\]/);
          const timestamp = tsMatch ? tsMatch[1] : '';
          allLogs.push({
            line,
            timestamp,
            typeOrder: typeOrderMap[lt],
            lineIndex: globalIndex++
          });
        }
      }
    }

    // BTS-14833: 타임스탬프 + 타입 순서 + 원본 순서로 안정 정렬
    allLogs.sort((a, b) => {
      // 1. 타임스탬프 비교
      if (a.timestamp !== b.timestamp) {
        return a.timestamp.localeCompare(b.timestamp);
      }
      // 2. 같은 타임스탬프면 타입 순서 (script -> image -> video -> youtube)
      if (a.typeOrder !== b.typeOrder) {
        return a.typeOrder - b.typeOrder;
      }
      // 3. 같은 타입이면 원본 파일 내 순서 유지
      return a.lineIndex - b.lineIndex;
    });

    return allLogs.map(item => item.line);`;

  if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ 로그 순서 수정 패치 성공!');
  } else {
    console.log('❌ 정규식 패턴 매칭 실패');
    // 간단한 문자열 교체 시도
    const simpleOld = '// 타임스탬프로 정렬\n    return allLogs.sort();';
    const simpleNew = `// BTS-14833: 타임스탬프 + 타입 순서 + 원본 순서로 안정 정렬
    // 참고: 이 단순 정렬은 문제가 있을 수 있으나 안전하게 유지
    return allLogs.sort();`;

    if (content.includes(simpleOld)) {
      console.log('간단한 패치로 시도...');
      // 더 정확한 접근: 전체 함수 교체
    }

    // 현재 함수 내용 출력
    const funcMatch = content.match(/export function getContentLogs[\s\S]*?^}/m);
    if (funcMatch) {
      console.log('\\n현재 getContentLogs 함수:');
      console.log(funcMatch[0].substring(0, 600) + '...');
    }
  }
} catch (err) {
  console.error('❌ 에러:', err.message);
}
