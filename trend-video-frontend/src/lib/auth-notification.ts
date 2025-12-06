/**
 * 인증 알림 시스템 (BTS-3133)
 *
 * 로그인/재인증이 필요할 때 사용자에게 알림을 보내고
 * 로그인 처리를 요청할 수 있는 플로우를 제공합니다.
 */

import { run, getAll, getOne } from './mysql';

export interface AuthNotification {
  notificationId: number;
  userId: string | null;
  service: string;
  message: string;
  actionUrl: string | null;
  actionLabel: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceType = 'youtube' | 'coupang' | 'wordpress' | 'tiktok' | 'instagram' | 'system';

/**
 * 인증 알림 생성
 *
 * @param service - 서비스 종류 (youtube, coupang, wordpress 등)
 * @param message - 알림 메시지
 * @param options - 추가 옵션 (userId, actionUrl, actionLabel)
 */
export async function createAuthNotification(
  service: ServiceType,
  message: string,
  options?: {
    userId?: string;
    actionUrl?: string;
    actionLabel?: string;
  }
): Promise<number> {
  const result = await run(
    `INSERT INTO auth_notification (user_id, service, message, action_url, action_label)
     VALUES (?, ?, ?, ?, ?)`,
    [
      options?.userId || null,
      service,
      message,
      options?.actionUrl || null,
      options?.actionLabel || null
    ]
  );

  console.log(`🔔 [AUTH-NOTIFICATION] Created: ${service} - ${message}`);
  return result.insertId;
}

/**
 * 읽지 않은 알림 조회
 *
 * @param userId - 사용자 ID (null이면 전체 시스템 알림)
 * @param limit - 최대 조회 수
 */
export async function getUnreadNotifications(
  userId?: string,
  limit: number = 10
): Promise<AuthNotification[]> {
  const sql = userId
    ? `SELECT notification_id as notificationId, user_id as userId, service, message,
              action_url as actionUrl, action_label as actionLabel, is_read as isRead,
              created_at as createdAt, updated_at as updatedAt
       FROM auth_notification
       WHERE is_read = 0 AND (user_id = ? OR user_id IS NULL)
       ORDER BY created_at DESC
       LIMIT ?`
    : `SELECT notification_id as notificationId, user_id as userId, service, message,
              action_url as actionUrl, action_label as actionLabel, is_read as isRead,
              created_at as createdAt, updated_at as updatedAt
       FROM auth_notification
       WHERE is_read = 0 AND user_id IS NULL
       ORDER BY created_at DESC
       LIMIT ?`;

  const params = userId ? [userId, limit] : [limit];
  return await getAll<AuthNotification>(sql, params);
}

/**
 * 알림 읽음 처리
 *
 * @param notificationId - 알림 ID
 */
export async function markNotificationAsRead(notificationId: number): Promise<boolean> {
  const result = await run(
    `UPDATE auth_notification SET is_read = 1, updated_at = NOW() WHERE notification_id = ?`,
    [notificationId]
  );
  return result.affectedRows > 0;
}

/**
 * 서비스별 알림 모두 읽음 처리
 *
 * @param service - 서비스 종류
 * @param userId - 사용자 ID (선택)
 */
export async function markServiceNotificationsAsRead(
  service: ServiceType,
  userId?: string
): Promise<number> {
  const sql = userId
    ? `UPDATE auth_notification SET is_read = 1, updated_at = NOW()
       WHERE service = ? AND (user_id = ? OR user_id IS NULL) AND is_read = 0`
    : `UPDATE auth_notification SET is_read = 1, updated_at = NOW()
       WHERE service = ? AND user_id IS NULL AND is_read = 0`;

  const params = userId ? [service, userId] : [service];
  const result = await run(sql, params);
  return result.affectedRows;
}

/**
 * 읽지 않은 알림 개수 조회
 *
 * @param userId - 사용자 ID (선택)
 */
export async function getUnreadNotificationCount(userId?: string): Promise<number> {
  const sql = userId
    ? `SELECT COUNT(*) as count FROM auth_notification
       WHERE is_read = 0 AND (user_id = ? OR user_id IS NULL)`
    : `SELECT COUNT(*) as count FROM auth_notification
       WHERE is_read = 0 AND user_id IS NULL`;

  const params = userId ? [userId] : [];
  const row = await getOne<{ count: number }>(sql, params);
  return row?.count || 0;
}

/**
 * 오래된 알림 정리 (30일 이상 경과)
 */
export async function cleanupOldNotifications(): Promise<number> {
  const result = await run(
    `DELETE FROM auth_notification WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`
  );
  if (result.affectedRows > 0) {
    console.log(`🧹 [AUTH-NOTIFICATION] Cleaned up ${result.affectedRows} old notifications`);
  }
  return result.affectedRows;
}

// ============================================================
// 서비스별 편의 함수
// ============================================================

/**
 * YouTube 인증 만료 알림
 */
export async function notifyYouTubeAuthExpired(channelName?: string): Promise<number> {
  const message = channelName
    ? `YouTube 채널 "${channelName}"의 인증이 만료되었습니다. 채널을 다시 연결해주세요.`
    : 'YouTube 인증이 만료되었습니다. 채널을 다시 연결해주세요.';

  return createAuthNotification('youtube', message, {
    actionUrl: '/automation?tab=channels',
    actionLabel: '채널 재연결'
  });
}

/**
 * 쿠팡 API 인증 오류 알림
 */
export async function notifyCoupangAuthError(errorMessage?: string): Promise<number> {
  const message = errorMessage
    ? `쿠팡 API 인증 오류: ${errorMessage}`
    : '쿠팡 API 인증에 실패했습니다. API 키를 확인해주세요.';

  return createAuthNotification('coupang', message, {
    actionUrl: '/settings',
    actionLabel: 'API 키 확인'
  });
}

/**
 * 일반 시스템 로그인 필요 알림
 */
export async function notifyLoginRequired(feature: string): Promise<number> {
  return createAuthNotification('system', `"${feature}" 기능을 사용하려면 로그인이 필요합니다.`, {
    actionUrl: '/login',
    actionLabel: '로그인'
  });
}
