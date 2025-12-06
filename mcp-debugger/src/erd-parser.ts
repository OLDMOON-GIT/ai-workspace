/**
 * ERD Parser
 * ERD(Entity-Relationship Diagram)에서 DB 마이그레이션 SQL 생성
 *
 * 지원 포맷:
 * - dbdiagram.io JSON export
 * - Mermaid ERD 문법
 * - PlantUML ERD
 * - 일반 SQL CREATE TABLE
 *
 * 출력:
 * - MySQL 마이그레이션 SQL
 * - TypeScript 타입 정의
 */

import fs from 'fs';
import path from 'path';

export interface ERDTable {
  name: string;
  columns: ERDColumn[];
  primaryKey?: string[];
  foreignKeys: ERDForeignKey[];
  indexes: ERDIndex[];
  comment?: string;
}

export interface ERDColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  autoIncrement?: boolean;
  unique?: boolean;
  comment?: string;
}

export interface ERDForeignKey {
  column: string;
  references: {
    table: string;
    column: string;
  };
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export interface ERDIndex {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface ERDRelation {
  from: { table: string; column: string };
  to: { table: string; column: string };
  type: '1:1' | '1:N' | 'N:1' | 'N:M';
}

export interface ERDParserResult {
  success: boolean;
  tables: ERDTable[];
  relations: ERDRelation[];
  errors: string[];
}

export interface MigrationResult {
  up: string;
  down: string;
  types: string;
}

/**
 * ERD 파일 파싱
 */
export async function parseERDFile(filePath: string): Promise<ERDParserResult> {
  const result: ERDParserResult = {
    success: false,
    tables: [],
    relations: [],
    errors: []
  };

  try {
    if (!fs.existsSync(filePath)) {
      result.errors.push(`파일을 찾을 수 없습니다: ${filePath}`);
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      // JSON 형식 (dbdiagram.io export)
      const parsed = parseJsonERD(content);
      result.tables = parsed.tables;
      result.relations = parsed.relations;
    } else if (content.includes('erDiagram') || content.includes('ER_DIAGRAM')) {
      // Mermaid ERD
      const parsed = parseMermaidERD(content);
      result.tables = parsed.tables;
      result.relations = parsed.relations;
    } else if (content.includes('@startuml') || content.includes('entity')) {
      // PlantUML ERD
      const parsed = parsePlantUMLERD(content);
      result.tables = parsed.tables;
      result.relations = parsed.relations;
    } else if (content.toLowerCase().includes('create table')) {
      // SQL CREATE TABLE
      const parsed = parseSQLERD(content);
      result.tables = parsed.tables;
      result.relations = parsed.relations;
    } else {
      result.errors.push('지원하지 않는 ERD 형식입니다.');
      return result;
    }

    result.success = result.tables.length > 0;
    if (!result.success) {
      result.errors.push('테이블을 추출할 수 없습니다.');
    }
  } catch (error: any) {
    result.errors.push(`파싱 오류: ${error.message}`);
  }

  return result;
}

/**
 * JSON ERD 파싱 (dbdiagram.io 스타일)
 */
function parseJsonERD(content: string): { tables: ERDTable[]; relations: ERDRelation[] } {
  const tables: ERDTable[] = [];
  const relations: ERDRelation[] = [];

  try {
    const data = JSON.parse(content);

    // 테이블 파싱
    const tableData = data.tables || data.entities || (Array.isArray(data) ? data : []);
    for (const table of tableData) {
      tables.push(parseJsonTable(table));
    }

    // 관계 파싱
    const relData = data.relations || data.relationships || data.refs || [];
    for (const rel of relData) {
      relations.push(parseJsonRelation(rel));
    }
  } catch (error: any) {
    console.error('JSON ERD 파싱 오류:', error.message);
  }

  return { tables, relations };
}

/**
 * JSON 테이블 파싱
 */
function parseJsonTable(data: any): ERDTable {
  const columns: ERDColumn[] = [];
  const foreignKeys: ERDForeignKey[] = [];
  const indexes: ERDIndex[] = [];
  let primaryKey: string[] = [];

  // 컬럼 파싱
  const colData = data.columns || data.fields || data.attributes || [];
  for (const col of colData) {
    const column: ERDColumn = {
      name: col.name || col.field,
      type: normalizeType(col.type || col.dataType || 'VARCHAR(255)'),
      nullable: col.nullable !== false && !col.notNull && !col.required,
      defaultValue: col.default || col.defaultValue,
      autoIncrement: col.autoIncrement || col.auto_increment,
      unique: col.unique,
      comment: col.comment || col.description
    };
    columns.push(column);

    if (col.pk || col.primaryKey || col.primary) {
      primaryKey.push(column.name);
    }
  }

  // FK 파싱
  const fkData = data.foreignKeys || data.references || [];
  for (const fk of fkData) {
    foreignKeys.push({
      column: fk.column || fk.field,
      references: {
        table: fk.refTable || fk.references?.table,
        column: fk.refColumn || fk.references?.column
      },
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate
    });
  }

  // 인덱스 파싱
  const idxData = data.indexes || data.indices || [];
  for (const idx of idxData) {
    indexes.push({
      name: idx.name,
      columns: Array.isArray(idx.columns) ? idx.columns : [idx.column],
      unique: idx.unique
    });
  }

  return {
    name: data.name || data.table || data.entity,
    columns,
    primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
    foreignKeys,
    indexes,
    comment: data.comment || data.description
  };
}

/**
 * JSON 관계 파싱
 */
function parseJsonRelation(data: any): ERDRelation {
  return {
    from: {
      table: data.from?.table || data.source?.table,
      column: data.from?.column || data.source?.column
    },
    to: {
      table: data.to?.table || data.target?.table,
      column: data.to?.column || data.target?.column
    },
    type: normalizeRelationType(data.type || data.cardinality)
  };
}

/**
 * Mermaid ERD 파싱
 */
function parseMermaidERD(content: string): { tables: ERDTable[]; relations: ERDRelation[] } {
  const tables: ERDTable[] = [];
  const relations: ERDRelation[] = [];

  // 테이블 정의 추출
  // 형식: TABLE_NAME { column_name type "comment" }
  const tablePattern = /(\w+)\s*\{([^}]*)\}/g;
  let match;

  while ((match = tablePattern.exec(content)) !== null) {
    const tableName = match[1];
    const columnBlock = match[2];

    const columns: ERDColumn[] = [];
    const columnLines = columnBlock.split('\n').filter(l => l.trim());

    for (const line of columnLines) {
      const colMatch = line.trim().match(/(\w+)\s+(\w+)(?:\s+PK)?(?:\s+FK)?(?:\s+"([^"]*)")?/);
      if (colMatch) {
        columns.push({
          name: colMatch[1],
          type: normalizeType(colMatch[2]),
          nullable: !line.includes('NOT NULL'),
          comment: colMatch[3]
        });
      }
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey: columns.filter(c => content.includes(`${c.name} PK`) || c.name === 'id' || c.name.endsWith('_id')).map(c => c.name).slice(0, 1),
      foreignKeys: [],
      indexes: []
    });
  }

