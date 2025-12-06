import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 카테고리별 예시 제목 (80점 이상 고품질 제목)
const categoryExamples: Record<string, string[]> = {
  '시니어사연': [
    '며느리를 내쫓았던 시어머니, 3년 후 양로원에서 무릎 꿇고 빌어야 했던 이유',
    '20년간 며느리를 괴롭혔던 시어머니가 결국 혼자 남겨진 충격적 진실',
    '무시당했던 며느리가 10년 후 성공한 사업가로 나타나자 벌어진 일',
    '며느리를 내쫓았던 시어머니, 그녀가 재벌가 딸이란 걸 알고 후회한 순간',
  ],
  '복수극': [
    '청소부를 무시했던 직원들, 5년 후 그녀가 CEO로 나타나자 사색이 된 이유',
    '무능력자 취급했던 팀장들, 그가 전설의 해커였다는 사실을 알고 벌어진 일',
    '배신했던 동료들이 그녀의 귀환 소식을 듣고 회사를 떠난 통쾌한 복수극',
    '왕따시켰던 학생들, 20년 후 판사가 된 그를 법정에서 만난 충격의 순간',
  ],
  '탈북자사연': [
    '탈북 후 10년, 무시당했던 그녀가 당당한 대한민국 변호사로 성공한 이유',
    '북한 출신이라 차별받던 청년, 5년 만에 대기업 임원이 된 눈물겨운 스토리',
    '탈북 여성이 겪은 남한의 충격, 자유를 찾기까지 7년간의 처절한 투쟁',
    '북한에서 온 그녀, 한국말도 서툴렀지만 3년 만에 유튜버로 성공한 비결',
  ],
  '북한탈북자사연': [
    '탈북 후 10년, 무시당했던 그녀가 당당한 대한민국 변호사로 성공한 이유',
    '북한 출신이라 차별받던 청년, 5년 만에 대기업 임원이 된 눈물겨운 스토리',
    '탈북 여성이 겪은 남한의 충격, 자유를 찾기까지 7년간의 처절한 투쟁',
    '북한에서 온 그녀, 한국말도 서툴렀지만 3년 만에 유튜버로 성공한 비결',
  ],
  '막장드라마': [
    '출생의 비밀, 평생 무시당했던 남자가 알고보니 재벌가 장남이었던 반전',
    '배다른 동생의 배신, 15년 만에 밝혀진 친자확인서의 충격적인 진실',
    '재벌가의 추악한 비밀, 사랑과 욕망이 뒤엉킨 30년 만의 복수극',
    '친자가 아니었던 아들, 평생 재산을 빼앗긴 후 찾아낸 놀라운 진실',
  ],
};

// 카테고리별 필수 키워드 (제목에 반드시 포함되어야 함)
function getCategoryInstruction(category: string): string {
  const instructions: Record<string, string> = {
    '탈북자사연': '🚨 필수: 반드시 "탈북", "북한", "남한", "탈북자", "대한민국" 등 북한 관련 키워드가 포함되어야 합니다!',
    '북한탈북자사연': '🚨 필수: 반드시 "탈북", "북한", "남한", "탈북자", "대한민국" 등 북한 관련 키워드가 포함되어야 합니다!',
    '시니어사연': '🚨 필수: 반드시 "시어머니", "며느리", "시댁", "고부갈등", "노인", "양로원" 등 시니어 관련 키워드가 포함되어야 합니다!',
    '복수극': '🚨 필수: 반드시 "복수", "무시", "CEO", "귀환", "배신" 등 복수극 관련 키워드가 포함되어야 합니다!',
    '막장드라마': '🚨 필수: 반드시 "출생 비밀", "재벌", "배다른", "친자확인", "숨겨진 아이" 등 막장드라마 키워드가 포함되어야 합니다!',
    '감동실화': '🚨 필수: 반드시 감동적인 실제 이야기로, 가족/사랑/희생/성공 관련 스토리여야 합니다!',
  };
  return instructions[category] || '';
}

