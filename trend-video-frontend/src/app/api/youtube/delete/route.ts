import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { run, getOne } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { videoId, youtubeUrl } = await req.json();

    if (!videoId && !youtubeUrl) {
      return NextResponse.json({ success: false, error: 'videoId 또는 youtubeUrl이 필요합니다' }, { status: 400 });
    }

    // YouTube URL에서 video_id 추출
    let extractedVideoId = videoId;
    if (!extractedVideoId && youtubeUrl) {
      const match = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
      if (match) {
        extractedVideoId = match[1];
      }
    }

    if (!extractedVideoId) {
      return NextResponse.json({ success: false, error: '유효한 YouTube video ID를 찾을 수 없습니다' }, { status: 400 });
    }

    // Backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const credentialsDir = path.join(backendPath, 'config');

    // 토큰 파일 찾기
    const configFiles = fs.readdirSync(credentialsDir);
    const userTokenFiles = configFiles.filter(f =>
      f.startsWith(`youtube_token_${session.user.id}_`) && f.endsWith('.json')
    );

    if (userTokenFiles.length === 0) {
      return NextResponse.json({ success: false, error: 'YouTube 인증이 필요합니다' }, { status: 403 });
    }

    const tokenPath = path.join(credentialsDir, userTokenFiles[0]);
    const credentialsPath = path.join(credentialsDir, 'youtube_client_secret.json');

    // Python CLI 호출
    const scriptPath = path.join(backendPath, 'src', 'youtube', 'youtube_upload_cli.py');
    const args = [
      '-u',
      scriptPath,
      '--action', 'delete',
      '--credentials', credentialsPath,
      '--token', tokenPath,
      '--video-id', extractedVideoId
    ];

    return new Promise((resolve) => {
      const pythonProcess = spawn('python', args, {
        cwd: backendPath,
        env: {
          ...process.env,
          PYTHONPATH: backendPath,
          PYTHONIOENCODING: 'utf-8'
        }
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // JSON 응답 파싱
            const jsonMatch = output.match(/\{[\s\S]*"success"[\s\S]*\}/);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);

              if (result.success) {
                // youtube_uploads 테이블에서 삭제 상태 업데이트
                await run(`UPDATE youtube_uploads SET status = 'deleted' WHERE youtube_video_id = ?`, [extractedVideoId]);

                resolve(NextResponse.json({ success: true, message: 'YouTube 비디오가 삭제되었습니다' }));
              } else {
                resolve(NextResponse.json({ success: false, error: result.error || '삭제 실패' }, { status: 500 }));
              }
            } else {
              resolve(NextResponse.json({ success: false, error: '응답 파싱 실패' }, { status: 500 }));
            }
          } catch (e: any) {
            resolve(NextResponse.json({ success: false, error: `삭제 중 오류: ${e.message}` }, { status: 500 }));
          }
        } else {
          resolve(NextResponse.json({ success: false, error: errorOutput || '삭제 실패' }, { status: 500 }));
        }
      });
    });
  } catch (error: any) {
    console.error('YouTube 삭제 API 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