  // 관계 추출
  // 형식: TABLE1 ||--o{ TABLE2 : "relation"
  const relPattern = /(\w+)\s*([\|o\{\}]+)[-]+([\|o\{\}]+)\s*(\w+)/g;

  while ((match = relPattern.exec(content)) !== null) {
    const [, from, leftCard, rightCard, to] = match;
    relations.push({
      from: { table: from, column: 'id' },
      to: { table: to, column: `${from.toLowerCase()}_id` },
      type: parseCardinalitySymbols(leftCard, rightCard)
    });
  }

  return { tables, relations };
}

/**
 * PlantUML ERD 파싱
 */
function parsePlantUMLERD(content: string): { tables: ERDTable[]; relations: ERDRelation[] } {
  const tables: ERDTable[] = [];
  const relations: ERDRelation[] = [];

  // entity 정의 추출
  const entityPattern = /entity\s+"?(\w+)"?\s*(?:as\s+\w+)?\s*\{([^}]*)\}/g;
  let match;

  while ((match = entityPattern.exec(content)) !== null) {
    const tableName = match[1];
    const fieldBlock = match[2];

    const columns: ERDColumn[] = [];
    const lines = fieldBlock.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));

    for (const line of lines) {
      const fieldMatch = line.trim().match(/[*~#]?\s*(\w+)\s*:\s*(\w+(?:\(\d+\))?)/);
      if (fieldMatch) {
        const isPK = line.includes('*') || line.includes('#');
        columns.push({
          name: fieldMatch[1],
          type: normalizeType(fieldMatch[2]),
          nullable: !isPK,
          unique: isPK
        });
      }
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey: columns.filter(c => !c.nullable).map(c => c.name).slice(0, 1),
      foreignKeys: [],
      indexes: []
    });
  }

  // 관계 추출
  const relPattern = /(\w+)\s*([\|\.o\*\+]+)[-]+([\|\.o\*\+]+)\s*(\w+)/g;

  while ((match = relPattern.exec(content)) !== null) {
    const [, from, leftCard, rightCard, to] = match;
    relations.push({
      from: { table: from, column: 'id' },
      to: { table: to, column: `${from.toLowerCase()}_id` },
      type: parsePlantUMLCardinality(leftCard, rightCard)
    });
  }

  return { tables, relations };
}