// Claude로 제목 생성
export async function generateTitlesWithClaude(category: string, count: number = 3): Promise<string[]> {
  try {
    const examples = categoryExamples[category] || [];
    const examplesText = examples.length > 0
      ? `[${category}]\n${examples.join('\n')}`
      : `카테고리: ${category}`;
    const categoryInstruction = getCategoryInstruction(category);

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 고품질 예시 제목들을 분석하여, 같은 수준의 제목 ${count}개를 생성해주세요.

${categoryInstruction ? categoryInstruction + '\n\n' : ''}${examplesText}

⚠️ 필수 - 주어 명확성 규칙:
❌ 잘못된 예: "무시당했던 청소부, CEO로 성공한 비결"
   → 누가 CEO가 됐는지 애매함 (청소부? 무시하던 사람?)
❌ 잘못된 예: "효자를 학대했던, 30년 만에 펑펑 울어버렸다"
   → 주어 누락, 문장 비문법적, 맥락 불명확

✅ 올바른 예:
   → "청소부를 무시했던 그들, CEO가 된 그녀 앞에서 무릎 꿇은 이유"
   → "무시당했던 그녀가 CEO로 성공하자, 후회하기 시작한 사람들"
   → "가난했던 시절 자신을 무시했던 사람들 앞에 CEO로 나타난 그녀"
   → "효자를 학대했던 시어머니가 30년 후 그 앞에서 펑펑 울어버린 충격적 이유"

🔥 제목 패턴 (다양한 구조 사용, 한 가지만 쓰지 말 것):

패턴 A - 이중 주어 + 시간 변화:
"[가해자]를 [행동]했던 [피해자], [시간] 후 [반전] [결말]"
예: "청소부를 무시했던 직원들, 10년 후 CEO가 된 그녀 앞에서 사색이 된 이유"

패턴 B - 순차 전개형:
"[과거 행동]한 [가해자], [시간] 만에 [피해자 변화], 결국 [가해자 결말]"
예: "며느리를 내쫓았던 시어머니, 3년 후 성공한 사업가로 돌아온 그녀를 보고 무릎 꿇을 수밖에 없었던 이유"

패턴 C - 역전 서사형:
"[과거 상황]에서 [무시/차별]받았던 [피해자], [시간] 후 [성공], [가해자]가 후회한 순간"
예: "북한 출신이라 차별받았던 청년이 5년 만에 대기업 임원이 되자, 그를 무시했던 사람들이 후회하기 시작한 이유"

패턴 D - 비밀 폭로형:
"[행동]했던 [가해자], 알고보니 [피해자]가 [숨겨진 신분]이었다는 사실에 [반응]"
예: "청소부를 무시했던 직원들, 그녀가 알고보니 회장 딸이었다는 사실을 알고 벌어진 충격의 순간"

패턴 E - 복수 완성형:
"[피해자]를 [가해 행동]했던 [가해자]들이 [시간] 후 [피해자 변화]를 보고 [결말]"
예: "왕따시켰던 학생들이 20년 후 판사가 된 그를 법정에서 만나고 사색이 된 이유"

핵심 요구사항 (90점 이상 필수 조건):
1. **45~70자 길이** (더 길고 구체적으로! 짧으면 90점 미만 처리)
2. **완전한 문장** (주어, 서술어 명확, 비문 절대 금지)
3. **구체적 숫자/시간**: "3년 후", "10년 만에", "20년 동안", "15년 만에"
4. **과거-현재 명확한 대비**: [과거 신분] → [현재 신분]
5. **인과관계 명확**: 누가 무엇을 했고, 누가 어떻게 변했는지 명확
6. **강한 훅 결말**: "이유", "진실", "순간", "말", "비밀", "방법"
7. **위 5가지 패턴 중 하나 무조건 사용** (다양성 확보)
8. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 1.0,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const titles = content.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^[\d.]+\s/))
      .slice(0, count);

    return titles;
  } catch (error: any) {
    console.error('Claude 제목 생성 실패:', error);
    return [];
  }
}

