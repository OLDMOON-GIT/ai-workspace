import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';
import path from 'path';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function POST(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { taskId } = body;

    if (!taskId || typeof taskId !== 'string') {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 작업 중지 요청: ${taskId}`);

    // 🆕 먼저 Python 및 자동화 프로세스 강제 종료 (PID 관계없이)
    try {
      if (process.platform === 'win32') {
        await execAsync('powershell -Command "Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force"');
        console.log('✅ Python processes killed (Windows)');
        await execAsync('powershell -Command "Get-Process chromedriver -ErrorAction SilentlyContinue | Stop-Process -Force"');
        console.log('✅ Chromedriver processes killed');
        await execAsync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'chrome.exe\'\\" | Where-Object {$_.CommandLine -like \'*--test-type*\' -or $_.CommandLine -like \'*--enable-automation*\' -or $_.CommandLine -like \'*--remote-debugging*\'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"');
        console.log('✅ Selenium Chrome processes killed');
      } else {
        await execAsync('pkill -f python || true');
        await execAsync('pkill -f chromedriver || true');
        await execAsync('pkill -f "chrome.*--enable-automation" || true');
        console.log('✅ Automation processes killed (Unix)');
      }
    } catch (killError: any) {
      console.log(`⚠️ Process kill warning: ${killError.message}`);
    }

    // MySQL: using imported db

    // 1. task 테이블에서 상태 업데이트
    try {
      await db.prepare(`
        UPDATE task
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE task_id = ?
      `).run(taskId);
      console.log(`✅ task 테이블 상태 업데이트 완료: ${taskId}`);
    } catch (error: any) {
      console.error('task 테이블 업데이트 실패:', error.message);
    }

    // 2. content 테이블에서 상태 업데이트
    try {
      await db.prepare(`
        UPDATE content
        SET status = 'cancelled', error = '사용자에 의해 중지됨', updated_at = CURRENT_TIMESTAMP
        WHERE content_id = ?
      `).run(taskId);
      console.log(`✅ content 테이블 상태 업데이트 완료: ${taskId}`);
    } catch (error: any) {
      console.error('content 테이블 업데이트 실패:', error.message);
    }

    // 3. task_queue에서 해당 작업 취소
    try {
      await db.prepare(`
        UPDATE task_queue
        SET status = 'cancelled'
        WHERE task_id = ? AND status IN ('waiting', 'processing')
      `).run(taskId);
      console.log(`✅ task_queue 취소 완료: ${taskId}`);
    } catch (error: any) {
      console.error('task_queue 업데이트 실패:', error.message);
    }

    // MySQL: pool manages connections

    // 3. STOP 신호 파일 생성 (보조 수단)
    try {
      const backendOutputDir = path.join(process.cwd(), '..', 'trend-video-backend', 'output');

      const possiblePaths = [
        path.join(backendOutputDir, taskId),
        path.join(process.cwd(), 'output', taskId),
        path.join(backendOutputDir, `script_${taskId}`),
        path.join(process.cwd(), 'output', `script_${taskId}`)
      ];

      let stopFilePath: string | null = null;
      for (const dirPath of possiblePaths) {
        try {
          await fs.access(dirPath);
          stopFilePath = path.join(dirPath, 'STOP');
          await fs.writeFile(stopFilePath, `STOP\nTimestamp: ${new Date().toISOString()}\nTaskId: ${taskId}`);
          console.log(`✅ STOP 신호 파일 생성: ${stopFilePath}`);
          break;
        } catch {
          continue;
        }
      }

      if (!stopFilePath) {
        console.log(`⚠️ 작업 디렉토리를 찾을 수 없음`);
      }
    } catch (error: any) {
      console.error(`⚠️ STOP 파일 생성 실패:`, error.message);
    }

    return NextResponse.json({
      success: true,
      message: '작업이 취소되었습니다.'
    });

  } catch (error: any) {
    console.error('Error canceling script:', error);
    return NextResponse.json(
      { error: error.message || '작업 중지 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
