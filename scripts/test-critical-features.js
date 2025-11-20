#!/usr/bin/env node

/**
 * 핵심 기능 자동 테스트
 *
 * 과거 버그가 발생했던 핵심 기능들이 손상되지 않았는지 체크
 * 실행 시간: ~5초
 *
 * 사용법:
 *   node scripts/test-critical-features.js
 *
 * 관련 문서: CRITICAL_FEATURES.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI 색상 코드
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

let failCount = 0;
let passCount = 0;

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function test(name, fn) {
  try {
    fn();
    passCount++;
    log(`✅ ${name}`, 'green');
    return true;
  } catch (error) {
    failCount++;
    log(`❌ ${name}`, 'red');
    log(`   → ${error.message}`, 'red');
    return false;
  }
}

log('\n🔍 핵심 기능 체크 시작...\n', 'cyan');

// ==================== 1. 상품정보 전달 ====================
test('상품정보: script.productInfo 사용', () => {
  const content = checkFile('trend-video-frontend/src/app/page.tsx');

  // script.productInfo 사용하는지 확인
  if (!content.includes('script.productInfo')) {
    throw new Error('script.productInfo를 사용하지 않음!');
  }

  // 위험한 script.content 파싱이 있는지 확인 (주석 제외)
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 주석은 스킵
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }

    // productInfo 관련 코드에서 JSON.parse(script.content) 사용 금지
    if (line.includes('generateProductInfo') || line.includes('상품')) {
      // 다음 20줄 확인
      for (let j = i; j < Math.min(i + 20, lines.length); j++) {
        const checkLine = lines[j].trim();

        // 주석 제외
        if (checkLine.startsWith('//') || checkLine.startsWith('*')) {
          continue;
        }

        // 실제 코드에서 JSON.parse(script.content) 사용 금지
        if (checkLine.includes('JSON.parse(script.content)') &&
            !checkLine.startsWith('//')) {
          throw new Error(`Line ${j + 1}: 위험한 script.content 파싱 발견! script.productInfo를 사용하세요.`);
        }
      }
    }
  }
});

test('상품정보: API가 productInfo 반환', () => {
  const content = checkFile('trend-video-frontend/src/app/api/scripts/[id]/route.ts');

  // GetScriptResponse 타입 사용하는지 확인
  if (!content.includes('GetScriptResponse')) {
    throw new Error('API가 GetScriptResponse 타입을 사용하지 않음!');
  }
});

test('상품정보: rowToContent가 productInfo 파싱', () => {
  const content = checkFile('trend-video-frontend/src/lib/content.ts');

  // rowToContent 함수에서 productInfo 파싱하는지 확인
  if (!content.includes('row.product_info')) {
    throw new Error('rowToContent가 product_info를 파싱하지 않음!');
  }

  if (!content.includes('productInfo: productInfo')) {
    throw new Error('rowToContent가 productInfo를 반환하지 않음!');
  }
});

// ==================== 2. 영상 재생성 - uploads 폴더 ====================
test('영상 재생성: uploads 폴더 지원', () => {
  const content = checkFile('trend-video-frontend/src/app/api/restart-video/route.ts');

  // 'uploads' 타입 포함 확인
  if (!content.includes("'uploads'")) {
    throw new Error("folderType에 'uploads'가 없음!");
  }

  // uploads 폴더 감지 로직 확인
  if (!content.includes('uploadsIndex') || !content.includes("=== 'uploads'")) {
    throw new Error('uploads 폴더 감지 로직이 없음!');
  }
});

// ==================== 3. Video Merge - SAR 필터 ====================
test('Video Merge: SAR 필터 정규화', () => {
  const content = checkFile('trend-video-backend/video_merge.py');

  if (!content.includes('setsar=1')) {
    throw new Error('setsar=1 필터가 없음! SAR 불일치 에러 발생 가능');
  }
});

// ==================== 4. TTS 미리듣기 - 에러 처리 ====================
test('TTS: 중지 에러 처리', () => {
  const content = checkFile('trend-video-frontend/src/app/my-content/page.tsx');

  if (!content.includes("event.error === 'interrupted'") && !content.includes("event.error === 'canceled'")) {
    throw new Error('TTS 중지 에러 처리가 없음!');
  }
});

// ==================== 5. 데이터베이스 컬럼 ====================
test('DB: contents.product_info 컬럼 존재', () => {
  const dbPath = 'trend-video-frontend/data/database.sqlite';
  if (!fs.existsSync(dbPath)) {
    log('   ⚠️  DB 파일 없음 - 스킵', 'yellow');
    return;
  }

  try {
    const output = execSync(`sqlite3 "${dbPath}" "PRAGMA table_info(contents);"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (!output.includes('product_info')) {
      throw new Error('contents.product_info 컬럼이 없음!');
    }
  } catch (error) {
    if (error.message.includes('product_info')) {
      throw error;
    }
    // sqlite3 명령어 없으면 스킵
    log('   ⚠️  sqlite3 명령어 없음 - 스킵', 'yellow');
  }
});

test('DB: jobs.tts_voice 컬럼 존재', () => {
  const dbPath = 'trend-video-frontend/data/database.sqlite';
  if (!fs.existsSync(dbPath)) {
    log('   ⚠️  DB 파일 없음 - 스킵', 'yellow');
    return;
  }

  try {
    const output = execSync(`sqlite3 "${dbPath}" "PRAGMA table_info(jobs);"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (!output.includes('tts_voice')) {
      throw new Error('jobs.tts_voice 컬럼이 없음!');
    }
  } catch (error) {
    if (error.message.includes('tts_voice')) {
      throw error;
    }
    log('   ⚠️  sqlite3 명령어 없음 - 스킵', 'yellow');
  }
});

// ==================== 6. 위험한 마이그레이션 금지 ====================
test('DB: DROP TABLE 사용 금지', () => {
  const content = checkFile('trend-video-frontend/src/lib/sqlite.ts');

  // DROP TABLE 검색
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 주석이 아니고 DROP TABLE 포함
    if (line.includes('DROP TABLE') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
      throw new Error(`Line ${i + 1}: 위험한 DROP TABLE 발견! 데이터 손실 위험!`);
    }
  }
});

// ==================== 7. 로그 기능 표준 ====================
test('로그 UI: 버튼 텍스트 표준', () => {
  const content = checkFile('trend-video-frontend/src/app/my-content/page.tsx');

  // 금지된 패턴 체크: '📋 로그 보기' 다음에 개수 표시
  const badPatterns = [
    /['"]📋\s*로그\s*보기['"]\s*.*\(.*\.length\)/,
    /['"]📋\s*로그['"]\s*.*\(.*\.length\)/,
  ];

  for (const pattern of badPatterns) {
    if (pattern.test(content)) {
      throw new Error('로그 버튼에 개수 표시 금지! "📋 로그" 또는 "📋 닫기"만 사용');
    }
  }
});

test('로그 UI: jobLastLogRefs 존재 (자동 스크롤)', () => {
  const content = checkFile('trend-video-frontend/src/app/my-content/page.tsx');

  if (!content.includes('jobLastLogRefs')) {
    throw new Error('jobLastLogRefs가 없음! 자동 스크롤 기능 손상');
  }
});

// ==================== 8. ChatGPT URL ====================
test('ChatGPT URL: 최신 URL 사용', () => {
  const files = [
    'trend-video-backend/src/ai_aggregator/agents/chatgpt_agent.py',
    'trend-video-backend/src/ai_aggregator/agents/agent.py',
    'trend-video-backend/src/ai_aggregator/setup_login.py',
  ];

  for (const file of files) {
    const content = checkFile(file);

    // 오래된 URL 사용 금지
    if (content.includes('chat.openai.com')) {
      throw new Error(`${file}: 오래된 URL 사용! chatgpt.com으로 변경 필요`);
    }

    // 새 URL 사용 확인
    if (!content.includes('chatgpt.com')) {
      throw new Error(`${file}: chatgpt.com URL이 없음!`);
    }
  }
});

// ==================== 결과 ====================
log('\n' + '='.repeat(50), 'cyan');
log(`결과: ${passCount} 성공, ${failCount} 실패`, failCount > 0 ? 'red' : 'green');
log('='.repeat(50) + '\n', 'cyan');

if (failCount > 0) {
  log('❌ 핵심 기능이 손상되었습니다!', 'red');
  log('📖 자세한 내용: CRITICAL_FEATURES.md\n', 'yellow');
  process.exit(1);
} else {
  log('✅ 모든 핵심 기능이 정상입니다!\n', 'green');
  process.exit(0);
}
