/**
 * Ollama 로컬 LLM으로 대량 제목 생성
 * 90점 이상만 필터링 → Claude 검증 → DB 저장
 */

const Database = require('better-sqlite3');
const path = require('path');

// === 설정 ===
const OLLAMA_MODEL = 'qwen2.5:7b'; // 또는 'llama3.1:8b'
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const BATCH_SIZE = 100; // 한 번에 생성할 개수
const MIN_SCORE = 90; // 최소 점수
const CATEGORIES = [
  '시니어사연',
  '복수극',
  '탈북자사연',
  '막장드라마'
];

// === 규칙 기반 점수 평가 ===
function evaluateTitleWithRules(title, category) {
  let score = 0;

  // 1. 제목 길이 (20-60자 최적)
  const length = title.length;
  if (length >= 20 && length <= 60) {
    score += 30;
  } else if (length >= 15 && length < 20) {
    score += 20;
  } else if (length > 60 && length <= 80) {
    score += 20;
  } else if (length < 15) {
    score += 5;
  } else {
    score += 10;
  }

  // 2. 특수문자 (호기심 유발)
  if (title.includes('?')) score += 10;
  if (title.includes('!')) score += 8;
  if (title.includes('...')) score += 5;
  if (title.includes('"') || title.includes("'")) score += 5;

  // 3. 감정 키워드
  const emotionalKeywords = [
    '후회', '복수', '반전', '충격', '눈물', '감동',
    '배신', '비밀', '진실', '최후', '귀환', '성공',
    '통쾌', '화려', '무릎', '외면', '당당', '전설',
    '알고보니', '결국', '드디어', '끝판왕', '최고'
  ];

  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) {
      emotionalCount++;
    }
  }
  score += Math.min(emotionalCount * 5, 20);

  // 4. 숫자 포함
  if (/\d+/.test(title)) {
    score += 8;
  }

  // 5. 카테고리 키워드
  const categoryKeywords = {
    '시니어사연': ['시어머니', '며느리', '고부갈등', '시댁', '양로원'],
    '복수극': ['복수', '무시', 'CEO', '귀환', '배신자', '신입'],
    '탈북자사연': ['탈북', '북한', '남한', '자유', '대한민국'],
    '막장드라마': ['출생', '비밀', '재벌', '배다른', '친자확인'],
  };

  const keywords = categoryKeywords[category] || [];
  let categoryCount = 0;
  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      categoryCount++;
    }
  }
  score += Math.min(categoryCount * 7, 15);

  // 6. 문장 구조
  const hasComma = (title.match(/,/g) || []).length;
  if (hasComma >= 1 && hasComma <= 2) {
    score += 7;
  }

  return Math.min(100, Math.max(0, score));
}

// === 유사도 체크 (자카드 유사도) ===
function calculateSimilarity(str1, str2) {
  const set1 = new Set(str1.split(''));
  const set2 = new Set(str2.split(''));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

// === Ollama로 제목 생성 ===
async function generateWithOllama(category, count) {
  const prompt = `유튜브 ${category} 카테고리의 제목을 ${count}개 생성해주세요.

요구사항:
- 40~60자 길이
- 클릭을 유도하는 자극적 제목
- 호기심을 자극하는 제목
- 반전, 갈등, 감동 요소 포함
- 각 제목은 한 줄에 하나씩
- 번호나 기호 없이 제목만 출력

제목:`;

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.9,
        top_p: 0.95
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama 오류: ${response.statusText}`);
  }

  const data = await response.json();
  const titles = data.response
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.match(/^[\d.]+\s/));

  return titles;
}

// === Claude로 최종 검증 ===
async function validateWithClaude(title, category) {
  // TODO: Claude API 호출로 제목 품질 검증
  // 지금은 90점 이상이면 통과로 가정
  return true;
}

// === 메인 배치 프로세스 ===
async function batchGenerate() {
  console.log('🚀 Ollama 배치 제목 생성 시작...\n');

  const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
  const db = new Database(dbPath);

  // 고품질 제목 풀 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS title_pool (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      score INTEGER NOT NULL,
      validated INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, title)
    );
  `);

  const stats = {
    total: 0,
    generated: 0,
    highScore: 0,
    validated: 0,
    duplicates: 0
  };

  for (const category of CATEGORIES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📂 카테고리: ${category}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 기존 제목 가져오기 (중복 체크용)
    const existingTitles = db.prepare(
      'SELECT title FROM title_pool WHERE category = ?'
    ).all(category).map(row => row.title);

    console.log(`📊 기존 제목 수: ${existingTitles.length}개`);

    for (let batch = 0; batch < 10; batch++) {
      console.log(`\n[배치 ${batch + 1}/10] ${BATCH_SIZE}개 생성 중...`);

      try {
        const titles = await generateWithOllama(category, BATCH_SIZE);
        stats.generated += titles.length;
        console.log(`✅ ${titles.length}개 생성 완료`);

        // 점수 평가 및 필터링
        const scoredTitles = titles.map(title => ({
          title,
          score: evaluateTitleWithRules(title, category)
        }));

        const highScoreTitles = scoredTitles.filter(t => t.score >= MIN_SCORE);
        stats.highScore += highScoreTitles.length;
        console.log(`🎯 ${MIN_SCORE}점 이상: ${highScoreTitles.length}개`);

        // 유사도 체크 및 저장
        let saved = 0;
        for (const item of highScoreTitles) {
          // 기존 제목과 유사도 체크
          let isDuplicate = false;
          for (const existing of existingTitles) {
            const similarity = calculateSimilarity(item.title, existing);
            if (similarity > 0.7) { // 70% 이상 유사하면 중복
              isDuplicate = true;
              stats.duplicates++;
              break;
            }
          }

          if (!isDuplicate) {
            const id = `pool_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

            try {
              db.prepare(`
                INSERT INTO title_pool (id, category, title, score)
                VALUES (?, ?, ?, ?)
              `).run(id, category, item.title, item.score);

              existingTitles.push(item.title);
              saved++;

              console.log(`  ✓ [${item.score}점] ${item.title}`);
            } catch (err) {
              // 중복 (UNIQUE 제약)
              stats.duplicates++;
            }
          }
        }

        console.log(`💾 저장: ${saved}개 (중복 ${highScoreTitles.length - saved}개)`);
        stats.total += saved;

        // 딜레이 (Ollama 과부하 방지)
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ 배치 생성 실패:`, error.message);
      }
    }
  }

  db.close();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 배치 생성 완료!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 생성된 제목: ${stats.generated}개`);
  console.log(`🎯 ${MIN_SCORE}점 이상: ${stats.highScore}개`);
  console.log(`💾 저장된 제목: ${stats.total}개`);
  console.log(`🔄 중복 제거: ${stats.duplicates}개`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

// 실행
if (require.main === module) {
  batchGenerate().catch(console.error);
}

module.exports = { batchGenerate, evaluateTitleWithRules };
