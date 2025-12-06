import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getCurrentUser } from '@/lib/session';
import { getOne } from '@/lib/mysql';

async function handleOpenFolder(request: NextRequest) {
  try {
    console.log('📁 폴더 열기 API 호출됨');

    const user = await getCurrentUser(request);
    console.log('👤 사용자:', user?.email, '관리자:', user?.isAdmin);

    if (!user) {
      console.log('❌ 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const pathParam = searchParams.get('path');
    const taskId = searchParams.get('taskId');
    const jobId = searchParams.get('jobId');

    console.log('📝 요청 파라미터:', { projectId, pathParam, taskId, jobId });

    let absoluteFolderPath: string;
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    if (projectId) {
      // ⚠️ ID 규칙: task_id = task_schedule.task_id (동일한 값 사용)
      // 폴더명은 prefix(task_, title_) 제거한 순수 ID 사용: tasks/1763997710632_xxx
      const cleanProjectId = projectId.replace(/^(task_|title_)/, '');
      console.log('🆔 Clean ID:', cleanProjectId);

      // ✅ FIX: MySQL content 테이블에서 실제 폴더명 찾기
      let actualFolderId = cleanProjectId;
      try {
        // ⭐ jobs → contents 통합 (video_path 조건 제거)
        const content = await getOne(`
          SELECT content_id FROM content WHERE source_content_id = ? ORDER BY created_at DESC LIMIT 1
        `, [cleanProjectId]) as any;
        if (content && content.content_id) {
          actualFolderId = content.content_id;
          console.log(`📁 contents 테이블에서 폴더 발견: ${cleanProjectId} → ${actualFolderId}`);
        }
      } catch (e: any) {
        console.log(`⚠️ contents 조회 실패: ${e.message}`);
      }

      const folderPath = path.join(backendPath, 'tasks', actualFolderId);
      absoluteFolderPath = path.resolve(folderPath);
    } else if (pathParam) {
      // path 파라미터 사용 (my-scripts, my-content 등)
      console.log('📂 Path 파라미터:', pathParam);

      // path가 상대 경로면 절대 경로로 변환
      if (pathParam.startsWith('../')) {
        absoluteFolderPath = path.resolve(process.cwd(), pathParam);
      } else if (pathParam.startsWith('task_') || pathParam.startsWith('title_')) {
        // task_, title_ 로 시작하면 tasks 폴더에서 찾기
        absoluteFolderPath = path.resolve(backendPath, 'tasks', pathParam);
      } else if (pathParam.startsWith('project_')) {
        // 하위 호환성: project_ 로 시작하면 task_로 변환
        const taskId = pathParam.replace('project_', 'task_');
        absoluteFolderPath = path.resolve(backendPath, 'tasks', taskId);
      } else if (path.isAbsolute(pathParam)) {
        // 절대 경로가 이미 주어진 경우
        absoluteFolderPath = path.resolve(pathParam);
      } else {
        // ⚠️ ID 규칙: prefix 없이 순수 ID만 사용하는 경우 tasks 폴더에서 찾기
        absoluteFolderPath = path.resolve(backendPath, 'tasks', pathParam);
      }

      // 파일 경로가 들어왔으면 상위 폴더로 변경
      if (fs.existsSync(absoluteFolderPath)) {
        const stat = fs.statSync(absoluteFolderPath);
        if (stat.isFile()) {
          absoluteFolderPath = path.dirname(absoluteFolderPath);
          console.log('📁 파일 경로 감지 → 상위 폴더로 전환:', absoluteFolderPath);
        }
      }
      // ⚠️ 폴더가 없으면 상위 폴더로 fallback하지 않음 - 정확한 폴더를 열어야 함
    } else if (taskId || jobId) {
      // taskId 사용 (하위 호환성)
      const resolvedId = taskId || jobId;
      console.log('🎬 Job ID:', resolvedId);

      // ⭐ video_path 조회 제거 - 직접 폴더 경로 사용
      // taskId로 폴더 찾기 - tasks, output 순서로 확인
      let folderPath;

      // 1. tasks 폴더 확인 (모든 task_, upload_, job_, shorts_ ID)
      if (resolvedId && (resolvedId.startsWith('task_') || resolvedId.startsWith('upload_') || resolvedId.startsWith('job_') || resolvedId.startsWith('shorts_'))) {
        folderPath = path.join(backendPath, 'tasks', resolvedId);
        if (fs.existsSync(folderPath)) {
          absoluteFolderPath = path.resolve(folderPath);
          console.log(`✅ tasks 폴더에서 발견: ${folderPath}`);
        } else {
          console.log(`❌ tasks 폴더에 없음: ${folderPath}`);

          // job_ ID인 경우 shorts_ 폴더로 변환 시도
          if (resolvedId.startsWith('job_')) {
            // job_1763914683396_xxx → shorts_1763914683396 형식으로 변환
            const timestamp = resolvedId.match(/job_(\d+)_/)?.[1];
            if (timestamp) {
              const shortsFolder = `shorts_${timestamp}`;
              const shortsPath = path.join(backendPath, 'tasks', shortsFolder);
              console.log(`🔍 shorts_ 폴더로 변환 시도: ${shortsPath}`);
              if (fs.existsSync(shortsPath)) {
                absoluteFolderPath = path.resolve(shortsPath);
                console.log(`✅ shorts_ 폴더에서 발견: ${shortsPath}`);
              } else {
                console.log(`❌ shorts_ 폴더에도 없음: ${shortsPath}`);
                // 마지막으로 tasks 경로를 기본으로
                absoluteFolderPath = path.resolve(backendPath, 'tasks', resolvedId);
              }
            } else {
              // 타임스탬프 추출 실패 시 기본 경로
              absoluteFolderPath = path.resolve(backendPath, 'tasks', resolvedId);
            }
          } else {
            // job_가 아닌 경우 기본 경로
            absoluteFolderPath = path.resolve(backendPath, 'tasks', resolvedId);
          }

          // task 폴더가 없고 pathParam이 함께 온 경우 pathParam 기준 폴더로 재시도
          if (pathParam && !fs.existsSync(absoluteFolderPath)) {
            let fallback: string;
            if (pathParam.startsWith('task_') || pathParam.startsWith('title_')) {
              fallback = path.resolve(backendPath, 'tasks', pathParam);
            } else if (pathParam.startsWith('tasks/') || pathParam.startsWith('tasks\\')) {
              // tasks/ 로 시작하는 상대 경로는 backendPath 기준으로 해석
              fallback = path.resolve(backendPath, pathParam);
            } else if (path.isAbsolute(pathParam)) {
              fallback = path.resolve(pathParam);
            } else {
              // 기타 상대 경로도 backendPath 기준으로 해석
              fallback = path.resolve(backendPath, pathParam);
            }
            if (fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
              fallback = path.dirname(fallback);
            } else if (!fs.existsSync(fallback)) {
              const parentDir = path.dirname(fallback);
              if (fs.existsSync(parentDir)) {
                fallback = parentDir;
              }
            }
            if (fs.existsSync(fallback)) {
              absoluteFolderPath = fallback;
              console.log('📁 task 폴더 없음, pathParam으로 대체:', absoluteFolderPath);
            }
          }
        }
      } else if (resolvedId) {
        // 그 외는 tasks 폴더 (output 폴더는 더 이상 확인하지 않음)
        folderPath = path.join(backendPath, 'tasks', resolvedId);
        absoluteFolderPath = path.resolve(folderPath);
      } else {
        return NextResponse.json(
          { error: 'taskId 또는 jobId가 필요합니다.' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'projectId, path, 또는 taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`📂 폴더 경로: ${absoluteFolderPath}`);

    // 폴더 존재 여부 확인
    if (!fs.existsSync(absoluteFolderPath)) {
      console.log(`⚠️ 폴더가 없음: ${absoluteFolderPath}`);

      // script_content 컬럼 삭제됨 - story.json은 대본 생성 시 이미 파일로 저장됨
      // 폴더가 없으면 story.json도 없으므로 404 반환 (아래에서 처리)

      // 폴더 재확인
      if (!fs.existsSync(absoluteFolderPath)) {
        console.error(`❌ 폴더가 존재하지 않습니다: ${absoluteFolderPath}`);

        // 사용자 친화적인 에러 메시지
        let userMessage = '폴더를 찾을 수 없습니다.';
        if ((taskId || jobId) && ((taskId || jobId)!.startsWith('job_') || (taskId || jobId)!.startsWith('task_'))) {
          userMessage = '작업 폴더가 아직 생성되지 않았습니다. 영상 생성이 완료될 때까지 기다려주세요.';
        }

        return NextResponse.json(
          { error: userMessage },
          { status: 404 }
        );
      }
    }

    // Windows에서 explorer로 폴더 열기
    // Windows 경로 형식으로 변환 (백슬래시)
    const windowsPath = absoluteFolderPath.replace(/\//g, '\\');

    console.log(`🔍 폴더 열기: ${windowsPath}`);

    // explorer.exe를 직접 실행 (포그라운드로 올라옴)
    const explorerProcess = spawn('explorer.exe', [windowsPath], {
      detached: true,
      stdio: 'ignore'
    });

    // 프로세스를 분리하여 부모 프로세스와 독립적으로 실행
    explorerProcess.unref();

    console.log('✅ explorer 프로세스 시작됨:', windowsPath);

    return NextResponse.json({
      success: true,
      message: '폴더를 열었습니다.',
      path: absoluteFolderPath
    });

  } catch (error: any) {
    console.error('Error opening folder:', error);
    return NextResponse.json(
      { error: error?.message || '폴더 열기 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST와 GET 모두 지원
export async function POST(request: NextRequest) {
  return handleOpenFolder(request);
}

export async function GET(request: NextRequest) {
  return handleOpenFolder(request);
}
