/**
 * 🆓 로컬 제목 엔진 v2 (API 무료!)
 * - 규칙 기반 점수 평가
 * - 템플릿 기반 제목 생성
 * - 다양한 반전/직업 표현
 */

// ============================================================
// 키워드 및 설정
// ============================================================

const emotionKeywords = ['후회', '복수', '반전', '충격', '눈물', '감동', '배신', '비밀', '진실', '최후', '통쾌', '무릎', '사색', '경악', '분노', '용서'];
const hookEndings = ['이유', '진실', '비밀', '순간', '결말', '말', '표정', '반응', '결과'];
const timePatterns = [/\d+년\s*(후|만에|뒤|간)/, /\d+개월/, /\d+일/];

const categoryConfig: Record<string, { required: string[]; bonus: string[]; templates: string[] }> = {
  '시니어사연': {
    required: ['시어머니', '며느리', '고부', '시댁', '양로원', '노인', '할머니', '할아버지', '효도', '불효', '간병'],
    bonus: ['유산', '상속', '치매', '용서', '눈물', '후회'],
    templates: [
      '며느리를 {행위}했던 시어머니, {시간} 후 그녀가 {반전} 걸 알고 {훅}',
      '{시간}간 며느리를 {행위}했던 시어머니, 양로원에서 무릎 꿇은 {훅}',
      '시어머니가 숨겼던 {비밀}, {시간} 만에 밝혀지자 며느리가 {훅}',
      '간병하던 며느리를 내쫓은 시어머니, {시간} 후 치매 걸리자 벌어진 {훅}',
      '시댁에서 {행위}당했던 며느리, {시간} 후 {반전} 걸 알고 시어머니가 {훅}',
    ],
  },
  '복수극': {
    required: ['복수', '무시', 'CEO', '귀환', '배신', '회장', '사장', '갑질', '성공', '부자', '유명', '대기업'],
    bonus: ['통쾌', '무릎', '후회', '충격', '반전', '사색', '오열'],
    templates: [
      '{피해자}를 무시했던 {가해자}, {시간} 후 그녀가 {반전} 걸 알고 {훅}',
      '"{대사}" 비웃던 {가해자}, {시간} 후 {반전} 그녀 앞에서 {훅}',
      '갑질당했던 {피해자}가 {시간} 만에 성공하자 {가해자}이 보인 {훅}',
      '무시당했던 {피해자}, {시간} 후 {반전} 모습으로 귀환해 복수한 {훅}',
      '{피해자}를 괴롭혔던 {가해자}, {시간} 후 부자가 된 그녀를 보고 {훅}',
      '"{대사}" 모욕했던 그들, {시간} 후 {반전} 그녀가 나타나자 {훅}',
      '{시간}간 왕따시켰던 {가해자}, 성공한 그녀가 나타나자 {훅}',
      '회사에서 쫓겨난 {피해자}, {시간} 후 대기업 임원으로 복수한 {훅}',
    ],
  },
  '탈북자사연': {
    required: ['탈북', '북한', '남한', '자유', '대한민국', '탈북자', '북쪽'],
    bonus: ['통일', '눈물', '성공', '희망', '고향', '어머니'],
    templates: [
      '탈북 {시간} 만에 대한민국에서 {반전} 된 그녀의 {훅}',
      '북한에서 온 그녀, 남한에서 {시간} 만에 성공한 {훅}',
      '탈북자를 무시했던 사람들, {시간} 후 그녀가 {반전} 걸 알고 {훅}',
      '"북한 출신이 뭘 알아" 비웃던 그들, {시간} 후 벌어진 {훅}',
      '자유를 찾아 탈북한 그녀, {시간} 후 대한민국에서 {훅}',
    ],
  },
  '북한탈북자사연': {
    required: ['탈북', '북한', '남한', '자유', '대한민국', '탈북자', '북쪽'],
    bonus: ['통일', '눈물', '성공', '희망', '고향', '어머니'],
    templates: [
      '탈북 {시간} 만에 대한민국에서 {반전} 된 그녀의 {훅}',
      '북한에서 온 그녀, 남한에서 {시간} 만에 성공한 {훅}',
      '탈북자를 무시했던 사람들, {시간} 후 그녀가 {반전} 걸 알고 {훅}',
    ],
  },
  '막장드라마': {
    required: ['출생', '비밀', '재벌', '배다른', '친자', '유전자', '친아버지', '숨긴'],
    bonus: ['충격', '진실', 'DNA', '반전', '상속'],
    templates: [
      '{시간}간 숨겨왔던 출생의 비밀, 재벌가에서 밝혀진 {훅}',
      '친자가 아니었던 아들, {시간} 만에 드러난 {훅}',
      '재벌가의 비밀, 배다른 동생이 {시간} 후 밝혀낸 {훅}',
    ],
  },
};

