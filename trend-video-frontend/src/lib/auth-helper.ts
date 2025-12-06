import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

/**
 * 인증 필수 API 헬퍼
 * 관리자 권한이 필요한 API에서 사용
 *
 * @returns 인증 실패 시 NextResponse, 성공 시 사용자 정보
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | { userId: string; email: string; isAdmin: boolean }> {
  const user = await getCurrentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized - 로그인이 필요합니다' }, { status: 401 });
  }

  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden - 관리자 권한이 필요합니다' }, { status: 403 });
  }

  return user;
}

/**
 * 로그인 필수 API 헬퍼 (관리자 권한 불필요)
 */
export async function requireLogin(request: NextRequest): Promise<NextResponse | { userId: string; email: string; isAdmin: boolean }> {
  const user = await getCurrentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized - 로그인이 필요합니다' }, { status: 401 });
  }

  return user;
}
