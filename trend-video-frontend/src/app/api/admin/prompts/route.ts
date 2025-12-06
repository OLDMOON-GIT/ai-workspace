import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';
import { clearAllPromptCache, getPromptCacheStatus } from '@/lib/prompt-cache';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');

interface Prompt {
  id: string;
  type: 'longform' | 'shortform';
  name: string;
  systemPrompt: string;
  sceneTemplate: string;
  dalleTemplate: string;
  updatedAt: string;
}

// 기본 프롬프트
const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: 'longform-default',
    type: 'longform',
    name: '롱폼 기본 프롬프트',
    systemPrompt: `당신은 16:9 가로형 롱폼 영상을 위한 대본 작가입니다.
YouTube나 TV에서 시청하기 적합한 형식으로 작성합니다.
각 씬은 자세하고 풍부한 설명을 포함합니다.`,
    sceneTemplate: `씬 {{sceneNumber}}: {{sceneContent}}

이 씬을 16:9 가로형 화면에 최적화된 형식으로 작성하세요.
- 배경과 등장인물을 상세히 묘사
- 카메라 앵글과 구도 설명
- 감정과 분위기 전달`,
    dalleTemplate: `16:9 landscape, cinematic composition, {{sceneContent}},
professional photography, detailed background,
horizontal framing, widescreen format, NO TEXT`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'shortform-default',
    type: 'shortform',
    name: '숏폼 기본 프롬프트',
    systemPrompt: `당신은 9:16 세로형 숏폼 영상을 위한 대본 작가입니다.
TikTok, Instagram Reels, YouTube Shorts에 최적화된 형식으로 작성합니다.
각 씬은 짧고 강렬하며, 시선을 사로잡는 내용으로 구성합니다.`,
    sceneTemplate: `씬 {{sceneNumber}}: {{sceneContent}}

이 씬을 9:16 세로형 화면에 최적화된 형식으로 작성하세요.
- 인물 중심의 클로즈업 구도
- 빠른 템포와 강렬한 임팩트
- 모바일 화면에 적합한 구성`,
    dalleTemplate: `9:16 portrait, vertical format, mobile-optimized, {{sceneContent}},
close-up shot, centered subject, dramatic lighting,
portrait orientation, NO TEXT`,
    updatedAt: new Date().toISOString()
  }
];

// 데이터 디렉토리 초기화
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// 프롬프트 파일 초기화
async function ensurePromptsFile() {
  await ensureDataDir();
  try {
    await fs.access(PROMPTS_FILE);
  } catch {
    await fs.writeFile(PROMPTS_FILE, JSON.stringify(DEFAULT_PROMPTS, null, 2), 'utf-8');
  }
}

// 프롬프트 읽기
async function getPrompts(): Promise<Prompt[]> {
  await ensurePromptsFile();
  const data = await fs.readFile(PROMPTS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 프롬프트 저장
async function savePrompts(prompts: Prompt[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PROMPTS_FILE, JSON.stringify(prompts, null, 2), 'utf-8');
}

// GET - 프롬프트 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const prompts = await getPrompts();

    return NextResponse.json({ prompts });
  } catch (error: any) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
      { error: error?.message || '프롬프트 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT - 프롬프트 수정
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, name, systemPrompt, sceneTemplate, dalleTemplate } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const prompts = await getPrompts();
    const index = prompts.findIndex(p => p.id === id);

    if (index === -1) {
      return NextResponse.json(
        { error: '프롬프트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 업데이트
    prompts[index] = {
      ...prompts[index],
      name,
      systemPrompt,
      sceneTemplate,
      dalleTemplate,
      updatedAt: new Date().toISOString()
    };

    await savePrompts(prompts);

    return NextResponse.json({ success: true, prompt: prompts[index] });
  } catch (error: any) {
    console.error('Error updating prompt:', error);
    return NextResponse.json(
      { error: error?.message || '프롬프트 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE - 프롬프트 캐시 전체 초기화
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // 캐시 상태 확인
    const beforeStatus = getPromptCacheStatus();

    // 캐시 초기화
    clearAllPromptCache();

    console.log('🗑️ 프롬프트 캐시 전체 초기화됨');

    return NextResponse.json({
      success: true,
      message: '프롬프트 캐시가 초기화되었습니다.',
      clearedCount: beforeStatus.length
    });
  } catch (error: any) {
    console.error('Error clearing prompt cache:', error);
    return NextResponse.json(
      { error: error?.message || '캐시 초기화 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
