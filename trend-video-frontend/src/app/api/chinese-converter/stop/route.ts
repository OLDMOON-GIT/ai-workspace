import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { writeFile } from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  findChineseConverterJobById,
  updateChineseConverterJob,
  addChineseConverterJobLog
} from '@/lib/db-chinese-converter';

const execAsync = promisify(exec);

/**
 * POST /api/chinese-converter/stop
 * 중국어 영상 변환 중지
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // taskId 파싱
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다' }, { status: 400 });
    }

    // 작업 확인
    const job = await findChineseConverterJobById(taskId);
    if (!job) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    // 권한 확인
    if (job.userId !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    console.log(`🛑 중국영상변환 중지 요청: ${taskId}`);

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

    // STOP 파일 생성 (보조 수단)
    try {
      const videoDir = path.dirname(job.videoPath || '');
      const stopFilePath = path.join(videoDir, 'STOP');
      await writeFile(stopFilePath, '');
      console.log(`   STOP 파일 생성: ${stopFilePath}`);
    } catch (e: any) {
      console.log(`⚠️ STOP 파일 생성 실패: ${e.message}`);
    }

    // 로그 추가
    addChineseConverterJobLog(taskId, '🛑 사용자가 중지를 요청했습니다');

    // 상태 업데이트 (cancelled로)
    updateChineseConverterJob(taskId, { status: 'cancelled' });

    return NextResponse.json({
      success: true,
      message: '작업이 중지되었습니다 (프로세스 종료됨)'
    });

  } catch (error: any) {
    console.error('❌ 중국영상변환 중지 오류:', error);
    return NextResponse.json(
      { error: error.message || '중지 요청 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
