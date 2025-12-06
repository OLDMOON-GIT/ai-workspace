import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Spawn 로그 실시간 조회 API (BTS-3201)
 *
 * GET: script.log에서 특정 taskId 관련 로그만 반환
 * - taskId: 조회할 작업 ID
 * - offset: 이미 읽은 바이트 수 (append 방식 폴링)
 */

const WORKSPACE_DIR = 'C:\\Users\\oldmoon\\workspace';
const SCRIPT_LOG = path.join(WORKSPACE_DIR, 'trend-video-backend', 'logs', 'script.log');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 로그 파일 읽기
    let logContent = '';
    let fileSize = 0;

    try {
      const stats = await fs.stat(SCRIPT_LOG);
      fileSize = stats.size;

      // offset부터 끝까지 읽기 (새 로그만)
      if (offset < fileSize) {
        const buffer = Buffer.alloc(fileSize - offset);
        const handle = await fs.open(SCRIPT_LOG, 'r');
        await handle.read(buffer, 0, fileSize - offset, offset);
        await handle.close();
        logContent = buffer.toString('utf-8');
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return NextResponse.json({
          logs: [],
          offset: 0,
          fileSize: 0,
          status: 'no_log_file'
        });
      }
      throw e;
    }

    // taskId가 지정된 경우, 해당 taskId의 로그만 필터링
    let lines = logContent.split('\n').filter(line => line.trim());

    if (taskId) {
      // taskId 관련 로그 블록 추출 (========== 새 Spawn 작업 시작 ========== 부터)
      const filteredLines: string[] = [];
      let inBlock = false;

      for (const line of lines) {
        // 새 Spawn 작업 시작 감지
        if (line.includes('새 Spawn 작업 시작')) {
          inBlock = false; // 이전 블록 종료
        }

        // taskId 일치 확인
        if (line.includes(`taskId: ${taskId}`)) {
          inBlock = true;
        }

        // 해당 블록의 로그만 추가
        if (inBlock) {
          filteredLines.push(line);
        }

        // 작업 완료/실패 감지
        if (inBlock && (line.includes('작업 완료') || line.includes('작업 실패'))) {
          inBlock = false;
        }
      }

      lines = filteredLines;
    }

    // 로그 파싱
    const logs = lines.map(line => {
      // [2025-12-05 12:15:30] [SPAWN] 메시지
      const match = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);
      if (match) {
        return {
          timestamp: match[1],
          level: match[2].toLowerCase(),
          message: match[3]
        };
      }
      return {
        timestamp: '',
        level: 'info',
        message: line
      };
    });

    // 작업 상태 판단
    let status: 'idle' | 'running' | 'completed' | 'failed' = 'idle';
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine.includes('작업 완료')) {
        status = 'completed';
      } else if (lastLine.includes('작업 실패')) {
        status = 'failed';
      } else if (lastLine.includes('시작') || lastLine.includes('Claude CLI')) {
        status = 'running';
      }
    }

    return NextResponse.json({
      logs,
      offset: fileSize,
      fileSize,
      status
    });

  } catch (error: any) {
    console.error('Spawn log error:', error);
    return NextResponse.json(
      { error: error.message || 'Spawn log 조회 실패' },
      { status: 500 }
    );
  }
}
