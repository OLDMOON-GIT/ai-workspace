'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface AuthNotification {
  notificationId: number;
  service: string;
  message: string;
  actionUrl: string | null;
  actionLabel: string | null;
  createdAt: string;
}

export default function AuthNotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AuthNotification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/auth-notifications?limit=5');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // 30초마다 알림 확인
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkRead = async (notificationId: number) => {
    setLoading(true);
    try {
      await fetch('/api/auth-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', notificationId })
      });
      setNotifications(prev => prev.filter(n => n.notificationId !== notificationId));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (notification: AuthNotification) => {
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
    handleMarkRead(notification.notificationId);
    setShowDropdown(false);
  };

  const getServiceIcon = (service: string) => {
    switch (service) {
      case 'youtube': return '🔴';
      case 'coupang': return '🛒';
      case 'wordpress': return '📝';
      case 'system': return '⚙️';
      default: return '🔔';
    }
  };

  const getServiceColor = (service: string) => {
    switch (service) {
      case 'youtube': return 'text-red-400';
      case 'coupang': return 'text-orange-400';
      case 'wordpress': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
        title={`${notifications.length}개의 알림`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* 알림 배지 */}
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {notifications.length}
        </span>
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-white">인증 알림</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification.notificationId}
                className="p-3 border-b border-gray-700 hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{getServiceIcon(notification.service)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${getServiceColor(notification.service)} font-medium`}>
                      {notification.service.toUpperCase()}
                    </p>
                    <p className="text-sm text-gray-300 mt-1">{notification.message}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {notification.actionUrl && (
                        <button
                          onClick={() => handleAction(notification)}
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded"
                          disabled={loading}
                        >
                          {notification.actionLabel || '처리하기'}
                        </button>
                      )}
                      <button
                        onClick={() => handleMarkRead(notification.notificationId)}
                        className="text-xs px-2 py-1 text-gray-400 hover:text-white"
                        disabled={loading}
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 배경 클릭 시 닫기 */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
