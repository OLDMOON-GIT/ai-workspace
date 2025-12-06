import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAll } from '@/lib/mysql';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/bugs/refine
 *
 * Claude Haiku를 사용하여 버그/스펙의 제목과 요약을 다듬고,
 * 최신 20개 BTS를 참고하여 연관 BTS를 찾아줍니다.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const title = (body.title || '').trim();
    const summary = (body.summary || '').trim();
    const type = (body.type || 'bug').trim();

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 최신 20개 BTS 조회 (제목과 ID만)
    const recentBugs = await getAll<{ id: number; title: string; type: string; status: string }>(
      `SELECT id, title, type, status FROM bugs
       ORDER BY created_at DESC
       LIMIT 20`
    );

    const recentBugsList = recentBugs.map((b) =>
      `- BTS-${String(b.id).padStart(7, '0')} [${b.type}/${b.status}]: ${b.title}`
    ).join('\n');

    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const typeLabel = type === 'spec' ? '스펙(기능 요청)' : '버그';

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `당신은 버그 트래킹 시스템(BTS) 전문가입니다.

## 입력
- 유형: ${typeLabel}
- 제목: ${title}
- 요약: ${summary || '(없음)'}

## 최근 등록된 BTS 목록 (연관성 참고용)
${recentBugsList}

## 작업
1. **제목 다듬기**: 더 명확하고 간결하게 수정. 불필요한 내용 제거.
2. **요약 다듬기**: 핵심만 남기고 체계적으로 정리. 요약이 없으면 제목을 기반으로 간단히 생성.
3. **연관 BTS 찾기**: 위 목록에서 이 ${typeLabel}와 관련있을 수 있는 BTS ID를 최대 3개까지 추출.

## 출력 형식 (JSON)
\`\`\`json
{
  "refinedTitle": "다듬어진 제목",
  "refinedSummary": "다듬어진 요약 (2-3문장)",
  "relatedBugs": ["BTS-0001234", "BTS-0001235"],
  "reason": "연관 BTS 선택 이유 (1문장)"
}
\`\`\`

JSON만 출력하세요. 다른 설명은 불필요합니다.`
        }
      ]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text.trim()
      : '';

    // JSON 파싱 시도
    let result: any = {
      refinedTitle: title,
      refinedSummary: summary,
      relatedBugs: [],
      reason: ''
    };

    try {
      // JSON 블록 추출
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                        responseText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        result = {
          refinedTitle: parsed.refinedTitle || title,
          refinedSummary: parsed.refinedSummary || summary,
          relatedBugs: Array.isArray(parsed.relatedBugs) ? parsed.relatedBugs : [],
          reason: parsed.reason || ''
        };
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError, responseText);
      // 파싱 실패 시 원본 유지
    }

    return NextResponse.json({
      original: { title, summary, type },
      refined: result,
      recentBugsCount: recentBugs.length,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens
      }
    });

  } catch (error: any) {
    console.error('POST /api/bugs/refine error:', error);

    if (error?.status === 401) {
      return NextResponse.json(
        { error: 'API 키가 유효하지 않습니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error?.message || '다듬기 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
