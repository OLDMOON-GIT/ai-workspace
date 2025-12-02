#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// 데이터베이스 설정
// ============================================

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "patterns.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ============================================
// 스키마 초기화
// ============================================

function initializeSchema() {
  // 카테고리 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 패턴 요소 테이블 (주어, 동작, 시간표현 등)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pattern_element (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      element_type TEXT NOT NULL,
      value TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      use_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES category(id),
      UNIQUE(category_id, element_type, value)
    )
  `);

  // 템플릿 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      pattern TEXT NOT NULL,
      description TEXT,
      weight REAL DEFAULT 1.0,
      use_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES category(id)
    )
  `);

  // 생성 기록 테이블 (통계용)
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      template_id INTEGER,
      generated_title TEXT NOT NULL,
      elements_used TEXT,
      was_selected INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES category(id),
      FOREIGN KEY (template_id) REFERENCES template(id)
    )
  `);

  // 인덱스 생성
  db.exec(`CREATE INDEX IF NOT EXISTS idx_element_type ON pattern_element(category_id, element_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_template_category ON template(category_id, is_active)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_generation_log_date ON generation_log(created_at)`);

  console.error("✅ 패턴 데이터베이스 초기화 완료");
}

// ============================================
// 기본 패턴 데이터 시드
// ============================================

function seedDefaultPatterns() {
  const categoryCount = db.prepare("SELECT COUNT(*) as cnt FROM category").get() as any;
  if (categoryCount.cnt > 0) return; // 이미 데이터가 있으면 스킵

  console.error("⚙️ 기본 패턴 데이터 시드 중...");

  // 카테고리 추가
  const categories = [
    { name: "시니어사연", displayName: "시니어 실화·사연", description: "시니어 세대의 실화와 가족 사연" },
    { name: "복수극", displayName: "복수 드라마", description: "복수와 반전이 있는 이야기" },
    { name: "감동사연", displayName: "감동 실화", description: "감동적인 실화 이야기" },
    { name: "로맨스", displayName: "로맨스 이야기", description: "사랑과 연애 이야기" },
    { name: "미스터리", displayName: "미스터리 사연", description: "미스터리하고 궁금증 유발 이야기" },
  ];

  const insertCategory = db.prepare(`
    INSERT INTO category (name, display_name, description) VALUES (?, ?, ?)
  `);

  categories.forEach(cat => {
    insertCategory.run(cat.name, cat.displayName, cat.description);
  });

  // 요소 타입별 기본 데이터
  const elementTypes = {
    // 주어 (카테고리별)
    subjects: {
      "시니어사연": [
        "80세 시어머니가", "70대 할머니가", "퇴직한 아버지가", "홀로된 어머니가",
        "치매 걸린 시아버지가", "손주 키우는 할머니가", "시골 농사짓는 할아버지가",
        "아파트 경비원 아저씨가", "폐지 줍는 할머니가", "요양원에 계신 아버지가",
        "사별한 70대 할머니가", "독거노인 할아버지가", "노인정 회장님이",
        "40년 부부가", "손주만 바라보던 할머니가", "평생 농사꾼 할아버지가",
        "퇴직금 다 날린 아버지가", "3남매 홀로 키운 어머니가", "중풍 걸린 시아버지가",
        "무릎 아픈 할머니가", "귀 안들리는 할아버지가", "치과 무서워하는 할머니가"
      ],
      "복수극": [
        "무시당한 며느리가", "쫓겨난 직원이", "버려진 아들이", "배신당한 아내가",
        "해고당한 부장이", "무고한 죄로 갇혔던 남자가", "속아서 빚더미에 앉은 여자가",
        "친구에게 사기당한 남자가", "가짜 친구에게 버림받은 여자가", "유산 못받은 막내가",
        "20년 참았던 며느리가", "뒷담화 들은 직원이", "왕따당한 신입이",
        "회사에서 쫓겨난 공장장이", "누명 쓴 회계팀장이", "졸혼당한 40대 가장이"
      ],
      "감동사연": [
        "암 투병 중인 어머니가", "실명한 딸이", "휠체어 탄 아들이", "말기암 선고받은 아버지가",
        "봉사 30년 한 할머니가", "헌혈 100회 한 청년이", "고아원 출신 CEO가",
        "기부왕 할아버지가", "장학금으로 대학 간 학생이", "양부모에게 감사하는 아들이"
      ],
      "로맨스": [
        "30년 만에 첫사랑을", "이혼한 40대 남자가", "미혼모 30대가", "늦깎이 50대 신랑이",
        "재혼한 60대 부부가", "소개팅 100번 만에", "동창회에서 만난 그녀가",
        "평생 독신이던 40대가", "돌싱남 3자녀 아빠가", "늦둥이 낳은 부부가"
      ],
      "미스터리": [
        "실종된 아들의", "갑자기 사라진 아내의", "30년 전 사건의", "유품 정리하다 발견한",
        "이상한 유언장의", "아무도 모르는 비밀이", "할머니 방에서 나온", "지하실에서 발견된"
      ]
    },
    // 과거 행동
    past_actions: [
      "매일 새벽 기도하더니", "평생 욕 한마디 안하더니", "묵묵히 참기만 하더니",
      "아무 말 없이 웃기만 하더니", "30년간 희생만 하더니", "혼자서 다 해내더니",
      "남편 뒷바라지만 하더니", "자식들 뒤에서 울기만 하더니", "평생 모은 돈을 모아",
      "매일 편지를 쓰더니", "조용히 준비하더니", "아무도 몰래 숨겨두더니",
      "매일 일기를 쓰더니", "10년간 모른 척하더니", "참고 참다가",
      "웃으면서 눈물 흘리더니", "뒤에서 지켜보기만 하더니", "아무 말도 안하더니"
    ],
    // 시간 표현
    time_expressions: [
      "3개월 후", "1년 뒤", "그날 밤", "장례식장에서", "임종 직전",
      "유품 정리하다가", "제사상 앞에서", "명절날", "추석 전날",
      "설날 아침", "생일날", "결혼 50주년에", "퇴직 날",
      "병원 입원 중", "수술 후", "마지막 순간", "돌아가시기 전날",
      "유언장을 열었을 때", "그 문자를 받고", "전화 끊고나서"
    ],
    // 반전
    plot_twists: [
      "진실이 밝혀지자", "비밀이 드러나자", "녹음 파일이 공개되자",
      "통장이 발견되자", "편지가 공개되자", "숨겨둔 증거가 나오자",
      "CCTV 확인하니", "DNA 결과가 나오니", "유언장을 열어보니",
      "일기장을 읽어보니", "문자 내역을 보니", "사진첩을 발견하니",
      "뒤늦게 알고보니", "모두가 알게 되자", "TV에 나오자",
      "경찰이 밝혀내니", "변호사가 말하길", "의사가 알려주길"
    ],
    // 드러난 것들 (조사 없이, 문법 자연스럽게)
    revelations: [
      "숨겨둔 3억", "비밀 통장", "모아둔 금", "숨겨둔 아들", "비밀 일기장",
      "30년 전 사연", "엄마의 희생", "아버지의 눈물", "충격적인 진실",
      "평생의 거짓말", "숨겨둔 보험금", "비밀 부동산", "몰래 모은 적금",
      "감춰둔 유산", "아무도 모른 병명", "비밀 결혼", "은인의 정체"
    ],
    // 감정 결과 (모두가로 시작 안함)
    emotional_results: [
      "오열했다", "무릎 꿇고 울었다", "땅을 치며 후회했다", "말을 잃었다",
      "통곡했다", "바닥에 주저앉았다", "눈물바다가 됐다", "서로 껴안고 울었다",
      "용서를 빌었다", "뒤늦게 깨달았다", "충격에 빠졌다", "한참을 멍하니 있었다",
      "밤새 울었다", "제대로 서있지도 못했다"
    ],
    // 후킹 엔딩
    hook_endings: [
      "충격 반전", "눈물 주의", "실화입니다", "소름 주의",
      "감동 실화", "경악 반전", "전국민 분노", "화제의 사연",
      "실제 상황", "대박 반전", "결말 충격", "모두가 울었다",
      "댓글 폭발", "조회수 폭발", "뉴스 난리", "재판 결과"
    ],
    // 장소
    places: [
      "시골집에서", "병원에서", "법원에서", "장례식장에서",
      "가족 모임에서", "제사상 앞에서", "공증사무실에서", "은행에서",
      "요양원에서", "교회에서", "노인정에서", "동네 슈퍼에서"
    ],
    // 관계 변화
    relationship_changes: [
      "며느리와 화해한", "자식들이 반성한", "가족이 다시 모인",
      "원수가 무릎 꿇은", "악연이 풀린", "형제가 화해한",
      "부모와 재회한", "고마움을 깨달은"
    ],
    // 물질 변화
    material_changes: [
      "3억 유산을", "평생 모은 돈을", "비밀 금고를",
      "숨겨둔 금을", "보험금 10억을", "땅 문서를",
      "주식 계좌를", "아파트 명의를"
    ]
  };

  // 요소 삽입
  const insertElement = db.prepare(`
    INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)
  `);

  const getCategoryId = db.prepare("SELECT id FROM category WHERE name = ?");

  // 카테고리별 주어 삽입
  for (const [catName, subjects] of Object.entries(elementTypes.subjects)) {
    const catRow = getCategoryId.get(catName) as any;
    if (catRow) {
      subjects.forEach(subj => insertElement.run(catRow.id, "subject", subj));
    }
  }

  // 공통 요소 삽입 (category_id = NULL)
  elementTypes.past_actions.forEach(v => insertElement.run(null, "past_action", v));
  elementTypes.time_expressions.forEach(v => insertElement.run(null, "time_expression", v));
  elementTypes.plot_twists.forEach(v => insertElement.run(null, "plot_twist", v));
  elementTypes.revelations.forEach(v => insertElement.run(null, "revelation", v));
  elementTypes.emotional_results.forEach(v => insertElement.run(null, "emotional_result", v));
  elementTypes.hook_endings.forEach(v => insertElement.run(null, "hook_ending", v));
  elementTypes.places.forEach(v => insertElement.run(null, "place", v));
  elementTypes.relationship_changes.forEach(v => insertElement.run(null, "relationship_change", v));
  elementTypes.material_changes.forEach(v => insertElement.run(null, "material_change", v));

  // 기본 템플릿 삽입
  const insertTemplate = db.prepare(`
    INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)
  `);

  const templates = [
    // 시니어사연 (길고 문법 정확한 템플릿)
    { cat: "시니어사연", pattern: "{subject} {past_action} {time_expression} 드디어 {revelation} 발견되자 온 가족이 {emotional_result} [{hook_ending}]", desc: "기본 반전형" },
    { cat: "시니어사연", pattern: "\"다 용서할게...\" {subject} {past_action} {time_expression} 남긴 유서에 {revelation} 적혀있자 {emotional_result} [{hook_ending}]", desc: "용서 대사형" },
    { cat: "시니어사연", pattern: "{subject} {past_action} 아무도 몰랐는데 {time_expression} 갑자기 {revelation} 공개되자 가족 모두 {emotional_result} [{hook_ending}]", desc: "비밀 공개형" },
    { cat: "시니어사연", pattern: "\"이건 꼭 전해줘...\" {subject} 떠나기 전 {time_expression} 남긴 편지 속에서 {revelation} 발견되자 {emotional_result} [{hook_ending}]", desc: "유언 편지형" },
    { cat: "시니어사연", pattern: "{subject} {past_action} 결국 {time_expression} {revelation} 들통나자 자식들이 {emotional_result} [{hook_ending}]", desc: "들통 반전형" },
    { cat: "시니어사연", pattern: "\"미안하다 얘들아...\" {subject} {past_action} {time_expression} 남긴 녹음에서 {revelation} 고백하자 온 가족이 {emotional_result} [{hook_ending}]", desc: "녹음 유언형" },
    { cat: "시니어사연", pattern: "{time_expression} {subject} 유품 속에서 {revelation} 발견됐다... 평생 아무도 몰랐던 비밀에 가족들 {emotional_result} [{hook_ending}]", desc: "유품 발견형" },
    { cat: "시니어사연", pattern: "{subject} 평생 숨겨온 {revelation} {time_expression} 드디어 밝혀지자 자식들 {emotional_result} [{hook_ending}]", desc: "평생 비밀형" },
    { cat: "시니어사연", pattern: "\"절대 열지마...\" {subject} 남긴 금고 속 {revelation} {time_expression} 열어보니 평생 숨겨온 비밀이 드러났다 [{hook_ending}]", desc: "금고 비밀형" },
    { cat: "시니어사연", pattern: "{subject} {past_action} {time_expression} 자식들 앞에서 {revelation} 꺼내들자 가족 모두 {emotional_result} [{hook_ending}]", desc: "공개 발표형" },

    // 복수극 (긴 버전)
    { cat: "복수극", pattern: "{subject} {past_action} {time_expression} 드디어 {plot_twist} 결국 가해자가 {emotional_result} [{hook_ending}]", desc: "복수 성공형" },
    { cat: "복수극", pattern: "\"다 갚아줄게\" {subject} {past_action} {time_expression} 마침내 {revelation} 공개하자 모두가 {emotional_result} [{hook_ending}]", desc: "복수 선언형" },
    { cat: "복수극", pattern: "{subject} 10년간 모은 증거... {time_expression} {plot_twist} 가해자는 {emotional_result} [{hook_ending}]", desc: "증거 복수형" },

    // 감동사연 (긴 버전)
    { cat: "감동사연", pattern: "{subject} {past_action} {time_expression} 아무도 몰랐던 {revelation} 밝혀지자 모두가 {emotional_result} [{hook_ending}]", desc: "감동 반전형" },
    { cat: "감동사연", pattern: "\"고맙습니다...\" {subject} 마지막으로 남긴 {revelation} {time_expression} 공개되자 {emotional_result} [{hook_ending}]", desc: "마지막 선물형" },

    // 로맨스 (긴 버전)
    { cat: "로맨스", pattern: "{subject} {past_action} {time_expression} 운명처럼 다시 만났다... 그리고 {revelation} 밝혀지자 둘 다 {emotional_result} [{hook_ending}]", desc: "재회 로맨스형" },
    { cat: "로맨스", pattern: "\"30년 기다렸어\" {subject} {time_expression} 드디어 {revelation} 고백하자 상대방은 {emotional_result} [{hook_ending}]", desc: "고백 반전형" },

    // 미스터리 (긴 버전)
    { cat: "미스터리", pattern: "{subject} {past_action} 그리고 {time_expression} {plot_twist} 충격적인 {revelation} 밝혀졌다 [{hook_ending}]", desc: "미스터리 해결형" },
    { cat: "미스터리", pattern: "{time_expression} {place} 발견된 {revelation}... 20년간 숨겨온 비밀이 드러나자 {emotional_result} [{hook_ending}]", desc: "발견 미스터리형" },
  ];

  templates.forEach(t => {
    const catRow = getCategoryId.get(t.cat) as any;
    if (catRow) {
      insertTemplate.run(catRow.id, t.pattern, t.desc);
    }
  });

  console.error("✅ 기본 패턴 데이터 시드 완료");
}

// 초기화 실행
initializeSchema();
seedDefaultPatterns();

// ============================================
// 패턴 생성 함수
// ============================================

function pickWeighted(items: any[]): any {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= item.weight || 1;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function generateTitle(categoryName: string): { title: string; templateId: number; elementsUsed: string[] } | null {
  // 카테고리 조회
  const category = db.prepare("SELECT id FROM category WHERE name = ? AND is_active = 1").get(categoryName) as any;
  if (!category) return null;

  // 템플릿 선택
  const templates = db.prepare(
    "SELECT * FROM template WHERE category_id = ? AND is_active = 1"
  ).all(category.id) as any[];
  if (templates.length === 0) return null;

  const template = pickWeighted(templates);
  let pattern = template.pattern as string;
  const elementsUsed: string[] = [];

  // 요소 치환
  const elementTypes = ["subject", "past_action", "time_expression", "plot_twist", "revelation",
    "emotional_result", "hook_ending", "place", "relationship_change", "material_change"];

  for (const elemType of elementTypes) {
    const placeholder = `{${elemType}}`;
    if (pattern.includes(placeholder)) {
      // 카테고리 특정 또는 공통 요소 조회
      const elements = db.prepare(`
        SELECT * FROM pattern_element
        WHERE element_type = ? AND (category_id = ? OR category_id IS NULL)
      `).all(elemType, category.id) as any[];

      if (elements.length > 0) {
        const elem = pickWeighted(elements);
        pattern = pattern.replace(placeholder, elem.value);
        elementsUsed.push(`${elemType}:${elem.id}`);
      }
    }
  }

  return {
    title: pattern,
    templateId: template.id,
    elementsUsed
  };
}

function generateTitles(categoryName: string, count: number): any[] {
  const results: any[] = [];
  const seen = new Set<string>();

  // 최대 시도 횟수
  const maxAttempts = count * 3;
  let attempts = 0;

  while (results.length < count && attempts < maxAttempts) {
    const result = generateTitle(categoryName);
    if (result && !seen.has(result.title)) {
      seen.add(result.title);
      results.push(result);

      // 생성 로그 기록
      const category = db.prepare("SELECT id FROM category WHERE name = ?").get(categoryName) as any;
      if (category) {
        db.prepare(`
          INSERT INTO generation_log (category_id, template_id, generated_title, elements_used)
          VALUES (?, ?, ?, ?)
        `).run(category.id, result.templateId, result.title, JSON.stringify(result.elementsUsed));
      }
    }
    attempts++;
  }

  return results;
}

// ============================================
// 통계 함수
// ============================================

function getStatistics(): any {
  const categoryStats = db.prepare(`
    SELECT c.name, c.display_name,
      (SELECT COUNT(*) FROM pattern_element WHERE category_id = c.id) as element_count,
      (SELECT COUNT(*) FROM template WHERE category_id = c.id AND is_active = 1) as template_count,
      (SELECT COUNT(*) FROM generation_log WHERE category_id = c.id) as generation_count
    FROM category c WHERE c.is_active = 1
  `).all();

  const totalElements = db.prepare("SELECT COUNT(*) as cnt FROM pattern_element").get() as any;
  const totalTemplates = db.prepare("SELECT COUNT(*) as cnt FROM template WHERE is_active = 1").get() as any;
  const totalGenerations = db.prepare("SELECT COUNT(*) as cnt FROM generation_log").get() as any;

  const topElements = db.prepare(`
    SELECT element_type, value, use_count, success_count
    FROM pattern_element ORDER BY use_count DESC LIMIT 10
  `).all();

  return {
    summary: {
      totalElements: totalElements.cnt,
      totalTemplates: totalTemplates.cnt,
      totalGenerations: totalGenerations.cnt
    },
    categories: categoryStats,
    topElements
  };
}

// ============================================
// 요소/템플릿 관리 함수
// ============================================

function addElement(categoryName: string | null, elementType: string, value: string): boolean {
  try {
    let categoryId = null;
    if (categoryName) {
      const cat = db.prepare("SELECT id FROM category WHERE name = ?").get(categoryName) as any;
      categoryId = cat?.id || null;
    }

    db.prepare(`
      INSERT OR IGNORE INTO pattern_element (category_id, element_type, value) VALUES (?, ?, ?)
    `).run(categoryId, elementType, value);

    return true;
  } catch {
    return false;
  }
}

function addTemplate(categoryName: string, pattern: string, description: string): boolean {
  try {
    const cat = db.prepare("SELECT id FROM category WHERE name = ?").get(categoryName) as any;
    if (!cat) return false;

    db.prepare(`
      INSERT INTO template (category_id, pattern, description) VALUES (?, ?, ?)
    `).run(cat.id, pattern, description);

    return true;
  } catch {
    return false;
  }
}

function listElements(elementType?: string, categoryName?: string): any[] {
  let query = "SELECT pe.*, c.name as category_name FROM pattern_element pe LEFT JOIN category c ON pe.category_id = c.id WHERE 1=1";
  const params: any[] = [];

  if (elementType) {
    query += " AND pe.element_type = ?";
    params.push(elementType);
  }

  if (categoryName) {
    query += " AND (c.name = ? OR pe.category_id IS NULL)";
    params.push(categoryName);
  }

  query += " ORDER BY pe.element_type, pe.use_count DESC";

  return db.prepare(query).all(...params);
}

function listTemplates(categoryName?: string): any[] {
  let query = `
    SELECT t.*, c.name as category_name
    FROM template t
    JOIN category c ON t.category_id = c.id
    WHERE t.is_active = 1
  `;
  const params: any[] = [];

  if (categoryName) {
    query += " AND c.name = ?";
    params.push(categoryName);
  }

  query += " ORDER BY t.use_count DESC";

  return db.prepare(query).all(...params);
}

function markTitleSelected(logId: number): boolean {
  try {
    db.prepare("UPDATE generation_log SET was_selected = 1 WHERE id = ?").run(logId);

    // 관련 요소 및 템플릿의 success_count 증가
    const log = db.prepare("SELECT template_id, elements_used FROM generation_log WHERE id = ?").get(logId) as any;
    if (log) {
      db.prepare("UPDATE template SET success_count = success_count + 1 WHERE id = ?").run(log.template_id);

      if (log.elements_used) {
        const elementsUsed = JSON.parse(log.elements_used);
        elementsUsed.forEach((elem: string) => {
          const [, elemId] = elem.split(":");
          if (elemId) {
            db.prepare("UPDATE pattern_element SET success_count = success_count + 1 WHERE id = ?").run(parseInt(elemId));
          }
        });
      }
    }

    return true;
  } catch {
    return false;
  }
}

// 패턴 진화: 성공률 기반 가중치 조정
function evolvePatterns(): string {
  const results: string[] = [];

  // 템플릿 가중치 조정
  const templates = db.prepare(`
    SELECT id, use_count, success_count, weight
    FROM template WHERE use_count >= 10
  `).all() as any[];

  templates.forEach(t => {
    const successRate = t.use_count > 0 ? t.success_count / t.use_count : 0;
    const newWeight = 0.5 + successRate * 1.5; // 0.5 ~ 2.0 범위

    if (Math.abs(newWeight - t.weight) > 0.1) {
      db.prepare("UPDATE template SET weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(newWeight, t.id);
      results.push(`템플릿 #${t.id}: ${t.weight.toFixed(2)} -> ${newWeight.toFixed(2)}`);
    }
  });

  // 요소 가중치 조정
  const elements = db.prepare(`
    SELECT id, element_type, value, use_count, success_count, weight
    FROM pattern_element WHERE use_count >= 5
  `).all() as any[];

  elements.forEach(e => {
    const successRate = e.use_count > 0 ? e.success_count / e.use_count : 0;
    const newWeight = 0.5 + successRate * 1.5;

    if (Math.abs(newWeight - e.weight) > 0.1) {
      db.prepare("UPDATE pattern_element SET weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(newWeight, e.id);
      results.push(`요소 "${e.value}": ${e.weight.toFixed(2)} -> ${newWeight.toFixed(2)}`);
    }
  });

  return results.length > 0
    ? `패턴 진화 완료:\n${results.join("\n")}`
    : "진화할 패턴이 없습니다 (사용량이 부족합니다)";
}

