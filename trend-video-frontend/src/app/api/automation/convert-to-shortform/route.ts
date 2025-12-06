/**
 * 롱폼 → 숏폼 자동변환 API
 *
 * 롱폼 영상 완료 후 이미지를 9:16 비율로 변환하여 숏폼 영상 자동 생성
 *
 * @see .claude/DEVELOPMENT_GUIDE.md - 롱폼/숏폼 관련 스펙
 */
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import db from '@/lib/sqlite';
import { getSql } from '@/lib/sql-mapper';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function POST(request: NextRequest) {
  try {
    // 내부 요청 확인
    const isInternalRequest = request.headers.get('X-Internal-Request');
    if (!isInternalRequest) {
      return NextResponse.json({ error: 'Internal request only' }, { status: 403 });
    }

    const body = await request.json();
    const { taskId, longformYoutubeUrl, title, category, channel, userId } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    console.log('🔄 [롱폼→숏폼 변환] 시작:', { taskId, title });

    // 1. 롱폼 폴더 확인
    const longformFolder = path.join(BACKEND_PATH, 'tasks', taskId);
    if (!fs.existsSync(longformFolder)) {
      return NextResponse.json({ error: '롱폼 폴더를 찾을 수 없습니다' }, { status: 404 });
    }

    // 2. 이미지 변환 스크립트 실행
    const convertScript = path.join(BACKEND_PATH, 'src', 'video_generator', 'convert_images_to_shorts.py');
    if (!fs.existsSync(convertScript)) {
      return NextResponse.json({ error: '이미지 변환 스크립트를 찾을 수 없습니다' }, { status: 404 });
    }

    console.log('🖼️ [롱폼→숏폼 변환] 이미지 변환 시작:', longformFolder);

    // Python 스크립트로 이미지 변환 실행
    await new Promise<void>((resolve, reject) => {
      const python = spawn('python', [convertScript, '--folder', longformFolder], {
        cwd: BACKEND_PATH,
        env: { ...process.env, PYTHONPATH: BACKEND_PATH }
      });

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
        console.log('📷 [이미지 변환]', data.toString().trim());
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('⚠️ [이미지 변환]', data.toString().trim());
      });

      python.on('close', (code) => {
        if (code === 0) {
          console.log('✅ [이미지 변환] 완료');
          resolve();
        } else {
          console.error('❌ [이미지 변환] 실패:', code);
          reject(new Error(`이미지 변환 실패: ${errorOutput}`));
        }
      });
    });

    // 3. shorts_images 폴더 확인
    const shortsImagesFolder = path.join(longformFolder, 'shorts_images');
    if (!fs.existsSync(shortsImagesFolder)) {
      return NextResponse.json({ error: '숏폼 이미지 폴더가 생성되지 않았습니다' }, { status: 500 });
    }

    const shortsImages = fs.readdirSync(shortsImagesFolder).filter(f =>
      /\.(jpg|jpeg|png)$/i.test(f)
    );

    if (shortsImages.length === 0) {
      return NextResponse.json({ error: '변환된 숏폼 이미지가 없습니다' }, { status: 500 });
    }

    console.log(`✅ [롱폼→숏폼 변환] ${shortsImages.length}개 이미지 변환 완료`);

    // 4. 새 숏폼 task 생성
    const shortformTaskId = randomUUID();
    const shortformFolder = path.join(BACKEND_PATH, 'tasks', shortformTaskId);
    fs.mkdirSync(shortformFolder, { recursive: true });

    // 5. 변환된 이미지 복사
    for (const img of shortsImages) {
      const src = path.join(shortsImagesFolder, img);
      const dest = path.join(shortformFolder, img);
      fs.copyFileSync(src, dest);
    }

    console.log(`📁 [롱폼→숏폼 변환] 이미지 복사 완료: ${shortformFolder}`);

    // 6. story.json 생성 (롱폼 story.json 복사 후 수정)
    const longformStoryPath = path.join(longformFolder, 'story.json');
    const shortformStoryPath = path.join(shortformFolder, 'story.json');

    if (fs.existsSync(longformStoryPath)) {
      const longformStory = JSON.parse(fs.readFileSync(longformStoryPath, 'utf-8'));

      // 숏폼용으로 수정
      const shortformStory = {
        ...longformStory,
        metadata: {
          ...longformStory.metadata,
          format: 'shortform',
          converted_from: taskId,
          longform_youtube_url: longformYoutubeUrl,
          aspect_ratio: '9:16',
          converted_at: new Date().toISOString()
        }
      };

      fs.writeFileSync(shortformStoryPath, JSON.stringify(shortformStory, null, 2), 'utf-8');
      console.log('📝 [롱폼→숏폼 변환] story.json 생성 완료');
    }

    // 7. DB에 숏폼 task 생성 (v5: task + content + content_setting 분리)
    // MySQL: using imported db

    // task 테이블에 INSERT (scheduled_time = NULL, task_queue에 직접 추가)
    const insertTaskSql = getSql('scheduler', 'insertTask');
    await db.prepare(insertTaskSql).run(shortformTaskId, userId, null);

    // content 테이블에 INSERT (메인 데이터) - youtube_channel 포함
    await db.prepare(`
      INSERT INTO content (
        content_id, user_id, title, prompt_format, category, ai_model,
        status, source_content_id, youtube_channel, created_at, updated_at
      )
      VALUES (?, ?, ?, 'shortform', ?, 'chatgpt', 'draft', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      shortformTaskId,
      userId,
      `[숏폼] ${title}`,
      category || null,
      taskId,  // 원본 롱폼 ID
      channel || null
    );

    // content_setting 테이블에 INSERT (제작 설정) - youtube_channel은 content 테이블에 있음
    await db.prepare(`
      INSERT INTO content_setting (content_id, script_mode, media_mode, created_at, updated_at)
      VALUES (?, 'chrome', 'none', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(shortformTaskId);

    // task_queue에 INSERT (video 단계부터 시작 - 대본/이미지 이미 있음)
    const insertTaskQueueVideoSql = getSql('scheduler', 'insertTaskQueueVideo');
    await db.prepare(insertTaskQueueVideoSql).run(shortformTaskId, userId);

    // task_schedule에 INSERT (즉시 실행)
    const scheduleId = randomUUID();
    // task_schedule INSERT removed

    // MySQL: pool manages connections

    console.log('✅ [롱폼→숏폼 변환] DB 레코드 생성 완료:', {
      shortformTaskId,
      scheduleId,
      sourceTaskId: taskId
    });

    // 8. 영상 생성 API 호출 (비동기)
    (async () => {
      try {
        const storyJson = JSON.parse(fs.readFileSync(shortformStoryPath, 'utf-8'));

        const videoRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/generate-video-upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'convert-to-shortform'
          },
          body: JSON.stringify({
            storyJson,
            userId,
            imageSource: 'none',  // 이미지 이미 준비됨
            imageModel: 'none',
            videoFormat: 'shortform',
            ttsVoice: 'ko-KR-SoonBokNeural',
            title: `[숏폼] ${title}`,
            scriptId: shortformTaskId
          })
        });

        if (videoRes.ok) {
          console.log('✅ [롱폼→숏폼 변환] 영상 생성 시작됨');
        } else {
          console.error('❌ [롱폼→숏폼 변환] 영상 생성 실패:', await videoRes.text());
        }
      } catch (videoError) {
        console.error('❌ [롱폼→숏폼 변환] 영상 생성 API 호출 실패:', videoError);
      }
    })();

    return NextResponse.json({
      success: true,
      taskId: shortformTaskId,
      scheduleId,
      message: `숏폼 변환 시작 (${shortsImages.length}개 이미지)`
    });

  } catch (error: any) {
    console.error('❌ [롱폼→숏폼 변환] 오류:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
