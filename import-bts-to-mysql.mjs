#!/usr/bin/env node
/**
 * BTS 마크다운 파일들을 MySQL bugs 테이블로 import
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBug } from './automation/bug-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// BTS 파일 목록
const btsFiles = [
  'md/bts/BTS-0000001.md',
  'md/bts/BTS-0000002.md',
  'md/bts/BTS-0000003.md',
  'md/bts/BTS-0000004.md',
  'md/bts/BTS-0000005.md',
  'md/bts/BTS-0000006.md',
  'md/bts/BTS-0000007.md',
  'md/bts/BTS-0000008.md',
  'md/bts/BTS-0000010.md',
  'md/bts/BTS-0000011.md',
  'md/bts/BTS-0000012.md',
  'md/bts/BTS-0000013.md',
  'md/bts/BTS-0000014.md',
  'md/bts/BTS-0000015.md',
  'md/bts/BTS-0000016.md',
  'md/bts/BTS-0000017.md',
  'md/bts/BTS-0000018.md',
  'md/bts/BTS-0000019.md',
  'md/bts/BTS-0000020.md',
  'md/bts/BTS-0000021.md',
  'md/bts/BTS-0000022.md',
  'md/bts/BTS-0000023.md',
  'md/bts/BTS-0000024.md',
  'md/bts/BTS-0000025.md',
  'md/bts/BTS-0000026.md',
  'md/bts/BTS-0000027.md',
  'md/bts/BTS-0000028.md',
  'md/bts/BTS-0000029.md',
  'md/bts/BTS-0000030.md',
  'md/bts/BTS-0000031.md',
  'md/bts/BTS-0000032.md',
  'md/bts/BTS-0000033.md',
  'md/bts/BTS-0000034.md',
  'BTS-0000035.md',
  'md/bts/BTS-0000035.md',
  'md/bts/BTS-0000036.md',
  'md/bts/BTS-0000037.md',
  'md/bts/BTS-0000038.md',
  'md/bts/BTS-0000039.md',
  'md/bts/BTS-0000040.md',
  'md/bts/BTS-0000041.md'
];

function parseBTSFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // ID 추출 (첫 줄: # BTS-0000001: 제목)
  const firstLine = lines[0] || '';
  const idMatch = firstLine.match(/^#\s*(BTS-\d+)/);
  const id = idMatch ? idMatch[1] : path.basename(filePath, '.md');

  // 제목 추출 (첫 줄에서 ID 이후)
  const titleMatch = firstLine.match(/^#\s*BTS-\d+:\s*(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : id;

  // 상태 추출
  const statusLine = lines.find(l => l.startsWith('**상태:**'));
  let status = 'open';
  if (statusLine) {
    if (statusLine.includes('해결됨') || statusLine.includes('완료')) {
      status = 'resolved';
    } else if (statusLine.includes('진행중') || statusLine.includes('처리중')) {
      status = 'in_progress';
    } else if (statusLine.includes('닫힘') || statusLine.includes('종료')) {
      status = 'closed';
    }
  }

  // 발생일 추출
  const dateMatch = content.match(/\*\*발생일:\*\*\s*(.+)/);
  const createdAt = dateMatch ? dateMatch[1].trim() : null;

  // 해결일 추출
  const resolvedMatch = content.match(/\*\*해결일:\*\*\s*(.+)/);
  const resolvedAt = resolvedMatch ? resolvedMatch[1].trim() : null;

  // 심각도 추출
  const severityMatch = content.match(/\*\*심각도:\*\*\s*.*?\*\*(.+?)\*\*/);
  const severity = severityMatch ? severityMatch[1].trim() : null;

  // summary는 짧게 (증상/에러 메시지만)
  let summary = '';

  // 증상 섹션 추출
  const symptomMatch = content.match(/## 증상\n([\s\S]*?)(?=\n##|$)/);
  if (symptomMatch) {
    summary = symptomMatch[1].trim().substring(0, 500);
  }

  // 에러 메시지 추출
  if (!summary) {
    const errorMatch = content.match(/\*\*에러 메시지:\*\*\n```\n([\s\S]*?)\n```/);
    if (errorMatch) {
      summary = errorMatch[1].trim().substring(0, 500);
    }
  }

  // 그것도 없으면 첫 200자
  if (!summary) {
    // 첫 줄 이후부터 추출
    const contentLines = content.split('\n').slice(1);
    summary = contentLines.join('\n').trim().substring(0, 200);
  }

  return {
    id,
    title,
    summary,
    status,
    metadata: {
      created_date: createdAt,
      resolved_date: resolvedAt,
      severity,
      source_file: filePath,
      full_content: content // 전체 내용은 metadata에 저장
    }
  };
}

async function main() {
  console.log('📥 BTS 파일들을 MySQL로 import 중...\n');

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of btsFiles) {
    const filePath = path.join(__dirname, file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  파일 없음: ${file}`);
      skipped++;
      continue;
    }

    try {
      const data = parseBTSFile(filePath);
      console.log(`📄 ${data.id}: ${data.title.substring(0, 50)}...`);

      try {
        const bugId = await createBug({
          id: data.id,
          title: data.title,
          summary: data.summary,
          metadata: data.metadata
        });

        // status가 resolved나 closed면 업데이트
        if (data.status !== 'open') {
          const { updateBugStatus } = await import('./automation/bug-db.js');
          await updateBugStatus(bugId, 'import-script', data.status, '마크다운 파일에서 import');
        }

        console.log(`   ✅ ${bugId} (${data.status})\n`);
        imported++;
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          // 이미 존재하면 UPDATE
          const mysql = await import('mysql2/promise');
          const pool = mysql.default.createPool({
            host: 'localhost',
            user: 'root',
            password: 'trend2024',
            database: 'trend_video'
          });

          await pool.execute(`
            UPDATE bugs
            SET title = ?, summary = ?, status = ?, metadata = ?, updated_at = NOW()
            WHERE id = ?
          `, [data.title, data.summary, data.status, JSON.stringify(data.metadata), data.id]);

          console.log(`   🔄 ${data.id} 업데이트 (${data.status})\n`);
          await pool.end();
          imported++;
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(`   ❌ 에러: ${error.message}\n`);
      errors++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Import 완료: ${imported}개`);
  console.log(`⏭️  건너뜀: ${skipped}개`);
  console.log(`❌ 에러: ${errors}개`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Import 실패:', err);
  process.exit(1);
});
