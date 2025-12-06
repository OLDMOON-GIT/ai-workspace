/**
 * 인증 알림 API (BTS-3133)
 *
 * GET - 읽지 않은 알림 조회
 * POST - 알림 읽음 처리
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  getUnreadNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markServiceNotificationsAsRead,
  cleanupOldNotifications
} from '@/lib/auth-notification';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const userId = user?.userId;

    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get('count') === 'true';

    if (countOnly) {
      const count = await getUnreadNotificationCount(userId);
      return NextResponse.json({ count });
    }

    const limit = parseInt(searchParams.get('limit') || '10');
    const notifications = await getUnreadNotifications(userId, limit);

    return NextResponse.json({
      notifications,
      count: notifications.length
    });
  } catch (error: any) {
    console.error('[AUTH-NOTIFICATIONS] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const userId = user?.userId;

    const { action, notificationId, service } = await request.json();

    switch (action) {
      case 'markRead':
        if (!notificationId) {
          return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
        }
        const success = await markNotificationAsRead(notificationId);
        return NextResponse.json({ success });

      case 'markServiceRead':
        if (!service) {
          return NextResponse.json({ error: 'service is required' }, { status: 400 });
        }
        const count = await markServiceNotificationsAsRead(service, userId);
        return NextResponse.json({ success: true, markedCount: count });

      case 'cleanup':
        // 관리자만 cleanup 가능
        if (!user?.isAdmin) {
          return NextResponse.json({ error: 'Admin only' }, { status: 403 });
        }
        const cleaned = await cleanupOldNotifications();
        return NextResponse.json({ success: true, cleanedCount: cleaned });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[AUTH-NOTIFICATIONS] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process notification action' },
      { status: 500 }
    );
  }
}
