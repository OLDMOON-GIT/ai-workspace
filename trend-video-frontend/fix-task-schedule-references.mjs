import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
  'src/app/api/automation/schedules/route.ts',
  'src/app/api/automation/calendar/route.ts',
  'src/app/api/queue/clear/route.ts',
  'src/lib/content.ts',
];

console.log('\n🔧 task_schedule 참조 제거 작업 시작...\n');

for (const file of files) {
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  파일 없음: ${file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // DELETE FROM task_schedule → task.scheduled_time = NULL로 변경
  content = content.replace(
    /DELETE FROM task_schedule WHERE schedule_id = \?/g,
    'UPDATE task SET scheduled_time = NULL WHERE task_id = ?'
  );

  // UPDATE task_schedule → task 업데이트로 변경
  content = content.replace(
    /UPDATE task_schedule\s+SET (.+?)\s+WHERE schedule_id = \?/gs,
    'UPDATE task SET scheduled_time = ? WHERE task_id = ?'
  );

  // FROM task_schedule 제거 (주석 처리)
  content = content.replace(
    /FROM task_schedule/g,
    '-- v6: task_schedule removed\n    FROM task'
  );

  // LEFT JOIN task_schedule 제거
  content = content.replace(
    /LEFT JOIN task_schedule s ON .+/g,
    '-- v6: task_schedule removed'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${file}`);
  } else {
    console.log(`⚪ ${file} (변경 없음)`);
  }
}

console.log('\n✅ 완료!\n');
