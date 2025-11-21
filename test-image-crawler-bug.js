/**
 * 이미지 크롤러 버그 테스트
 * 문제: 8개 씬을 가져오는데 씬 1을 여러 번 호출
 *
 * 예상 동작: 씬 0 → 씬 1 → 씬 2 → ... → 씬 7 (순서대로 1번씩)
 * 현재 동작: 씬 0 → 씬 1 → 씬 1 → 씬 1 (씬 1을 여러 번 호출)
 */

const fs = require('fs');
const path = require('path');

// 테스트 씬 데이터 생성
const testScenes = [
  {
    scene_id: 'scene_00_bomb',
    scene_name: '3초 폭탄 씬',
    image_prompt: 'Korean elderly woman shocked expression - SCENE 0'
  },
  {
    scene_id: 'scene_01_main',
    scene_name: '씬 1',
    image_prompt: 'Korean dramatic scene - SCENE 1'
  },
  {
    scene_id: 'scene_02_main',
    scene_name: '씬 2',
    image_prompt: 'Korean dramatic scene - SCENE 2'
  },
  {
    scene_id: 'scene_03_main',
    scene_name: '씬 3',
    image_prompt: 'Korean dramatic scene - SCENE 3'
  },
  {
    scene_id: 'scene_04_main',
    scene_name: '씬 4',
    image_prompt: 'Korean dramatic scene - SCENE 4'
  },
  {
    scene_id: 'scene_05_main',
    scene_name: '씬 5',
    image_prompt: 'Korean dramatic scene - SCENE 5'
  },
  {
    scene_id: 'scene_06_main',
    scene_name: '씬 6',
    image_prompt: 'Korean dramatic scene - SCENE 6'
  },
  {
    scene_id: 'scene_07_main',
    scene_name: '씬 7',
    image_prompt: 'Korean dramatic scene - SCENE 7'
  }
];

console.log('📊 === 이미지 크롤러 버그 분석 테스트 ===');
console.log(`총 씬 개수: ${testScenes.length}`);
console.log('\n예상 호출 순서:');
testScenes.forEach((scene, i) => {
  console.log(`  ${i}. ${scene.scene_id}: ${scene.image_prompt.substring(0, 40)}...`);
});

// 문제 분석
console.log('\n\n🔍 === 문제 분석 ===');
console.log('현재 코드의 문제점:');
console.log('');
console.log('1. input_prompt_to_whisk 함수 (라인 1070):');
console.log('   ```python');
console.log('   buttons = driver.find_elements(By.XPATH, f"//button[contains(...")]');
console.log('   for btn in buttons:');
console.log('       if btn.is_displayed() and btn.is_enabled():');
console.log('           btn.click()  # ← 모든 버튼을 클릭할 수 있음!');
console.log('   ```');
console.log('');
console.log('   문제: find_elements는 여러 버튼을 찾을 수 있으므로');
console.log('   모든 버튼이 클릭될 수 있습니다.');
console.log('');
console.log('2. 메인 루프 (라인 1434):');
console.log('   ```python');
console.log('   for i in range(len(scenes)):  # 8개 씬 반복');
console.log('       input_prompt_to_whisk(...)  # 각 씬 입력');
console.log('   ```');
console.log('');
console.log('   문제: 같은 입력창에 계속 입력하면서,');
console.log('   첫 번째 씬의 생성 버튼이 자동으로 여러 번 클릭될 수 있음.');
console.log('');

// 해결 방법
console.log('\n\n✅ === 해결 방법 ===');
console.log('');
console.log('1. 생성 버튼을 클릭할 때 break로 즉시 종료:');
console.log('   ```python');
console.log('   for btn in buttons:');
console.log('       if btn.is_displayed() and btn.is_enabled():');
console.log('           btn.click()');
console.log('           generate_button_found = True');
console.log('           break  # ← 첫 번째 버튼만 클릭 후 종료');
console.log('   ```');
console.log('');
console.log('2. 또는 더 구체적인 selector 사용:');
console.log('   - "Generate" 텍스트를 가진 버튼만 선택');
console.log('   - 가시적이고 활성화된 버튼만 선택');
console.log('   - 첫 번째 버튼만 선택하도록 limit 추가');
console.log('');
console.log('3. 각 씬 입력 후 충분한 대기 시간:');
console.log('   - 이미지 생성이 시작될 때까지 대기 (현재 구현됨)');
console.log('   - 하지만 첫 번째 프롬프트 입력 후 페이지 상태 확인');
console.log('');

// 테스트 케이스
console.log('\n\n🧪 === 테스트 시나리오 ===');
console.log('');
console.log('시나리오 1: 정상 흐름');
console.log('  1. 씬 0 프롬프트 입력 → 생성 버튼 클릭 (1번)');
console.log('  2. 씬 1 프롬프트 입력 → 생성 버튼 클릭 (1번)');
console.log('  3. ... (계속 정상)');
console.log('  결과: ✅ 씬당 1번씩 생성');
console.log('');
console.log('시나리오 2: 버그 발생');
console.log('  1. 씬 0 프롬프트 입력 → 생성 버튼 여러 개 발견');
console.log('  2. 모든 버튼 클릭되어 씬 0이 여러 번 생성');
console.log('  3. 다음 씬 입력 시도하지만 페이지 상태 이상');
console.log('  결과: ❌ 씬 1만 반복 생성 또는 생성 실패');
console.log('');

// 추가 확인 사항
console.log('\n\n🔎 === 확인 사항 ===');
console.log('');
console.log('1. 생성 버튼 찾기 로직:');
console.log('   - XPath: //button[contains(...)]');
console.log('   - 이는 여러 버튼을 반환할 수 있음');
console.log('');
console.log('2. 버튼 클릭 로직:');
console.log('   - for btn in buttons: 모든 버튼 반복');
console.log('   - break가 있으면 첫 번째 버튼만 클릭');
console.log('   - break가 없으면 모든 버튼 클릭');
console.log('');
console.log('3. 현재 코드 (라인 1068-1080):');
console.log('   - break가 있으므로 첫 번째 버튼만 클릭됨');
console.log('   - ✅ 이 부분은 정상');
console.log('');
console.log('4. Whisk 페이지 구조:');
console.log('   - 같은 페이지에서 계속 프롬프트 입력?');
console.log('   - 아니면 새로운 페이지로 이동?');
console.log('   - Whisk의 작동 방식 확인 필요');
console.log('');

console.log('\n\n💡 === 최종 제안 ===');
console.log('');
console.log('1. 로그 추가:');
console.log('   - 각 씬 입력 전후에 씬 번호 명확하게 로깅');
console.log('   - 생성 버튼 클릭 횟수 로깅');
console.log('   - 페이지 상태 변화 로깅');
console.log('');
console.log('2. 페이지 상태 확인:');
console.log('   - 각 씬 입력 후 페이지 URL 확인');
console.log('   - 각 씬 입력 후 생성 중 표시 확인');
console.log('');
console.log('3. 더 안전한 프롬프트 입력:');
console.log('   - 이전 프롬프트가 완전히 지워졌는지 확인');
console.log('   - 새로운 프롬프트가 완전히 입력되었는지 확인');
console.log('');

// 실제 테스트 파일 생성
const testFile = path.join(process.cwd(), 'test-scenes-debug.json');
fs.writeFileSync(testFile, JSON.stringify(testScenes, null, 2));
console.log(`\n✅ 테스트 씬 파일 생성: ${testFile}`);
console.log(`   이 파일을 사용하여 이미지 크롤러를 테스트하세요.`);
