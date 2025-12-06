/**
 * ERD Parser Tests
 */

import {
  parseMermaidERD,
  parseDBML,
  generateMySQLMigration,
  ERDDocument
} from '../../src/parsers/erd-parser';

describe('ERD Parser', () => {
  describe('parseMermaidERD', () => {
    it('should parse basic mermaid ERD', () => {
      const content = `
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER {
        string name
        string email PK
    }
    ORDER {
        int id PK
        string status
    }
`;
      const doc = parseMermaidERD(content);

      expect(doc.tables.length).toBe(2);
      expect(doc.relationships.length).toBe(2);

      const customer = doc.tables.find(t => t.name === 'CUSTOMER');
      expect(customer).toBeDefined();
      expect(customer?.columns.length).toBe(2);
      expect(customer?.columns.find(c => c.primaryKey)?.name).toBe('email');
    });

    it('should parse relationship types', () => {
      const content = `
erDiagram
    A ||--|| B : one_to_one
    C ||--o{ D : one_to_many
    E }o--o{ F : many_to_many
`;
      const doc = parseMermaidERD(content);

      expect(doc.relationships.length).toBe(3);
      expect(doc.relationships[0].type).toBe('1:1');
      expect(doc.relationships[1].type).toBe('1:N');
      expect(doc.relationships[2].type).toBe('N:M');
    });

    it('should handle column comments', () => {
      const content = `
erDiagram
    USER {
        int id PK "Primary key"
        string email UK "Unique email"
    }
`;
      const doc = parseMermaidERD(content);

      const user = doc.tables.find(t => t.name === 'USER');
      expect(user?.columns[0].comment).toBe('Primary key');
      expect(user?.columns[1].unique).toBe(true);
    });
  });

  describe('parseDBML', () => {
    it('should parse basic DBML', () => {
      const content = `
Table users {
  id int [pk, increment]
  email varchar [not null, unique]
  name varchar
  created_at timestamp [default: 'now()']
}

Table posts {
  id int [pk]
  user_id int
  title varchar
}

Ref: posts.user_id > users.id
`;
      const doc = parseDBML(content);

      expect(doc.tables.length).toBe(2);
      expect(doc.relationships.length).toBe(1);

      const users = doc.tables.find(t => t.name === 'users');
      expect(users?.columns.length).toBe(4);
      expect(users?.columns[0].primaryKey).toBe(true);
      expect(users?.columns[0].autoIncrement).toBe(true);
      expect(users?.columns[1].nullable).toBe(false);
      expect(users?.columns[1].unique).toBe(true);
    });

    it('should parse foreign key relationships', () => {
      const content = `
Table orders {
  id int [pk]
  customer_id int
}

Table customers {
  id int [pk]
}

Ref: orders.customer_id > customers.id
Ref: orders.id < line_items.order_id
`;
      const doc = parseDBML(content);

      expect(doc.relationships.length).toBe(2);
      expect(doc.relationships[0].type).toBe('1:N');
      expect(doc.relationships[1].type).toBe('N:1');
    });
  });

  describe('generateMySQLMigration', () => {
    it('should generate CREATE TABLE statements', () => {
      const doc: ERDDocument = {
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INT', primaryKey: true, autoIncrement: true, nullable: false, unique: false, index: false },
              { name: 'email', type: 'VARCHAR(255)', primaryKey: false, autoIncrement: false, nullable: false, unique: true, index: false }
            ],
            indexes: []
          }
        ],
        relationships: []
      };

      const migration = generateMySQLMigration(doc);

      expect(migration.up).toContain('CREATE TABLE IF NOT EXISTS `users`');
      expect(migration.up).toContain('`id` INT AUTO_INCREMENT');
      expect(migration.up).toContain('`email` VARCHAR(255) NOT NULL UNIQUE');
      expect(migration.up).toContain('PRIMARY KEY (`id`)');
      expect(migration.down).toContain('DROP TABLE IF EXISTS `users`');
    });

    it('should generate foreign key constraints', () => {
      const doc: ERDDocument = {
        tables: [
          {
            name: 'orders',
            columns: [
              { name: 'id', type: 'INT', primaryKey: true, autoIncrement: true, nullable: false, unique: false, index: false },
              { name: 'user_id', type: 'INT', primaryKey: false, autoIncrement: false, nullable: false, unique: false, index: true }
            ],
            indexes: []
          },
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INT', primaryKey: true, autoIncrement: true, nullable: false, unique: false, index: false }
            ],
            indexes: []
          }
        ],
        relationships: [
          { from: { table: 'orders', column: 'user_id' }, to: { table: 'users', column: 'id' }, type: '1:N' }
        ]
      };

      const migration = generateMySQLMigration(doc);

      expect(migration.up).toContain('ADD CONSTRAINT `fk_orders_user_id`');
      expect(migration.up).toContain('FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)');
      expect(migration.down).toContain('DROP FOREIGN KEY `fk_orders_user_id`');
    });

    it('should include column comments', () => {
      const doc: ERDDocument = {
        tables: [
          {
            name: 'products',
            columns: [
              { name: 'price', type: 'DECIMAL(10,2)', primaryKey: false, autoIncrement: false, nullable: false, unique: false, index: false, comment: 'Product price in USD' }
            ],
            indexes: []
          }
        ],
        relationships: []
      };

      const migration = generateMySQLMigration(doc);

      expect(migration.up).toContain("COMMENT 'Product price in USD'");
    });
  });
});
