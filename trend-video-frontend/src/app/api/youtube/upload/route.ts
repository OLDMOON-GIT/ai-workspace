import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getYouTubeChannelById, getDefaultYouTubeChannel, getUserYouTubeChannels, createYouTubeUpload } from '@/lib/db';
import { addContentLog } from '@/lib/content';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import kill from 'tree-kill';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'src', 'youtube', 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');

// 실행 중인 YouTube 업로드 프로세스 관리
const runningUploads = new Map<string, ChildProcess>();

const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');
function getUserTokenPath(userId: string): string {
  return path.join(CREDENTIALS_DIR, `youtube_token_${userId}.json`);
}

/**
 * POST /api/youtube/upload - 비디오 업로드
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 내부 요청 확인
    const isInternalRequest = request.headers.get('X-Internal-Request');

    const body = await request.json();
    const {
      videoPath,
      title,
      description = '',
      pinnedComment: userPinnedComment = '', // ⭐ 프론트엔드에서 전달하는 고정 댓글
      tags = [],
      privacy = 'unlisted',
      categoryId = '27',
      thumbnailPath,
      captionsPath,
      publishAt,
      channelId, // 업로드할 YouTube 채널 ID (선택사항, 없으면 기본 채널 사용)
      taskId,
      userId: internalUserId, // automation에서 전달하는 userId
      type // 영상 타입 (product, longform, shortform 등)
    } = body;

    console.log('📺 YouTube 업로드 API 호출 - Privacy 설정:', {
      taskId,
      title: title?.substring(0, 50),
      privacy,
      publishAt,
      isInternal: !!isInternalRequest
    });

    // ⚠️ 중복 업로드 방지: 동일 taskId로 이미 업로드 중인지 확인
    if (taskId && runningUploads.has(taskId)) {
      console.log(`⚠️ 이미 업로드 중인 taskId: ${taskId} - 중복 요청 차단`);
      return NextResponse.json(
        { error: '이미 업로드가 진행 중입니다. 잠시 후 다시 시도해주세요.', duplicate: true },
        { status: 409 }
      );
    }
    // ⚠️ 즉시 락 설정하여 동시 요청 차단 (프로세스 생성 전에 먼저 등록)
    if (taskId) {
      runningUploads.set(taskId, null as any);
      console.log(`🔒 업로드 락 설정: ${taskId}`);
    }

    // 사용자 인증
    let user;
    if (isInternalRequest && internalUserId) {
      // 내부 요청이면 전달받은 userId 사용
      user = { userId: internalUserId };
      console.log('🔧 Internal request - using provided userId:', internalUserId);
    } else {
      // 일반 요청이면 세션에서 사용자 확인
      user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
      }
    }

    // ⭐ videoPath가 없으면 taskId로 폴더에서 mp4 파일 자동 탐색
    let resolvedVideoPath = videoPath;
    let resolvedTitle = title;

    if (taskId && !videoPath) {
      try {
        const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);
        if (fs.existsSync(taskFolder)) {
          const files = fs.readdirSync(taskFolder);
          // scene_*.mp4, *_audio.mp4, 숫자파일(01.mp4 등) 제외하고 최종 영상 파일 찾기
          const mp4Files = files.filter(f =>
            f.endsWith('.mp4') &&
            !f.startsWith('scene_') &&
            !f.includes('_audio') &&
            !/^\d+\.mp4$/i.test(f)  // 🚨 01.mp4, 02.mp4 등 원본 재료 파일 제외
          );
          // 여러 파일이 있으면 가장 큰 파일 선택 (최종 렌더링 영상이 가장 큼)
          let videoFile;
          if (mp4Files.length > 1) {
            let maxSize = 0;
            for (const f of mp4Files) {
              const stats = fs.statSync(path.join(taskFolder, f));
              if (stats.size > maxSize) {
                maxSize = stats.size;
                videoFile = f;
              }
            }
            console.log(`📍 여러 mp4 중 최대 크기 파일 선택: ${videoFile} (${(maxSize / 1024 / 1024).toFixed(1)}MB)`);
          } else {
            videoFile = mp4Files[0];
          }
          if (videoFile) {
            resolvedVideoPath = path.join(taskFolder, videoFile);
            console.log('📍 폴더에서 video 파일 자동 탐색:', resolvedVideoPath);
          }
        }
      } catch (fsError) {
        console.warn('⚠️ 폴더 탐색 실패:', fsError);
      }
    }

    // title이 없으면 DB에서 조회
    if (taskId && !title) {
      try {
        const db = (await import('@/lib/mysql')).default;
        const [rows] = await db.query(
          'SELECT title FROM content WHERE content_id = ?',
          [taskId]
        );
        const content = (rows as any[])[0] as { title?: string } | undefined;

        if (content?.title) {
          resolvedTitle = content.title;
          console.log('📍 content 테이블에서 title 조회:', resolvedTitle);
        }
      } catch (dbError) {
        console.warn('⚠️ content 테이블 조회 실패:', dbError);
      }
    }

    if (!resolvedVideoPath || !resolvedTitle) {
      return NextResponse.json({
        error: 'videoPath와 title은 필수입니다',
        debug: { videoPath: !!resolvedVideoPath, title: !!resolvedTitle, taskId }
      }, { status: 400 });
    }

    // Job 데이터에서 type 확인하여 Shorts 여부 판단 및 상품 태그 자동 생성
    let isShorts = false;
    let autoGeneratedTags = tags;
    let autoGeneratedDescription = description;
    // ⭐ 프론트에서 전달한 댓글이 있으면 우선 사용
    let pinnedComment = userPinnedComment || '';
    // ⭐ 숏폼이 롱폼에서 파생된 경우 롱폼 채널 사용
    let parentChannelId: string | null = null;

    if (taskId) {
      try {
        const { findJobById } = await import('@/lib/db');
        const job = await findJobById(taskId);
        // ⭐ promptFormat 또는 type으로 숏폼 판단
        const isShortformContent = job && (job.promptFormat === 'shortform' || job.type === 'shortform');
        if (isShortformContent) {
          isShorts = true;
          console.log('✅ 숏폼(shortform) 감지 - YouTube Shorts로 업로드, promptFormat:', (job as any).promptFormat);

          // 숏폼인 경우 롱폼 YouTube 링크 확인
          try {
            const db = (await import('@/lib/mysql')).default;

            let longformUrl = '';

            // 1. content 테이블의 source_content_id로 원본 롱폼 ID 조회
            // ⭐ findJobById가 반환하는 필드명은 sourceContentId (camelCase)
            const sourceContentId = (job as any).sourceContentId;
            console.log('🔍 sourceContentId:', sourceContentId);

            if (sourceContentId) {
              // ⭐ 롱폼 채널 조회 (숏폼이 롱폼에서 파생된 경우 롱폼 채널 사용)
              const [taskRows] = await db.query(
                'SELECT channel FROM task WHERE task_id = ?',
                [sourceContentId]
              );
              const parentTask = (taskRows as any[])[0] as { channel?: string } | undefined;

              if (parentTask?.channel) {
                parentChannelId = parentTask.channel;
                console.log('📺 롱폼 채널 발견 (task.channel):', parentChannelId);
              }

              // ⭐ 먼저 content 테이블에서 youtube_url 직접 조회
              const [contentRows] = await db.query(
                'SELECT youtube_url FROM content WHERE content_id = ? AND youtube_url IS NOT NULL AND youtube_url != ?',
                [sourceContentId, '']
              );
              const contentWithUrl = (contentRows as any[])[0] as { youtube_url?: string } | undefined;

              if (contentWithUrl && contentWithUrl.youtube_url) {
                longformUrl = contentWithUrl.youtube_url;
                console.log('📺 원본 롱폼 YouTube 링크 발견 (content.youtube_url):', longformUrl);
              } else {
                // content에 없으면 youtube_uploads 테이블에서 조회
                const [uploadRows] = await db.query(
                  'SELECT youtube_url FROM youtube_uploads WHERE content_id = ? AND status != ? ORDER BY uploaded_at DESC LIMIT 1',
                  [sourceContentId, 'deleted']
                );
                const upload = (uploadRows as any[])[0] as { youtube_url?: string } | undefined;

                if (upload && upload.youtube_url) {
                  longformUrl = upload.youtube_url;
                  console.log('📺 원본 롱폼 YouTube 링크 발견 (youtube_uploads):', longformUrl);
                } else {
                  console.log('ℹ️ source_content_id로 YouTube URL을 찾을 수 없음');
                }
              }
            }

            // 2. source_content_id가 없으면 story.json에서 확인
            if (!longformUrl) {
              const absoluteVideoPath = path.isAbsolute(resolvedVideoPath) ? resolvedVideoPath : path.join(BACKEND_PATH, resolvedVideoPath);
              const videoDir = path.dirname(absoluteVideoPath);
              const storyJsonPath = path.join(videoDir, 'story.json');

              if (fs.existsSync(storyJsonPath)) {
                const storyContent = fs.readFileSync(storyJsonPath, 'utf-8');
                const storyData = JSON.parse(storyContent);

                if (storyData.metadata?.longform_youtube_url) {
                  longformUrl = storyData.metadata.longform_youtube_url;
                  console.log('📺 원본 롱폼 YouTube 링크 발견 (story.json metadata):', longformUrl);
                } else if (storyData.metadata?.converted_from) {
                  const [uploadRows2] = await db.query(
                    'SELECT youtube_url FROM youtube_uploads WHERE content_id = ? AND status != ? ORDER BY uploaded_at DESC LIMIT 1',
                    [storyData.metadata.converted_from, 'deleted']
                  );
                  const upload = (uploadRows2 as any[])[0] as { youtube_url?: string } | undefined;

                  if (upload?.youtube_url) {
                    longformUrl = upload.youtube_url;
                    console.log('📺 원본 롱폼 YouTube 링크 발견 (converted_from 기반):', longformUrl);

                    // story.json에 캐시
                    storyData.metadata.longform_youtube_url = longformUrl;
                    fs.writeFileSync(storyJsonPath, JSON.stringify(storyData, null, 2));
                  }
                }
              }
            }

            // description에 롱폼 링크 추가 및 고정 댓글 설정
            if (longformUrl) {
              // ⭐ 이미 롱폼 링크가 있으면 중복 추가하지 않음
              const hasLongformLink = description && description.includes(longformUrl);
              if (!hasLongformLink) {
                if (description && description.trim() !== '') {
                  autoGeneratedDescription = `🎬 전체 영상 보기: ${longformUrl}\n\n${description}`;
                } else {
                  autoGeneratedDescription = `🎬 전체 영상 보기: ${longformUrl}\n\n구독과 좋아요 부탁드립니다 ❤️`;
                }
                console.log('✅ 숏폼 설명에 롱폼 링크 추가됨');
              } else {
                autoGeneratedDescription = description;
                console.log('ℹ️ 설명에 이미 롱폼 링크 있음, 중복 추가 안함');
              }
              pinnedComment = `🎬 전체 영상 보러가기 👉 ${longformUrl}`;
              console.log('✅ 고정 댓글 설정됨:', pinnedComment);
            } else {
              console.log('ℹ️ 원본 롱폼의 YouTube 업로드 기록이 없습니다');
            }
          } catch (linkError) {
            console.warn('⚠️ 롱폼 링크 추가 실패 (무시하고 계속):', linkError);
          }
        }

        // content 테이블에서 task_id로 대본의 category 확인
        let isProductCategory = false;
        if (taskId) {
          try {
            const db = (await import('@/lib/mysql')).default;

            // content 테이블에서 직접 category 확인 (task_id = content_id)
            // ⚠️ video content는 script_content가 NULL이므로 조건 제거
            const [categoryRows] = await db.query('SELECT category FROM content WHERE content_id = ?', [taskId]);
            const content = (categoryRows as any[])[0] as { category?: string } | undefined;

            if (content?.category === '상품') {
              isProductCategory = true;
              console.log('🛍️ 상품 카테고리 대본 감지 - task_id:', taskId);
            }
          } catch (dbError) {
            console.warn('⚠️ 대본 카테고리 조회 실패:', dbError);
          }
        }

        // 상품 카테고리인 경우에만 자동 태그 생성 및 상품정보 대본으로 설명 채우기
        if (isProductCategory) {
          console.log('🛍️ 상품 카테고리 - 자동 태그 생성 및 상품정보 대본 로드');

          // 제목에서 키워드 추출하여 태그 생성 (태그가 비어있을 경우만)
          if (!tags || tags.length === 0) {
            const keywords = title.split(/[\s,]+/).filter((word: string) => word.length > 1);
            autoGeneratedTags = [...new Set([...keywords, '상품리뷰', '추천', '쇼핑'])].slice(0, 10);
            console.log('✅ 자동 생성된 태그:', autoGeneratedTags);
          }

          // ⚠️ CRITICAL: 상품 카테고리이고 description이 비어있으면 story.json의 youtube_description.text에서 가져오기
          // story.json 안에 youtube_description.text 포함됨 (프롬프트 통합으로 한 번에 생성)
          if (!description || description.trim() === '') {
            try {
              const videoDir = path.dirname(resolvedVideoPath);
              const storyJsonPath = path.join(videoDir, 'story.json');

              console.log('🔍 story.json 경로:', storyJsonPath);

              if (fs.existsSync(storyJsonPath)) {
                const storyContent = fs.readFileSync(storyJsonPath, 'utf-8');
                const storyData = JSON.parse(storyContent);

                // youtube_description.text 추출
                if (storyData.youtube_description && storyData.youtube_description.text) {
                  // ✅ 문자열 "\n"을 실제 줄바꿈으로 변환
                  autoGeneratedDescription = storyData.youtube_description.text.replace(/\\n/g, '\n');
                  console.log('✅ story.json에서 YouTube 설명 로드 완료 (길이:', autoGeneratedDescription.length, '자)');

                  // ⭐ 상품 카테고리: 댓글에도 상품설명 추가
                  pinnedComment = autoGeneratedDescription;
                  console.log('✅ 상품 고정 댓글 설정됨 (길이:', pinnedComment.length, '자)');
                } else {
                  // youtube_description이 없으면 기본 설명
                  autoGeneratedDescription = `${resolvedTitle}\n\n📦 상품 정보는 영상 설명란을 확인해주세요!\n\n구독과 좋아요 부탁드립니다 ❤️`;
                  console.log('⚠️ story.json에 youtube_description이 없음 - 기본 설명 사용');
                }
              } else {
                // story.json이 없으면 기본 설명
                console.log('⚠️ story.json 파일이 없음:', storyJsonPath);
                autoGeneratedDescription = `${resolvedTitle}\n\n📦 상품 정보는 영상 설명란을 확인해주세요!\n\n구독과 좋아요 부탁드립니다 ❤️`;
              }
            } catch (parseError) {
              console.error('❌ YouTube 설명 로드 실패:', parseError);
              autoGeneratedDescription = `${resolvedTitle}\n\n📦 상품 정보는 영상 설명란을 확인해주세요!\n\n구독과 좋아요 부탁드립니다 ❤️`;
            }
          }
        } else {
          console.log('ℹ️ 상품 카테고리 아님 - isProductCategory:', isProductCategory);
        }
      } catch (error) {
        console.warn('⚠️ Job 조회 실패, type 확인 불가:', error);
      }
    }

    // 사용할 채널 결정
    // ⭐ 숏폼이 롱폼에서 파생된 경우 롱폼 채널 우선 사용
    let effectiveChannelId = parentChannelId || channelId;

    // ⭐ channelId가 없으면 content_setting.youtube_channel에서 조회 (fallback)
    if (!effectiveChannelId && taskId) {
      try {
        const db = (await import('@/lib/mysql')).default;
        const [settingRows] = await db.query(
          'SELECT youtube_channel FROM content_setting WHERE content_id = ?',
          [taskId]
        );
        const setting = (settingRows as any[])[0] as { youtube_channel?: string } | undefined;

        if (setting?.youtube_channel) {
          effectiveChannelId = setting.youtube_channel;
          console.log('✅ content_setting에서 채널 조회:', effectiveChannelId);
        } else {
          console.warn('⚠️ content_setting.youtube_channel 없음 (taskId:', taskId, ')');
        }
      } catch (dbError) {
        console.warn('⚠️ content_setting 조회 실패:', dbError);
      }
    }

    let selectedChannel;
    if (effectiveChannelId) {
      // 특정 채널 ID가 제공된 경우 (롱폼 채널 또는 요청된 채널)
      console.log('🔍 채널 ID로 조회:', effectiveChannelId, parentChannelId ? '(롱폼 채널 상속)' : '');

      // channelId가 DB의 id인지 YouTube의 실제 channelId인지 확인
      selectedChannel = await getYouTubeChannelById(effectiveChannelId);

      // id로 못 찾으면 youtube_channels.json에서 재조회
      if (!selectedChannel) {
        console.log('🔍 DB에서 못 찾음, youtube_channels.json에서 재조회:', effectiveChannelId);
        const allChannels = await getUserYouTubeChannels(user.userId);
        // youtube_channels.json의 id 또는 YouTube 실제 channelId로 조회
        selectedChannel = allChannels.find(ch => ch.id === effectiveChannelId || ch.channelId === effectiveChannelId);
      }

      console.log('📺 조회된 채널:', selectedChannel);
      console.log('👤 현재 사용자 ID:', user.userId);

      if (!selectedChannel) {
        console.error('❌ 채널을 찾을 수 없음:', effectiveChannelId);
        return NextResponse.json({ error: '채널을 찾을 수 없습니다' }, { status: 404 });
      }

      if (selectedChannel.userId !== user.userId) {
        console.error('❌ 채널 소유자 불일치:', {
          channelUserId: selectedChannel.userId,
          currentUserId: user.userId
        });
        return NextResponse.json({ error: '유효하지 않은 채널입니다' }, { status: 403 });
      }

      console.log('✅ 채널 검증 성공:', selectedChannel.channelTitle, parentChannelId ? '(롱폼 채널 상속)' : '');
    } else {
      // channelId가 없으면 기본 채널 사용
      console.log('🔍 기본 채널 조회 중... 사용자 ID:', user.userId);
      selectedChannel = await getDefaultYouTubeChannel(user.userId);
      if (!selectedChannel) {
        console.error('❌ 기본 채널 없음');
        return NextResponse.json({ error: 'YouTube 채널이 연결되지 않았습니다' }, { status: 400 });
      }
      console.log('✅ 기본 채널 선택:', selectedChannel.channelTitle);
    }

    // videoPath가 절대 경로인지 확인
    let fullVideoPath = path.isAbsolute(resolvedVideoPath) ? resolvedVideoPath : path.join(BACKEND_PATH, resolvedVideoPath);

    console.log('📹 비디오 경로 확인:', { videoPath: resolvedVideoPath, fullVideoPath, exists: fs.existsSync(fullVideoPath) });

    // ⭐ 파일이 없으면 taskId로 폴더에서 재탐색 (경로 불일치 방어)
    if (!fs.existsSync(fullVideoPath) && taskId) {
      console.log('⚠️ 지정 경로에 파일 없음, taskId로 재탐색:', taskId);
      const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);
      if (fs.existsSync(taskFolder)) {
        const files = fs.readdirSync(taskFolder);
        // 숫자파일(01.mp4 등) 제외
        const mp4Files2 = files.filter(f =>
          f.endsWith('.mp4') &&
          !f.startsWith('scene_') &&
          !f.includes('_audio') &&
          !/^\d+\.mp4$/i.test(f)
        );
        let videoFile2;
        if (mp4Files2.length > 1) {
          let maxSize = 0;
          for (const f of mp4Files2) {
            const stats = fs.statSync(path.join(taskFolder, f));
            if (stats.size > maxSize) {
              maxSize = stats.size;
              videoFile2 = f;
            }
          }
        } else {
          videoFile2 = mp4Files2[0];
        }
        if (videoFile2) {
          fullVideoPath = path.join(taskFolder, videoFile2);
          console.log('✅ 재탐색 성공:', fullVideoPath);
        }
      }
    }

    if (!fs.existsSync(fullVideoPath)) {
      console.error('❌ 비디오 파일을 찾을 수 없음:', fullVideoPath);
      return NextResponse.json({ error: '비디오 파일을 찾을 수 없습니다' }, { status: 404 });
    }

    // 사용자가 입력한 제목과 설명을 그대로 사용 (상품은 자동 생성된 값 사용)
    const finalTitle = resolvedTitle;
    const finalDescription = autoGeneratedDescription;

    // 메타데이터 JSON 생성
    const metadata: Record<string, any> = {
      title: finalTitle,
      description: finalDescription,
      tags: autoGeneratedTags,
      category_id: categoryId,
      privacy_status: privacy,
      publish_at: publishAt
    };

    // 숏폼일 때 고정 댓글 추가 (롱폼 링크)
    if (pinnedComment) {
      metadata.pinned_comment = pinnedComment;
    }

    console.log('📝 YouTube 메타데이터 생성:', {
      title: finalTitle?.substring(0, 50),
      privacy_status: metadata.privacy_status,
      publish_at: metadata.publish_at,
      tags_count: autoGeneratedTags?.length || 0,
      has_pinned_comment: !!metadata.pinned_comment
    });

    const metadataPath = path.join(CREDENTIALS_DIR, `youtube_metadata_${Date.now()}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // 업로드 실행
    return new Promise((resolve) => {
      const credentialsPath = COMMON_CREDENTIALS_PATH;
      // 채널 추가 시와 동일한 토큰 경로 사용
      const tokenPath = path.join(CREDENTIALS_DIR, `youtube_token_${user.userId}_${selectedChannel.channelId}.json`);

      // 토큰 파일 존재 여부 확인
      console.log('🔑 토큰 파일 확인:', {
        userId: user.userId,
        channelId: selectedChannel.channelId,
        tokenPath,
        exists: fs.existsSync(tokenPath)
      });

      if (!fs.existsSync(tokenPath)) {
        console.error('❌ 토큰 파일이 존재하지 않음:', tokenPath);
        return resolve(NextResponse.json({
          error: '인증 실패',
          details: 'YouTube 토큰 파일을 찾을 수 없습니다. 채널을 다시 연결해주세요.',
          tokenPath
        }, { status: 401 }));
      }

      if (!fs.existsSync(credentialsPath)) {
        console.error('❌ Credentials 파일이 존재하지 않음:', credentialsPath);
        return resolve(NextResponse.json({
          error: '인증 실패',
          details: 'YouTube API Credentials가 설정되지 않았습니다.',
          credentialsPath
        }, { status: 401 }));
      }

      // 취소 플래그 파일 경로
      const cancelFlagPath = path.join(CREDENTIALS_DIR, `youtube_cancel_${taskId || Date.now()}.flag`);

      const args = [
        YOUTUBE_CLI,
        '--action', 'upload',
        '--credentials', credentialsPath,
        '--token', tokenPath,
        '--video', fullVideoPath,
        '--metadata', metadataPath,
        '--cancel-flag', cancelFlagPath
      ];

      if (thumbnailPath) {
        const fullThumbnailPath = path.isAbsolute(thumbnailPath) ? thumbnailPath : path.join(BACKEND_PATH, thumbnailPath);
        console.log('🖼️ 썸네일 경로 확인:', { thumbnailPath, fullThumbnailPath, exists: fs.existsSync(fullThumbnailPath) });
        if (fs.existsSync(fullThumbnailPath)) {
          args.push('--thumbnail', fullThumbnailPath);
        }
      }

      if (captionsPath) {
        const fullCaptionsPath = path.join(BACKEND_PATH, captionsPath);
        if (fs.existsSync(fullCaptionsPath)) {
          args.push('--captions', fullCaptionsPath);
        }
      }

      console.log('🐍 Python 실행 명령:', 'python -u', args.join(' '));
      console.log('📂 작업 디렉토리:', BACKEND_PATH);

      // -u 플래그: unbuffered 모드 (print가 즉시 출력됨)
      // cwd와 PYTHONPATH를 백엔드 경로로 설정하여 src 모듈 import 가능하게 함
      const python = spawn('python', ['-u', ...args], {
        cwd: BACKEND_PATH,
        env: {
          ...process.env,
          PYTHONPATH: BACKEND_PATH,
          PYTHONIOENCODING: 'utf-8'
        }
      });

      // taskId가 있으면 프로세스를 Map에 등록하여 취소 가능하도록 함
      const uploadId = body.taskId || `upload_${Date.now()}`;
      if (python.pid) {
        runningUploads.set(uploadId, python);
        console.log(`✅ YouTube 업로드 프로세스 등록: ${uploadId}, PID: ${python.pid}`);
      }

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        const text = data.toString().trim();
        console.log('📤 Python stdout:', text);
        output += text + '\n';  // ⭐ 줄바꿈 추가 - JSON 파싱용
        // YouTube 업로드 로그 파일에 기록
        if (taskId && text) {
          addContentLog(taskId, text, 'youtube');
        }
      });

      python.stderr.on('data', (data) => {
        const text = data.toString().trim();
        console.error('🔴 Python stderr:', text);
        errorOutput += text;
        // YouTube 업로드 에러 로그 기록
        if (taskId && text) {
          addContentLog(taskId, `❌ ${text}`, 'youtube');
        }
      });

      python.on('close', async (code) => {
        // Map에서 제거
        runningUploads.delete(uploadId);
        console.log(`✅ YouTube 업로드 프로세스 제거: ${uploadId}`);

        // 메타데이터 파일 삭제
        try {
          if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
          }
        } catch {}

        console.log('🐍 Python 종료 코드:', code);
        console.log('📤 Python stdout:', output);
        if (errorOutput) {
          console.error('🔴 Python stderr:', errorOutput);
        }

        try {
          // ⭐ JSON 패턴으로 결과 줄 찾기 (마지막 줄이 빈 줄일 수 있음)
          const lines = output.trim().split('\n').filter(line => line.trim());
          // {"success": 로 시작하는 줄 찾기 (뒤에서부터)
          let jsonLine = '';
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{"success":') || line.startsWith('{"error":')) {
              jsonLine = line;
              break;
            }
          }
          if (!jsonLine) {
            // 못 찾으면 마지막 줄 사용 (기존 동작)
            jsonLine = lines[lines.length - 1] || '';
          }
          const result = JSON.parse(jsonLine);
          if (result.success) {
            // YouTube 업로드 기록 저장
            let uploadRecordId: string | undefined;
            try {
              const thumbnailUrl = `https://img.youtube.com/vi/${result.video_id}/maxresdefault.jpg`;

              const uploadRecord = await createYouTubeUpload({
                userId: user.userId,
                taskId: body.taskId || undefined,
                videoId: result.video_id,
                videoUrl: result.video_url,
                title: resolvedTitle,
                description: finalDescription,
                thumbnailUrl,
                channelId: selectedChannel.channelId,
                channelTitle: selectedChannel.channelTitle,
                privacyStatus: privacy
              });

              uploadRecordId = uploadRecord.id;
              console.log('✅ YouTube 업로드 기록 저장 완료, uploadId:', uploadRecordId);

              // ⭐ content 테이블 + task_queue 상태 업데이트 (실패 → 성공 전환 지원)
              if (body.taskId) {
                try {
                  const updateDb = (await import('@/lib/mysql')).default;

                  // 1. content 테이블 업데이트
                  await updateDb.query(`
                    UPDATE content
                    SET status = 'completed', youtube_url = ?, updated_at = NOW()
                    WHERE content_id = ?
                  `, [result.video_url, body.taskId]);

                  // 2. task_queue 업데이트 (스케줄 목록에 반영)
                  await updateDb.query(`
                    UPDATE task_queue
                    SET type = 'youtube', status = 'completed', completed_at = NOW()
                    WHERE task_id = ?
                  `, [body.taskId]);

                  // 3. 롱폼→숏폼 자동변환 확인 및 실행
                  // BTS-3354: auto_create_shortform은 content_setting 테이블에 저장됨
                  const [taskDataRows] = await updateDb.query(`
                    SELECT c.prompt_format, cs.auto_create_shortform, c.title, c.category, c.youtube_channel as channel, c.user_id
                    FROM content c
                    LEFT JOIN content_setting cs ON c.content_id = cs.content_id
                    WHERE c.content_id = ?
                  `, [body.taskId]);
                  const taskData = (taskDataRows as any[])[0] as {
                    prompt_format: string;
                    auto_create_shortform: number;
                    title: string;
                    category: string;
                    channel: string;
                    user_id: string;
                  } | undefined;

                  console.log('✅ content + task_queue 상태 업데이트 완료: completed, youtube_url:', result.video_url);

                  // 🔍 BTS-3356 디버깅: 롱폼→숏폼 자동변환 조건 확인
                  console.log('🔍 [BTS-3356] 자동변환 조건 체크:', {
                    taskId: body.taskId,
                    hasTaskData: !!taskData,
                    prompt_format: taskData?.prompt_format,
                    auto_create_shortform: taskData?.auto_create_shortform,
                    auto_create_shortform_type: typeof taskData?.auto_create_shortform,
                    isLongform: taskData?.prompt_format === 'longform',
                    isAutoConvertEnabled: taskData?.auto_create_shortform == 1  // == 로 느슨한 비교
                  });

                  // 롱폼이고 auto_create_shortform이 설정되어 있으면 숏폼 자동생성
                  // BTS-3356: == 로 느슨한 비교 (문자열 "1"도 처리)
                  if (taskData && taskData.prompt_format === 'longform' && taskData.auto_create_shortform == 1) {
                    console.log('🔄 롱폼→숏폼 자동변환 시작:', body.taskId);

                    // 비동기로 숏폼 변환 실행 (업로드 응답을 지연시키지 않음)
                    (async () => {
                      try {
                        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/automation/convert-to-shortform`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-Internal-Request': 'youtube-upload'
                          },
                          body: JSON.stringify({
                            taskId: body.taskId,
                            longformYoutubeUrl: result.video_url,
                            title: taskData.title,
                            category: taskData.category,
                            channel: taskData.channel,
                            userId: taskData.user_id
                          })
                        });

                        if (response.ok) {
                          const data = await response.json();
                          console.log('✅ 숏폼 자동생성 완료:', data.taskId);
                        } else {
                          console.error('❌ 숏폼 자동생성 실패:', await response.text());
                        }
                      } catch (convertError) {
                        console.error('❌ 숏폼 자동변환 API 호출 실패:', convertError);
                      }
                    })();
                  }
                } catch (updateError) {
                  console.error('⚠️ 상태 업데이트 실패 (무시):', updateError);
                }
              }
            } catch (dbError) {
              console.error('❌ DB 저장 실패:', dbError);
              // DB 저장 실패해도 업로드는 성공이므로 계속 진행
            }

            resolve(NextResponse.json({
              success: true,
              videoId: result.video_id,
              videoUrl: result.video_url,
              uploadId: uploadRecordId // 업로드 기록 ID 반환
            }));
          } else {
            resolve(NextResponse.json({
              error: result.error || '업로드 실패',
              details: errorOutput || '상세 정보 없음',
              stdout: output,
              stderr: errorOutput
            }, { status: 500 }));
          }
        } catch (parseError) {
          console.error('❌ JSON 파싱 실패:', parseError);
          console.error('❌ 원본 출력:', output);
          resolve(NextResponse.json({
            error: '업로드 프로세스 오류',
            details: errorOutput || output || 'No output',
            stdout: output,
            stderr: errorOutput,
            exitCode: code
          }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'YouTube 업로드 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/youtube/upload - YouTube 업로드 중지
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId') || searchParams.get('taskId');

    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId 또는 taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 YouTube 업로드 중지 요청: ${uploadId}`);

    const process = runningUploads.get(uploadId);

    if (process && process.pid) {
      const pid = process.pid;
      console.log(`🛑 취소 플래그 파일 생성: Upload ${uploadId}, PID ${pid}`);

      try {
        // 취소 플래그 파일 생성 (Python이 감지하여 KeyboardInterrupt 발생)
        const cancelFlagPath = path.join(CREDENTIALS_DIR, `youtube_cancel_${uploadId}.flag`);
        fs.writeFileSync(cancelFlagPath, '', 'utf8');
        console.log(`✅ 취소 플래그 파일 생성: ${cancelFlagPath}`);

        // Python이 플래그를 감지하고 정리 작업을 수행할 시간 부여 (최대 10초)
        console.log('⏳ Python 정리 작업 대기 중 (최대 10초)...');

        let processExited = false;
        const checkInterval = 500; // 0.5초마다 체크
        const maxWaitTime = 10000; // 최대 10초
        let elapsedTime = 0;

        while (elapsedTime < maxWaitTime && !processExited) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          elapsedTime += checkInterval;

          // 프로세스가 종료되었는지 확인
          try {
            process.kill(0); // signal 0: 프로세스 존재 확인
          } catch {
            // 프로세스가 종료됨
            processExited = true;
            console.log(`✅ Python 프로세스 정상 종료됨 (${elapsedTime}ms 후): PID ${pid}`);
          }
        }

        // 타임아웃 후에도 프로세스가 살아있으면 강제 종료
        if (!processExited) {
          console.log(`⚠️ 프로세스가 ${maxWaitTime}ms 내에 종료되지 않음, 강제 종료 시도: PID ${pid}`);
          try {
            await new Promise<void>((resolve, reject) => {
              kill(pid, 'SIGKILL', (err) => {
                if (err) {
                  console.error(`❌ SIGKILL 실패: ${err.message}`);
                  reject(err);
                } else {
                  console.log(`✅ SIGKILL 성공: PID ${pid} 강제 종료`);
                  resolve();
                }
              });
            });
          } catch (killError: any) {
            console.error(`❌ 강제 종료 실패: ${killError.message}`);
          }
        }

        // 취소 플래그 파일 정리 (Python이 삭제하지 못한 경우를 대비)
        try {
          if (fs.existsSync(cancelFlagPath)) {
            fs.unlinkSync(cancelFlagPath);
            console.log(`✅ 취소 플래그 파일 정리: ${cancelFlagPath}`);
          }
        } catch {
          // 무시
        }

        runningUploads.delete(uploadId);
        console.log(`✅ runningUploads에서 제거: ${uploadId}`);

        return NextResponse.json({
          success: true,
          message: 'YouTube 업로드가 중지되었습니다.',
        });

      } catch (error: any) {
        console.error(`❌ 업로드 중지 실패: ${error.message}`);
        runningUploads.delete(uploadId);

        return NextResponse.json({
          error: '업로드 중지 실패',
          details: error.message
        }, { status: 500 });
      }
    } else {
      console.log(`⚠️ 실행 중인 업로드 프로세스 없음: ${uploadId}`);
      return NextResponse.json({
        success: true,
        message: '실행 중인 업로드가 없습니다.',
      });
    }

  } catch (error: any) {
    console.error('DELETE 핸들러 에러:', error);
    return NextResponse.json(
      { error: 'YouTube 업로드 중지 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