// ChatGPT로 제목 생성
export async function generateTitlesWithChatGPT(category: string, count: number = 3): Promise<string[]> {
  try {
    const examples = categoryExamples[category] || [];
    const examplesText = examples.length > 0
      ? `[${category}]\n${examples.join('\n')}`
      : `카테고리: ${category}`;
    const categoryInstruction = getCategoryInstruction(category);

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 고품질 예시 제목들을 분석하여, 같은 수준의 제목 ${count}개를 생성해주세요.

${categoryInstruction ? categoryInstruction + '\n\n' : ''}${examplesText}

⚠️ 필수 - 주어 명확성 규칙:
❌ 잘못된 예: "무시당했던 청소부, CEO로 성공한 비결"
   → 누가 CEO가 됐는지 애매함 (청소부? 무시하던 사람?)
❌ 잘못된 예: "효자를 학대했던, 30년 만에 펑펑 울어버렸다"
   → 주어 누락, 문장 비문법적, 맥락 불명확

✅ 올바른 예:
   → "청소부를 무시했던 그들, CEO가 된 그녀 앞에서 무릎 꿇은 이유"
   → "무시당했던 그녀가 CEO로 성공하자, 후회하기 시작한 사람들"
   → "가난했던 시절 자신을 무시했던 사람들 앞에 CEO로 나타난 그녀"
   → "효자를 학대했던 시어머니가 30년 후 그 앞에서 펑펑 울어버린 충격적 이유"

🔥 제목 패턴 (다양한 구조 사용, 한 가지만 쓰지 말 것):

패턴 A - 이중 주어 + 시간 변화:
"[가해자]를 [행동]했던 [피해자], [시간] 후 [반전] [결말]"
예: "청소부를 무시했던 직원들, 10년 후 CEO가 된 그녀 앞에서 사색이 된 이유"

패턴 B - 순차 전개형:
"[과거 행동]한 [가해자], [시간] 만에 [피해자 변화], 결국 [가해자 결말]"
예: "며느리를 내쫓았던 시어머니, 3년 후 성공한 사업가로 돌아온 그녀를 보고 무릎 꿇을 수밖에 없었던 이유"

패턴 C - 역전 서사형:
"[과거 상황]에서 [무시/차별]받았던 [피해자], [시간] 후 [성공], [가해자]가 후회한 순간"
예: "북한 출신이라 차별받았던 청년이 5년 만에 대기업 임원이 되자, 그를 무시했던 사람들이 후회하기 시작한 이유"

패턴 D - 비밀 폭로형:
"[행동]했던 [가해자], 알고보니 [피해자]가 [숨겨진 신분]이었다는 사실에 [반응]"
예: "청소부를 무시했던 직원들, 그녀가 알고보니 회장 딸이었다는 사실을 알고 벌어진 충격의 순간"

패턴 E - 복수 완성형:
"[피해자]를 [가해 행동]했던 [가해자]들이 [시간] 후 [피해자 변화]를 보고 [결말]"
예: "왕따시켰던 학생들이 20년 후 판사가 된 그를 법정에서 만나고 사색이 된 이유"

핵심 요구사항 (90점 이상 필수 조건):
1. **45~70자 길이** (더 길고 구체적으로! 짧으면 90점 미만 처리)
2. **완전한 문장** (주어, 서술어 명확, 비문 절대 금지)
3. **구체적 숫자/시간**: "3년 후", "10년 만에", "20년 동안", "15년 만에"
4. **과거-현재 명확한 대비**: [과거 신분] → [현재 신분]
5. **인과관계 명확**: 누가 무엇을 했고, 누가 어떻게 변했는지 명확
6. **강한 훅 결말**: "이유", "진실", "순간", "말", "비밀", "방법"
7. **위 5가지 패턴 중 하나 무조건 사용** (다양성 확보)
8. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 1.0,
      max_tokens: 1024,
    });

    const text = completion.choices[0]?.message?.content || '';
    const titles = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^[\d.]+\s/))
      .slice(0, count);

    return titles;
  } catch (error: any) {
    console.error('ChatGPT 제목 생성 실패:', error);
    return [];
  }
}

