import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAll, getOne } from '@/lib/mysql';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({
        error: '로그인되지 않음',
        user: null
      });
    }

    // 데이터베이스에서 사용자 정보 가져오기
    const userInfo = await getOne('SELECT user_id, email FROM user WHERE user_id = ?', [user.userId]) as any;

    // 이 사용자의 contents (scripts) 개수 확인
    const scriptCount = await getOne("SELECT COUNT(*) as count FROM content WHERE user_id = ? AND status = 'completed'", [user.userId]) as any;

    // 모든 contents (scripts) 확인 (디버깅용)
    const allScripts = await getAll("SELECT content_id, user_id, title, created_at FROM content WHERE status = 'completed' ORDER BY created_at DESC LIMIT 10", []) as any[];

    return NextResponse.json({
      currentUser: {
        userId: user.userId,
        email: userInfo?.email,
        isAdmin: user.isAdmin
      },
      myScriptCount: scriptCount?.count || 0,
      allScriptsInDB: allScripts.map(s => ({
        id: s.content_id,
        userId: s.user_id,
        title: s.title,
        createdAt: s.created_at,
        isMyScript: s.user_id === user.userId
      }))
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
