import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs';
import path from 'path';

// 버그 스크린샷 저장 경로
const BUG_SCREENSHOTS_DIR = path.join(process.cwd(), 'public', 'bug-screenshots');

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // 폴더 생성 (없으면)
    if (!fs.existsSync(BUG_SCREENSHOTS_DIR)) {
      fs.mkdirSync(BUG_SCREENSHOTS_DIR, { recursive: true });
    }

    // 파일명 생성: timestamp_originalname
    const timestamp = Date.now();
    const ext = path.extname(file.name) || '.png';
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(ext, '');
    const filename = `${timestamp}_${safeName}${ext}`;
    const filepath = path.join(BUG_SCREENSHOTS_DIR, filename);

    // 파일 저장
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    // 웹에서 접근 가능한 경로 반환
    const publicPath = `/bug-screenshots/${filename}`;

    console.log(`[Bug Upload] Saved screenshot: ${publicPath}`);

    return NextResponse.json({
      success: true,
      path: publicPath,
      filename
    });
  } catch (error: any) {
    console.error('[Bug Upload] Error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