// Gemini로 제목 생성
export async function generateTitlesWithGemini(category: string, count: number = 3): Promise<string[]> {
  try {
    const examples = categoryExamples[category] || [];
    const examplesText = examples.length > 0
      ? `[${category}]\n${examples.join('\n')}`
      : `카테고리: ${category}`;
    const categoryInstruction = getCategoryInstruction(category);

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 고품질 예시 제목들을 분석하여, 같은 수준의 제목 ${count}개를 생성해주세요.

${categoryInstruction ? categoryInstruction + '\n\n' : ''}${examplesText}

⚠️ 필수 - 주어 명확성 규칙:
❌ 잘못된 예: "무시당했던 청소부, CEO로 성공한 비결"
   → 누가 CEO가 됐는지 애매함 (청소부? 무시하던 사람?)
❌ 잘못된 예: "효자를 학대했던, 30년 만에 펑펑 울어버렸다"
   → 주어 누락, 문장 비문법적, 맥락 불명확

✅ 올바른 예:
   → "청소부를 무시했던 그들, CEO가 된 그녀 앞에서 무릎 꿇은 이유"
   → "무시당했던 그녀가 CEO로 성공하자, 후회하기 시작한 사람들"
   → "가난했던 시절 자신을 무시했던 사람들 앞에 CEO로 나타난 그녀"
   → "효자를 학대했던 시어머니가 30년 후 그 앞에서 펑펑 울어버린 충격적 이유"

🔥 제목 패턴 (다양한 구조 사용, 한 가지만 쓰지 말 것):

패턴 A - 이중 주어 + 시간 변화:
"[가해자]를 [행동]했던 [피해자], [시간] 후 [반전] [결말]"
예: "청소부를 무시했던 직원들, 10년 후 CEO가 된 그녀 앞에서 사색이 된 이유"

패턴 B - 순차 전개형:
"[과거 행동]한 [가해자], [시간] 만에 [피해자 변화], 결국 [가해자 결말]"
예: "며느리를 내쫓았던 시어머니, 3년 후 성공한 사업가로 돌아온 그녀를 보고 무릎 꿇을 수밖에 없었던 이유"

패턴 C - 역전 서사형:
"[과거 상황]에서 [무시/차별]받았던 [피해자], [시간] 후 [성공], [가해자]가 후회한 순간"
예: "북한 출신이라 차별받았던 청년이 5년 만에 대기업 임원이 되자, 그를 무시했던 사람들이 후회하기 시작한 이유"

패턴 D - 비밀 폭로형:
"[행동]했던 [가해자], 알고보니 [피해자]가 [숨겨진 신분]이었다는 사실에 [반응]"
예: "청소부를 무시했던 직원들, 그녀가 알고보니 회장 딸이었다는 사실을 알고 벌어진 충격의 순간"

패턴 E - 복수 완성형:
"[피해자]를 [가해 행동]했던 [가해자]들이 [시간] 후 [피해자 변화]를 보고 [결말]"
예: "왕따시켰던 학생들이 20년 후 판사가 된 그를 법정에서 만나고 사색이 된 이유"

핵심 요구사항 (90점 이상 필수 조건):
1. **45~70자 길이** (더 길고 구체적으로! 짧으면 90점 미만 처리)
2. **완전한 문장** (주어, 서술어 명확, 비문 절대 금지)
3. **구체적 숫자/시간**: "3년 후", "10년 만에", "20년 동안", "15년 만에"
4. **과거-현재 명확한 대비**: [과거 신분] → [현재 신분]
5. **인과관계 명확**: 누가 무엇을 했고, 누가 어떻게 변했는지 명확
6. **강한 훅 결말**: "이유", "진실", "순간", "말", "비밀", "방법"
7. **위 5가지 패턴 중 하나 무조건 사용** (다양성 확보)
8. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const titles = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^[\d.]+\s/))
      .slice(0, count);

    return titles;
  } catch (error: any) {
    console.error('Gemini 제목 생성 실패:', error);
    return [];
  }
}

// 제목 점수 평가 (Claude 사용) - 엄격한 평가
export async function evaluateTitleScore(title: string, category: string): Promise<number> {
  try {
    const prompt = `유튜브 제목 평가 전문가로서, 다음 제목을 0-100점으로 엄격하게 평가해주세요.

카테고리: ${category}
제목: "${title}"

⚠️ 엄격한 평가 기준 (하나라도 부족하면 감점):

1. 문법 및 완결성 (30점) - 매우 중요!
   - 주어와 서술어가 명확한 완전한 문장인가?
   - 비문법적 표현 없는가?
   - "~했던," 으로만 끝나지 않는가?
   - 문장이 중간에 끊기지 않는가?

2. 길이 적절성 (20점)
   - 45~70자 범위인가? (40자 미만: -20점, 70자 초과: -10점)
   - 너무 짧거나 너무 길면 큰 감점

3. 주어 명확성 (20점)
   - 누가 무엇을 했는지 명확한가?
   - 주어가 2개 이상 등장하는가? (가해자 + 피해자)
   - 애매한 표현 없는가?

4. 스토리 구체성 (15점)
   - 구체적 숫자나 시간이 있는가? ("3년 후", "10년 만에")
   - 과거-현재 대비가 명확한가?
   - 변화의 정도가 구체적인가?

5. 감정적 임팩트 (10점)
   - 감정을 자극하는 키워드가 있는가?
   - 공감을 이끌어내는가?

6. 클릭 유도성 (5점)
   - "이유", "진실", "순간" 등 훅이 있는가?
   - 끝까지 보고 싶게 만드는가?

감점 예시:
- 비문법적 문장: -30점
- 주어 누락: -20점
- 40자 미만: -20점
- 시간/숫자 없음: -10점
- 맥락 불명확: -15점

점수만 숫자로 답변해주세요. (예: 78)
⚠️ 비문법적 제목이거나 주어가 불명확하면 70점 이하로 평가하세요!`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 100,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return 50; // 기본값
    }

    const scoreMatch = content.text.match(/\d+/);
    const score = scoreMatch ? parseInt(scoreMatch[0]) : 50;

    return Math.min(100, Math.max(0, score)); // 0-100 범위로 제한

  } catch (error: any) {
    console.error('제목 점수 평가 실패:', error);
    return 50; // 에러 시 중간 점수
  }
}

