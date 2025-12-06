import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';
import { getContentLogs, LogType } from '@/lib/content';

/**
 * GET /api/automation/logs?taskId=xxx&logOffset=0
 * 특정 태스크의 실행 로그 조회 (script, image, video, youtube 로그 통합)
 * logOffset: 클라이언트가 이미 가진 로그 개수 (append 방식으로 새 로그만 반환)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const logOffset = parseInt(searchParams.get('logOffset') || '0');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    // MySQL: using imported db

    // 본인의 태스크인지 확인 (admin은 모든 로그 볼 수 있음)
    if (!user.isAdmin) {
      const titleOwner = await db.prepare(`
        SELECT user_id FROM task WHERE task_id = ?
      `).get(taskId) as { user_id?: string } | undefined;

      if (!titleOwner || titleOwner.user_id !== user.userId) {
        // MySQL: pool manages connections
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 1. 파일 기반 로그에서 모든 타입의 로그 가져오기
    const logTypes: LogType[] = ['script', 'image', 'video', 'youtube'];
    let pythonLogs: Array<{ log_message: string; created_at: string; source: string }> = [];

    // 2. 통합 키 시스템: task_id = content_id 이므로 바로 사용
    // 파일에서 모든 타입의 로그 가져오기 (실시간!)
    for (const logType of logTypes) {
      const lines = getContentLogs(taskId, logType);
      for (const line of lines) {
        const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (match) {
          pythonLogs.push({
            log_message: match[2],
            created_at: match[1],
            source: logType
          });
        } else if (line.trim()) {
          pythonLogs.push({
            log_message: line,
            created_at: new Date().toISOString(),
            source: logType
          });
        }
      }
    }

    // MySQL: pool manages connections

    // 4. Python 로그 포맷 변환 (파일 기반 로그에서 가져온 데이터)
    const formattedPythonLogs = pythonLogs.map((row: { log_message: string; created_at: string; source: string }) => {
      const line = row.log_message;

      // Python 로그 형식: "2025-11-14 17:36:09,615 - INFO - 메시지"
      const pythonMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+ - (\w+) - (.+)$/);

      if (pythonMatch) {
        return {
          timestamp: pythonMatch[1].replace(' ', 'T'),
          level: pythonMatch[2].toLowerCase(),
          message: pythonMatch[3],
          source: row.source
        };
      }

      // FFmpeg나 기타 출력 (created_at 타임스탬프 사용)
      return {
        timestamp: row.created_at,
        level: 'info',
        message: line.trim(),
        source: row.source
      };
    });

    // ⭐ BTS-FIX: 중복 로그 제거 (연속된 동일한 로그 필터링)
    const deduplicatedLogs: typeof formattedPythonLogs = [];
    for (let i = 0; i < formattedPythonLogs.length; i++) {
      const current = formattedPythonLogs[i];
      const prev = formattedPythonLogs[i - 1];

      // 이전 로그와 메시지+소스가 동일하면 중복으로 간주하고 건너뛰기
      if (prev && current.message === prev.message && current.source === prev.source) {
        continue;
      }

      deduplicatedLogs.push(current);
    }

    // 5. 모든 로그 시간순 정렬 (중복 제거된 로그 사용)
    const allLogs = deduplicatedLogs.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // 6. offset 이후의 새 로그만 반환 (append 방식으로 대역폭 절약)
    const newLogs = allLogs.slice(logOffset);
    // 최대 100개로 제한 (너무 많으면 청크로 나눠서 전송)
    const limitedLogs = newLogs.slice(0, 100);

    return NextResponse.json({
      logs: limitedLogs,
      logOffset: logOffset + limitedLogs.length,  // 클라이언트가 다음 요청에 사용할 offset
      totalLogs: allLogs.length,
      hasMore: newLogs.length > 100
    });
  } catch (error: any) {
    console.error('GET /api/automation/logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
