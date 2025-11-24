const http = require('http');

const data = JSON.stringify({
  prompt: "",
  title: "Test Product",
  type: "product",
  model: "claude",
  productInfo: { product_id: "test123", name: "Test Item" },
  category: "general",
  userId: "automation-system"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/scripts/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'X-Internal-Request': 'automation-system'
  }
};

const req = http.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    console.log('Response:', responseData);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();
