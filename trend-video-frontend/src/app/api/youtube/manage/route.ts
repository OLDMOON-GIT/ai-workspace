import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getYouTubeChannelById } from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';
import db from '@/lib/sqlite';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_MANAGE_CLI = path.join(BACKEND_PATH, 'src', 'youtube', 'youtube_manage_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function getChannelTokenPath(channelId: string): string {
  return path.join(CREDENTIALS_DIR, `youtube_token_${channelId}.json`);
}

interface ManageResult {
  success: boolean;
  error?: string;
  video_id?: string;
  old_privacy?: string;
  new_privacy?: string;
  title?: string;
  message?: string;
  privacy?: string;
  view_count?: string;
  like_count?: string;
  comment_count?: string;
}

async function runYoutubeManageCli(args: string[]): Promise<ManageResult> {
  return new Promise((resolve) => {
    const process = spawn('python', [YOUTUBE_MANAGE_CLI, ...args], {
      cwd: BACKEND_PATH
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        resolve({
          success: false,
          error: stderr || stdout || `프로세스 종료 코드: ${code}`
        });
      }
    });

    process.on('error', (err) => {
      resolve({
        success: false,
        error: err.message
      });
    });
  });
}

/**
 * POST /api/youtube/manage
 * YouTube 비디오 관리 (공개설정 변경, 삭제)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, videoId, channelId, privacy, uploadId } = body;

    if (!action || !videoId) {
      return NextResponse.json({ error: 'action과 videoId는 필수입니다' }, { status: 400 });
    }

    if (!['update-privacy', 'delete', 'info'].includes(action)) {
      return NextResponse.json({ error: '유효하지 않은 action입니다' }, { status: 400 });
    }

    if (action === 'update-privacy' && !privacy) {
      return NextResponse.json({ error: 'privacy는 필수입니다' }, { status: 400 });
    }

    // 채널 토큰 경로 결정
    let tokenPath: string;
    if (channelId) {
      const channel = await getYouTubeChannelById(channelId);
      if (channel) {
        tokenPath = getChannelTokenPath(`${channel.userId}_${channel.channelId}`);
      } else {
        tokenPath = getChannelTokenPath(channelId);
      }
    } else {
      // uploadId로 채널 정보 조회
      // MySQL: using imported db
      const upload = await db.prepare('SELECT channel_id FROM youtube_uploads WHERE id = ?').get(uploadId) as any;
      // MySQL: pool manages connections

      if (upload?.channel_id) {
        tokenPath = getChannelTokenPath(upload.channel_id);
      } else {
        return NextResponse.json({ error: '채널 정보를 찾을 수 없습니다' }, { status: 400 });
      }
    }

    // CLI 실행
    const args = ['--token', tokenPath, '--video-id', videoId, '--action', action];
    if (action === 'update-privacy') {
      args.push('--privacy', privacy);
    }

    console.log(`🎬 [YouTube Manage] ${action} for ${videoId}`);
    const result = await runYoutubeManageCli(args);

    if (!result.success) {
      console.error(`❌ [YouTube Manage] Failed: ${result.error}`);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // DB 업데이트 (삭제 시)
    if (action === 'delete' && uploadId) {
      // MySQL: using imported db
      await db.prepare('UPDATE youtube_uploads SET status = ? WHERE id = ?').run('deleted', uploadId);
      // MySQL: pool manages connections
      console.log(`🗑️ [YouTube Manage] Marked as deleted in DB: ${uploadId}`);
    }

    // DB 업데이트 (공개설정 변경 시)
    if (action === 'update-privacy' && uploadId) {
      // MySQL: using imported db
      // status 필드에 현재 공개설정 저장 (active_public, active_private, active_unlisted)
      await db.prepare('UPDATE youtube_uploads SET status = ? WHERE id = ?').run(`active_${privacy}`, uploadId);
      // MySQL: pool manages connections
      console.log(`🔒 [YouTube Manage] Updated privacy in DB: ${uploadId} → ${privacy}`);
    }

    console.log(`✅ [YouTube Manage] Success: ${action} for ${videoId}`);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('POST /api/youtube/manage error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/youtube/manage?taskId=xxx
 * 특정 task의 YouTube 업로드 목록 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    // taskId와 contentId는 동일한 값 (task_id = content_id)
    const contentId = searchParams.get('contentId') || searchParams.get('taskId');

    if (!contentId) {
      return NextResponse.json({ error: 'contentId가 필요합니다' }, { status: 400 });
    }

    // MySQL: using imported db

    const uploads = await db.prepare(`
      SELECT u.*, c.channel_name, c.channel_url
      FROM youtube_uploads u
      LEFT JOIN youtube_channels c ON u.channel_id = c.channel_id
      WHERE u.content_id = ?
      ORDER BY u.uploaded_at DESC
    `).all(contentId);

    // MySQL: pool manages connections

    return NextResponse.json({
      success: true,
      uploads
    });

  } catch (error: any) {
    console.error('GET /api/youtube/manage error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
