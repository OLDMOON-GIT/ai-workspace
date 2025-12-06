/**
 * HTTPS 커스텀 서버 for Next.js
 * BTS-0000953: HTTPS 지원
 *
 * 사용법:
 *   npm run dev:https
 *
 * 인증서 생성:
 *   node generate-ssl.js
 */

const https = require('https');
const http = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
// TREND_HTTP_PORT, TREND_HTTPS_PORT 환경변수 우선 사용 (az.bat과 호환)
const httpPort = parseInt(process.env.TREND_HTTP_PORT || process.env.PORT || '2000', 10);
const httpsPort = parseInt(process.env.TREND_HTTPS_PORT || process.env.HTTPS_PORT || '2443', 10);

const app = next({ dev, hostname, port: httpPort });
const handle = app.getRequestHandler();

// SSL 인증서 경로
const SSL_DIR = path.join(__dirname, 'ssl');
const KEY_PATH = path.join(SSL_DIR, 'server.key');
const CERT_PATH = path.join(SSL_DIR, 'server.crt');

// SSL 인증서 존재 여부 확인
function hasSSLCerts() {
  return fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH);
}

app.prepare().then(() => {
  // HTTP 서버 (항상 시작)
  const httpServer = http.createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  httpServer.listen(httpPort, hostname, () => {
    console.log(`> HTTP  서버: http://${hostname}:${httpPort}`);
  });

  // HTTPS 서버 (SSL 인증서 있으면 추가)
  if (hasSSLCerts()) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(KEY_PATH),
        cert: fs.readFileSync(CERT_PATH),
      };

      const httpsServer = https.createServer(httpsOptions, (req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
      });

      httpsServer.listen(httpsPort, hostname, () => {
        console.log(`> HTTPS 서버: https://${hostname}:${httpsPort}`);
      });
    } catch (error) {
      console.error('HTTPS 서버 시작 실패:', error.message);
    }
  }
});
