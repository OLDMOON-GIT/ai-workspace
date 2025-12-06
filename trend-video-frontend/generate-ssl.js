/**
 * SSL 자체 서명 인증서 생성 스크립트
 * BTS-0000953: HTTPS 지원
 *
 * 사용법:
 *   node generate-ssl.js
 *
 * 생성되는 파일:
 *   ssl/server.key - 개인키
 *   ssl/server.crt - 인증서
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SSL_DIR = path.join(__dirname, 'ssl');
const KEY_PATH = path.join(SSL_DIR, 'server.key');
const CERT_PATH = path.join(SSL_DIR, 'server.crt');

// SSL 디렉토리 생성
if (!fs.existsSync(SSL_DIR)) {
  fs.mkdirSync(SSL_DIR);
  console.log('ssl/ 디렉토리 생성됨');
}

// 이미 존재하면 백업
if (fs.existsSync(KEY_PATH)) {
  const backupPath = KEY_PATH + '.bak';
  fs.renameSync(KEY_PATH, backupPath);
  console.log(`기존 키 백업: ${backupPath}`);
}
if (fs.existsSync(CERT_PATH)) {
  const backupPath = CERT_PATH + '.bak';
  fs.renameSync(CERT_PATH, backupPath);
  console.log(`기존 인증서 백업: ${backupPath}`);
}

// OpenSSL로 인증서 생성
console.log('\nSSL 인증서 생성 중...');

try {
  // Windows에서 OpenSSL 경로 찾기
  let opensslPath = 'openssl';

  // Git for Windows의 OpenSSL 사용 시도
  const gitOpenSSL = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
  if (fs.existsSync(gitOpenSSL)) {
    opensslPath = `"${gitOpenSSL}"`;
  }

  const subject = '/C=KR/ST=Seoul/L=Seoul/O=TrendVideo/CN=localhost';

  // 개인키 생성
  execSync(`${opensslPath} genrsa -out "${KEY_PATH}" 2048`, { stdio: 'inherit' });

  // 자체 서명 인증서 생성 (365일 유효)
  execSync(
    `${opensslPath} req -new -x509 -key "${KEY_PATH}" -out "${CERT_PATH}" -days 365 -subj "${subject}"`,
    { stdio: 'inherit' }
  );

  console.log('\n✅ SSL 인증서 생성 완료!');
  console.log(`   키: ${KEY_PATH}`);
  console.log(`   인증서: ${CERT_PATH}`);
  console.log('\n이제 HTTPS 서버를 시작할 수 있습니다:');
  console.log('   npm run dev:https');
  console.log('\n⚠️ 자체 서명 인증서는 브라우저에서 경고가 표시됩니다.');
  console.log('   API 호출 시에는 문제없이 사용 가능합니다.');
} catch (error) {
  console.error('\n❌ SSL 인증서 생성 실패:', error.message);
  console.log('\nOpenSSL이 설치되어 있는지 확인하세요.');
  console.log('Git for Windows가 설치되어 있으면 OpenSSL이 포함되어 있습니다.');
  process.exit(1);
}
