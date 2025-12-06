import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getOne } from '@/lib/mysql';
import path from 'path';
import fs from 'fs/promises';

/**
 * GET /api/images/logs?scriptId=xxx
 * 이미지 크롤링 로그 파일을 읽어서 반환
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId가 필요합니다.' }, { status: 400 });
    }

    // 태스크 폴더 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    // ⚠️ ID 규칙: prefix 없이 순수 ID만 사용
    const cleanId = scriptId.replace(/^(task_|title_|script_|project_)/, '');

    // ✅ BTS-0000023: MySQL로 전환 (better-sqlite3 제거)
    let actualFolderId = cleanId;
    try {
      const content = await getOne(`
        SELECT content_id FROM content WHERE source_content_id = ? ORDER BY created_at DESC LIMIT 1
      `, [cleanId]) as any;
      if (content && content.content_id) {
        actualFolderId = content.content_id;
        console.log(`📁 contents 테이블에서 폴더 발견: ${cleanId} → ${actualFolderId}`);
      }
    } catch (e: any) {
      console.log(`⚠️ contents 조회 실패: ${e.message}`);
    }

    const projectDir = path.join(backendPath, 'tasks', actualFolderId);

    // 프로젝트 폴더가 존재하는지 확인
    try {
      await fs.access(projectDir);
    } catch {
      return NextResponse.json({
        logs: [],
        message: '프로젝트 폴더가 존재하지 않습니다.'
      });
    }

    // 로그 파일 찾기 (image_crawl.log 또는 image_crawl_*.log)
    const files = await fs.readdir(projectDir);
    const logFiles = files.filter(f => f === 'image_crawl.log' || (f.startsWith('image_crawl_') && f.endsWith('.log')));

    if (logFiles.length === 0) {
      return NextResponse.json({
        logs: [],
        message: '이미지 크롤링 로그가 없습니다.'
      });
    }

    // image_crawl.log가 있으면 우선, 없으면 최신 로그 파일 사용
    let latestLogFile: string | undefined = logFiles.find(f => f === 'image_crawl.log');
    if (!latestLogFile) {
      logFiles.sort().reverse();
      latestLogFile = logFiles[0];
    }
    const logPath = path.join(projectDir, latestLogFile);

    // 로그 파일 읽기
    const logContent = await fs.readFile(logPath, 'utf-8');
    const logLines = logContent.split('\n').filter(line => line.trim());

    return NextResponse.json({
      logs: logLines,
      logFile: latestLogFile,
      totalLogs: logFiles.length
    });

  } catch (error: any) {
    console.error('❌ 이미지 크롤링 로그 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
