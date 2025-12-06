import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getOne, run, transaction } from '@/lib/mysql';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const promptsDir = path.join(process.cwd(), 'prompts');

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    const params = await context.params;
    const { name } = params;
    const body = await request.json();
    const { version } = body;

    if (!version) {
      return NextResponse.json({ error: 'Version required' }, { status: 400 });
    }

    try {
      const targetVersion = await getOne(
        'SELECT * FROM prompt_templates WHERE name = ? AND version = ?',
        [name, version]
      ) as any;

      if (!targetVersion) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }

      if (targetVersion.is_active) {
        return NextResponse.json({ error: 'Already active' }, { status: 400 });
      }

      // 트랜잭션으로 처리
      await transaction(async (conn) => {
        await conn.execute(
          'UPDATE prompt_templates SET is_active = 0 WHERE name = ? AND is_active = 1',
          [name]
        );

        await conn.execute(
          'UPDATE prompt_templates SET is_active = 1 WHERE name = ? AND version = ?',
          [name, version]
        );
      });

      const fileName = `prompt_${name}.txt`;
      const filePath = path.join(promptsDir, fileName);
      fs.writeFileSync(filePath, targetVersion.content, 'utf-8');

      try {
        const commitMsg = `chore: ${targetVersion.display_name} reverted to v${version}`;
        await execAsync(`git add "${filePath}"`, { cwd: process.cwd() });
        await execAsync(`git commit -m "${commitMsg}"`, { cwd: process.cwd() });
        console.log(`Git commit: ${fileName} reverted to v${version}`);
      } catch (gitError: any) {
        console.warn('Git commit failed:', gitError.message);
      }

      return NextResponse.json({
        success: true,
        version,
        message: `Reverted to v${version}`
      });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
