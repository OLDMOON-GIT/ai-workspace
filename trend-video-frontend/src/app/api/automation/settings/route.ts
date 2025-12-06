import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { updateAutomationSetting, getAutomationSettings } from '@/lib/automation';
import { startAutoTitleGeneration, stopAutoTitleGeneration, isAutoTitleGenerationRunning } from '@/lib/automation-scheduler';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    // 로그인한 사용자면 사용 가능 (관리자 체크 제거)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // 각 설정 키에 대해 업데이트
    for (const [key, value] of Object.entries(body)) {
      await updateAutomationSetting(key, String(value));
      console.log(`✅ Updated automation setting: ${key} = ${value}`);

      // 🆕 자동 제목 생성 토글 시 독립 타이머 시작/중지
      if (key === 'auto_title_generation') {
        if (value === 'true') {
          console.log('🤖 자동 제목 생성 켜짐 - 독립 타이머 시작');
          await startAutoTitleGeneration();
        } else {
          console.log('⏸️ 자동 제목 생성 꺼짐 - 타이머 중지');
          stopAutoTitleGeneration();
        }
      }
    }

    // ✅ 즉시 업데이트된 설정값 반환 (캐싱 문제 방지)
    const updatedSettings = await getAutomationSettings();

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
      autoTitleRunning: await isAutoTitleGenerationRunning()
    });

  } catch (error: any) {
    console.error('Failed to update automation settings:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