// ============================================================
// 🔥 제목 자동 업그레이드 (저점수 → 고점수 리라이팅)
// ============================================================
export async function upgradeTitleWithAI(
  title: string,
  currentScore: number,
  category: string,
  targetScore: number = 90
): Promise<{ upgradedTitle: string; newScore: number; improvements: string[] }> {
  try {
    const examples = categoryExamples[category] || [];
    const categoryInstruction = getCategoryInstruction(category);

    const prompt = `당신은 유튜브 제목 업그레이드 전문가입니다.

현재 제목: "${title}"
현재 점수: ${currentScore}점
목표 점수: ${targetScore}점 이상
카테고리: ${category}

${categoryInstruction}

고품질 예시:
${examples.slice(0, 3).join('\n')}

문제점을 분석하고, ${targetScore}점 이상이 되도록 제목을 업그레이드해주세요.

응답 형식 (JSON):
{
  "upgradedTitle": "업그레이드된 제목",
  "improvements": ["개선점1", "개선점2", "개선점3"],
  "expectedScore": 예상점수
}`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response');
    }

    // JSON 파싱
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON not found in response');
    }

    const result = JSON.parse(jsonMatch[0]);
    const newScore = await evaluateTitleScore(result.upgradedTitle, category);

    console.log(`[Upgrade] 🔥 "${title}" (${currentScore}점) → "${result.upgradedTitle}" (${newScore}점)`);

    return {
      upgradedTitle: result.upgradedTitle,
      newScore,
      improvements: result.improvements || [],
    };
  } catch (error: any) {
    console.error('제목 업그레이드 실패:', error);
    return { upgradedTitle: title, newScore: currentScore, improvements: [] };
  }
}

