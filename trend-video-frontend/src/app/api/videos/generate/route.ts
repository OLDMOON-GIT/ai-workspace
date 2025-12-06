import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/videos/generate
 * 대본 ID로 영상 생성 (자동화 시스템용)
 */
export async function POST(request: NextRequest) {
  try {
    // 내부 요청 확인
    const isInternal = request.headers.get('X-Internal-Request') === 'automation-system';

    if (!isInternal) {
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { scriptId, mediaMode, type, imageSource } = body;

    console.log('📥 [VIDEO-GEN] Received request:', { scriptId, mediaMode, type, imageSource });

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId is required' }, { status: 400 });
    }

    // contents 테이블에서 대본 조회
    // MySQL: using imported db
    const content = await db.prepare(`
      SELECT content_id as contentId, title, prompt_format as promptFormat, user_id as userId
      FROM content
      WHERE content_id = ?
    `).get(scriptId) as any;

    // MySQL: pool manages connections

    if (!content) {
      console.error('❌ [VIDEO-GEN] Script not found:', scriptId);
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    console.log('✅ [VIDEO-GEN] Task found:', { title: content.title, scriptId });

    // tasks 폴더 경로
    const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolder = path.join(BACKEND_PATH, 'tasks', scriptId);
    const storyPath = path.join(taskFolder, 'story.json');

    console.log(`📂 [VIDEO-GEN] Task folder: ${taskFolder}`);

    // story.json 존재 확인
    if (!fs.existsSync(storyPath)) {
      console.error('❌ [VIDEO-GEN] story.json not found:', storyPath);
      return NextResponse.json({
        error: 'story.json not found. Script/Image generation may not be completed yet.'
      }, { status: 400 });
    }

    // story.json 읽기
    let scriptData;
    try {
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      scriptData = JSON.parse(storyContent);
      console.log(`✅ [VIDEO-GEN] story.json loaded (${scriptData.scenes?.length || 0} scenes)`);
    } catch (e: any) {
      console.error('❌ [VIDEO-GEN] Failed to read story.json:', e);
      return NextResponse.json({
        error: `Invalid story.json: ${e.message}`
      }, { status: 400 });
    }

    // 대본이 실제로 완료되었는지 확인
    if (!scriptData.scenes || scriptData.scenes.length === 0) {
      console.error('❌ [VIDEO-GEN] Script has no scenes:', scriptData);
      return NextResponse.json({
        error: 'Script has no scenes. Script generation may not be completed yet.'
      }, { status: 400 });
    }

    // 타입 결정: 요청 > DB에서 가져온 promptFormat > 기본값
    // ⚠️ scriptData.metadata?.genre 사용 금지 (카테고리 이름이 들어옴)
    const videoType = type || content.promptFormat || 'shortform';
    console.log(`🎬 [VIDEO-GEN] Video type: ${videoType}`);

    // JSON body로 /api/generate-video-upload 호출 (내부 요청)
    console.log('📤 [VIDEO-GEN] Calling /api/generate-video-upload...');

    // story.json 생성
    const storyJson = {
      ...scriptData,
      scenes: scriptData.scenes || []
    };

    // 이미지 모델 설정 (imagen3 -> imagen3, 나머지는 dalle3)
    const imageModel = imageSource === 'imagen3' ? 'imagen3' : 'dalle3';

    // JSON body 생성 (내부 요청용)
    const requestBody = {
      userId: content.userId,
      imageSource: imageSource || 'none',
      imageModel,
      promptFormat: videoType,
      videoFormat: videoType,
      ttsVoice: 'ko-KR-SoonBokNeural',
      ttsSpeed: '+0%',
      title: content.title,
      scriptId: scriptId,
      taskId: scriptId,  // existingJobId
      storyJson: storyJson,
      useThumbnailFromFirstImage: false
    };

    console.log('📤 [VIDEO-GEN] Request body:', {
      imageSource: imageSource || 'none',
      imageModel,
      videoType,
      userId: content.userId,
      scriptId
    });

    // 내부 요청임을 명시
    const videoResponse = await fetch(`http://localhost:2000/api/generate-video-upload`, {
      method: 'POST',
      headers: {
        'X-Internal-Request': 'automation-system',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📥 [VIDEO-GEN] generate-video response: ${videoResponse.status}`);

    if (!videoResponse.ok) {
      const errorText = await videoResponse.text();
      console.error('❌ [VIDEO-GEN] generate-video failed:', errorText);
      return NextResponse.json(
        { error: `Video generation failed: ${errorText}` },
        { status: videoResponse.status }
      );
    }

    const result = await videoResponse.json();
    console.log('✅ [VIDEO-GEN] Video generation completed:', result);

    return NextResponse.json({
      success: true,
      taskId: result.taskId,
      message: 'Video generation completed'  // ✅ BTS-0000017: "completed"로 수정
    });

  } catch (error: any) {
    console.error('❌ [VIDEO-GEN] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
