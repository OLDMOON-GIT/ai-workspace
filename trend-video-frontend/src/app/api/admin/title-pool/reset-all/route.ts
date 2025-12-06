import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { run } from '@/lib/mysql';

// POST: 모든 사용됨(used=1) 제목을 미사용(used=0)으로 변경
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await run('UPDATE title_pool SET used = 0 WHERE used = 1', []);

    return NextResponse.json({
      success: true,
      count: result.affectedRows || 0
    });

  } catch (error: any) {
    console.error('모두 되돌리기 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to reset titles' },
      { status: 500 }
    );
  }
}