// ============================================================
// ⚔️ 제목 배틀 (두 제목 중 승자 선택)
// ============================================================
export async function titleBattle(
  title1: string,
  title2: string,
  category: string
): Promise<{ winner: string; loser: string; reason: string; scores: { title1: number; title2: number } }> {
  try {
    const prompt = `당신은 유튜브 제목 심판관입니다. 두 제목 중 더 클릭을 유도할 제목을 선택해주세요.

카테고리: ${category}

제목 A: "${title1}"
제목 B: "${title2}"

평가 기준:
1. 호기심 유발력
2. 주어 명확성
3. 감정적 임팩트
4. 클릭베이트 효과
5. 카테고리 적합성

응답 형식 (JSON):
{
  "winner": "A" 또는 "B",
  "scoreA": 0-100,
  "scoreB": 0-100,
  "reason": "승자 선택 이유 (한 문장)"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON not found');
    }

    const result = JSON.parse(jsonMatch[0]);
    const winner = result.winner === 'A' ? title1 : title2;
    const loser = result.winner === 'A' ? title2 : title1;

    console.log(`[Battle] ⚔️ 승자: "${winner}" vs 패자: "${loser}"`);
    console.log(`[Battle] 이유: ${result.reason}`);

    return {
      winner,
      loser,
      reason: result.reason,
      scores: { title1: result.scoreA, title2: result.scoreB },
    };
  } catch (error: any) {
    console.error('제목 배틀 실패:', error);
    // 에러 시 랜덤 선택
    const random = Math.random() > 0.5;
    return {
      winner: random ? title1 : title2,
      loser: random ? title2 : title1,
      reason: '평가 실패로 랜덤 선택',
      scores: { title1: 50, title2: 50 },
    };
  }
}

// ============================================================
// 🧬 제목 진화 (성공 패턴 학습)
// ============================================================

// 성공 패턴 저장소 (메모리)
const successPatterns: Map<string, { pattern: string; score: number; count: number }[]> = new Map();

export function learnFromSuccessfulTitle(category: string, title: string, score: number) {
  if (score < 90) return; // 90점 이상만 학습

  // 패턴 추출
  const patterns = extractTitlePatterns(title);

  if (!successPatterns.has(category)) {
    successPatterns.set(category, []);
  }

  const categoryPatterns = successPatterns.get(category)!;

  for (const pattern of patterns) {
    const existing = categoryPatterns.find((p) => p.pattern === pattern);
    if (existing) {
      existing.score = (existing.score + score) / 2; // 평균 점수
      existing.count++;
    } else {
      categoryPatterns.push({ pattern, score, count: 1 });
    }
  }

  // 상위 10개만 유지
  categoryPatterns.sort((a, b) => b.score * b.count - a.score * a.count);
  if (categoryPatterns.length > 10) {
    categoryPatterns.length = 10;
  }

  console.log(`[Evolution] 🧬 "${category}" 패턴 학습: ${patterns.join(', ')}`);
}

function extractTitlePatterns(title: string): string[] {
  const patterns: string[] = [];

  // 시간 패턴: "N년 후", "N년 만에"
  if (/\d+년\s*(후|만에|뒤)/.test(title)) patterns.push('시간_변화');

  // 대비 패턴: "~했던 ~가"
  if (/했던.*가\s/.test(title)) patterns.push('과거_대비');

  // 결말 패턴: "이유", "진실", "비밀"
  if (/(이유|진실|비밀|순간|결말)/.test(title)) patterns.push('훅_결말');

  // 감정 패턴: "충격", "눈물", "분노"
  if (/(충격|눈물|분노|후회|통쾌)/.test(title)) patterns.push('감정_자극');

  // 신분 변화: "CEO", "재벌", "성공"
  if (/(CEO|재벌|성공|사장|회장)/.test(title)) patterns.push('신분_상승');

  // 복수 패턴
  if (/(복수|되갚|응징|무릎)/.test(title)) patterns.push('복수_서사');

  return patterns;
}

export function getLearnedPatterns(category: string): string[] {
  const patterns = successPatterns.get(category) || [];
  return patterns.map((p) => `${p.pattern}(${p.score}점, ${p.count}회)`);
}

// 진화된 제목 생성 (학습된 패턴 반영)
export async function generateEvolvedTitle(category: string): Promise<string[]> {
  const patterns = successPatterns.get(category) || [];
  const topPatterns = patterns.slice(0, 5).map((p) => p.pattern);

  if (topPatterns.length === 0) {
    // 학습된 패턴 없으면 기본 생성
    return generateTitlesWithClaude(category, 3);
  }

  const patternInstructions = topPatterns
    .map((p) => {
      switch (p) {
        case '시간_변화':
          return '- 구체적인 시간 경과 포함 (예: "3년 후", "10년 만에")';
        case '과거_대비':
          return '- 과거와 현재의 극적인 대비';
        case '훅_결말':
          return '- "이유", "진실", "비밀" 등으로 끝맺기';
        case '감정_자극':
          return '- 충격, 눈물, 통쾌 등 감정 키워드';
        case '신분_상승':
          return '- CEO, 재벌 등 신분 상승 스토리';
        case '복수_서사':
          return '- 복수, 응징, 무릎 꿇음 등 통쾌한 전개';
        default:
          return '';
      }
    })
    .filter((s) => s)
    .join('\n');

  const prompt = `당신은 유튜브 제목 전문가입니다. 다음 학습된 성공 패턴을 반영하여 "${category}" 카테고리 제목 3개를 생성해주세요.

🧬 학습된 성공 패턴:
${patternInstructions}

제목만 한 줄에 하나씩 출력해주세요.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return [];

    return content.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 10)
      .slice(0, 3);
  } catch (error) {
    console.error('진화 제목 생성 실패:', error);
    return [];
  }
}

