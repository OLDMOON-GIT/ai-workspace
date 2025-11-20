const http = require('http');

// 상품 정보 (DB에서 가져온 실제 데이터)
const productInfo = {
  title: "슈페르바 저소음 큰숫자 학생 수능 아날로그 손목 시계 수능시계",
  thumbnail: "https://image12.coupangcdn.com/image/vendor_inventory/04c3/9e817a4ea0eba68e1eca1de28318b09f8ff7a6f29b99b93a17f7d1c8c7b7.jpg",
  product_link: "https://link.coupang.com/a/c4Ldhn",
  description: "슈페르바 저소음 큰숫자 학생 수능 아날로그 손목 시계 수능시계 - 패션잡화"
};

console.log('🧪 실제 API 테스트: product-info 대본 생성\n');
console.log('📦 상품 정보:');
console.log('  - title:', productInfo.title);
console.log('  - thumbnail:', productInfo.thumbnail.substring(0, 50) + '...');
console.log('  - product_link:', productInfo.product_link);
console.log('  - description:', productInfo.description);
console.log('\n' + '='.repeat(70));

const requestData = JSON.stringify({
  title: `${productInfo.title} - 상품 기입 정보`,
  type: 'product-info',
  videoFormat: 'product-info',
  productInfo: productInfo,
  userId: 'test-user-id',
  useClaudeLocal: false,
  scriptModel: 'claude'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/scripts/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestData)
  }
};

console.log('\n🚀 POST /api/scripts/generate 호출...\n');

const req = http.request(options, (res) => {
  console.log(`✅ 응답 상태: ${res.statusCode}`);
  console.log(`📋 헤더:`, res.headers);
  console.log('');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
    process.stdout.write('.');
  });

  res.on('end', () => {
    console.log('\n\n' + '='.repeat(70));
    console.log('📝 응답 내용:\n');

    try {
      const response = JSON.parse(data);
      console.log(JSON.stringify(response, null, 2));

      if (response.taskId) {
        console.log('\n✅ 대본 생성 시작됨!');
        console.log(`   Task ID: ${response.taskId}`);
        console.log('\n💡 다음 단계:');
        console.log('   1. 브라우저 콘솔 확인: "🛍️🛍️🛍️ 상품 정보 치환 시작"');
        console.log('   2. DB 확인: scripts 테이블에서 생성된 대본 확인');
        console.log(`   3. 플레이스홀더 확인: {thumbnail}, {product_link}, {product_description}`);
      } else {
        console.log('\n❌ taskId가 없습니다!');
      }
    } catch (e) {
      console.log('❌ JSON 파싱 실패:');
      console.log(data);
    }
    console.log('='.repeat(70));
  });
});

req.on('error', (e) => {
  console.error(`\n❌ 요청 실패: ${e.message}`);
});

req.write(requestData);
req.end();