/**
 * SQL CREATE TABLE 파싱
 */
function parseSQLERD(content: string): { tables: ERDTable[]; relations: ERDRelation[] } {
  const tables: ERDTable[] = [];
  const relations: ERDRelation[] = [];

  // CREATE TABLE 추출
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([^;]+)\)/gi;
  let match;

  while ((match = tablePattern.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];

    const columns: ERDColumn[] = [];
    const foreignKeys: ERDForeignKey[] = [];
    const indexes: ERDIndex[] = [];
    let primaryKey: string[] = [];

    // 컬럼과 제약조건 분리
    const statements = body.split(',').map(s => s.trim()).filter(s => s);

    for (const stmt of statements) {
      const upperStmt = stmt.toUpperCase();

      // PRIMARY KEY
      if (upperStmt.startsWith('PRIMARY KEY')) {
        const pkMatch = stmt.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkMatch) {
          primaryKey = pkMatch[1].split(',').map(c => c.trim().replace(/[`"]/g, ''));
        }
        continue;
      }

      // FOREIGN KEY
      if (upperStmt.startsWith('FOREIGN KEY') || upperStmt.includes('REFERENCES')) {
        const fkMatch = stmt.match(/(?:FOREIGN\s+KEY\s*\()?[`"]?(\w+)[`"]?\)?\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\([`"]?(\w+)[`"]?\)/i);
        if (fkMatch) {
          foreignKeys.push({
            column: fkMatch[1],
            references: { table: fkMatch[2], column: fkMatch[3] },
            onDelete: stmt.toUpperCase().includes('ON DELETE CASCADE') ? 'CASCADE' : undefined,
            onUpdate: stmt.toUpperCase().includes('ON UPDATE CASCADE') ? 'CASCADE' : undefined
          });
        }
        continue;
      }

      // INDEX / KEY
      if (upperStmt.startsWith('INDEX') || upperStmt.startsWith('KEY') || upperStmt.startsWith('UNIQUE')) {
        const idxMatch = stmt.match(/(?:UNIQUE\s+)?(?:INDEX|KEY)\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/i);
        if (idxMatch) {
          indexes.push({
            name: idxMatch[1],
            columns: idxMatch[2].split(',').map(c => c.trim().replace(/[`"]/g, '')),
            unique: upperStmt.startsWith('UNIQUE')
          });
        }
        continue;
      }

      // 일반 컬럼
      const colMatch = stmt.match(/^[`"]?(\w+)[`"]?\s+(\w+(?:\([^)]+\))?)/i);
      if (colMatch) {
        const column: ERDColumn = {
          name: colMatch[1],
          type: normalizeType(colMatch[2]),
          nullable: !upperStmt.includes('NOT NULL'),
          autoIncrement: upperStmt.includes('AUTO_INCREMENT'),
          unique: upperStmt.includes('UNIQUE')
        };

        // DEFAULT 값
        const defaultMatch = stmt.match(/DEFAULT\s+([^,\s]+)/i);
        if (defaultMatch) {
          column.defaultValue = defaultMatch[1].replace(/['"]/g, '');
        }

        // COMMENT
        const commentMatch = stmt.match(/COMMENT\s+'([^']+)'/i);
        if (commentMatch) {
          column.comment = commentMatch[1];
        }

        columns.push(column);
      }
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      foreignKeys,
      indexes
    });

    // FK로부터 관계 생성
    for (const fk of foreignKeys) {
      relations.push({
        from: { table: tableName, column: fk.column },
        to: { table: fk.references.table, column: fk.references.column },
        type: 'N:1'
      });
    }
  }

  return { tables, relations };
}

/**
 * 타입 정규화
 */
function normalizeType(type: string): string {
  const upper = type.toUpperCase();

  // 매핑 테이블
  const typeMap: Record<string, string> = {
    'INT': 'INT',
    'INTEGER': 'INT',
    'BIGINT': 'BIGINT',
    'SMALLINT': 'SMALLINT',
    'TINYINT': 'TINYINT',
    'FLOAT': 'FLOAT',
    'DOUBLE': 'DOUBLE',
    'DECIMAL': 'DECIMAL',
    'NUMERIC': 'DECIMAL',
    'VARCHAR': 'VARCHAR(255)',
    'CHAR': 'CHAR(1)',
    'TEXT': 'TEXT',
    'LONGTEXT': 'LONGTEXT',
    'MEDIUMTEXT': 'MEDIUMTEXT',
    'BLOB': 'BLOB',
    'BOOLEAN': 'BOOLEAN',
    'BOOL': 'BOOLEAN',
    'DATE': 'DATE',
    'DATETIME': 'DATETIME',
    'TIMESTAMP': 'TIMESTAMP',
    'TIME': 'TIME',
    'JSON': 'JSON',
    'ENUM': 'ENUM',
    'UUID': 'CHAR(36)',
    'STRING': 'VARCHAR(255)',
    'NUMBER': 'INT',
  };

  // 괄호 포함 타입 (VARCHAR(100) 등)
  const matchWithSize = upper.match(/^(\w+)\s*\(.*\)$/);
  if (matchWithSize) {
    return type.toUpperCase();
  }

  return typeMap[upper] || type.toUpperCase();
}

/**
 * 관계 타입 정규화
 */
function normalizeRelationType(type: string): ERDRelation['type'] {
  const normalized = type?.toLowerCase() || '';

  if (normalized.includes('many-to-many') || normalized.includes('n:m') || normalized.includes('m:n')) {
    return 'N:M';
  }
  if (normalized.includes('one-to-one') || normalized.includes('1:1')) {
    return '1:1';
  }
  if (normalized.includes('one-to-many') || normalized.includes('1:n')) {
    return '1:N';
  }
  if (normalized.includes('many-to-one') || normalized.includes('n:1')) {
    return 'N:1';
  }

  return 'N:1';
}

/**
 * Mermaid 카디널리티 심볼 파싱
 */
function parseCardinalitySymbols(left: string, right: string): ERDRelation['type'] {
  const leftMany = left.includes('{') || left.includes('}');
  const rightMany = right.includes('{') || right.includes('}');

  if (leftMany && rightMany) return 'N:M';
  if (!leftMany && rightMany) return '1:N';
  if (leftMany && !rightMany) return 'N:1';
  return '1:1';
}

/**
 * PlantUML 카디널리티 파싱
 */
function parsePlantUMLCardinality(left: string, right: string): ERDRelation['type'] {
  const leftMany = left.includes('*') || left.includes('+');
  const rightMany = right.includes('*') || right.includes('+');

  if (leftMany && rightMany) return 'N:M';
  if (!leftMany && rightMany) return '1:N';
  if (leftMany && !rightMany) return 'N:1';
  return '1:1';
}

/**
 * MySQL 마이그레이션 SQL 생성
 */
export function generateMigration(tables: ERDTable[]): MigrationResult {
  let up = '-- Migration UP\n\n';
  let down = '-- Migration DOWN\n\n';

  for (const table of tables) {
    // UP: CREATE TABLE
    up += `CREATE TABLE IF NOT EXISTS \`${table.name}\` (\n`;

    const columnDefs: string[] = [];

    for (const col of table.columns) {
      let def = `  \`${col.name}\` ${col.type}`;

      if (!col.nullable) {
        def += ' NOT NULL';
      }

      if (col.autoIncrement) {
        def += ' AUTO_INCREMENT';
      }

      if (col.defaultValue !== undefined) {
        if (col.defaultValue === 'CURRENT_TIMESTAMP' || col.defaultValue.includes('()')) {
          def += ` DEFAULT ${col.defaultValue}`;
        } else if (/^\d+$/.test(col.defaultValue)) {
          def += ` DEFAULT ${col.defaultValue}`;
        } else {
          def += ` DEFAULT '${col.defaultValue}'`;
        }
      }

      if (col.unique) {
        def += ' UNIQUE';
      }

      if (col.comment) {
        def += ` COMMENT '${col.comment}'`;
      }

      columnDefs.push(def);
    }

    // PRIMARY KEY
    if (table.primaryKey && table.primaryKey.length > 0) {
      columnDefs.push(`  PRIMARY KEY (\`${table.primaryKey.join('`, `')}\`)`);
    }

    // FOREIGN KEYS
    for (const fk of table.foreignKeys) {
      let fkDef = `  FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.references.table}\`(\`${fk.references.column}\`)`;
      if (fk.onDelete) fkDef += ` ON DELETE ${fk.onDelete}`;
      if (fk.onUpdate) fkDef += ` ON UPDATE ${fk.onUpdate}`;
      columnDefs.push(fkDef);
    }

    // INDEXES
    for (const idx of table.indexes) {
      const idxDef = idx.unique
        ? `  UNIQUE KEY \`${idx.name}\` (\`${idx.columns.join('`, `')}\`)`
        : `  KEY \`${idx.name}\` (\`${idx.columns.join('`, `')}\`)`;
      columnDefs.push(idxDef);
    }

    up += columnDefs.join(',\n');
    up += '\n)';

    if (table.comment) {
      up += ` COMMENT='${table.comment}'`;
    }

    up += ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n';

    // DOWN: DROP TABLE
    down = `DROP TABLE IF EXISTS \`${table.name}\`;\n` + down;
  }

  return {
    up: up.trim(),
    down: down.trim(),
    types: generateTypeDefinitions(tables)
  };
}

/**
 * TypeScript 타입 정의 생성
 */
export function generateTypeDefinitions(tables: ERDTable[]): string {
  let types = '// Auto-generated TypeScript types from ERD\n\n';

  for (const table of tables) {
    const interfaceName = toPascalCase(table.name);
    types += `export interface ${interfaceName} {\n`;

    for (const col of table.columns) {
      const tsType = mapSQLTypeToTS(col.type);
      const optional = col.nullable ? '?' : '';
      const comment = col.comment ? `  /** ${col.comment} */\n` : '';

      types += `${comment}  ${col.name}${optional}: ${tsType};\n`;
    }

    types += '}\n\n';
  }

  return types.trim();
}

/**
 * SQL 타입을 TypeScript 타입으로 매핑
 */
function mapSQLTypeToTS(sqlType: string): string {
  const upper = sqlType.toUpperCase();

  if (/^(INT|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC)/.test(upper)) {
    return 'number';
  }
  if (/^(VARCHAR|CHAR|TEXT|LONGTEXT|MEDIUMTEXT|ENUM|UUID)/.test(upper)) {
    return 'string';
  }
  if (/^(BOOLEAN|BOOL)/.test(upper)) {
    return 'boolean';
  }
  if (/^(DATE|DATETIME|TIMESTAMP|TIME)/.test(upper)) {
    return 'Date | string';
  }
  if (/^JSON/.test(upper)) {
    return 'Record<string, any>';
  }
  if (/^BLOB/.test(upper)) {
    return 'Buffer';
  }

  return 'any';
}

/**
 * PascalCase 변환
 */
function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// CLI 실행
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
사용법: npx tsx erd-parser.ts <ERD 파일>

지원 형식:
  - dbdiagram.io JSON export (.json)
  - Mermaid ERD (.mmd, .md)
  - PlantUML ERD (.puml)
  - SQL CREATE TABLE (.sql)

옵션:
  --output <dir>    마이그레이션 파일 출력 디렉토리

예시:
  npx tsx erd-parser.ts ./schema.json
  npx tsx erd-parser.ts ./schema.sql --output ./migrations
`);
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : null;

  parseERDFile(filePath).then(result => {
    if (result.success) {
      console.log(`\n✅ ERD 파싱 완료:`);
      console.log(`  - 테이블: ${result.tables.length}개`);
      console.log(`  - 관계: ${result.relations.length}개`);

      const migration = generateMigration(result.tables);

      if (outputDir) {
        const dir = path.resolve(outputDir);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        fs.writeFileSync(path.join(dir, `${timestamp}_migration_up.sql`), migration.up);
        fs.writeFileSync(path.join(dir, `${timestamp}_migration_down.sql`), migration.down);
        fs.writeFileSync(path.join(dir, `${timestamp}_types.ts`), migration.types);

        console.log(`\n📁 파일 생성:`);
        console.log(`  - ${timestamp}_migration_up.sql`);
        console.log(`  - ${timestamp}_migration_down.sql`);
        console.log(`  - ${timestamp}_types.ts`);
      } else {
        console.log('\n--- UP Migration ---');
        console.log(migration.up);
        console.log('\n--- Types ---');
        console.log(migration.types);
      }
    } else {
      console.error('\n❌ ERD 파싱 실패:', result.errors.join(', '));
      process.exit(1);
    }
  }).catch(error => {
    console.error('오류:', error.message);
    process.exit(1);
  });
}

export default { parseERDFile, generateMigration, generateTypeDefinitions };
