/**
 * HTTPS Proxy Server for localhost:443
 * BTS-0001212: mkcert를 사용한 로컬 HTTPS 설정
 *
 * localhost:443 (HTTPS) → localhost:3000 (HTTP) 프록시
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HTTPS_PORT = 443;
const TARGET_PORT = 3000;

// SSL 인증서 로드
const certsDir = path.join(__dirname, 'certs');
const options = {
  key: fs.readFileSync(path.join(certsDir, 'localhost+2-key.pem')),
  cert: fs.readFileSync(path.join(certsDir, 'localhost+2.pem'))
};

// HTTPS 프록시 서버
const server = https.createServer(options, (req, res) => {
  const proxyReq = http.request({
    hostname: 'localhost',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${TARGET_PORT}`
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error: ${err.message}`);
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
});

server.listen(HTTPS_PORT, () => {
  console.log('========================================');
  console.log('  HTTPS Proxy Server Started');
  console.log('========================================');
  console.log(`  https://localhost:${HTTPS_PORT}`);
  console.log(`  → http://localhost:${TARGET_PORT}`);
  console.log('========================================');
  console.log('  Certificate: certs/localhost+2.pem');
  console.log('  Valid until: March 2028');
  console.log('========================================');
});

server.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error('ERROR: Port 443 requires administrator privileges.');
    console.error('Run this script as Administrator.');
  } else if (err.code === 'EADDRINUSE') {
    console.error('ERROR: Port 443 is already in use.');
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
