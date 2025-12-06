import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAll, getOne, run, transaction } from '@/lib/mysql';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { refreshPromptCache } from '@/lib/prompt-cache';

const execAsync = promisify(exec);
const promptsDir = path.join(process.cwd(), 'prompts');

export async function GET(
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

    try {
      const versions = await getAll(`
        SELECT id, name, display_name, version, content, change_reason,
               changed_by, is_active, created_at
        FROM prompt_templates
        WHERE name = ?
        ORDER BY version DESC
      `, [name]);

      if (versions.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json({ versions, count: versions.length });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

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
    const { content, changeReason } = body;

    if (!content || !changeReason) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    try {
      const existing = await getOne(
        'SELECT display_name, MAX(version) as max_version FROM prompt_templates WHERE name = ?',
        [name]
      ) as any;

      if (!existing) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const newVersion = existing.max_version + 1;
      const id = uuidv4();

      // 트랜잭션으로 처리
      await transaction(async (conn) => {
        await conn.execute(
          'UPDATE prompt_templates SET is_active = 0 WHERE name = ? AND is_active = 1',
          [name]
        );

        await conn.execute(`
          INSERT INTO prompt_templates (
            id, name, display_name, version, content, change_reason, changed_by, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `, [id, name, existing.display_name, newVersion, content, changeReason, user.userId]);
      });

      const fileName = `prompt_${name}.txt`;
      const filePath = path.join(promptsDir, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');

      // 캐시 갱신
      await refreshPromptCache(name);
      console.log('🔄 프롬프트 캐시 갱신:', name);

      try {
        const commitMsg = `chore: ${existing.display_name} v${newVersion}\n\n${changeReason}`;
        await execAsync(`git add "${filePath}"`, { cwd: process.cwd() });
        await execAsync(`git commit -m "${commitMsg}"`, { cwd: process.cwd() });
        console.log(`Git commit: ${fileName} v${newVersion}`);
      } catch (gitError: any) {
        console.warn('Git commit failed:', gitError.message);
      }

      return NextResponse.json({
        success: true,
        version: newVersion,
        id,
        message: `v${newVersion} created`
      });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
