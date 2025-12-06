/**
 * ERD Parser 통합 테스트 (BTS-3189)
 */

import fs from 'fs';
import path from 'path';
import { ErdParser } from '../../src/cicd/erd-parser';

// 테스트용 임시 파일 생성 헬퍼
const createTempFile = (content: string, ext: string): string => {
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filePath = path.join(tempDir, `test-${Date.now()}${ext}`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
};

// 테스트 후 정리
const cleanupTempFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const cleanupDir = (dirPath: string) => {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
  }
};

describe('ErdParser', () => {
  let parser: ErdParser;

  beforeEach(() => {
    parser = new ErdParser();
  });

  describe('SQL DDL 파싱', () => {
    it('CREATE TABLE 문을 파싱해야 함', async () => {
      const sql = `
CREATE TABLE users (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_email (email)
);

CREATE TABLE posts (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;
      const filePath = createTempFile(sql, '.sql');

      try {
        const schema = await parser.parseFile(filePath);

        expect(schema.tables).toHaveLength(2);

        // users 테이블 검증
        const usersTable = schema.tables.find(t => t.name === 'users');
        expect(usersTable).toBeDefined();
        expect(usersTable!.columns.length).toBeGreaterThanOrEqual(4);

        const idCol = usersTable!.columns.find(c => c.name === 'id');
        expect(idCol).toBeDefined();
        expect(idCol!.primaryKey).toBe(true);
        expect(idCol!.nullable).toBe(false);

        // posts 테이블 검증
        const postsTable = schema.tables.find(t => t.name === 'posts');
        expect(postsTable).toBeDefined();

        // 마이그레이션 생성 확인
        expect(schema.migrations.length).toBeGreaterThanOrEqual(2);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('다양한 데이터 타입을 처리해야 함', async () => {
      const sql = `
CREATE TABLE type_test (
  int_col INT,
  bigint_col BIGINT,
  varchar_col VARCHAR(255),
  text_col TEXT,
  json_col JSON,
  datetime_col DATETIME,
  boolean_col BOOLEAN,
  decimal_col DECIMAL(10, 2)
);
`;
      const filePath = createTempFile(sql, '.sql');

      try {
        const schema = await parser.parseFile(filePath);

        expect(schema.tables).toHaveLength(1);
        const table = schema.tables[0];

        const intCol = table.columns.find(c => c.name === 'int_col');
        expect(intCol?.type).toContain('INT');

        const varcharCol = table.columns.find(c => c.name === 'varchar_col');
        expect(varcharCol?.type).toContain('VARCHAR');

        const jsonCol = table.columns.find(c => c.name === 'json_col');
        expect(jsonCol?.type).toContain('JSON');
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('DBML 파싱', () => {
    it('DBML 테이블 정의를 파싱해야 함', async () => {
      const dbml = `
Table users {
  id int [pk, increment]
  email varchar [not null, unique]
  name varchar
  created_at datetime [default: 'now()']
}

Table posts {
  id int [pk, increment]
  user_id int [ref: > users.id]
  title varchar [not null]
  content text
}
`;
      const filePath = createTempFile(dbml, '.dbml');

      try {
        const schema = await parser.parseFile(filePath);

        expect(schema.tables).toHaveLength(2);

        const usersTable = schema.tables.find(t => t.name === 'users');
        expect(usersTable).toBeDefined();

        const idCol = usersTable!.columns.find(c => c.name === 'id');
        expect(idCol?.primaryKey).toBe(true);

        const emailCol = usersTable!.columns.find(c => c.name === 'email');
        expect(emailCol?.unique).toBe(true);
        expect(emailCol?.nullable).toBe(false);
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('JSON 스키마 파싱', () => {
    it('JSON 스키마를 파싱해야 함', async () => {
      const jsonSchema = JSON.stringify({
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'int', primaryKey: true },
              { name: 'email', type: 'varchar(255)', unique: true, nullable: false },
              { name: 'name', type: 'varchar(100)' },
            ],
          },
          {
            name: 'posts',
            columns: [
              { name: 'id', type: 'int', primaryKey: true },
              { name: 'user_id', type: 'int', references: { table: 'users', column: 'id' } },
              { name: 'title', type: 'varchar(200)' },
            ],
          },
        ],
      });
      const filePath = createTempFile(jsonSchema, '.json');

      try {
        const schema = await parser.parseFile(filePath);

        expect(schema.tables).toHaveLength(2);

        const usersTable = schema.tables.find(t => t.name === 'users');
        expect(usersTable!.columns).toHaveLength(3);
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('마이그레이션 파일 생성', () => {
    it('마이그레이션 SQL 파일을 생성해야 함', async () => {
      const sql = `
CREATE TABLE test_table (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100),
  PRIMARY KEY (id)
);
`;
      const filePath = createTempFile(sql, '.sql');
      const outputDir = path.join(__dirname, '../temp/migrations');

      try {
        const schema = await parser.parseFile(filePath);
        const files = await parser.generateMigrationFiles(schema, outputDir);

        expect(files.length).toBeGreaterThan(0);
        expect(fs.existsSync(files[0])).toBe(true);

        const content = fs.readFileSync(files[0], 'utf-8');
        expect(content).toContain('CREATE TABLE');
      } finally {
        cleanupTempFile(filePath);
        cleanupDir(outputDir);
      }
    });
  });

  describe('SQL 생성', () => {
    it('테이블 스키마에서 CREATE TABLE SQL을 생성해야 함', () => {
      const table = {
        name: 'test_table',
        columns: [
          { name: 'id', type: 'INT', primaryKey: true, nullable: false, unique: false, default: 'AUTO_INCREMENT' },
          { name: 'name', type: 'VARCHAR(100)', primaryKey: false, nullable: true, unique: false },
          { name: 'email', type: 'VARCHAR(255)', primaryKey: false, nullable: false, unique: true },
        ],
        indexes: [],
      };

      const sql = parser.generateCreateTableSql(table);

      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('`test_table`');
      expect(sql).toContain('`id`');
      expect(sql).toContain('AUTO_INCREMENT');
      expect(sql).toContain('PRIMARY KEY');
      expect(sql).toContain('UNIQUE KEY');
    });
  });

  describe('에지 케이스', () => {
    it('빈 파일을 처리해야 함', async () => {
      const filePath = createTempFile('', '.sql');

      try {
        const schema = await parser.parseFile(filePath);
        expect(schema.tables).toHaveLength(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('지원하지 않는 확장자를 처리해야 함', async () => {
      const filePath = createTempFile('test', '.xyz');

      try {
        const schema = await parser.parseFile(filePath);
        expect(schema.tables).toHaveLength(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });
});
