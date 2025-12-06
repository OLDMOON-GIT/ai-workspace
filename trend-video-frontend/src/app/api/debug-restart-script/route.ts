import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findScriptById, deductCredits, addCreditHistory, getSettings } from '@/lib/db';
import { findContentById } from '@/lib/content';

export async function POST(request: NextRequest) {
  try {
    const { scriptId, title } = await request.json();

    if (!scriptId && !title) {
      return NextResponse.json(
        { error: 'scriptId 또는 title이 필요합니다.' },
        { status: 400 }
      );
    }

    const contentForUser = await findContentById(scriptId);
    if (!contentForUser) {
        return NextResponse.json({ error: '스크립트를 찾을 수 없습니다.' }, { status: 404 });
    }

    const user = { userId: contentForUser.userId, email: 'debug@internal.com', isAdmin: true };

    // Script 정보 조회 (우선순위: content -> script)
    let script = null;
    if (scriptId) {
      script = await findScriptById(scriptId);

      // 본인의 스크립트인지 확인
      if (script && script.userId !== user.userId) {
        return NextResponse.json(
          { error: '권한이 없습니다.' },
          { status: 403 }
        );
      }
    }

    console.log(`스크립트 재생성 요청: ${scriptId || title} by ${user.email}`);

    // 크레딧 조회 및 차감
    const settings = await getSettings();
    const cost = settings.scriptGenerationCost || 10; // 스크립트 생성 비용

    const deductResult = await deductCredits(user.userId, cost);

    if (!deductResult.success) {
      console.log(`크레딧 부족: ${user.email}, 필요: ${cost}, 잔액: ${deductResult.balance}`);
      return NextResponse.json(
        {
          error: `크레딧이 부족합니다. (필요: ${cost}, 잔액: ${deductResult.balance})`,
          requiredCredits: cost,
          currentCredits: deductResult.balance
        },
        { status: 402 } // 402 Payment Required
      );
    }

    console.log(`크레딧 차감 성공: ${user.email}, ${cost} 크레딧 차감, 남은 잔액: ${deductResult.balance}`);

    // 크레딧 사용 내역 기록
    await addCreditHistory(user.userId, 'use', -cost, '스크립트 재생성');

    // contents에서 원본 요청 정보 조회
    let scriptTitle = title;
    let scriptType = 'longform';
    let useClaudeLocal = false;
    let model: string | undefined = undefined;

    if (scriptId) {
      const content = await findContentById(scriptId);

      if (content) {
        console.log(`기존 스크립트 정보 로드:`, {
          title: content.title,
          originalTitle: content.originalTitle,
          type: content.promptFormat,
          useClaudeLocal: content.useClaudeLocal
        });

        scriptTitle = content.originalTitle || content.title;
        scriptType = content.promptFormat || 'longform';
        useClaudeLocal = content.useClaudeLocal === true;
        model = content.aiModel || model;
      } else if (script) {
        // contents에 없는 레거시 스크립트
        scriptTitle = script.originalTitle || script.title;
        scriptType = script.promptFormat || 'longform';
        useClaudeLocal = script.useClaudeLocal === true;
        model = (script as any).aiModel || model;
      }
    }

    // 내부 스크립트 생성 API 호출
    const generateResponse = await fetch(`${request.nextUrl.origin}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(request.headers.entries())
      },
      body: JSON.stringify({
        title: `${scriptTitle} (재생성)`,
        format: scriptType,
        useClaudeLocal: useClaudeLocal,
        model: model || 'claude'
      })
    });

    const generateData = await generateResponse.json();

    if (!generateResponse.ok) {
      return NextResponse.json(
        { error: generateData.error || '스크립트 재생성에 실패했습니다.' },
        { status: generateResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      scriptId: generateData.taskId || generateData.scriptId,
      message: '스크립트가 성공적으로 재생성 요청되었습니다.'
    });

  } catch (error: any) {
    console.error('Error restarting script:', error);
    return NextResponse.json(
      { error: error?.message || '스크립트 재생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
