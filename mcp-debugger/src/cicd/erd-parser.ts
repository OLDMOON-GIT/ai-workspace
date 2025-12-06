#!/usr/bin/env node
/**
 * ERD Parser (BTS-3189)
 * ERD에서 DB 스키마/마이그레이션 생성
 *
 * 지원 형식:
 * 1. SQL DDL (.sql)
 * 2. DBML (.dbml)
 * 3. JSON 스키마 (.json)
 * 4. Prisma 스키마 (.prisma)
 */

import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default?: string;
  references?: {
    table: string;
    column: string;
  };
  comment?: string;
}

interface Index {
  name: string;
  columns: string[];
  unique: boolean;
}

interface Table {
  name: string;
  columns: Column[];
  indexes: Index[];
  comment?: string;
}

interface Migration {
  type: 'create_table' | 'alter_table' | 'drop_table' | 'add_column' | 'drop_column' | 'add_index';
  table: string;
  sql: string;
  description: string;
}

interface ParsedSchema {
  tables: Table[];
  migrations: Migration[];
}

// SQL 타입 매핑
const SQL_TYPE_MAP: Record<string, string> = {
  'int': 'INT',
  'integer': 'INT',
  'bigint': 'BIGINT',
  'smallint': 'SMALLINT',
  'tinyint': 'TINYINT',
  'float': 'FLOAT',
  'double': 'DOUBLE',
  'decimal': 'DECIMAL',
  'varchar': 'VARCHAR',
  'char': 'CHAR',
  'text': 'TEXT',
  'longtext': 'LONGTEXT',
  'mediumtext': 'MEDIUMTEXT',
  'blob': 'BLOB',
  'boolean': 'BOOLEAN',
  'bool': 'BOOLEAN',
  'date': 'DATE',
  'datetime': 'DATETIME',
  'timestamp': 'TIMESTAMP',
  'time': 'TIME',
  'json': 'JSON',
  'uuid': 'VARCHAR(36)',
  'enum': 'ENUM',
};

export class ErdParser {
  /**
   * 파일에서 스키마 파싱
   */
  async parseFile(filePath: string): Promise<ParsedSchema> {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    switch (ext) {
      case '.sql':
        return this.parseSql(content);
      case '.dbml':
        return this.parseDbml(content);
      case '.json':
        return this.parseJson(content);
      case '.prisma':
        return this.parsePrisma(content);
      default:
        console.warn(`[ErdParser] 지원하지 않는 파일 형식: ${ext}`);
        return { tables: [], migrations: [] };
    }
  }

