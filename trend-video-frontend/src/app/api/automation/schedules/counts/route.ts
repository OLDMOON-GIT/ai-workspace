import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAllScheduleCount } from '@/lib/automation';

/**
 * GET: 스케줄 카운트만 가져오기 (가벼운 쿼리 - 최적화용)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const counts = await getAllScheduleCount();
    return NextResponse.json({ counts });
  } catch (error: any) {
    console.error('GET /api/automation/schedules/counts error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
