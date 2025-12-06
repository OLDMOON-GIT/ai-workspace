#!/usr/bin/env node
/**
 * youtube_uploads 테이블 마이그레이션
 * - 1:N 관계로 YouTube 업로드 이력 관리
 * - 기존 content.youtube_url, task_schedule.youtube_url 데이터 마이그레이션
 */

const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function migrate() {
  console.log('🚀 youtube_uploads 테이블 마이그레이션 시작...\n');

  const db = new Database(dbPath);

  try {
    // 1. youtube_uploads 테이블 생성
    console.log('1️⃣ youtube_uploads 테이블 생성...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_uploads (
        id TEXT PRIMARY KEY,
        content_id TEXT,
        task_id TEXT,
        channel_id TEXT,
        youtube_url TEXT NOT NULL,
        youtube_video_id TEXT,
        status TEXT DEFAULT 'active',
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ 테이블 생성 완료\n');

    // 2. 인덱스 생성
    console.log('2️⃣ 인덱스 생성...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_youtube_uploads_content ON youtube_uploads(content_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_youtube_uploads_task ON youtube_uploads(task_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_youtube_uploads_channel ON youtube_uploads(channel_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_youtube_uploads_video_id ON youtube_uploads(youtube_video_id)`);
    console.log('   ✅ 인덱스 생성 완료\n');

    // 3. 기존 데이터 마이그레이션 - content 테이블
    console.log('3️⃣ content 테이블에서 기존 데이터 마이그레이션...');
    const contentRows = db.prepare(`
      SELECT content_id, youtube_url, created_at
      FROM content
      WHERE youtube_url IS NOT NULL AND youtube_url != ''
    `).all();

    let contentMigrated = 0;
    for (const row of contentRows) {
      // 중복 체크
      const existing = db.prepare(`
        SELECT id FROM youtube_uploads WHERE content_id = ? AND youtube_url = ?
      `).get(row.content_id, row.youtube_url);

      if (!existing) {
        const videoId = extractYoutubeVideoId(row.youtube_url);
        db.prepare(`
          INSERT INTO youtube_uploads (id, content_id, youtube_url, youtube_video_id, uploaded_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          row.content_id,
          row.youtube_url,
          videoId,
          row.created_at,
          row.created_at
        );
        contentMigrated++;
      }
    }
    console.log(`   ✅ content 테이블: ${contentMigrated}개 마이그레이션 완료\n`);

    // 4. 기존 데이터 마이그레이션 - task_schedule 테이블
    console.log('4️⃣ task_schedule 테이블에서 기존 데이터 마이그레이션...');
    const scheduleRows = db.prepare(`
      SELECT s.task_id, s.youtube_url, s.created_at, t.channel
      FROM task_schedule s
      LEFT JOIN task t ON s.task_id = t.task_id
      WHERE s.youtube_url IS NOT NULL AND s.youtube_url != ''
    `).all();

    let scheduleMigrated = 0;
    for (const row of scheduleRows) {
      // 중복 체크 (task_id + youtube_url)
      const existing = db.prepare(`
        SELECT id FROM youtube_uploads WHERE task_id = ? AND youtube_url = ?
      `).get(row.task_id, row.youtube_url);

      if (!existing) {
        const videoId = extractYoutubeVideoId(row.youtube_url);
        db.prepare(`
          INSERT INTO youtube_uploads (id, task_id, channel_id, youtube_url, youtube_video_id, uploaded_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          row.task_id,
          row.channel || null,
          row.youtube_url,
          videoId,
          row.created_at,
          row.created_at
        );
        scheduleMigrated++;
      }
    }
    console.log(`   ✅ task_schedule 테이블: ${scheduleMigrated}개 마이그레이션 완료\n`);

    // 5. 결과 확인
    const totalUploads = db.prepare('SELECT COUNT(*) as count FROM youtube_uploads').get();
    console.log('📊 마이그레이션 결과:');
    console.log(`   총 youtube_uploads 레코드: ${totalUploads.count}개\n`);

    // 샘플 데이터 출력
    const samples = db.prepare('SELECT * FROM youtube_uploads LIMIT 3').all();
    if (samples.length > 0) {
      console.log('📋 샘플 데이터:');
      samples.forEach((s, i) => {
        console.log(`   ${i+1}. task_id=${s.task_id}, url=${s.youtube_url}, channel=${s.channel_id}`);
      });
    }

    console.log('\n✅ 마이그레이션 완료!');

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    throw error;
  } finally {
    db.close();
  }
}

function extractYoutubeVideoId(url) {
  if (!url) return null;

  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/watch?v=VIDEO_ID
  const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (longMatch) return longMatch[1];

  return null;
}

migrate();
