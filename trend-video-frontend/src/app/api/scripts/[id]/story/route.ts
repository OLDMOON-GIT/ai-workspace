import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');

/**
 * GET /api/scripts/[id]/story - story.json 가져오기
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다' }, { status: 400 });
    }

    const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);
    const storyPath = path.join(taskFolder, 'story.json');

    if (!fs.existsSync(storyPath)) {
      return NextResponse.json({ error: 'story.json 파일을 찾을 수 없습니다' }, { status: 404 });
    }

    const storyContent = fs.readFileSync(storyPath, 'utf-8');
    const storyData = JSON.parse(storyContent);

    return NextResponse.json({
      success: true,
      scenes: storyData.scenes || [],
      metadata: storyData.metadata || {},
      youtube_description: storyData.youtube_description || null
    });
  } catch (error: any) {
    console.error('story.json 읽기 오류:', error);
    return NextResponse.json({ error: error.message || '스토리 로드 실패' }, { status: 500 });
  }
}

/**
 * PUT /api/scripts/[id]/story - story.json 수정하기
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다' }, { status: 400 });
    }

    const body = await request.json();
    const { scenes } = body;

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json({ error: 'scenes 배열이 필요합니다' }, { status: 400 });
    }

    const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);
    const storyPath = path.join(taskFolder, 'story.json');

    if (!fs.existsSync(storyPath)) {
      return NextResponse.json({ error: 'story.json 파일을 찾을 수 없습니다' }, { status: 404 });
    }

    // 기존 story.json 읽기
    const storyContent = fs.readFileSync(storyPath, 'utf-8');
    const storyData = JSON.parse(storyContent);

    // scenes 업데이트
    storyData.scenes = scenes;
    storyData.modified_at = new Date().toISOString();

    // story.json 저장
    fs.writeFileSync(storyPath, JSON.stringify(storyData, null, 2), 'utf-8');

    console.log(`✅ story.json 수정 완료: ${taskId}`);

    return NextResponse.json({
      success: true,
      message: '대본이 저장되었습니다'
    });
  } catch (error: any) {
    console.error('story.json 수정 오류:', error);
    return NextResponse.json({ error: error.message || '스토리 저장 실패' }, { status: 500 });
  }
}