const vocabulary = {
  피해자: ['청소부', '신입사원', '인턴', '막내', '알바생', '배달부', '경비원', '식당 아줌마', '파출부'],
  가해자: ['팀장', '선배들', '직원들', '상사', '동료들', '사장', '본부장', '임원들'],
  행위: ['무시', '멸시', '차별', '외면', '괴롭힘', '조롱', '왕따', '모욕'],
  시간: ['3년', '5년', '7년', '10년', '15년', '20년', '1년', '2년'],
  반전: [
    'CEO인', '재벌 딸인', '회장인', '억만장자인',
    '유명 유튜버인', '베스트셀러 작가인', '국회의원인', '검사인',
    '대기업 임원인', '연예인인', '의사인', '변호사인', '교수인',
    '스타트업 대표인', '세계적 요리사인', '톱스타 매니저인'
  ],
  훅: [
    '충격적인 이유', '소름돋는 진실', '눈물의 결말', '통쾌한 순간', '후회한 이유',
    '경악한 표정', '무릎 꿇은 이유', '사색이 된 이유', '눈물 흘린 이유',
    '땅을 친 이유', '오열한 순간', '간청한 말'
  ],
  비밀: ['출생의 비밀', '숨겨진 진실', '충격적 과거', '10년 전 비밀', '감춰진 정체'],
  대사: ['넌 평생 이렇게 살아', '네가 뭔데', '주제 파악해', '꺼져', '니가 감히?', '넌 안 돼', '분수를 알아'],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// 점수 평가 (튜닝됨)
// ============================================================

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export function evaluateTitleLocal(title: string, category: string): ScoreResult {
  let score = 40; // 기본 점수 40점
  const reasons: string[] = [];
  const config = categoryConfig[category];

  // 1. 길이 (최대 +15)
  const len = title.length;
  if (len >= 30 && len <= 60) { score += 15; reasons.push('✅ 길이'); }
  else if (len >= 20 && len < 30) { score += 8; }
  else if (len > 60 && len <= 75) { score += 8; }
  else { score -= 10; reasons.push('❌ 길이'); }

  // 2. 구조 (최대 +15)
  if (title.includes(',')) { score += 5; reasons.push('✅ 구조'); }
  if (/["']/.test(title)) { score += 5; reasons.push('✅ 인용'); }
  if (/했던.*[,]/.test(title) || /당했던/.test(title)) { score += 5; reasons.push('✅ 대립'); }

  // 3. 시간 (최대 +12)
  if (timePatterns.some(p => p.test(title))) { score += 12; reasons.push('✅ 시간'); }
  else if (/\d+/.test(title)) { score += 6; }

  // 4. 감정 (최대 +12)
  const emotionCount = emotionKeywords.filter(e => title.includes(e)).length;
  if (emotionCount >= 2) { score += 12; reasons.push(`✅ 감정x${emotionCount}`); }
  else if (emotionCount === 1) { score += 6; }
  else { score -= 5; }

  // 5. 훅 (최대 +10)
  if (hookEndings.some(h => title.includes(h))) { score += 10; reasons.push('✅ 훅'); }
  else { score -= 5; }

  // 6. 카테고리 (최대 +15, 페널티 -20)
  if (config) {
    const reqCount = config.required.filter(k => title.includes(k)).length;
    if (reqCount >= 2) { score += 15; reasons.push(`✅ 카테고리x${reqCount}`); }
    else if (reqCount === 1) { score += 8; }
    else { score -= 20; reasons.push('❌ 카테고리 없음'); }

    const bonusCount = config.bonus.filter(k => title.includes(k)).length;
    if (bonusCount > 0) { score += Math.min(bonusCount * 4, 8); reasons.push(`✅ 보너스x${bonusCount}`); }
  }

  // 7. 주어 명확성 (+8)
  if (/그들|그녀|그가|그 앞/.test(title)) { score += 8; reasons.push('✅ 주어'); }

  // 8. 과거-현재 대비 (+7)
  if (/했던.*후|했던.*만에|당했던.*후/.test(title)) { score += 7; reasons.push('✅ 대비'); }

  return { score: Math.min(100, Math.max(0, score)), reasons };
}

// ============================================================
// 제목 생성
// ============================================================

export function generateTitleLocal(category: string): string | null {
  const config = categoryConfig[category];
  if (!config) return null;

  const template = pickRandom(config.templates);
  let title = template;

  // 플레이스홀더 치환
  title = title.replace('{피해자}', pickRandom(vocabulary.피해자));
  title = title.replace('{가해자}', pickRandom(vocabulary.가해자));
  title = title.replace('{행위}', pickRandom(vocabulary.행위));
  title = title.replace('{시간}', pickRandom(vocabulary.시간));
  title = title.replace('{반전}', pickRandom(vocabulary.반전));
  title = title.replace('{훅}', pickRandom(vocabulary.훅));
  title = title.replace('{비밀}', pickRandom(vocabulary.비밀));
  title = title.replace('{대사}', pickRandom(vocabulary.대사));

  return title;
}

export function generateTitlesLocal(category: string, count: number = 5): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count * 3 && titles.length < count; i++) {
    const title = generateTitleLocal(category);
    if (title && !seen.has(title)) {
      titles.push(title);
      seen.add(title);
    }
  }

  return titles;
}

// ============================================================
// 배틀 & 최적 선택
// ============================================================

export function battleTitlesLocal(title1: string, title2: string, category: string) {
  const result1 = evaluateTitleLocal(title1, category);
  const result2 = evaluateTitleLocal(title2, category);

  return {
    winner: result1.score >= result2.score ? title1 : title2,
    loser: result1.score >= result2.score ? title2 : title1,
    score1: result1.score,
    score2: result2.score,
  };
}

export function generateOptimalTitleLocal(category: string, count: number = 5): {
  title: string;
  score: number;
  alternatives: { title: string; score: number }[];
} {
  const titles = generateTitlesLocal(category, count);

  const scored = titles.map(title => ({
    title,
    ...evaluateTitleLocal(title, category),
  }));

  scored.sort((a, b) => b.score - a.score);

  return {
    title: scored[0]?.title || '',
    score: scored[0]?.score || 0,
    alternatives: scored.slice(1, 4).map(s => ({ title: s.title, score: s.score })),
  };
}