// ============================================
// MCP 서버 설정
// ============================================

const server = new Server(
  {
    name: "mcp-title-patterns",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 도구 목록
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_titles",
        description: "카테고리별 제목을 패턴 기반으로 생성합니다. 매번 다른 조합으로 생성됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "카테고리 이름 (시니어사연, 복수극, 감동사연, 로맨스, 미스터리)"
            },
            count: {
              type: "number",
              description: "생성할 제목 개수 (기본: 10)"
            }
          },
          required: ["category"]
        }
      },
      {
        name: "list_categories",
        description: "사용 가능한 카테고리 목록을 조회합니다."
      },
      {
        name: "get_statistics",
        description: "패턴 사용 통계를 조회합니다."
      },
      {
        name: "add_element",
        description: "새로운 패턴 요소를 추가합니다.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "카테고리 이름 (공통 요소는 null)"
            },
            element_type: {
              type: "string",
              description: "요소 타입 (subject, past_action, time_expression, plot_twist, revelation, emotional_result, hook_ending, place, relationship_change, material_change)"
            },
            value: {
              type: "string",
              description: "요소 값"
            }
          },
          required: ["element_type", "value"]
        }
      },
      {
        name: "add_template",
        description: "새로운 템플릿을 추가합니다. {element_type} 형태로 플레이스홀더를 사용합니다.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "카테고리 이름"
            },
            pattern: {
              type: "string",
              description: "템플릿 패턴 (예: {subject} {past_action} {time_expression})"
            },
            description: {
              type: "string",
              description: "템플릿 설명"
            }
          },
          required: ["category", "pattern", "description"]
        }
      },
      {
        name: "list_elements",
        description: "패턴 요소 목록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {
            element_type: {
              type: "string",
              description: "요소 타입 필터 (선택)"
            },
            category: {
              type: "string",
              description: "카테고리 필터 (선택)"
            }
          }
        }
      },
      {
        name: "list_templates",
        description: "템플릿 목록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "카테고리 필터 (선택)"
            }
          }
        }
      },
      {
        name: "mark_selected",
        description: "사용자가 선택한 제목을 표시합니다. 이 정보로 패턴이 진화합니다.",
        inputSchema: {
          type: "object",
          properties: {
            log_id: {
              type: "number",
              description: "generation_log의 ID"
            }
          },
          required: ["log_id"]
        }
      },
      {
        name: "evolve_patterns",
        description: "사용 통계를 기반으로 패턴 가중치를 자동 조정합니다."
      }
    ]
  };
});