  /**
   * SQL DDL 파싱
   */
  private parseSql(content: string): ParsedSchema {
    const tables: Table[] = [];
    const migrations: Migration[] = [];

    // CREATE TABLE 문 추출
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]*?)\)(?:\s*ENGINE\s*=\s*\w+)?(?:\s*DEFAULT\s+CHARSET\s*=\s*\w+)?;/gi;

    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1];
      const columnsStr = match[2];

      const table = this.parseTableColumns(tableName, columnsStr);
      tables.push(table);

      migrations.push({
        type: 'create_table',
        table: tableName,
        sql: match[0],
        description: `테이블 ${tableName} 생성`,
      });
    }

    // ALTER TABLE 문 추출
    const alterTableRegex = /ALTER\s+TABLE\s+`?(\w+)`?\s+([\s\S]*?);/gi;
    while ((match = alterTableRegex.exec(content)) !== null) {
      migrations.push({
        type: 'alter_table',
        table: match[1],
        sql: match[0],
        description: `테이블 ${match[1]} 수정`,
      });
    }

    // CREATE INDEX 문 추출
    const createIndexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+`?(\w+)`?\s+ON\s+`?(\w+)`?\s*\(([\s\S]*?)\);/gi;
    while ((match = createIndexRegex.exec(content)) !== null) {
      migrations.push({
        type: 'add_index',
        table: match[2],
        sql: match[0],
        description: `인덱스 ${match[1]} 추가 (${match[2]})`,
      });
    }

    return { tables, migrations };
  }

  /**
   * 테이블 컬럼 파싱
   */
  private parseTableColumns(tableName: string, columnsStr: string): Table {
    const columns: Column[] = [];
    const indexes: Index[] = [];

    const lines = columnsStr.split(/,\s*\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // PRIMARY KEY
      const pkMatch = trimmed.match(/PRIMARY\s+KEY\s*\(`?(\w+)`?\)/i);
      if (pkMatch) {
        const col = columns.find(c => c.name === pkMatch[1]);
        if (col) col.primaryKey = true;
        continue;
      }

      // UNIQUE KEY
      const uniqueMatch = trimmed.match(/(?:UNIQUE\s+)?KEY\s+`?(\w+)`?\s*\(([^)]+)\)/i);
      if (uniqueMatch) {
        indexes.push({
          name: uniqueMatch[1],
          columns: uniqueMatch[2].split(',').map(c => c.replace(/`/g, '').trim()),
          unique: trimmed.toUpperCase().includes('UNIQUE'),
        });
        continue;
      }

      // FOREIGN KEY
      const fkMatch = trimmed.match(/FOREIGN\s+KEY\s*\(`?(\w+)`?\)\s*REFERENCES\s+`?(\w+)`?\s*\(`?(\w+)`?\)/i);
      if (fkMatch) {
        const col = columns.find(c => c.name === fkMatch[1]);
        if (col) {
          col.references = { table: fkMatch[2], column: fkMatch[3] };
        }
        continue;
      }

      // 컬럼 정의
      const colMatch = trimmed.match(/^`?(\w+)`?\s+(\w+(?:\([^)]+\))?)\s*(.*)?$/i);
      if (colMatch) {
        const column: Column = {
          name: colMatch[1],
          type: this.normalizeType(colMatch[2]),
          nullable: !colMatch[3]?.toUpperCase().includes('NOT NULL'),
          primaryKey: colMatch[3]?.toUpperCase().includes('PRIMARY KEY') || false,
          unique: colMatch[3]?.toUpperCase().includes('UNIQUE') || false,
        };

        // DEFAULT 값
        const defaultMatch = colMatch[3]?.match(/DEFAULT\s+([^\s,]+)/i);
        if (defaultMatch) {
          column.default = defaultMatch[1].replace(/^['"]|['"]$/g, '');
        }

        // AUTO_INCREMENT
        if (colMatch[3]?.toUpperCase().includes('AUTO_INCREMENT')) {
          column.default = 'AUTO_INCREMENT';
        }

        // COMMENT
        const commentMatch = colMatch[3]?.match(/COMMENT\s+['"]([^'"]+)['"]/i);
        if (commentMatch) {
          column.comment = commentMatch[1];
        }

        columns.push(column);
      }
    }

    return { name: tableName, columns, indexes };
  }

  /**
   * DBML 파싱
   */
  private parseDbml(content: string): ParsedSchema {
    const tables: Table[] = [];
    const migrations: Migration[] = [];

    // Table 블록 추출
    const tableRegex = /Table\s+(\w+)\s*(?:as\s+\w+\s*)?\{([\s\S]*?)\}/gi;

    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      const tableName = match[1];
      const tableBody = match[2];

      const table = this.parseDbmlTable(tableName, tableBody);
      tables.push(table);

      const sql = this.generateCreateTableSql(table);
      migrations.push({
        type: 'create_table',
        table: tableName,
        sql,
        description: `테이블 ${tableName} 생성`,
      });
    }

    return { tables, migrations };
  }

  /**
   * DBML 테이블 파싱
   */
  private parseDbmlTable(tableName: string, body: string): Table {
    const columns: Column[] = [];
    const indexes: Index[] = [];

    const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    for (const line of lines) {
      // 인덱스
      const indexMatch = line.match(/indexes\s*\{/i);
      if (indexMatch) continue;

      // 컬럼 정의: name type [options]
      const colMatch = line.match(/^(\w+)\s+(\w+)\s*(?:\[([^\]]*)\])?/);
      if (colMatch) {
        const options = colMatch[3] || '';
        const column: Column = {
          name: colMatch[1],
          type: this.normalizeType(colMatch[2]),
          nullable: !options.toLowerCase().includes('not null'),
          primaryKey: options.toLowerCase().includes('pk') || options.toLowerCase().includes('primary key'),
          unique: options.toLowerCase().includes('unique'),
        };

        // default
        const defaultMatch = options.match(/default:\s*['"`]?([^'"`\],]+)['"`]?/i);
        if (defaultMatch) column.default = defaultMatch[1];

        // ref
        const refMatch = options.match(/ref:\s*[<>-]\s*(\w+)\.(\w+)/i);
        if (refMatch) {
          column.references = { table: refMatch[1], column: refMatch[2] };
        }

        // note
        const noteMatch = options.match(/note:\s*['"]([^'"]+)['"]/i);
        if (noteMatch) column.comment = noteMatch[1];

        columns.push(column);
      }
    }

    return { name: tableName, columns, indexes };
  }

  /**
   * JSON 스키마 파싱
   */
  private parseJson(content: string): ParsedSchema {
    const data = JSON.parse(content);
    const tables: Table[] = [];
    const migrations: Migration[] = [];

    // tables 배열 형식
    const tableList = data.tables || data.entities || (Array.isArray(data) ? data : []);

    for (const tableData of tableList) {
      const table: Table = {
        name: tableData.name || tableData.tableName,
        columns: (tableData.columns || tableData.fields || []).map((col: Record<string, unknown>) => ({
          name: col.name || col.field,
          type: this.normalizeType(String(col.type || col.dataType || 'VARCHAR(255)')),
          nullable: col.nullable !== false,
          primaryKey: col.primaryKey === true || col.pk === true,
          unique: col.unique === true,
          default: col.default,
          references: col.references || col.ref,
          comment: col.comment || col.description,
        })),
        indexes: (tableData.indexes || []).map((idx: Record<string, unknown>) => ({
          name: idx.name,
          columns: idx.columns || [],
          unique: idx.unique === true,
        })),
        comment: tableData.comment || tableData.description,
      };

      tables.push(table);

      const sql = this.generateCreateTableSql(table);
      migrations.push({
        type: 'create_table',
        table: table.name,
        sql,
        description: `테이블 ${table.name} 생성`,
      });
    }

    return { tables, migrations };
  }

  /**
   * Prisma 스키마 파싱
   */
  private parsePrisma(content: string): ParsedSchema {
    const tables: Table[] = [];
    const migrations: Migration[] = [];

    // model 블록 추출
    const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/gi;

    let match;
    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const modelBody = match[2];

      const table = this.parsePrismaModel(modelName, modelBody);
      tables.push(table);

      const sql = this.generateCreateTableSql(table);
      migrations.push({
        type: 'create_table',
        table: modelName,
        sql,
        description: `테이블 ${modelName} 생성`,
      });
    }

    return { tables, migrations };
  }

  /**
   * Prisma 모델 파싱
   */
  private parsePrismaModel(modelName: string, body: string): Table {
    const columns: Column[] = [];
    const indexes: Index[] = [];

    const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    for (const line of lines) {
      // @@index, @@unique
      const indexMatch = line.match(/@@(?:index|unique)\(\[([^\]]+)\]/);
      if (indexMatch) {
        indexes.push({
          name: `${modelName}_${indexMatch[1].replace(/,\s*/g, '_')}`,
          columns: indexMatch[1].split(',').map(c => c.trim()),
          unique: line.includes('@@unique'),
        });
        continue;
      }

      // 필드 정의: name Type? @attr
      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\?)?(?:\s+(.*))?$/);
      if (fieldMatch) {
        const attrs = fieldMatch[4] || '';
        const column: Column = {
          name: fieldMatch[1],
          type: this.prismaTypeToSql(fieldMatch[2]),
          nullable: !!fieldMatch[3],
          primaryKey: attrs.includes('@id'),
          unique: attrs.includes('@unique'),
        };

        // @default
        const defaultMatch = attrs.match(/@default\(([^)]+)\)/);
        if (defaultMatch) {
          column.default = defaultMatch[1].replace(/^"|"$/g, '');
          if (column.default === 'autoincrement()') column.default = 'AUTO_INCREMENT';
          if (column.default === 'now()') column.default = 'CURRENT_TIMESTAMP';
        }

        // @relation
        const relMatch = attrs.match(/@relation\(.*references:\s*\[(\w+)\]/);
        if (relMatch) {
          // 관계는 외래키로 변환하지 않음 (참조만 기록)
        }

        columns.push(column);
      }
    }

    return { name: modelName, columns, indexes };
  }

  /**
   * Prisma 타입을 SQL 타입으로 변환
   */
  private prismaTypeToSql(prismaType: string): string {
    const typeMap: Record<string, string> = {
      'String': 'VARCHAR(255)',
      'Int': 'INT',
      'BigInt': 'BIGINT',
      'Float': 'FLOAT',
      'Decimal': 'DECIMAL(10,2)',
      'Boolean': 'BOOLEAN',
      'DateTime': 'DATETIME',
      'Json': 'JSON',
      'Bytes': 'BLOB',
    };
    return typeMap[prismaType] || 'VARCHAR(255)';
  }

  /**
   * 타입 정규화
   */
  private normalizeType(type: string): string {
    const lower = type.toLowerCase();
    const baseType = lower.replace(/\([^)]*\)/, '');

    if (SQL_TYPE_MAP[baseType]) {
      // 길이 정보 유지
      const lengthMatch = type.match(/\(([^)]+)\)/);
      if (lengthMatch) {
        return `${SQL_TYPE_MAP[baseType]}(${lengthMatch[1]})`;
      }
      return SQL_TYPE_MAP[baseType];
    }

    return type.toUpperCase();
  }

  /**
   * CREATE TABLE SQL 생성
   */
  generateCreateTableSql(table: Table): string {
    const lines: string[] = [`CREATE TABLE IF NOT EXISTS \`${table.name}\` (`];

    // 컬럼
    const columnDefs: string[] = [];
    for (const col of table.columns) {
      let def = `  \`${col.name}\` ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.default) {
        if (col.default === 'AUTO_INCREMENT') {
          def += ' AUTO_INCREMENT';
        } else if (col.default === 'CURRENT_TIMESTAMP') {
          def += ' DEFAULT CURRENT_TIMESTAMP';
        } else {
          def += ` DEFAULT '${col.default}'`;
        }
      }
      if (col.comment) def += ` COMMENT '${col.comment}'`;
      columnDefs.push(def);
    }

    // Primary Key
    const pkCols = table.columns.filter(c => c.primaryKey).map(c => `\`${c.name}\``);
    if (pkCols.length > 0) {
      columnDefs.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    }

    // Unique
    for (const col of table.columns.filter(c => c.unique && !c.primaryKey)) {
      columnDefs.push(`  UNIQUE KEY \`uk_${col.name}\` (\`${col.name}\`)`);
    }

    // Foreign Keys
    for (const col of table.columns.filter(c => c.references)) {
      columnDefs.push(
        `  FOREIGN KEY (\`${col.name}\`) REFERENCES \`${col.references!.table}\`(\`${col.references!.column}\`)`
      );
    }

    // Indexes
    for (const idx of table.indexes) {
      const keyword = idx.unique ? 'UNIQUE KEY' : 'KEY';
      columnDefs.push(`  ${keyword} \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')})`);
    }

    lines.push(columnDefs.join(',\n'));
    lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;');

    return lines.join('\n');
  }

  /**
   * 마이그레이션 파일 생성
   */
  async generateMigrationFiles(schema: ParsedSchema, outputDir: string): Promise<string[]> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const files: string[] = [];
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

    for (let i = 0; i < schema.migrations.length; i++) {
      const migration = schema.migrations[i];
      const fileName = `${timestamp}_${String(i + 1).padStart(3, '0')}_${migration.table}.sql`;
      const filePath = path.join(outputDir, fileName);

      const content = [
        `-- Migration: ${migration.description}`,
        `-- Generated: ${new Date().toISOString()}`,
        '',
        migration.sql,
      ].join('\n');

      fs.writeFileSync(filePath, content, 'utf-8');
      files.push(filePath);
      console.log(`[ErdParser] 마이그레이션 생성: ${fileName}`);
    }

    return files;
  }

  /**
   * BTS에 스키마 변경 SPEC 등록
   */
  async registerSchemaSpecs(schema: ParsedSchema): Promise<number[]> {
    const registeredIds: number[] = [];

    for (const table of schema.tables) {
      try {
        const columnInfo = table.columns.map(col => {
          let info = `- ${col.name}: ${col.type}`;
          if (col.primaryKey) info += ' (PK)';
          if (!col.nullable) info += ' NOT NULL';
          if (col.references) info += ` -> ${col.references.table}.${col.references.column}`;
          return info;
        }).join('\n');

        const result = await bugCreate({
          type: 'spec',
          title: `[DB] 테이블 ${table.name} 스키마`,
          summary: `테이블: ${table.name}\n\n컬럼:\n${columnInfo}`,
          priority: 'P2',
          metadata: {
            source: 'erd',
            table,
          },
        });

        if (result && result.id) {
          registeredIds.push(result.id);
          console.log(`[ErdParser] 등록됨: BTS-${result.id} - ${table.name}`);
        }
      } catch (error) {
        console.error(`[ErdParser] 등록 실패: ${table.name}`, error);
      }
    }

    return registeredIds;
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('사용법: npx ts-node erd-parser.ts <file-path> [options]');
    console.log('');
    console.log('옵션:');
    console.log('  --output <dir>  마이그레이션 파일 출력 디렉토리');
    console.log('  --register      파싱된 스키마를 BTS에 SPEC으로 등록');
    console.log('');
    console.log('지원 형식: .sql, .dbml, .json, .prisma');
    process.exit(1);
  }

  const filePath = args[0];
  const outputDir = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : './migrations';
  const shouldRegister = args.includes('--register');

  if (!fs.existsSync(filePath)) {
    console.error(`파일을 찾을 수 없습니다: ${filePath}`);
    process.exit(1);
  }

  const parser = new ErdParser();
  const schema = await parser.parseFile(filePath);

  console.log(`\n[ErdParser] ${schema.tables.length}개의 테이블 발견:\n`);

  for (const table of schema.tables) {
    console.log(`  [Table] ${table.name} (${table.columns.length} columns)`);
    for (const col of table.columns.slice(0, 5)) {
      const flags = [
        col.primaryKey ? 'PK' : '',
        col.unique ? 'UNIQUE' : '',
        !col.nullable ? 'NOT NULL' : '',
      ].filter(Boolean).join(', ');
      console.log(`      - ${col.name}: ${col.type}${flags ? ` (${flags})` : ''}`);
    }
    if (table.columns.length > 5) {
      console.log(`      ... 외 ${table.columns.length - 5}개`);
    }
  }

  // 마이그레이션 파일 생성
  console.log(`\n[ErdParser] 마이그레이션 파일 생성 (${outputDir})...\n`);
  await parser.generateMigrationFiles(schema, outputDir);

  // BTS 등록
  if (shouldRegister && schema.tables.length > 0) {
    console.log('\n[ErdParser] BTS에 SPEC 등록 중...\n');
    const ids = await parser.registerSchemaSpecs(schema);
    console.log(`\n[ErdParser] ${ids.length}개 등록 완료`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default ErdParser;
