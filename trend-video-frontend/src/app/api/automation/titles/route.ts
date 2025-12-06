import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  initAutomationTables,
  addVideoTitle,
  getAllVideoTitles
} from '@/lib/automation';

// 테이블 초기화 (최초 1회)
(async () => {
  try {
    await initAutomationTables();
  } catch (error) {
    console.error('Failed to initialize automation tables:', error);
  }
})();

// GET: 모든 제목 가져오기
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const titles = await getAllVideoTitles();
    return NextResponse.json({ titles });
  } catch (error: any) {
    console.error('GET /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 새 제목 추가
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, promptFormat, category, tags, productUrl, productData, channel, scriptMode, mediaMode, youtubeSchedule, aiModel, ttsVoice, ttsSpeed, autoConvert, skipDuplicateCheck } = body;

    // ⭐ 디버그: promptFormat 값 확인
    console.log(`📋 [POST /api/automation/titles] 수신된 데이터:`, {
      title: title?.substring(0, 30),
      promptFormat,
      category,
      aiModel
    });

    if (!title || !promptFormat) {
      return NextResponse.json({ error: 'Title and promptFormat are required' }, { status: 400 });
    }

    if (!['shortform', 'longform', 'product', 'sora2'].includes(promptFormat)) {
      return NextResponse.json({ error: 'Invalid promptFormat' }, { status: 400 });
    }

    // 상품 타입인 경우 딥링크 검증
    if (promptFormat === 'product' && productUrl) {
      // 딥링크는 반드시 link.coupang.com으로 시작해야 함
      if (!productUrl.startsWith('https://link.coupang.com/')) {
        return NextResponse.json({
          error: '상품 링크가 올바른 딥링크 형식이 아닙니다. 쿠팡 파트너스에서 딥링크를 먼저 생성해주세요. (link.coupang.com으로 시작하는 URL이어야 합니다)'
        }, { status: 400 });
      }
    }

    const titleId = await addVideoTitle({
      title,
      promptFormat,
      category,
      tags,
      productUrl,
      productData,
      channel,
      scriptMode,
      mediaMode,
      youtubeSchedule,
      aiModel: aiModel || 'claude',
      ttsVoice: ttsVoice || 'ko-KR-SoonBokNeural',  // TTS 음성
      ttsSpeed: ttsSpeed || '+0%',  // TTS 속도
      autoConvert: autoConvert || false,  // 롱폼→숏폼 자동변환
      skipDuplicateCheck: skipDuplicateCheck || false,  // ⭐ 중복/점수 검사 건너뛰기 (새제목추가용)
      userId: user.userId
    });

    return NextResponse.json({ success: true, titleId });
  } catch (error: any) {
    console.error('POST /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 제목 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const titleId = searchParams.get('id');

    if (!titleId) {
      return NextResponse.json({ error: 'Title ID is required' }, { status: 400 });
    }

    const db = (await import('@/lib/mysql')).default;

    // 1. task_queue 삭제
    await db.query('DELETE FROM task_queue WHERE task_id = ?', [titleId]);
    // 2. task_lock 해제
    await db.query('UPDATE task_lock SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL WHERE lock_task_id = ?', [titleId]);
    // 3. task 삭제
    await db.query('DELETE FROM task WHERE task_id = ?', [titleId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 제목 업데이트 (v5: content + content_setting 분리)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, promptFormat, category, tags, priority, channelId, scriptMode, mediaMode, aiModel, ttsVoice, ttsSpeed, autoConvert } = body;

    console.log('🔍 [API PATCH /automation/titles] 받은 데이터:', {
      id,
      title,
      ttsVoice,
      ttsSpeed,
      autoConvert,
      allBody: body
    });

    if (!id) {
      return NextResponse.json({ error: 'Title ID is required' }, { status: 400 });
    }

    const db = (await import('@/lib/mysql')).default;

    // content 테이블 업데이트 (title, prompt_format, category, ai_model)
    const contentUpdates: string[] = [];
    const contentValues: any[] = [];

    if (title !== undefined) {
      contentUpdates.push('title = ?');
      contentValues.push(title);
    }
    if (promptFormat !== undefined) {
      contentUpdates.push('prompt_format = ?');
      contentValues.push(promptFormat);
    }
    if (category !== undefined) {
      contentUpdates.push('category = ?');
      contentValues.push(category);
    }
    if (aiModel !== undefined) {
      contentUpdates.push('ai_model = ?');
      contentValues.push(aiModel);
    }
    if (channelId !== undefined) {
      contentUpdates.push('youtube_channel = ?');
      contentValues.push(channelId);
    }

    if (contentUpdates.length > 0) {
      contentUpdates.push('updated_at = NOW()');
      contentValues.push(id);
      await db.query(`
        UPDATE content
        SET ${contentUpdates.join(', ')}
        WHERE content_id = ?
      `, contentValues);
    }

    // content_setting 테이블 업데이트 (tags, priority, script_mode, media_mode, tts_*, auto_create_shortform)
    const settingUpdates: string[] = [];
    const settingValues: any[] = [];

    if (tags !== undefined) {
      settingUpdates.push('tags = ?');
      settingValues.push(tags);
    }
    if (priority !== undefined) {
      settingUpdates.push('priority = ?');
      settingValues.push(priority);
    }
    if (scriptMode !== undefined) {
      settingUpdates.push('script_mode = ?');
      settingValues.push(scriptMode);
    }
    if (mediaMode !== undefined) {
      settingUpdates.push('media_mode = ?');
      settingValues.push(mediaMode);
    }
    if (ttsVoice !== undefined) {
      settingUpdates.push('tts_voice = ?');
      settingValues.push(ttsVoice);
    }
    if (ttsSpeed !== undefined) {
      settingUpdates.push('tts_speed = ?');
      settingValues.push(ttsSpeed);
    }
    if (autoConvert !== undefined) {
      settingUpdates.push('auto_create_shortform = ?');
      settingValues.push(autoConvert ? 1 : 0);
    }

    if (settingUpdates.length > 0) {
      settingUpdates.push('updated_at = NOW()');
      settingValues.push(id);

      console.log('💾 [API] content_setting UPDATE 실행:', {
        updates: settingUpdates,
        values: settingValues
      });

      await db.query(`
        UPDATE content_setting
        SET ${settingUpdates.join(', ')}
        WHERE content_id = ?
      `, settingValues);

      console.log('✅ [API] content_setting UPDATE 완료');
    }

    // task 테이블은 status만 가지고 있으므로 업데이트 불필요

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