// 도구 실행
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "generate_titles": {
        const category = args?.category as string;
        const count = (args?.count as number) || 10;
        const titles = generateTitles(category, count);

        if (titles.length === 0) {
          return { content: [{ type: "text", text: `카테고리 "${category}"를 찾을 수 없거나 패턴이 없습니다.` }] };
        }

        const result = titles.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
        return { content: [{ type: "text", text: `📝 생성된 제목 (${category}):\n\n${result}` }] };
      }

      case "list_categories": {
        const categories = db.prepare("SELECT name, display_name, description FROM category WHERE is_active = 1").all() as any[];
        const result = categories.map(c => `- ${c.name}: ${c.display_name} - ${c.description || ""}`).join("\n");
        return { content: [{ type: "text", text: `📁 카테고리 목록:\n\n${result}` }] };
      }

      case "get_statistics": {
        const stats = getStatistics();
        let result = `📊 패턴 통계\n\n`;
        result += `총 요소: ${stats.summary.totalElements}개\n`;
        result += `총 템플릿: ${stats.summary.totalTemplates}개\n`;
        result += `총 생성: ${stats.summary.totalGenerations}회\n\n`;
        result += `카테고리별:\n`;
        stats.categories.forEach((c: any) => {
          result += `- ${c.display_name}: 요소 ${c.element_count}개, 템플릿 ${c.template_count}개, 생성 ${c.generation_count}회\n`;
        });
        return { content: [{ type: "text", text: result }] };
      }

      case "add_element": {
        const success = addElement(
          args?.category as string | null,
          args?.element_type as string,
          args?.value as string
        );
        return {
          content: [{
            type: "text",
            text: success ? "✅ 요소가 추가되었습니다." : "❌ 요소 추가 실패 (이미 존재하거나 오류)"
          }]
        };
      }

      case "add_template": {
        const success = addTemplate(
          args?.category as string,
          args?.pattern as string,
          args?.description as string
        );
        return {
          content: [{
            type: "text",
            text: success ? "✅ 템플릿이 추가되었습니다." : "❌ 템플릿 추가 실패"
          }]
        };
      }

      case "list_elements": {
        const elements = listElements(args?.element_type as string, args?.category as string);
        const grouped: Record<string, any[]> = {};
        elements.forEach(e => {
          if (!grouped[e.element_type]) grouped[e.element_type] = [];
          grouped[e.element_type].push(e);
        });

        let result = "📝 패턴 요소 목록:\n\n";
        for (const [type, elems] of Object.entries(grouped)) {
          result += `## ${type} (${elems.length}개)\n`;
          elems.slice(0, 20).forEach(e => {
            result += `- ${e.value} (사용: ${e.use_count}, 성공: ${e.success_count})\n`;
          });
          if (elems.length > 20) result += `  ... 외 ${elems.length - 20}개\n`;
          result += "\n";
        }
        return { content: [{ type: "text", text: result }] };
      }

      case "list_templates": {
        const templates = listTemplates(args?.category as string);
        let result = "📋 템플릿 목록:\n\n";
        templates.forEach(t => {
          result += `[${t.category_name}] ${t.description}\n`;
          result += `  패턴: ${t.pattern}\n`;
          result += `  사용: ${t.use_count}회, 성공: ${t.success_count}회\n\n`;
        });
        return { content: [{ type: "text", text: result }] };
      }

      case "mark_selected": {
        const success = markTitleSelected(args?.log_id as number);
        return {
          content: [{
            type: "text",
            text: success ? "✅ 선택이 기록되었습니다." : "❌ 기록 실패"
          }]
        };
      }

      case "evolve_patterns": {
        const result = evolvePatterns();
        return { content: [{ type: "text", text: result }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `오류: ${error.message}` }],
      isError: true
    };
  }
});

// 서버 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🎯 MCP Title Patterns 서버가 시작되었습니다.");
}

main().catch(console.error);
