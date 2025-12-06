import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 비밀 키 (URL에 포함해야 실행 가능)
const SECRET_KEY = 'moony75-emergency-2024';

// 허용된 명령어 목록 (보안)
const ALLOWED_COMMANDS: Record<string, string> = {
  // RDP 관련
  'rdp-start': 'net start TermService',
  'rdp-stop': 'net stop TermService',
  'rdp-status': 'sc query TermService',

  // Chrome Remote Desktop
  'crd-start': 'net start "Chrome Remote Desktop Service"',
  'crd-stop': 'net stop "Chrome Remote Desktop Service"',
  'crd-status': 'sc query "chromoting"',

  // 시스템 정보
  'services': 'net start',
  'ipconfig': 'ipconfig',
  'tasklist': 'tasklist /FI "STATUS eq running"',

  // 재부팅 (주의!)
  'reboot': 'shutdown /r /t 30 /c "Emergency reboot via API"',
  'reboot-cancel': 'shutdown /a',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const cmd = searchParams.get('cmd');
  const raw = searchParams.get('raw'); // raw=1이면 직접 명령 실행 (위험!)

  // 보안 키 확인
  if (key !== SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!cmd) {
    return NextResponse.json({
      message: 'Emergency System Command API',
      usage: '/api/emergency-exec?key=SECRET&cmd=COMMAND',
      allowedCommands: Object.keys(ALLOWED_COMMANDS),
      warning: 'raw=1 파라미터로 직접 명령 실행 가능 (위험!)'
    });
  }

  try {
    let command: string;

    if (raw === '1') {
      // 직접 명령 실행 (위험하지만 긴급 상황용)
      command = cmd;
    } else {
      // 허용된 명령어만 실행
      command = ALLOWED_COMMANDS[cmd];
      if (!command) {
        return NextResponse.json({
          error: `Unknown command: ${cmd}`,
          allowedCommands: Object.keys(ALLOWED_COMMANDS)
        }, { status: 400 });
      }
    }

    console.log(`🚨 [EMERGENCY] Executing: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      encoding: 'utf8',
      timeout: 30000, // 30초 타임아웃
    });

    return NextResponse.json({
      success: true,
      command,
      stdout: stdout || '(no output)',
      stderr: stderr || null,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ [EMERGENCY] Command failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stdout: error.stdout || null,
      stderr: error.stderr || null
    }, { status: 500 });
  }
}
