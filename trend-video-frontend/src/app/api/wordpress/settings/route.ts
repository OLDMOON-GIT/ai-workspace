import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getOne, run } from '@/lib/mysql';

/**
 * 워드프레스 설정 저장/조회 API
 */

interface WordPressSettings {
  siteUrl: string;
  username: string;
  appPassword: string;
}

// GET: 워드프레스 설정 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 사용자별 워드프레스 설정 조회
    const settings = await getOne(`
      SELECT site_url, username, app_password
      FROM wordpress_settings
      WHERE user_id = ?
    `, [user.userId]) as any;

    if (!settings) {
      return NextResponse.json({
        siteUrl: '',
        username: '',
        appPassword: ''
      });
    }

    return NextResponse.json({
      siteUrl: settings.site_url,
      username: settings.username,
      appPassword: settings.app_password
    });

  } catch (error: any) {
    console.error('워드프레스 설정 조회 오류:', error);
    return NextResponse.json(
      { error: '설정 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 워드프레스 설정 저장
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { siteUrl, username, appPassword } = await request.json();

    // 필수 항목 확인
    if (!siteUrl || !username || !appPassword) {
      return NextResponse.json(
        { error: '모든 항목을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 워드프레스 설정 저장 (upsert)
    await run(`
      INSERT INTO wordpress_settings (user_id, site_url, username, app_password, updated_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        site_url = VALUES(site_url),
        username = VALUES(username),
        app_password = VALUES(app_password),
        updated_at = NOW()
    `, [user.userId, siteUrl, username, appPassword]);

    console.log('✅ 워드프레스 설정 저장 완료:', user.email);

    return NextResponse.json({
      success: true,
      message: '워드프레스 설정이 저장되었습니다.'
    });

  } catch (error: any) {
    console.error('워드프레스 설정 저장 오류:', error);
    return NextResponse.json(
      { error: '설정 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
