import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const voice = searchParams.get('voice');
    const speed = searchParams.get('speed') || '1.0';

    if (!voice) {
      return NextResponse.json(
        { error: 'voice parameter is required' },
        { status: 400 }
      );
    }

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    // 1. 먼저 backend/voice_samples에서 미리 생성된 파일 확인
    const preGeneratedFile = path.join(backendPath, 'voice_samples', `sample_${voice}_${speed}.mp3`);
    try {
      const cachedData = await fs.readFile(preGeneratedFile);
      return new NextResponse(cachedData, {
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' },
      });
    } catch (e) {
      // 미리 생성된 파일이 없으면 동적 생성으로 폴백
    }

    // 2. 동적 생성 (미리 생성된 파일이 없는 경우)
    const pythonScript = path.join(backendPath, 'src', 'video_generator', 'preview_tts.py');
    const tempDir = path.join(os.tmpdir(), 'tts-preview');
    await fs.mkdir(tempDir, { recursive: true });
    const outputFile = path.join(tempDir, `${voice}_${speed}.mp3`);

    // 임시 캐시 확인
    try {
      const cachedData = await fs.readFile(outputFile);
      return new NextResponse(cachedData, {
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' },
      });
    } catch (e) {}

    return new Promise<NextResponse>((resolve) => {
      const pythonProcess = spawn('python', [pythonScript, '--voice', voice, '--speed', speed, '--output', outputFile], { cwd: backendPath, shell: true });
      let stderr = '';

      pythonProcess.stderr?.on('data', (data) => { stderr += data.toString(); });
      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            const audioData = await fs.readFile(outputFile);
            resolve(new NextResponse(audioData, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' } }));
          } catch { resolve(NextResponse.json({ error: 'Failed to read audio' }, { status: 500 })); }
        } else {
          resolve(NextResponse.json({ error: 'TTS failed' }, { status: 500 }));
        }
      });
      pythonProcess.on('error', () => resolve(NextResponse.json({ error: 'TTS error' }, { status: 500 })));
      setTimeout(() => { pythonProcess.kill(); resolve(NextResponse.json({ error: 'Timeout' }, { status: 504 })); }, 60000);
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
