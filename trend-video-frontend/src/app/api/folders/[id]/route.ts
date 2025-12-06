import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getOne, run } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

interface Folder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// PUT /api/folders/[id] - 폴더 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id: folderId } = await params;
    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '폴더 이름을 입력해주세요.' }, { status: 400 });
    }

    if (name.trim().length > 50) {
      return NextResponse.json({ error: '폴더 이름은 50자를 초과할 수 없습니다.' }, { status: 400 });
    }

    // 폴더 소유권 확인
    const folder = await getOne('SELECT * FROM folders WHERE id = ? AND user_id = ?', [folderId, user.userId]) as Folder | undefined;

    if (!folder) {
      return NextResponse.json({ error: '폴더를 찾을 수 없습니다.' }, { status: 404 });
    }

    const now = getLocalDateTime();

    await run(`
      UPDATE folders
      SET name = ?, color = ?, updated_at = ?
      WHERE id = ?
    `, [name.trim(), color || folder.color, now, folderId]);

    const updatedFolder = await getOne('SELECT * FROM folders WHERE id = ?', [folderId]) as Folder;

    return NextResponse.json({
      success: true,
      folder: updatedFolder
    });
  } catch (error) {
    console.error('폴더 수정 오류:', error);
    return NextResponse.json({ error: '폴더 수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
