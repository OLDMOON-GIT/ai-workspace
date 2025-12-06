/**
 * ERD Parser
 * ERD 다이어그램에서 DB 마이그레이션 SQL 생성
 */

import * as fs from 'fs';

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  foreignKey?: {
    table: string;
    column: string;
  };
  unique: boolean;
  index: boolean;
  comment?: string;
}

export interface Table {
  name: string;
  columns: Column[];
  indexes: Index[];
  comment?: string;
}

export interface Index {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface Relationship {
  from: { table: string; column: string };
  to: { table: string; column: string };
  type: '1:1' | '1:N' | 'N:1' | 'N:M';
}

export interface ERDDocument {
  tables: Table[];
  relationships: Relationship[];
}

export interface MigrationSQL {
  up: string;
  down: string;
}

/**
 * Mermaid ERD 문법 파싱
 * 예:
 * erDiagram
 *     CUSTOMER ||--o{ ORDER : places
 *     ORDER ||--|{ LINE-ITEM : contains
 *     CUSTOMER {
 *         string name
 *         string email PK
 *     }
 */
export function parseMermaidERD(content: string): ERDDocument {
  const doc: ERDDocument = {
    tables: [],
    relationships: []
  };

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  let currentTable: Table | null = null;
  let inTableBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // erDiagram 헤더 스킵
    if (line.toLowerCase() === 'erdiagram') continue;

    // 관계 파싱 (TABLE1 ||--o{ TABLE2 : relation)
    const relMatch = line.match(/(\w+)\s+(\|\||\|o|o\||\}o|o\{|\|\{|\}\|)--(\|\||\|o|o\||\}o|o\{|\|\{|\}\|)\s+(\w+)\s*:\s*(\w+)?/);
    if (relMatch) {
      const [, from, leftCard, rightCard, to] = relMatch;
      doc.relationships.push({
        from: { table: from, column: 'id' },
        to: { table: to, column: `${from.toLowerCase()}_id` },
        type: cardinalityToType(leftCard, rightCard)
      });
      continue;
    }

    // 테이블 정의 시작 ({ 포함)
    const tableStartMatch = line.match(/(\w+)\s*\{/);
    if (tableStartMatch) {
      currentTable = {
        name: tableStartMatch[1],
        columns: [],
        indexes: []
      };
      inTableBlock = true;
      continue;
    }

    // 테이블 정의 종료 (})
    if (line === '}' && currentTable) {
      doc.tables.push(currentTable);
      currentTable = null;
      inTableBlock = false;
      continue;
    }

    // 컬럼 파싱 (type name [PK] [FK] [UK] ["comment"])
    if (inTableBlock && currentTable) {
      const colMatch = line.match(/(\w+)\s+(\w+)(?:\s+(PK|FK|UK))?(?:\s+"([^"]+)")?/);
      if (colMatch) {
        const [, type, name, constraint, comment] = colMatch;
        currentTable.columns.push({
          name,
          type: mermaidTypeToSQL(type),
          nullable: true,
          primaryKey: constraint === 'PK',
          autoIncrement: constraint === 'PK' && type === 'int',
          unique: constraint === 'UK',
          index: constraint === 'FK',
          comment
        });
      }
    }
  }

  return doc;
}

/**
 * DBML 형식 파싱
 */
export function parseDBML(content: string): ERDDocument {
  const doc: ERDDocument = {
    tables: [],
    relationships: []
  };

  const lines = content.split('\n');
  let currentTable: Table | null = null;
  let inTableBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 테이블 정의 시작
    const tableMatch = trimmed.match(/^Table\s+(\w+)\s*(?:as\s+(\w+))?\s*\{/);
    if (tableMatch) {
      currentTable = {
        name: tableMatch[1],
        columns: [],
        indexes: []
      };
      inTableBlock = true;
      continue;
    }

    // 테이블 종료
    if (trimmed === '}' && currentTable) {
      doc.tables.push(currentTable);
      currentTable = null;
      inTableBlock = false;
      continue;
    }

    // 컬럼 파싱 (name type [pk, not null, unique, default: 'value'])
    if (inTableBlock && currentTable && !trimmed.startsWith('//') && !trimmed.startsWith('indexes')) {
      const colMatch = trimmed.match(/^(\w+)\s+(\w+(?:\([\d,]+\))?)\s*(?:\[(.*?)\])?/);
      if (colMatch) {
        const [, name, type, constraints] = colMatch;
        const constraintList = constraints?.split(',').map(c => c.trim().toLowerCase()) || [];

        currentTable.columns.push({
          name,
          type: dbmlTypeToSQL(type),
          nullable: !constraintList.includes('not null'),
          primaryKey: constraintList.includes('pk'),
          autoIncrement: constraintList.includes('increment'),
          unique: constraintList.includes('unique'),
          index: false,
          defaultValue: extractDefault(constraints)
        });
      }
    }

    // 관계 파싱 (Ref: table1.col1 > table2.col2)
    const refMatch = trimmed.match(/^Ref:\s*(\w+)\.(\w+)\s*([<>-])\s*(\w+)\.(\w+)/);
    if (refMatch) {
      const [, fromTable, fromCol, rel, toTable, toCol] = refMatch;
      doc.relationships.push({
        from: { table: fromTable, column: fromCol },
        to: { table: toTable, column: toCol },
        type: rel === '<' ? 'N:1' : rel === '>' ? '1:N' : '1:1'
      });
    }
  }

  return doc;
}

/**
 * MySQL 마이그레이션 SQL 생성
 */
export function generateMySQLMigration(doc: ERDDocument): MigrationSQL {
  const upStatements: string[] = [];
  const downStatements: string[] = [];

  for (const table of doc.tables) {
    const columns = table.columns.map(col => {
      let def = `  \`${col.name}\` ${col.type}`;

      if (col.primaryKey && col.autoIncrement) {
        def += ' AUTO_INCREMENT';
      }

      if (!col.nullable) {
        def += ' NOT NULL';
      }

      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${col.defaultValue}`;
      }

      if (col.unique) {
        def += ' UNIQUE';
      }

      if (col.comment) {
        def += ` COMMENT '${col.comment}'`;
      }

      return def;
    });

    // Primary Key
    const pkCols = table.columns.filter(c => c.primaryKey);
    if (pkCols.length > 0) {
      columns.push(`  PRIMARY KEY (\`${pkCols.map(c => c.name).join('`, `')}\`)`);
    }

    // Indexes
    for (const index of table.indexes) {
      const indexType = index.unique ? 'UNIQUE KEY' : 'KEY';
      columns.push(`  ${indexType} \`${index.name}\` (\`${index.columns.join('`, `')}\`)`);
    }

    upStatements.push(`CREATE TABLE IF NOT EXISTS \`${table.name}\` (\n${columns.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    downStatements.push(`DROP TABLE IF EXISTS \`${table.name}\`;`);
  }

  // Foreign Key 제약조건 (테이블 생성 후 추가)
  for (const rel of doc.relationships) {
    const fkName = `fk_${rel.from.table}_${rel.from.column}`;
    upStatements.push(`ALTER TABLE \`${rel.from.table}\` ADD CONSTRAINT \`${fkName}\` FOREIGN KEY (\`${rel.from.column}\`) REFERENCES \`${rel.to.table}\` (\`${rel.to.column}\`) ON DELETE CASCADE ON UPDATE CASCADE;`);
    downStatements.unshift(`ALTER TABLE \`${rel.from.table}\` DROP FOREIGN KEY \`${fkName}\`;`);
  }

  return {
    up: `-- Migration UP\n-- Generated at ${new Date().toISOString()}\n\n${upStatements.join('\n\n')}`,
    down: `-- Migration DOWN\n-- Generated at ${new Date().toISOString()}\n\n${downStatements.join('\n\n')}`
  };
}

/**
 * Mermaid 타입을 SQL 타입으로 변환
 */
function mermaidTypeToSQL(type: string): string {
  const typeMap: Record<string, string> = {
    'int': 'INT',
    'integer': 'INT',
    'string': 'VARCHAR(255)',
    'text': 'TEXT',
    'float': 'FLOAT',
    'double': 'DOUBLE',
    'decimal': 'DECIMAL(10,2)',
    'boolean': 'TINYINT(1)',
    'bool': 'TINYINT(1)',
    'date': 'DATE',
    'datetime': 'DATETIME',
    'timestamp': 'TIMESTAMP',
    'time': 'TIME',
    'json': 'JSON',
    'blob': 'BLOB',
    'uuid': 'VARCHAR(36)'
  };

  return typeMap[type.toLowerCase()] || 'VARCHAR(255)';
}

/**
 * DBML 타입을 SQL 타입으로 변환
 */
function dbmlTypeToSQL(type: string): string {
  return mermaidTypeToSQL(type.replace(/\(.*\)/, ''));
}

/**
 * 기수성(cardinality)을 관계 타입으로 변환
 */
function cardinalityToType(left: string, right: string): '1:1' | '1:N' | 'N:1' | 'N:M' {
  const leftMany = left.includes('{') || left.includes('}');
  const rightMany = right.includes('{') || right.includes('}');

  if (leftMany && rightMany) return 'N:M';
  if (leftMany) return 'N:1';
  if (rightMany) return '1:N';
  return '1:1';
}

/**
 * default 값 추출
 */
function extractDefault(constraints?: string): string | undefined {
  if (!constraints) return undefined;
  const match = constraints.match(/default:\s*([^\]]+)/i);
  return match?.[1]?.trim();
}

/**
 * ERD 파일 파싱 (형식 자동 감지)
 */
export function parseERDFile(filePath: string): ERDDocument {
  const content = fs.readFileSync(filePath, 'utf-8');

  // DBML 형식 감지
  if (content.includes('Table ') && content.includes('Ref:')) {
    return parseDBML(content);
  }

  // Mermaid 형식 감지
  if (content.toLowerCase().includes('erdiagram')) {
    return parseMermaidERD(content);
  }

  throw new Error('Unknown ERD format. Supported: Mermaid ERD, DBML');
}

export default {
  parseMermaidERD,
  parseDBML,
  parseERDFile,
  generateMySQLMigration
};
