import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), '..', 'automation', 'data', 'bugs-recording.json');

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.enabled === 'boolean') return parsed;
  } catch (error) {
    // ignore and fall through
  }
  return { enabled: true };
}

async function writeConfig(enabled: boolean) {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ enabled }, null, 2), 'utf8');
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
  }
  const config = await readConfig();
  return NextResponse.json(config);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const enabled = !!body?.enabled;
    await writeConfig(enabled);
    return NextResponse.json({ enabled });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '녹화 설정을 저장하지 못했습니다.' },
      { status: 500 }
    );
  }
}