// ============================================================
// 🎰 대박 예감 알림 (95점 이상)
// ============================================================
export async function checkAndNotifyHighScore(
  title: string,
  score: number,
  category: string,
  notifyCallback?: (message: string) => Promise<void>
): Promise<boolean> {
  if (score < 95) return false;

  const message = `🎰 대박 예감! 95점 이상 제목 발견!

📌 카테고리: ${category}
📝 제목: "${title}"
⭐ 점수: ${score}점

이 제목은 클릭률이 높을 것으로 예상됩니다!`;

  console.log(`\n${'='.repeat(50)}`);
  console.log(message);
  console.log(`${'='.repeat(50)}\n`);

  // 콜백이 있으면 호출 (텔레그램, 이메일 등)
  if (notifyCallback) {
    try {
      await notifyCallback(message);
    } catch (e) {
      console.error('알림 전송 실패:', e);
    }
  }

  return true;
}

// ============================================================
// 🔄 자동 변형 생성 (1개 컨셉 → 5개 버전)
// ============================================================
export async function generateTitleVariations(
  concept: string,
  category: string,
  count: number = 5
): Promise<{ title: string; score: number; style: string }[]> {
  const styles = ['호기심형', '충격형', '감동형', '복수형', '반전형'];

  const prompt = `당신은 유튜브 제목 변형 전문가입니다.

기본 컨셉: "${concept}"
카테고리: ${category}

위 컨셉을 다음 5가지 스타일로 각각 변형해주세요:

1. 호기심형: "왜?", "어떻게?", "~한 이유" 등 궁금증 유발
2. 충격형: "충격", "경악", "믿기 힘든" 등 강렬한 임팩트
3. 감동형: "눈물", "감동", "가슴 뭉클" 등 감성 자극
4. 복수형: "복수", "되갚음", "통쾌한" 등 사이다 전개
5. 반전형: "알고보니", "사실은", "충격 반전" 등 트위스트

응답 형식 (JSON 배열):
[
  {"style": "호기심형", "title": "변형된 제목1"},
  {"style": "충격형", "title": "변형된 제목2"},
  ...
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return [];

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const variations = JSON.parse(jsonMatch[0]) as { style: string; title: string }[];

    // 각 변형에 점수 매기기
    const results: { title: string; score: number; style: string }[] = [];
    for (const v of variations.slice(0, count)) {
      const score = await evaluateTitleScore(v.title, category);
      results.push({ title: v.title, score, style: v.style });
      console.log(`[Variation] 🔄 ${v.style}: "${v.title}" (${score}점)`);
    }

    // 점수 순으로 정렬
    results.sort((a, b) => b.score - a.score);

    return results;
  } catch (error) {
    console.error('변형 생성 실패:', error);
    return [];
  }
}

// ============================================================
// 📊 실시간 트렌드 반영 (네이버 실검)
// ============================================================
export async function injectTrendKeyword(
  title: string,
  category: string,
  trendKeywords?: string[]
): Promise<{ title: string; injectedKeyword: string | null; score: number }> {
  // 트렌드 키워드가 없으면 기본 키워드 사용
  const keywords = trendKeywords || await fetchTrendKeywords();

  if (keywords.length === 0) {
    const score = await evaluateTitleScore(title, category);
    return { title, injectedKeyword: null, score };
  }

  const prompt = `당신은 유튜브 제목 트렌드 전문가입니다.

원본 제목: "${title}"
카테고리: ${category}

오늘의 트렌드 키워드:
${keywords.slice(0, 10).map((k, i) => `${i + 1}. ${k}`).join('\n')}

위 트렌드 키워드 중 하나를 자연스럽게 제목에 삽입해주세요.
단, 원래 의미를 유지하면서 어색하지 않게!

응답 형식 (JSON):
{
  "newTitle": "트렌드 반영된 제목",
  "usedKeyword": "사용한 키워드",
  "naturally": true/false
}

어색하면 naturally: false로 하고 원본 제목 유지.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      const score = await evaluateTitleScore(title, category);
      return { title, injectedKeyword: null, score };
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const score = await evaluateTitleScore(title, category);
      return { title, injectedKeyword: null, score };
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!result.naturally) {
      const score = await evaluateTitleScore(title, category);
      return { title, injectedKeyword: null, score };
    }

    const score = await evaluateTitleScore(result.newTitle, category);
    console.log(`[Trend] 📊 트렌드 반영: "${result.usedKeyword}" → "${result.newTitle}" (${score}점)`);

    return {
      title: result.newTitle,
      injectedKeyword: result.usedKeyword,
      score,
    };
  } catch (error) {
    console.error('트렌드 반영 실패:', error);
    const score = await evaluateTitleScore(title, category);
    return { title, injectedKeyword: null, score };
  }
}

