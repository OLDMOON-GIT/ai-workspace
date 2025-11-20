const fs = require('fs');
const path = require('path');

// .env.local 파일 로드
function loadEnv() {
  const envPath = path.join(__dirname, 'trend-video-frontend/.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('⚠️ .env.local 파일이 없습니다.');
    return {};
  }
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  return env;
}

const env = loadEnv();

if (!env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY가 .env.local에 없습니다.');
  process.exit(1);
}

// 프롬프트 파일 로드
const promptPath = path.join(__dirname, 'trend-video-frontend/prompts/prompt_shortform.txt');
const promptTemplate = fs.readFileSync(promptPath, 'utf-8');

// 테스트 제목
const testTitle = "며느리가 시어머니에게 준 찬밥, 친정에 전화한통으로 사색이 된 며느리";

// 프롬프트 완성
const prompt = promptTemplate.replace('{title}', testTitle);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 숏폼 8개 씬 구조 테스트');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('제목:', testTitle);
console.log('모델: gpt-4o');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function testShortform() {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 오류: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // JSON 파싱
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error('❌ JSON 파싱 실패:', e.message);
      console.log('\n생성된 내용:\n', content.substring(0, 500));
      throw e;
    }

    // 결과 검증
    console.log('✅ JSON 생성 성공!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 검증 결과:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const checks = {
      'version': result.version === 'shortform-3.0' ? '✅' : '❌',
      'scene_count': result.scenes?.length === 8 ? '✅' : '❌',
      'total_duration': result.metadata?.estimated_duration_seconds >= 100 ? '✅' : '❌',
      'total_word_count': result.metadata?.total_word_count >= 700 ? '✅' : '❌',
    };

    console.log(`${checks.version} 버전: ${result.version}`);
    console.log(`${checks.scene_count} 씬 개수: ${result.scenes?.length}개`);
    console.log(`${checks.total_duration} 총 길이: ${result.metadata?.estimated_duration_seconds}초`);
    console.log(`${checks.total_word_count} 총 글자수: ${result.metadata?.total_word_count}자`);

    // 각 씬 검증
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 씬별 상세 내용:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    result.scenes.forEach((scene, idx) => {
      const wordCount = scene.narration?.length || 0;
      const expectedCounts = [40, 100, 130, 130, 130, 130, 100, 140];
      const tolerance = 30; // ±30자 허용
      const isCorrectLength = Math.abs(wordCount - expectedCounts[idx]) <= tolerance;

      console.log(`\n【씬 ${idx}: ${scene.scene_name}】`);
      console.log(`⏱️  ${scene.duration_seconds}초 / 📝 ${wordCount}자 ${isCorrectLength ? '✅' : '⚠️ (예상: ' + expectedCounts[idx] + '자)'}`);
      console.log(`💬 ${scene.narration}`);
    });

    // CTA 확인
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 CTA 검증:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const lastScene = result.scenes[7];
    const hasCTA = lastScene?.narration?.includes('구독') && lastScene?.narration?.includes('좋아요');
    console.log(hasCTA ? '✅ 씬 7에 CTA 포함됨' : '❌ 씬 7에 CTA 없음');

    if (!hasCTA) {
      console.log('⚠️ 마지막 씬:', lastScene?.narration);
    }

    // 재미/감동 체크
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('😊 재미/감동 체크:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const fullStory = result.scenes.map(s => s.narration).join(' ');

    // 대화 체크 (따옴표 사용)
    const hasDialogue = fullStory.includes('"') || fullStory.includes("'");
    console.log(hasDialogue ? '✅ 대화 포함' : '⚠️ 대화 없음 (건조할 수 있음)');

    // 감정 단어 체크
    const emotionWords = ['눈물', '떨', '한숨', '웃', '울', '소리', '외쳤', '말했'];
    const hasEmotion = emotionWords.some(word => fullStory.includes(word));
    console.log(hasEmotion ? '✅ 감정 표현 풍부' : '⚠️ 감정 표현 부족');

    // 설명투 체크
    const descCount = (fullStory.match(/습니다\./g) || []).length;
    console.log(descCount > 10 ? `⚠️ 설명투 과다 (${descCount}회)` : `✅ 설명투 적절 (${descCount}회)`);

    // 파일 저장
    const outputPath = path.join(__dirname, 'test-shortform-output.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 결과 저장: ${outputPath}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    process.exit(1);
  }
}

testShortform();
