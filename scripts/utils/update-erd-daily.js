/**
 * ERD 자동 업데이트 스크립트
 * 매일 새벽 6시 실행 (Windows Task Scheduler)
 */

const fs = require('fs');
const path = require('path');

// trend-video-frontend의 node_modules에서 better-sqlite3 로드
const FRONTEND_PATH = path.join(__dirname, '../../trend-video-frontend');
const Database = require(path.join(FRONTEND_PATH, 'node_modules/better-sqlite3'));

const DB_PATH = path.join(FRONTEND_PATH, 'data/database.sqlite');
const ERD_DOC_PATH = path.join(FRONTEND_PATH, 'docs/DATABASE_ERD.md');

function getTables(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  return tables.map(t => t.name);
}

function getTableSchema(db, tableName) {
  const schema = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all();
  const indexes = db.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_%'
  `).all(tableName);

  return { columns: schema, foreignKeys, indexes };
}

function generateMermaidERD(db) {
  const tables = getTables(db);
  let erd = '```mermaid\nerDiagram\n';

  // 관계 정의 (외래키 기반)
  const relationships = new Set();
  tables.forEach(table => {
    const { foreignKeys } = getTableSchema(db, table);
    foreignKeys.forEach(fk => {
      const rel = `    ${fk.table.toUpperCase()} ||--o{ ${table.toUpperCase()} : "has many"`;
      relationships.add(rel);
    });
  });

  relationships.forEach(rel => erd += rel + '\n');
  erd += '\n';

  // 테이블 정의
  tables.forEach(table => {
    const { columns } = getTableSchema(db, table);
    erd += `    ${table.toUpperCase()} {\n`;

    columns.forEach(col => {
      const pk = col.pk ? ' PK' : '';
      const notNull = col.notnull && !col.pk ? ' NOT NULL' : '';
      erd += `        ${col.type} ${col.name}${pk}${notNull}\n`;
    });

    erd += '    }\n\n';
  });

  erd += '```';
  return erd;
}

function generateTableList(db) {
  const tables = getTables(db);
  let list = '## 📊 테이블 목록\n\n';
  list += `**총 ${tables.length}개 테이블**\n\n`;

  // 카테고리별 분류
  const categories = {
    '사용자 & 인증': [],
    '작업 & 큐': [],
    '자동화': [],
    '콘텐츠': [],
    '쿠팡 & 쇼핑': [],
    '소셜미디어': [],
    '로그 & 통계': [],
    '기타': []
  };

  tables.forEach(table => {
    if (table.match(/^(users|sessions|credit|charge)/)) {
      categories['사용자 & 인증'].push(table);
    } else if (table.match(/^(jobs|tasks|queue|unified)/)) {
      categories['작업 & 큐'].push(table);
    } else if (table.match(/^(automation|video_schedules|video_titles|title_pool)/)) {
      categories['자동화'].push(table);
    } else if (table.match(/^(contents|scripts|folders)/)) {
      categories['콘텐츠'].push(table);
    } else if (table.match(/^(coupang|shop|pending_products)/)) {
      categories['쿠팡 & 쇼핑'].push(table);
    } else if (table.match(/^(youtube|wordpress|social_media)/)) {
      categories['소셜미디어'].push(table);
    } else if (table.match(/log|api_costs/)) {
      categories['로그 & 통계'].push(table);
    } else {
      categories['기타'].push(table);
    }
  });

  Object.entries(categories).forEach(([category, tables]) => {
    if (tables.length > 0) {
      list += `### ${category} (${tables.length}개)\n`;
      tables.forEach(t => {
        const { columns } = getTableSchema(db, t);
        list += `- **${t}** (${columns.length}개 컬럼)\n`;
      });
      list += '\n';
    }
  });

  return list;
}

function generateDetailedSchemas(db) {
  const tables = getTables(db);
  let details = '## 📋 테이블 상세 스키마\n\n';

  tables.forEach(table => {
    const { columns, foreignKeys, indexes } = getTableSchema(db, table);

    details += `### ${table}\n\n`;
    details += '**컬럼:**\n\n';
    details += '| 컬럼명 | 타입 | 제약 | 설명 |\n';
    details += '|--------|------|------|------|\n';

    columns.forEach(col => {
      const constraints = [];
      if (col.pk) constraints.push('PK');
      if (col.notnull && !col.pk) constraints.push('NOT NULL');
      if (col.dflt_value) constraints.push(`DEFAULT ${col.dflt_value}`);

      details += `| ${col.name} | ${col.type} | ${constraints.join(', ') || '-'} | |\n`;
    });

    if (foreignKeys.length > 0) {
      details += '\n**외래키:**\n\n';
      foreignKeys.forEach(fk => {
        details += `- ${fk.from} → ${fk.table}(${fk.to})\n`;
      });
    }

    if (indexes.length > 0) {
      details += '\n**인덱스:**\n\n';
      indexes.forEach(idx => {
        details += `- ${idx.name}\n`;
      });
    }

    details += '\n---\n\n';
  });

  return details;
}

function updateERDDocument() {
  console.log('📊 ERD 문서 업데이트 시작...');
  console.log(`⏰ 실행 시간: ${new Date().toLocaleString('ko-KR')}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 데이터베이스 파일을 찾을 수 없습니다:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  try {
    const tables = getTables(db);
    console.log(`✅ ${tables.length}개 테이블 발견`);

    // ERD 문서 생성
    let doc = '# 데이터베이스 ERD (Entity Relationship Diagram)\n\n';
    doc += `> 🤖 자동 생성됨: ${new Date().toLocaleString('ko-KR')}\n`;
    doc += `> 📊 총 ${tables.length}개 테이블\n\n`;
    doc += '---\n\n';

    // Mermaid ERD
    doc += '## 🗺️ 전체 ERD\n\n';
    doc += generateMermaidERD(db);
    doc += '\n\n---\n\n';

    // 테이블 목록
    doc += generateTableList(db);
    doc += '\n---\n\n';

    // 상세 스키마
    doc += generateDetailedSchemas(db);

    // 메타데이터
    doc += '## 📝 변경 이력\n\n';
    doc += `- **마지막 업데이트**: ${new Date().toLocaleString('ko-KR')}\n`;
    doc += `- **업데이트 주기**: 매일 새벽 6시 자동\n`;
    doc += `- **테이블 개수**: ${tables.length}개\n`;

    // 파일 저장
    fs.writeFileSync(ERD_DOC_PATH, doc, 'utf8');
    console.log('✅ ERD 문서 업데이트 완료:', ERD_DOC_PATH);

    // 변경사항 요약
    const stats = fs.statSync(ERD_DOC_PATH);
    console.log(`📄 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('❌ ERD 업데이트 실패:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  updateERDDocument();
}

module.exports = { updateERDDocument };
