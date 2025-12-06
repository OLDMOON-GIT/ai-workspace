import { NextRequest, NextResponse } from 'next/server';
import { findContentById, addContentLog } from '@/lib/content';
import { getCurrentUser } from '@/lib/session';
import { getOne, run } from '@/lib/mysql';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { GetScriptResponse, GetScriptErrorResponse } from '@/types/content';

const execAsync = promisify(exec);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<GetScriptResponse | GetScriptErrorResponse>> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const { id: contentId } = await params;

    if (!contentId) {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: 'contentId가 필요합니다.' },
        { status: 400 }
      );
    }

    const content = await findContentById(contentId);

    if (!content || !content.content) {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: 'Script not found' },
        { status: 404 }
      );
    }

    // 본인의 대본만 조회 가능 (관리자는 모두 조회 가능)
    if (!user.isAdmin && content.userId !== user.userId) {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // ⭐ 타입 안전성: content.productInfo는 자동으로 타입 체크됨
    // Return as 'script' for backward compatibility
    return NextResponse.json<GetScriptResponse>({ script: content });
  } catch (error) {
    console.error('Error fetching script:', error);
    return NextResponse.json<GetScriptErrorResponse>(
      { error: 'Failed to fetch script' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const { id: contentId } = await params;

    if (!contentId) {
      return NextResponse.json(
        { error: 'contentId가 필요합니다.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { folderId, content: newContent } = body;

    // 스크립트 소유권 확인
    const content = await findContentById(contentId);

    if (!content || !content.content) {
      return NextResponse.json(
        { error: '스크립트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 대본 내용 수정은 관리자만 가능
    if (newContent !== undefined && !user.isAdmin) {
      return NextResponse.json(
        { error: '대본 수정은 관리자만 가능합니다.' },
        { status: 403 }
      );
    }

    // 폴더 이동은 본인만 가능
    if (folderId !== undefined && !user.isAdmin && content.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    try {
      // folderId가 제공된 경우 폴더 소유권 확인
      if (folderId !== undefined) {
        if (folderId) {
          const folder: any = await getOne('SELECT * FROM folders WHERE id = ? AND user_id = ?', [folderId, user.userId]);
          if (!folder) {
            return NextResponse.json(
              { error: '폴더를 찾을 수 없습니다.' },
              { status: 404 }
            );
          }
        }

        // folder_id 업데이트
        await run(`
          UPDATE content
          SET folder_id = ?, updated_at = NOW()
          WHERE content_id = ?
        `, [folderId || null, contentId]);
      }

      // content가 제공된 경우 대본 내용 업데이트 (관리자 전용)
      if (newContent !== undefined) {
        await run(`
          UPDATE content
          SET content = ?, updated_at = NOW()
          WHERE content_id = ?
        `, [newContent, contentId]);
      }

      const message = newContent !== undefined
        ? '대본이 수정되었습니다.'
        : '스크립트가 이동되었습니다.';

      return NextResponse.json({
        success: true,
        message
      });

    } catch (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error updating script folder:', error);
    return NextResponse.json(
      { error: '스크립트 폴더 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const { id: taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 작업 중지 요청: ${taskId}`);

    // 🆕 먼저 Python 및 자동화 프로세스 강제 종료 (PID 관계없이)
    let killed = false;
    try {
      if (process.platform === 'win32') {
        // 모든 Python 프로세스 종료 (자동화는 Python으로 실행됨)
        await execAsync('powershell -Command "Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force"');
        console.log('✅ Python processes killed (Windows)');

        // chromedriver 종료
        await execAsync('powershell -Command "Get-Process chromedriver -ErrorAction SilentlyContinue | Stop-Process -Force"');
        console.log('✅ Chromedriver processes killed');

        // WMI로 Selenium Chrome 찾아서 종료 (CommandLine에 --enable-automation 또는 --test-type 포함)
        await execAsync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'chrome.exe\'\\" | Where-Object {$_.CommandLine -like \'*--test-type*\' -or $_.CommandLine -like \'*--enable-automation*\' -or $_.CommandLine -like \'*--remote-debugging*\'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"');
        console.log('✅ Selenium Chrome processes killed');
        killed = true;
      } else {
        // Linux/Mac
        await execAsync('pkill -f python || true');
        await execAsync('pkill -f chromedriver || true');
        await execAsync('pkill -f "chrome.*--enable-automation" || true');
        console.log('✅ Automation processes killed (Unix)');
        killed = true;
      }
    } catch (killError: any) {
      console.log(`⚠️ Process kill warning: ${killError.message}`);
    }

    // DB 상태 업데이트 (content + task 양쪽) - cancelled로 (사용자 중지)
    try {
      // content 테이블 업데이트
      await run(`
        UPDATE content
        SET status = 'cancelled', error = '사용자에 의해 중지됨', updated_at = NOW()
        WHERE content_id = ?
      `, [taskId]);

      // task 테이블도 업데이트 (없을 수도 있음)
      try {
        await run(`
          UPDATE task
          SET status = 'cancelled', updated_at = NOW()
          WHERE task_id = ?
        `, [taskId]);
      } catch (e) {
        console.log(`⚠️ task 업데이트 실패: ${e}`);
      }

      // task_queue 상태도 업데이트
      try {
        await run(`
          UPDATE task_queue
          SET status = 'cancelled'
          WHERE task_id = ? AND status IN ('waiting', 'processing')
        `, [taskId]);
      } catch (e) {
        // task_queue에 해당 row가 없을 수 있음
      }

      // 로그 추가 (파일 기반)
      addContentLog(taskId, '🛑 사용자에 의해 작업이 중지되었습니다.');

      console.log(`✅ DB 상태 업데이트 완료: ${taskId}`);
    } catch (dbError) {
      console.error('DB 업데이트 실패:', dbError);
    }

    return NextResponse.json({
      success: true,
      message: '작업이 중지되었습니다 (프로세스 종료됨)',
      processKilled: killed
    });

  } catch (error: any) {
    console.error('Error canceling script:', error);
    return NextResponse.json(
      { error: error.message || '작업 중지 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
