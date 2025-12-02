// task_schedule 참조를 자동으로 제거하는 스크립트
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const patterns = [
  // SELECT FROM task_schedule
  {
    regex: /SELECT\s+.*?\s+FROM\s+task_schedule\s+WHERE\s+task_id\s*=\s*\?/gis,
    replace: 'SELECT tq.status FROM task_queue tq WHERE tq.task_id = ?'
  },
  // LEFT JOIN task_schedule
  {
    regex: /LEFT\s+JOIN\s+task_schedule\s+\w+\s+ON\s+\w+\.task_id\s*=\s*\w+\.task_id/gis,
    replace: ''
  },
  // UPDATE task_schedule
  {
    regex: /UPDATE\s+task_schedule\s+SET\s+status\s*=\s*'(\w+)'.*?WHERE\s+task_id\s*=\s*\?/gis,
    replace: "UPDATE task_queue SET status = '$1' WHERE task_id = ?"
  },
  // INSERT INTO task_schedule
  {
    regex: /INSERT\s+INTO\s+task_schedule\s*\([^)]+\)\s*VALUES\s*\([^)]+\)/gis,
    replace: '-- task_schedule removed'
  },
  // DELETE FROM task_schedule
  {
    regex: /DELETE\s+FROM\s+task_schedule\s+WHERE/gis,
    replace: '-- task_schedule removed WHERE'
  }
];

const files = await glob('trend-video-frontend/src/**/*.ts', { ignore: ['**/node_modules/**'] });

let totalChanges = 0;
for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  const original = content;

  for (const pattern of patterns) {
    content = content.replace(pattern.regex, pattern.replace);
  }

  if (content !== original) {
    writeFileSync(file, content, 'utf-8');
    totalChanges++;
    console.log(`✅ Fixed: ${file}`);
  }
}

console.log(`\n✅ Total files fixed: ${totalChanges}`);
