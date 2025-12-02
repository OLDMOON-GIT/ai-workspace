/**
 * 자동 패턴 진화 시스템
 * - 성공한 패턴 분석
 * - 새로운 변형 자동 생성
 * - 가중치 자동 조정
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'patterns.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ DB 파일이 없습니다. MCP 서버를 먼저 실행하세요.');
  process.exit(1);
}

const db = new Database(DB_PATH);

// ============================================
// 1. 성공률 기반 가중치 자동 조정
// ============================================
function evolveWeights(): string[] {
  const results: string[] = [];

  // 템플릿 가중치 조정 (최소 5회 이상 사용된 것만)
  const templates = db.prepare(`
    SELECT id, pattern, use_count, success_count, weight
    FROM template WHERE use_count >= 5
  `).all() as any[];

  templates.forEach(t => {
    const successRate = t.success_count / t.use_count;
    // 성공률에 따라 0.3 ~ 2.5 범위로 가중치 조정
    const newWeight = Math.max(0.3, Math.min(2.5, 0.5 + successRate * 2));

    if (Math.abs(newWeight - t.weight) > 0.1) {
      db.prepare('UPDATE template SET weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newWeight, t.id);
      results.push(`템플릿 #${t.id}: ${t.weight.toFixed(2)} → ${newWeight.toFixed(2)} (성공률 ${(successRate * 100).toFixed(0)}%)`);
    }
  });

  // 요소 가중치 조정
  const elements = db.prepare(`
    SELECT id, element_type, value, use_count, success_count, weight
    FROM pattern_element WHERE use_count >= 3
  `).all() as any[];

  elements.forEach(e => {
    const successRate = e.success_count / e.use_count;
    const newWeight = Math.max(0.3, Math.min(2.5, 0.5 + successRate * 2));

    if (Math.abs(newWeight - e.weight) > 0.1) {
      db.prepare('UPDATE pattern_element SET weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newWeight, e.id);
      results.push(`요소 "${e.value.substring(0, 15)}...": ${e.weight.toFixed(2)} → ${newWeight.toFixed(2)}`);
    }
  });

  return results;
}

// ============================================
// 2. 성공한 제목에서 새 패턴 추출
// ============================================
function extractNewPatterns(): string[] {
  const results: string[] = [];

  // 최근 선택된 제목들 분석
  const selectedTitles = db.prepare(`
    SELECT generated_title, template_id, elements_used
    FROM generation_log
    WHERE was_selected = 1
    ORDER BY created_at DESC
    LIMIT 50
  `).all() as any[];

  if (selectedTitles.length < 10) {
    return ['선택된 제목이 10개 미만이라 분석 불가'];
  }

  // 자주 사용되는 요소 조합 찾기
  const elementCombos: Record<string, number> = {};
  selectedTitles.forEach(t => {
    if (t.elements_used) {
      const elements = JSON.parse(t.elements_used);
      const key = elements.sort().join('|');
      elementCombos[key] = (elementCombos[key] || 0) + 1;
    }
  });

  // 가장 인기 있는 조합 기록
  const topCombos = Object.entries(elementCombos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  topCombos.forEach(([combo, count]) => {
    results.push(`인기 조합 (${count}회): ${combo.split('|').slice(0, 3).join(', ')}...`);
  });

  return results;
}

// ============================================
// 3. 저성과 패턴 비활성화
// ============================================
function pruneUnderperformers(): string[] {
  const results: string[] = [];

  // 사용 횟수 많지만 성공률 10% 미만인 템플릿 비활성화
  const badTemplates = db.prepare(`
    SELECT id, pattern, use_count, success_count
    FROM template
    WHERE use_count >= 20 AND (success_count * 1.0 / use_count) < 0.1 AND is_active = 1
  `).all() as any[];

  badTemplates.forEach(t => {
    db.prepare('UPDATE template SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(t.id);
    results.push(`비활성화: 템플릿 #${t.id} (성공률 ${((t.success_count / t.use_count) * 100).toFixed(0)}%)`);
  });

  return results;
}

// ============================================
// 4. 새로운 변형 요소 자동 생성
// ============================================
function generateVariations(): string[] {
  const results: string[] = [];

  // 성공률 높은 요소들 가져오기
  const topElements = db.prepare(`
    SELECT element_type, value, success_count, use_count
    FROM pattern_element
    WHERE use_count >= 5 AND (success_count * 1.0 / use_count) > 0.3
    ORDER BY success_count DESC
    LIMIT 20
  `).all() as any[];

  // 주어 변형 생성 (숫자 변경, 관계 변경)
  const subjectVariations: Record<string, string[]> = {
    '80세': ['75세', '85세', '90세'],
    '70대': ['60대', '80대'],
    '3남매': ['4남매', '5남매', '2남매'],
    '30년': ['20년', '40년', '50년'],
    '할머니가': ['할아버지가', '어르신이'],
    '아버지가': ['어머니가', '부모님이'],
  };

  topElements.filter(e => e.element_type === 'subject').forEach(elem => {
    for (const [pattern, replacements] of Object.entries(subjectVariations)) {
      if (elem.value.includes(pattern)) {
        replacements.forEach(replacement => {
          const newValue = elem.value.replace(pattern, replacement);
          try {
            db.prepare(`
              INSERT OR IGNORE INTO pattern_element (category_id, element_type, value, weight)
              SELECT category_id, element_type, ?, 1.0
              FROM pattern_element WHERE id = ?
            `).run(newValue, elem.id);
            results.push(`새 변형: "${newValue}"`);
          } catch {
            // 이미 존재하면 무시
          }
        });
      }
    }
  });

  return results.slice(0, 10); // 최대 10개만 리포트
}

// ============================================
// 5. 일간 통계 리포트
// ============================================
function dailyReport(): Record<string, any> {
  const today = new Date().toISOString().split('T')[0];

  const todayGenerations = db.prepare(`
    SELECT COUNT(*) as cnt FROM generation_log
    WHERE date(created_at) = date('now')
  `).get() as any;

  const todaySelections = db.prepare(`
    SELECT COUNT(*) as cnt FROM generation_log
    WHERE date(created_at) = date('now') AND was_selected = 1
  `).get() as any;

  const topTemplates = db.prepare(`
    SELECT t.description, COUNT(*) as cnt
    FROM generation_log gl
    JOIN template t ON gl.template_id = t.id
    WHERE date(gl.created_at) = date('now')
    GROUP BY t.id
    ORDER BY cnt DESC
    LIMIT 5
  `).all();

  return {
    date: today,
    totalGenerations: todayGenerations.cnt,
    totalSelections: todaySelections.cnt,
    selectionRate: todayGenerations.cnt > 0
      ? ((todaySelections.cnt / todayGenerations.cnt) * 100).toFixed(1) + '%'
      : 'N/A',
    topTemplates
  };
}

// ============================================
// 메인 실행
// ============================================
export function runAutoEvolve(): string {
  const output: string[] = [];

  output.push('🧬 자동 패턴 진화 시작...\n');

  // 1. 가중치 조정
  output.push('## 1. 가중치 조정');
  const weightResults = evolveWeights();
  if (weightResults.length > 0) {
    output.push(...weightResults.map(r => `  ${r}`));
  } else {
    output.push('  변경 없음');
  }
  output.push('');

  // 2. 패턴 분석
  output.push('## 2. 성공 패턴 분석');
  const patternResults = extractNewPatterns();
  output.push(...patternResults.map(r => `  ${r}`));
  output.push('');

  // 3. 저성과 정리
  output.push('## 3. 저성과 패턴 정리');
  const pruneResults = pruneUnderperformers();
  if (pruneResults.length > 0) {
    output.push(...pruneResults.map(r => `  ${r}`));
  } else {
    output.push('  비활성화된 패턴 없음');
  }
  output.push('');

  // 4. 변형 생성
  output.push('## 4. 새 변형 생성');
  const variationResults = generateVariations();
  if (variationResults.length > 0) {
    output.push(...variationResults.map(r => `  ${r}`));
  } else {
    output.push('  새 변형 없음');
  }
  output.push('');

  // 5. 일간 리포트
  output.push('## 5. 오늘 통계');
  const report = dailyReport();
  output.push(`  생성: ${report.totalGenerations}회`);
  output.push(`  선택: ${report.totalSelections}회`);
  output.push(`  선택률: ${report.selectionRate}`);
  output.push('');

  output.push('✅ 자동 진화 완료!');

  return output.join('\n');
}

// CLI 실행
if (process.argv[1].includes('auto-evolve')) {
  console.log(runAutoEvolve());
}

export { evolveWeights, extractNewPatterns, pruneUnderperformers, generateVariations, dailyReport };
