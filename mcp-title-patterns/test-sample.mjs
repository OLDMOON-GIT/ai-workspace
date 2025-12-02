import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'data', 'patterns.db'));

function getRandomElement(categoryId, elementType) {
  // 먼저 카테고리별 요소 찾고, 없으면 공통 요소 (category_id IS NULL)
  let rows = db.prepare(`
    SELECT value, weight FROM pattern_element
    WHERE category_id = ? AND element_type = ?
  `).all(categoryId, elementType);

  if (rows.length === 0) {
    rows = db.prepare(`
      SELECT value, weight FROM pattern_element
      WHERE category_id IS NULL AND element_type = ?
    `).all(elementType);
  }

  if (rows.length === 0) return '';

  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;

  for (const row of rows) {
    random -= row.weight;
    if (random <= 0) return row.value;
  }
  return rows[0].value;
}

function generateTitle(categoryId) {
  const templates = db.prepare(`
    SELECT id, pattern, weight FROM template WHERE category_id = ? AND is_active = 1
  `).all(categoryId);

  if (templates.length === 0) return '템플릿 없음';

  const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  let template = templates[0];

  for (const t of templates) {
    random -= t.weight;
    if (random <= 0) {
      template = t;
      break;
    }
  }

  return template.pattern.replace(/\{(\w+)\}/g, (match, elementType) => {
    return getRandomElement(categoryId, elementType) || match;
  });
}

// 카테고리 목록 가져오기
const categories = db.prepare('SELECT id, display_name FROM category WHERE is_active = 1').all();

console.log('\n🎯 제목 샘플 10개:\n');

// 시니어 실화 카테고리 (id=1)에서 10개 생성
for (let i = 0; i < 10; i++) {
  const title = generateTitle(1);
  console.log(`${i + 1}. ${title}`);
}
console.log('');
