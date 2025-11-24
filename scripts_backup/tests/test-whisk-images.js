// Whisk 페이지에서 이미지 정보 확인
const imgs = Array.from(document.querySelectorAll('img'));
console.log('전체 이미지 개수:', imgs.length);

// 모든 이미지 정보 출력
imgs.forEach((img, idx) => {
    console.log(`[${idx}] ${img.offsetWidth}x${img.offsetHeight} - ${img.src.substring(0, 80)}`);
});

// 크기별 필터링
const largeImgs = imgs.filter(img => img.offsetWidth > 100 && img.offsetHeight > 100);
console.log('\n큰 이미지 (100x100 이상):', largeImgs.length);
largeImgs.forEach((img, idx) => {
    console.log(`[${idx}] ${img.offsetWidth}x${img.offsetHeight} - ${img.src.substring(0, 80)}`);
});

// HTTP/blob URL만
const httpImgs = imgs.filter(img => {
    const src = img.src || '';
    return (src.startsWith('http') || src.startsWith('blob:')) &&
           img.offsetWidth > 100 && img.offsetHeight > 100;
});
console.log('\nHTTP/Blob 이미지 (100x100 이상):', httpImgs.length);
httpImgs.forEach((img, idx) => {
    console.log(`[${idx}] ${img.offsetWidth}x${img.offsetHeight} - ${img.src.substring(0, 80)}`);
});

// 크기 순으로 정렬
const sorted = httpImgs.sort((a, b) => {
    const sizeA = a.offsetWidth * a.offsetHeight;
    const sizeB = b.offsetWidth * b.offsetHeight;
    return sizeB - sizeA;
});

console.log('\n크기 순 정렬 (상위 5개):');
sorted.slice(0, 5).forEach((img, idx) => {
    const size = img.offsetWidth * img.offsetHeight;
    console.log(`[${idx}] ${img.offsetWidth}x${img.offsetHeight} (${size}px²) - ${img.src.substring(0, 80)}`);
});