// 트렌드 키워드 가져오기 (네이버 실검 대체)
async function fetchTrendKeywords(): Promise<string[]> {
  // TODO: 실제 네이버 API 연동 시 구현
  // 현재는 더미 데이터 반환
  const dummyTrends = [
    '연말정산', '크리스마스', '송년회', '새해', '복권',
    '한파', '폭설', '연휴', '귀성길', '선물'
  ];

  console.log('[Trend] 📊 트렌드 키워드 로드됨:', dummyTrends.slice(0, 5).join(', '));
  return dummyTrends;
}

// 네이버 DataLab API 연동 (실제 구현용)
export async function fetchNaverTrends(): Promise<string[]> {
  try {
    // 네이버 DataLab API 호출
    // 실제 구현 시 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 필요
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.log('[Trend] 네이버 API 키 없음, 더미 데이터 사용');
      return fetchTrendKeywords();
    }

    // TODO: 실제 API 호출 구현
    return fetchTrendKeywords();
  } catch (error) {
    console.error('네이버 트렌드 조회 실패:', error);
    return [];
  }
}

// ============================================================
// 🚀 통합 파이프라인: 제목 생성 → 배틀 → 업그레이드 → 알림
// ============================================================
export async function generateOptimalTitle(
  category: string,
  options?: {
    useTrends?: boolean;
    minScore?: number;
    notifyCallback?: (message: string) => Promise<void>;
  }
): Promise<{
  title: string;
  score: number;
  variations?: { title: string; score: number; style: string }[];
  upgraded?: boolean;
  trendKeyword?: string;
}> {
  const { useTrends = false, minScore = 90, notifyCallback } = options || {};

  console.log(`\n🚀 [OptimalTitle] ${category} 카테고리 최적 제목 생성 시작...`);

  // 1. 진화된 제목 생성 (학습된 패턴 반영)
  let titles = await generateEvolvedTitle(category);
  if (titles.length === 0) {
    titles = await generateTitlesWithClaude(category, 5);
  }

  if (titles.length === 0) {
    throw new Error('제목 생성 실패');
  }

  // 2. 제목 배틀로 최고 제목 선택
  let bestTitle = titles[0];
  let bestScore = await evaluateTitleScore(bestTitle, category);

  for (let i = 1; i < titles.length; i++) {
    const battle = await titleBattle(bestTitle, titles[i], category);
    if (battle.winner !== bestTitle) {
      bestTitle = battle.winner;
      bestScore = battle.scores.title2;
    }
  }

  console.log(`[OptimalTitle] ⚔️ 배틀 승자: "${bestTitle}" (${bestScore}점)`);

  // 3. 점수가 낮으면 업그레이드
  let upgraded = false;
  if (bestScore < minScore) {
    const upgrade = await upgradeTitleWithAI(bestTitle, bestScore, category, minScore);
    if (upgrade.newScore > bestScore) {
      bestTitle = upgrade.upgradedTitle;
      bestScore = upgrade.newScore;
      upgraded = true;
      console.log(`[OptimalTitle] 🔥 업그레이드 완료: ${upgrade.improvements.join(', ')}`);
    }
  }

  // 4. 트렌드 키워드 반영 (옵션)
  let trendKeyword: string | undefined;
  if (useTrends) {
    const trendResult = await injectTrendKeyword(bestTitle, category);
    if (trendResult.injectedKeyword && trendResult.score >= bestScore) {
      bestTitle = trendResult.title;
      bestScore = trendResult.score;
      trendKeyword = trendResult.injectedKeyword;
    }
  }

  // 5. 성공 패턴 학습
  if (bestScore >= 90) {
    learnFromSuccessfulTitle(category, bestTitle, bestScore);
  }

  // 6. 대박 예감 알림
  await checkAndNotifyHighScore(bestTitle, bestScore, category, notifyCallback);

  // 7. 변형 생성 (보너스)
  const variations = await generateTitleVariations(bestTitle, category, 3);

  console.log(`\n✅ [OptimalTitle] 최종 선택: "${bestTitle}" (${bestScore}점)\n`);

  return {
    title: bestTitle,
    score: bestScore,
    variations,
    upgraded,
    trendKeyword,
  };
}
