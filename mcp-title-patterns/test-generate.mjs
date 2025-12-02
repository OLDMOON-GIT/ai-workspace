import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'patterns.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 스키마 초기화
db.exec(`CREATE TABLE IF NOT EXISTS category (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, description TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS pattern_element (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, element_type TEXT NOT NULL, value TEXT NOT NULL, weight REAL DEFAULT 1.0, use_count INTEGER DEFAULT 0, UNIQUE(category_id, element_type, value))`);
db.exec(`CREATE TABLE IF NOT EXISTS template (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, pattern TEXT NOT NULL, description TEXT, weight REAL DEFAULT 1.0, is_active INTEGER DEFAULT 1)`);

// 데이터 시드
const catCount = db.prepare('SELECT COUNT(*) as cnt FROM category').get();
if (catCount.cnt === 0) {
  db.prepare('INSERT INTO category (name, display_name, description) VALUES (?, ?, ?)').run('시니어사연', '시니어 실화·사연', '시니어 세대의 실화');

  const subjects = ['80세 시어머니가', '70대 할머니가', '퇴직한 아버지가', '홀로된 어머니가', '치매 걸린 시아버지가', '손주 키우는 할머니가', '시골 농사짓는 할아버지가', '폐지 줍는 할머니가', '요양원에 계신 아버지가', '사별한 70대 할머니가', '독거노인 할아버지가', '40년 부부가', '손주만 바라보던 할머니가', '평생 농사꾼 할아버지가', '퇴직금 다 날린 아버지가', '3남매 홀로 키운 어머니가', '중풍 걸린 시아버지가', '무릎 아픈 할머니가', '귀 안들리는 할아버지가'];
  const pastActions = ['매일 새벽 기도하더니', '평생 욕 한마디 안하더니', '묵묵히 참기만 하더니', '아무 말 없이 웃기만 하더니', '30년간 희생만 하더니', '혼자서 다 해내더니', '남편 뒷바라지만 하더니', '자식들 뒤에서 울기만 하더니', '평생 모은 돈을 모아', '매일 편지를 쓰더니', '조용히 준비하더니', '아무도 몰래 숨겨두더니', '10년간 모른 척하더니', '참고 참다가', '뒤에서 지켜보기만 하더니'];
  const timeExpressions = ['3개월 후', '1년 뒤', '그날 밤', '장례식장에서', '임종 직전', '유품 정리하다가', '제사상 앞에서', '명절날', '추석 전날', '설날 아침', '생일날', '결혼 50주년에', '퇴직 날', '병원 입원 중', '마지막 순간', '돌아가시기 전날', '유언장을 열었을 때'];
  const emotionalResults = ['오열했다', '무릎 꿇고 울었다', '땅을 치며 후회했다', '말을 잃었다', '통곡했다', '바닥에 주저앉았다', '눈물바다가 됐다', '서로 껴안고 울었다', '용서를 빌었다', '뒤늦게 깨달았다', '충격에 빠졌다', '한참을 멍하니 있었다', '밤새 울었다', '제대로 서있지도 못했다'];
  const revelations = ['숨겨둔 3억', '비밀 통장', '모아둔 금', '숨겨둔 아들', '비밀 일기장', '30년 전 사연', '엄마의 희생', '아버지의 눈물', '충격적인 진실', '평생의 거짓말', '숨겨둔 보험금', '비밀 부동산', '몰래 모은 적금', '감춰둔 유산', '아무도 모른 병명'];
  const hookEndings = ['충격 반전', '눈물 주의', '실화입니다', '소름 주의', '감동 실화', '경악 반전', '전국민 분노', '화제의 사연', '실제 상황', '대박 반전', '결말 충격', '모두가 울었다'];

  const catId = 1;
  subjects.forEach(v => db.prepare('INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)').run(catId, 'subject', v));
  pastActions.forEach(v => db.prepare('INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)').run(null, 'past_action', v));
  timeExpressions.forEach(v => db.prepare('INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)').run(null, 'time_expression', v));
  emotionalResults.forEach(v => db.prepare('INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)').run(null, 'emotional_result', v));
  revelations.forEach(v => db.prepare('INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)').run(null, 'revelation', v));
  hookEndings.forEach(v => db.prepare('INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)').run(null, 'hook_ending', v));

  // 긴 템플릿들 (최소 5-6개 요소 조합, 문법 정확하게)
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '{subject} {past_action} {time_expression} 드디어 {revelation} 발견되자 온 가족이 {emotional_result} [{hook_ending}]', '기본 반전형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '"다 용서할게..." {subject} {past_action} {time_expression} 남긴 유서에 {revelation} 적혀있자 {emotional_result} [{hook_ending}]', '용서 대사형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '{subject} {past_action} 아무도 몰랐는데 {time_expression} 갑자기 {revelation} 공개되자 가족 모두 {emotional_result} [{hook_ending}]', '비밀 공개형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '"이건 꼭 전해줘..." {subject} 떠나기 전 {time_expression} 남긴 편지 속에서 {revelation} 발견되자 {emotional_result} [{hook_ending}]', '유언 편지형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '{subject} {past_action} 결국 {time_expression} {revelation} 들통나자 자식들이 {emotional_result} [{hook_ending}]', '들통 반전형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '"미안하다 얘들아..." {subject} {past_action} {time_expression} 남긴 녹음에서 {revelation} 고백하자 온 가족이 {emotional_result} [{hook_ending}]', '녹음 유언형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '{time_expression} {subject} 유품 속에서 {revelation} 발견됐다... 평생 아무도 몰랐던 비밀에 가족들 {emotional_result} [{hook_ending}]', '유품 발견형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '{subject} 평생 숨겨온 {revelation} {time_expression} 드디어 밝혀지자 자식들 {emotional_result} [{hook_ending}]', '평생 비밀형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '"절대 열지마..." {subject} 남긴 금고 속 {revelation} {time_expression} 열어보니 평생 숨겨온 비밀이 드러났다 [{hook_ending}]', '금고 비밀형');
  db.prepare('INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)').run(catId, '{subject} {past_action} {time_expression} 자식들 앞에서 {revelation} 꺼내들자 가족 모두 {emotional_result} [{hook_ending}]', '공개 발표형');
}

// 제목 생성
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateTitle() {
  const templates = db.prepare('SELECT * FROM template WHERE category_id = 1 AND is_active = 1').all();
  const template = pick(templates);
  let pattern = template.pattern;

  const types = ['subject', 'past_action', 'time_expression', 'emotional_result', 'revelation', 'hook_ending'];
  for (const t of types) {
    if (pattern.includes('{' + t + '}')) {
      const elems = db.prepare('SELECT value FROM pattern_element WHERE element_type = ? AND (category_id = 1 OR category_id IS NULL)').all(t);
      if (elems.length > 0) {
        pattern = pattern.replace('{' + t + '}', pick(elems).value);
      }
    }
  }
  return pattern;
}

console.log('\n[ 시니어사연 제목 10개 생성 ]\n');
const seen = new Set();
let count = 0;
while (count < 10) {
  const title = generateTitle();
  if (!seen.has(title)) {
    seen.add(title);
    count++;
    console.log(count + '. ' + title);
  }
}
