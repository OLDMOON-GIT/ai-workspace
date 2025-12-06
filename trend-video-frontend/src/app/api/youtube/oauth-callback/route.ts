import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { addYouTubeChannel, updateYouTubeChannelToken } from '@/lib/db';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * GET /api/youtube/oauth-callback - YouTube OAuth 콜백 처리
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // 사용자 정보 가져오기
    const user = await getCurrentUser(request);
    if (!user) {
      return createErrorPage('로그인이 필요합니다', '/login');
    }

    const userId = user.userId;

    if (!code) {
      return createErrorPage('인증 코드가 없습니다');
    }

    // state에서 재인증 정보 파싱
    let isReauth = false;
    let reauthChannelId: string | null = null;
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        isReauth = stateData.reauth === true;
        reauthChannelId = stateData.channelId || null;
        console.log('[OAuth Callback] State data:', { isReauth, reauthChannelId });
      } catch (e) {
        console.log('[OAuth Callback] Could not parse state, treating as new auth');
      }
    }

    console.log('[OAuth Callback] Processing callback for user:', userId, isReauth ? '(재인증)' : '');

    // credentials 파일 읽기
    const credentialsContent = fs.readFileSync(COMMON_CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(credentialsContent);
    const { client_id, client_secret } = credentials.installed || credentials.web;

    // 현재 호스트 감지
    const host = request.headers.get('host') || 'localhost:2000';
    const protocol = host.includes('localhost') ? 'http' : 'http';
    const redirectUri = `${protocol}://${host}/api/youtube/oauth-callback`;

    console.log('[OAuth Callback] Exchanging code for tokens...');

    // 1. 코드를 토큰으로 교환
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id,
        client_secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('[OAuth Callback] Token exchange failed:', error);
      return createErrorPage('토큰 교환 실패: ' + error);
    }

    const tokens = await tokenResponse.json();
    console.log('[OAuth Callback] Token exchange successful');

    // 토큰에 client_id와 client_secret 추가 (Python에서 필요함)
    const tokenData = {
      ...tokens,
      client_id,
      client_secret
    };

    // 2. 토큰으로 채널 정보 가져오기
    const channelResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept': 'application/json'
      }
    });

    if (!channelResponse.ok) {
      const error = await channelResponse.text();
      console.error('[OAuth Callback] Channel info failed:', error);
      return createErrorPage('채널 정보 조회 실패');
    }

    const channelData = await channelResponse.json();
    if (!channelData.items || channelData.items.length === 0) {
      return createErrorPage('YouTube 채널을 찾을 수 없습니다');
    }

    const channel = channelData.items[0];
    const channelId = channel.id;
    const channelTitle = channel.snippet.title;
    const thumbnailUrl = channel.snippet.thumbnails?.default?.url;
    const subscriberCount = parseInt(channel.statistics?.subscriberCount || '0');
    const description = channel.snippet.description || '';

    console.log('[OAuth Callback] Channel info:', { channelId, channelTitle, subscriberCount });

    // 3. 토큰 파일 저장
    const tokenFilename = `youtube_token_${userId}_${channelId}.json`;
    const tokenPath = path.join(CREDENTIALS_DIR, tokenFilename);

    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
    console.log('[OAuth Callback] Token saved:', tokenFilename);

    // 4. DB 처리 (재인증 vs 새 채널)
    if (isReauth && reauthChannelId) {
      // 재인증: 기존 채널의 토큰만 업데이트
      await updateYouTubeChannelToken(userId, channelId, tokenFilename);
      console.log('[OAuth Callback] Channel token updated (reauth)');

      // 성공 페이지 반환 (재인증)
      return new NextResponse(createSuccessPage(channelTitle, subscriberCount, true), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } else {
      // 새 채널 추가
      const newChannel = {
        id: uuidv4(),
        userId,
        channelId,
        channelTitle,
        thumbnailUrl: thumbnailUrl || null,
        subscriberCount,
        description,
        tokenFile: tokenFilename,
        isDefault: false,
        createdAt: getLocalDateTime(),
        updatedAt: getLocalDateTime()
      };

      await addYouTubeChannel(newChannel);
      console.log('[OAuth Callback] Channel added to DB');

      // 5. 성공 페이지 반환
      return new NextResponse(createSuccessPage(channelTitle, subscriberCount, false), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

  } catch (error: any) {
    console.error('[OAuth Callback] Error:', error);
    return createErrorPage('채널 연결 중 오류 발생: ' + error.message);
  }
}

function createSuccessPage(channelTitle: string, subscriberCount: number, isReauth: boolean = false): string {
  const title = isReauth ? 'YouTube OAuth 재설정 완료!' : 'YouTube 채널 연결 성공!';
  const message = isReauth ? '토큰이 갱신되었습니다.' : '';
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #1e293b; color: white; }
            .container { max-width: 500px; margin: 0 auto; }
            h1 { color: #10b981; margin-bottom: 20px; }
            p { font-size: 18px; margin: 20px 0; }
            .channel-info { background: #374151; padding: 20px; border-radius: 10px; margin: 20px 0; }
            .spinner { border: 4px solid #374151; border-top: 4px solid #8b5cf6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .reauth-badge { background: #eab308; color: #1e293b; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>✅ ${title}</h1>
            <div class="channel-info">
                <h2>${channelTitle}</h2>
                <p>구독자: ${subscriberCount.toLocaleString()}명</p>
                ${isReauth ? `<p class="reauth-badge">🔄 ${message}</p>` : ''}
            </div>
            <div class="spinner"></div>
            <p>잠시 후 설정 페이지로 돌아갑니다...</p>
        </div>
        <script>
            setTimeout(function() {
                window.location.href = '/my-content?tab=settings';
            }, 2000);
        </script>
    </body>
    </html>
  `;
}

function createErrorPage(message: string, redirectTo: string = '/my-content?tab=settings'): NextResponse {
  return new NextResponse(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>YouTube 연결 실패</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #1e293b; color: white; }
            .container { max-width: 500px; margin: 0 auto; }
            h1 { color: #ef4444; margin-bottom: 20px; }
            a { color: #8b5cf6; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>❌ YouTube 채널 연결 실패</h1>
            <p>${message}</p>
            <p><a href="${redirectTo}">돌아가기</a></p>
        </div>
    </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
