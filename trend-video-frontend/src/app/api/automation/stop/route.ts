import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { addContentLog } from '@/lib/content';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// 진행 중인 모든 상태 목록
const PROCESSING_STATUSES = [
  'processing',
  'script_processing',
  'image_processing',
  'video_processing',
  'youtube_processing'
];

/**
 * POST /api/automation/stop
 * 진행 중인 작업 중지
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId } = body;

    if (!titleId) {
      return NextResponse.json({ error: 'Title ID is required' }, { status: 400 });
    }

    // MySQL: using imported db

    console.log(`🛑 [STOP] Stopping tasks for title: ${titleId}`);

    // 0. task + content 정보 가져오기 (통합 키 시스템: task_id = content_id)
    const taskInfo = await db.prepare(`
      SELECT t.task_id, c.title
      FROM task t
      LEFT JOIN content c ON t.task_id = c.content_id
      WHERE t.task_id = ?
    `).get(titleId) as any;
    if (!taskInfo) {
      // MySQL: pool manages connections
      return NextResponse.json({ error: 'Title not found' }, { status: 404 });
    }

    console.log(`🔍 [STOP] Title name: ${taskInfo.title}`);

    // 🆕 Python 및 자동화 프로세스 강제 종료 (Windows)
    try {
      if (process.platform === 'win32') {
        // 모든 Python 프로세스 종료 (자동화는 Python으로 실행됨)
        await execAsync('powershell -Command "Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force"');
        console.log('✅ [STOP] Python processes killed (Windows)');

        // chromedriver 종료
        await execAsync('powershell -Command "Get-Process chromedriver -ErrorAction SilentlyContinue | Stop-Process -Force"');
        console.log('✅ [STOP] Chromedriver processes killed');

        // WMI로 Selenium Chrome 찾아서 종료 (CommandLine에 --enable-automation 또는 --test-type 포함)
        await execAsync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'chrome.exe\'\\" | Where-Object {$_.CommandLine -like \'*--test-type*\' -or $_.CommandLine -like \'*--enable-automation*\' -or $_.CommandLine -like \'*--remote-debugging*\'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"');
        console.log('✅ [STOP] Selenium Chrome processes killed');
      } else {
        // Linux/Mac
        await execAsync('pkill -f python || true');
        await execAsync('pkill -f chromedriver || true');
        await execAsync('pkill -f "chrome.*--enable-automation" || true');
        console.log('✅ [STOP] Automation processes killed (Unix)');
      }
    } catch (killError: any) {
      console.log(`⚠️ [STOP] Process kill warning: ${killError.message}`);
    }

    // 1. task_queue에서 진행 중인 작업 모두 중지
    try {
      // task_queue의 진행 중인 작업을 cancelled로 변경 (worker가 다시 픽업하지 않도록)
      // 재시도는 수동으로 재시도 버튼을 통해서만 가능
      const result = await db.prepare(`
        UPDATE task_queue
        SET status = 'cancelled', error = 'Manually stopped by user'
        WHERE task_id = ? AND status IN ('waiting', 'processing')
      `).run(titleId);

      console.log(`✅ [STOP] ${result.changes} tasks in queue cancelled`);
    } catch (e: any) {
      console.log(`⚠️ [STOP] task_queue update failed: ${e.message}`);
    }

    // 1-1. task_lock 해제 (lock_task_id로 직접 찾아서 해제)
    try {
      const lockResult = await db.prepare(`
        UPDATE task_lock
        SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL, lock_task_id = NULL
        WHERE lock_task_id = ?
      `).run(titleId);

      if (lockResult.changes > 0) {
        console.log(`🔓 [STOP] Released lock for task ${titleId}`);
      }
    } catch (e: any) {
      console.log(`⚠️ [STOP] task_lock release failed: ${e.message}`);
    }

    // ⭐ 3. content 테이블에서 관련 작업 중지 (video_path 조건 제거)
    let stoppedJobs = 0;
    try {
      const jobsResult = await db.prepare(`
        UPDATE content
        SET status = 'cancelled', error = '사용자가 작업을 중지했습니다', updated_at = NOW()
        WHERE source_content_id = ? AND status IN ('pending', 'processing')
      `).run(titleId);
      stoppedJobs = jobsResult.changes;
      console.log(`✅ [STOP] ${stoppedJobs} jobs stopped`);
    } catch (e: any) {
      console.log(`⚠️ [STOP] content table update warning: ${e.message}`);
    }

    // 4. 해당 task_id의 content 중지 (통합 키 시스템: task_id = content_id)
    let stoppedContents = 0;
    try {
      const contentResult = await db.prepare(`
        UPDATE content
        SET status = 'cancelled',
            error = '사용자에 의해 중지됨',
            updated_at = CURRENT_TIMESTAMP
        WHERE content_id = ? AND status IN ('processing', 'pending')
      `).run(titleId);
      stoppedContents = contentResult.changes;
      console.log(`✅ [STOP] ${stoppedContents} content stopped`);
    } catch (e: any) {
      console.log(`⚠️ [STOP] content table update warning: ${e.message}`);
    }

    // 5. task 테이블은 status 컬럼 없음 (task_queue로 관리)
    // (삭제됨)

    // 6. task 로그 추가 (파일 기반)
    try {
      addContentLog(titleId, '🛑 작업이 사용자에 의해 중지되었습니다', 'script');
    } catch (e: any) {
      console.log(`⚠️ [STOP] task log warning: ${e.message}`);
    }

    // MySQL: pool manages connections

    console.log(`✅ [STOP] All tasks for title ${titleId} stopped`);

    return NextResponse.json({
      success: true,
      message: '작업이 중지되었습니다 (프로세스 종료됨)',
      stoppedJobs,
      stoppedContents
    });

  } catch (error: any) {
    console.error('POST /api/automation/stop error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
