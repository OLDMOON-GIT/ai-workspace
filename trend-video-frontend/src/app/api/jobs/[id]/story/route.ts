import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';
import db from '@/lib/mysql';
import JSON5 from 'json5';

/**
 * GET /api/jobs/[id]/story
 * job의 story.json 파일을 읽어서 반환
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const jobId = params.id;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    // ⭐ MySQL에서 user_id 조회
    const [rows] = await db.query('SELECT user_id as userId FROM content WHERE content_id = ?', [jobId]);
    const job = (rows as any[])[0];

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // 권한 확인
    if (job.userId !== user.userId && !user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ⭐ video_path 대신 taskId로 폴더 경로 직접 사용
    const projectDir = path.join(backendPath, 'tasks', jobId);

    const storyPath = path.join(projectDir, 'story.json');

    try {
      // 1. 파일 읽기
      const storyContent = await fs.readFile(storyPath, 'utf-8');

      // 2. JSON 파싱 (유연한 파서 사용)
      let storyJson;
      try {
        // 2-1. 먼저 표준 JSON.parse 시도 (성능 최적화)
        storyJson = JSON.parse(storyContent);
      } catch (parseError: any) {
        // 2-2. 실패하면 JSON5로 재시도 (더 유연한 파서)
        console.log('⚠️ 표준 JSON 파싱 실패, JSON5로 재시도:', parseError.message);
        storyJson = JSON5.parse(storyContent);
      }

      console.log('✅ story.json 읽기 성공:', storyPath);
      return NextResponse.json({
        success: true,
        story: storyJson
      });

    } catch (fileError: any) {
      // 3. 에러 유형 구분
      if (fileError.code === 'ENOENT') {
        // 파일이 실제로 없는 경우
        console.log('⚠️ story.json 파일 없음:', storyPath);
        return NextResponse.json({
          success: false,
          error: 'story.json not found'
        }, { status: 404 });
      } else {
        // 파싱 에러 또는 기타 에러
        console.error('❌ story.json 처리 실패:', {
          path: storyPath,
          error: fileError.message,
          code: fileError.code
        });
        return NextResponse.json({
          success: false,
          error: 'Failed to process story.json',
          details: fileError.message
        }, { status: 500 });
      }
    }

  } catch (error: any) {
    console.error('GET /api/jobs/[id]/story error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
