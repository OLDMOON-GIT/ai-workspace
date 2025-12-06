import { NextRequest, NextResponse } from 'next/server';
import { getOne, run } from '@/lib/mysql';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
// import path from 'path';

// POST: 버그 작업 시작 - Claude CLI 실행
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

    const body = await request.json();
    const { bugId } = body;

    if (!bugId) {
      return NextResponse.json({ error: 'bugId는 필수입니다' }, { status: 400 });
    }

    // BTS-0000XXX 형식에서 숫자만 추출
    const numericId = bugId.replace('BTS-', '').replace(/^0+/, '');

    // 버그 정보 조회
    const bug = await getOne<any>(`
      SELECT id, title, summary, status, type, priority
      FROM bugs WHERE id = ?
    `, [numericId]);

    if (!bug) {
      return NextResponse.json({ error: '버그를 찾을 수 없습니다' }, { status: 404 });
    }

    // 상태를 in_progress로 변경
    await run('UPDATE bugs SET status = ?, updated_at = NOW() WHERE id = ?', ['in_progress', numericId]);

    // Claude CLI 프롬프트 생성 (한 줄로 - Windows cmd 호환)
    const bugType = bug.type === 'spec' ? 'SPEC' : '버그';
    const title = (bug.title || '').replace(/"/g, "'").replace(/\n/g, ' ').trim();
    const summary = (bug.summary || '').replace(/"/g, "'").replace(/\n/g, ' ').substring(0, 200).trim();
    const prompt = `${bugId} ${bugType}: ${title}${summary ? ' - ' + summary : ''}`;

    // Windows에서 새 cmd 창으로 Claude CLI 실행
    const workspacePath = 'C:\\Users\\oldmoon\\workspace';

    // start 명령으로 새 창을 열고 claude 실행 (shell: false로 불필요한 창 방지)
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const child = spawn('cmd.exe', ['/c', 'start', '', 'cmd', '/k', `cd /d "${workspacePath}" && claude --dangerously-skip-permissions "${escapedPrompt}"`], {
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true
    });

    child.unref();

    return NextResponse.json({
      success: true,
      message: `${bugId} 작업이 시작되었습니다. 새 터미널에서 Claude가 실행됩니다.`,
      bugId,
      status: 'in_progress'
    });

  } catch (error: any) {
    console.error('[bugs/start-work] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
