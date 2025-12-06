import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAll, getOne, run } from '@/lib/mysql';

/**
 * 사용자 카테고리 관리 API
 *
 * GET: 카테고리 목록 조회
 * POST: 새 카테고리 추가
 */

// 카테고리 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const categories = await getAll(`
      SELECT id, category, display_name, keywords, description, is_default, created_at, updated_at
      FROM user_category
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `, [user.userId]) as any[];

    // keywords는 JSON 문자열이므로 파싱
    const parsedCategories = categories.map(cat => ({
      ...cat,
      keywords: cat.keywords ? JSON.parse(cat.keywords) : [],
      is_default: Boolean(cat.is_default)
    }));

    return NextResponse.json({
      categories: parsedCategories
    });

  } catch (error: any) {
    console.error('❌ 카테고리 조회 오류:', error);
    return NextResponse.json(
      { error: error?.message || '카테고리 조회 실패' },
      { status: 500 }
    );
  }
}

// 새 카테고리 추가
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { category, displayName, keywords, description } = body;

    // 유효성 검증
    if (!category || !displayName) {
      return NextResponse.json(
        { error: '카테고리명과 표시 이름은 필수입니다.' },
        { status: 400 }
      );
    }

    // 카테고리명 중복 확인
    const existing = await getOne(`
      SELECT id FROM user_category WHERE user_id = ? AND category = ?
    `, [user.userId, category]);

    if (existing) {
      return NextResponse.json(
        { error: '이미 존재하는 카테고리명입니다.' },
        { status: 400 }
      );
    }

    // 키워드 배열을 JSON 문자열로 변환
    const keywordsJson = Array.isArray(keywords) ? JSON.stringify(keywords) : null;

    // 카테고리 추가
    const result = await run(`
      INSERT INTO user_category (user_id, category, display_name, keywords, description, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())
    `, [user.userId, category, displayName, keywordsJson, description || null]);

    console.log('✅ 카테고리 추가 완료:', category, 'for user:', user.userId);

    return NextResponse.json({
      success: true,
      message: '카테고리가 추가되었습니다.',
      categoryId: result.insertId
    });

  } catch (error: any) {
    console.error('❌ 카테고리 추가 오류:', error);
    return NextResponse.json(
      { error: error?.message || '카테고리 추가 실패' },
      { status: 500 }
    );
  }
}

// 카테고리 수정
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, category, displayName, keywords, description } = body;

    // 유효성 검증
    if (!id) {
      return NextResponse.json(
        { error: '카테고리 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 카테고리 소유권 확인
    const existing = await getOne(`
      SELECT id, is_default FROM user_category WHERE id = ? AND user_id = ?
    `, [id, user.userId]) as any;

    if (!existing) {
      return NextResponse.json(
        { error: '카테고리를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 기본 카테고리는 수정 불가
    if (existing.is_default) {
      return NextResponse.json(
        { error: '기본 카테고리는 수정할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 키워드 배열을 JSON 문자열로 변환
    const keywordsJson = Array.isArray(keywords) ? JSON.stringify(keywords) : null;

    // 카테고리 수정
    await run(`
      UPDATE user_category
      SET category = ?,
          display_name = ?,
          keywords = ?,
          description = ?,
          updated_at = NOW()
      WHERE id = ? AND user_id = ?
    `, [category, displayName, keywordsJson, description || null, id, user.userId]);

    console.log('✅ 카테고리 수정 완료:', id);

    return NextResponse.json({
      success: true,
      message: '카테고리가 수정되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 카테고리 수정 오류:', error);
    return NextResponse.json(
      { error: error?.message || '카테고리 수정 실패' },
      { status: 500 }
    );
  }
}

// 카테고리 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: '카테고리 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 카테고리 소유권 확인
    const existing = await getOne(`
      SELECT id, is_default FROM user_category WHERE id = ? AND user_id = ?
    `, [id, user.userId]) as any;

    if (!existing) {
      return NextResponse.json(
        { error: '카테고리를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 기본 카테고리는 삭제 불가
    if (existing.is_default) {
      return NextResponse.json(
        { error: '기본 카테고리는 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 카테고리 삭제
    await run(`
      DELETE FROM user_category WHERE id = ? AND user_id = ?
    `, [id, user.userId]);

    console.log('✅ 카테고리 삭제 완료:', id);

    return NextResponse.json({
      success: true,
      message: '카테고리가 삭제되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 카테고리 삭제 오류:', error);
    return NextResponse.json(
      { error: error?.message || '카테고리 삭제 실패' },
      { status: 500 }
    );
  }
}
