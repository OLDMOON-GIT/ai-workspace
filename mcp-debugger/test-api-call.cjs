const http = require('http');

// /api/bugs API 호출 테스트
async function testApiCall() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/bugs?status=open&type=all&page=1&pageSize=20',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data.substring(0, 1000));
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error('Request error:', e.message);
      reject(e);
    });

    req.end();
  });
}

testApiCall().catch(console.error);
