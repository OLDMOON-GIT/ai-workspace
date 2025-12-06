import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

interface ChannelSetting {
  channel_id: string;
  channel_name: string;
  categories: string;
  schedule_times: string;
  color: string;
}

// POST: 자동 스케줄 생성 수동 트리거 (스트리밍)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendLog = (message: string) => {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        };

        try {
          sendLog('⚡ [즉시 실행] 자동 제목 생성을 시작합니다...');
          sendLog('');

          const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
          // MySQL: using imported db

          // 모든 활성 채널 설정 조회
          const allSettings = await db.prepare(`
            SELECT * FROM youtube_channel_setting
            WHERE is_active = 1
          `).all() as ChannelSetting[];

          sendLog(`🔍 총 ${allSettings.length}개 활성 채널 발견`);
          sendLog('');

          let successCount = 0;
          let failedCount = 0;
          let skippedCount = 0;

          for (let i = 0; i < allSettings.length; i++) {
            const setting = allSettings[i];
            sendLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            sendLog(`📺 [${i + 1}/${allSettings.length}] ${setting.channel_name}`);

            // 카테고리 검증
            if (!setting.categories || setting.categories.trim() === '' || setting.categories === '[]') {
              sendLog(`   ⏸️ 카테고리 미설정 → 스킵`);
              skippedCount++;
              sendLog('');
              continue;
            }

            let categories: string[];
            try {
              categories = JSON.parse(setting.categories);
              if (!Array.isArray(categories) || categories.length === 0) {
                sendLog(`   ⏸️ 카테고리 배열 비어있음 → 스킵`);
                skippedCount++;
                sendLog('');
                continue;
              }
            } catch (e) {
              sendLog(`   ❌ 카테고리 파싱 실패 → 스킵`);
              skippedCount++;
              sendLog('');
              continue;
            }

            const category = categories[0];
            sendLog(`   📁 카테고리: ${category}`);

            // 🚨 상품 카테고리는 Coupang API를 사용해야 함 - 스킵
            if (category === '상품' || category.includes('product') || category.includes('쿠팡')) {
              sendLog(`   ⏸️ 상품 카테고리 → Coupang API 필요 (스킵)`);
              skippedCount++;
              sendLog('');
              continue;
            }

            // 스케줄 시간 확인 (없으면 1분 후 즉시 실행)
            let scheduleTimes: string[] = [];
            try {
              scheduleTimes = JSON.parse(setting.schedule_times || '[]');
            } catch (e) {
              scheduleTimes = [];
            }

            const now = new Date();
            let nextScheduleTime: Date;

            if (scheduleTimes.length === 0) {
              // 예약 시간 없으면 1분 후 즉시 실행
              nextScheduleTime = new Date(now.getTime() + 60 * 1000);
              sendLog(`   ⚡ 예약 시간 미설정 → 1분 후 즉시 실행`);
            } else {
              sendLog(`   ⏰ 예약 시간: ${scheduleTimes.join(', ')}`);

              // 다음 스케줄 시간 계산
              nextScheduleTime = new Date(now.getTime() + 60 * 1000); // 기본값: 1분 후

              for (const timeStr of scheduleTimes) {
                const [hours, minutes] = timeStr.split(':').map(Number);
                const scheduleToday = new Date(now);
                scheduleToday.setHours(hours, minutes, 0, 0);

                if (scheduleToday > now) {
                  nextScheduleTime = scheduleToday;
                  break;
                }
              }

              // 오늘 남은 시간이 없으면 내일 첫 번째 시간
              if (nextScheduleTime.getTime() === now.getTime() + 60 * 1000 && scheduleTimes.length > 0) {
                const [hours, minutes] = scheduleTimes[0].split(':').map(Number);
                nextScheduleTime = new Date(now);
                nextScheduleTime.setDate(nextScheduleTime.getDate() + 1);
                nextScheduleTime.setHours(hours, minutes, 0, 0);
              }
            }

            // 기존 예약 확인 (같은 날짜에 이미 있는지)
            const scheduleDateStr = nextScheduleTime.toISOString().split('T')[0];
            const existingSchedule = await db.prepare(`
              SELECT t.task_id, t.scheduled_time, c.title
              FROM task t
              JOIN content c ON t.task_id = c.content_id
              WHERE c.youtube_channel = ? AND t.user_id = ?
                AND t.scheduled_time IS NOT NULL
                AND date(t.scheduled_time) = date(?)
              LIMIT 1
            `).get(setting.channel_id, user.userId, scheduleDateStr) as any;

            if (existingSchedule) {
              sendLog(`   ⏸️ ${scheduleDateStr}에 이미 예약 있음`);
              sendLog(`      → "${existingSchedule.title?.substring(0, 30)}..."`);
              skippedCount++;
              sendLog('');
              continue;
            }

            // 제목 생성 시도 (제목 풀 우선 → 패턴 샘플링 → AI 백업)
            sendLog(`   📋 제목 풀에서 가져오는 중...`);

            try {
              // 실제 제목 생성 함수 호출 (채널별 예약 시간 전달)
              const { generateTitleWithMultiModelEvaluation } = await import('@/lib/automation-scheduler');
              const result = await generateTitleWithMultiModelEvaluation(
                category,
                user.userId,
                setting.channel_id,
                setting.channel_name,
                nextScheduleTime  // 🆕 채널별 예약 시간 전달
              );

              if (result) {
                sendLog(`   ✅ 제목 생성 성공!`);
                sendLog(`      📝 "${result.title}"`);
                sendLog(`      📅 예약: ${nextScheduleTime.toLocaleString('ko-KR')}`);
                successCount++;
              } else {
                sendLog(`   ❌ 제목 생성 실패 (점수 미달 또는 오류)`);
                failedCount++;
              }
            } catch (error: any) {
              sendLog(`   ❌ 오류: ${error.message}`);
              failedCount++;
            }

            sendLog('');
          }

          // MySQL: pool manages connections

          sendLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          sendLog('');
          sendLog('📊 결과 요약:');
          sendLog(`   ✅ 성공: ${successCount}개`);
          sendLog(`   ❌ 실패: ${failedCount}개`);
          sendLog(`   ⏸️ 스킵: ${skippedCount}개`);
          sendLog('');
          sendLog('✨ 즉시 실행 완료!');

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error: any) {
          sendLog(`❌ 오류 발생: ${error.message}`);
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Failed to start streaming:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start' },
      { status: 500 }
    );
  }
}
