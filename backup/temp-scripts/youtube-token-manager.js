// YouTube API 토큰 관리 시스템
// 리프레시 토큰을 사용한 자동 갱신 구현

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class YouTubeTokenManager {
    constructor(config) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.redirectUri = config.redirectUri;
        this.tokenPath = config.tokenPath || './tokens.json';

        // OAuth2 클라이언트 초기화
        this.oauth2Client = new google.auth.OAuth2(
            this.clientId,
            this.clientSecret,
            this.redirectUri
        );

        // YouTube API 클라이언트
        this.youtube = google.youtube({
            version: 'v3',
            auth: this.oauth2Client
        });
    }

    /**
     * 저장된 토큰 로드
     */
    async loadTokens() {
        try {
            const tokenData = await fs.readFile(this.tokenPath, 'utf8');
            const tokens = JSON.parse(tokenData);

            // 토큰 설정
            this.oauth2Client.setCredentials(tokens);

            // 토큰 만료 체크 및 자동 갱신
            await this.refreshIfNeeded(tokens);

            return tokens;
        } catch (error) {
            console.error('토큰 로드 실패:', error.message);
            return null;
        }
    }

    /**
     * 토큰 저장
     */
    async saveTokens(tokens) {
        try {
            // 토큰 저장 시 타임스탬프 추가
            const tokenData = {
                ...tokens,
                saved_at: new Date().toISOString(),
                last_used: new Date().toISOString()
            };

            await fs.writeFile(
                this.tokenPath,
                JSON.stringify(tokenData, null, 2)
            );

            console.log('토큰 저장 완료');
        } catch (error) {
            console.error('토큰 저장 실패:', error.message);
        }
    }

    /**
     * 액세스 토큰 만료 확인 및 자동 갱신
     */
    async refreshIfNeeded(tokens) {
        try {
            // 액세스 토큰 만료 시간 체크
            const now = Date.now();
            const expiryTime = tokens.expiry_date || 0;

            // 만료 5분 전에 미리 갱신 (버퍼 시간)
            const bufferTime = 5 * 60 * 1000; // 5분

            if (expiryTime - now < bufferTime) {
                console.log('액세스 토큰 갱신 필요');
                await this.refreshAccessToken();
            } else {
                const remainingTime = Math.floor((expiryTime - now) / 1000 / 60);
                console.log(`액세스 토큰 유효 시간: ${remainingTime}분 남음`);
            }
        } catch (error) {
            console.error('토큰 갱신 체크 실패:', error.message);
        }
    }

    /**
     * 리프레시 토큰을 사용하여 액세스 토큰 갱신
     */
    async refreshAccessToken() {
        try {
            const { credentials } = await this.oauth2Client.refreshAccessToken();

            // 새 토큰 설정
            this.oauth2Client.setCredentials(credentials);

            // 토큰 저장
            await this.saveTokens(credentials);

            console.log('액세스 토큰 갱신 성공');
            console.log(`새 만료 시간: ${new Date(credentials.expiry_date).toLocaleString()}`);

            return credentials;
        } catch (error) {
            console.error('액세스 토큰 갱신 실패:', error.message);

            // 리프레시 토큰이 만료된 경우 재인증 필요
            if (error.message.includes('invalid_grant') ||
                error.message.includes('Token has been expired or revoked')) {
                console.error('리프레시 토큰 만료 - 재인증 필요');
                throw new Error('REFRESH_TOKEN_EXPIRED');
            }

            throw error;
        }
    }

    /**
     * 초기 인증 URL 생성
     */
    generateAuthUrl(scopes = ['https://www.googleapis.com/auth/youtube.readonly']) {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline', // 리프레시 토큰 받기 위해 필수
            prompt: 'consent',      // 리프레시 토큰 재발급 보장
            scope: scopes
        });
    }

    /**
     * 인증 코드로 토큰 교환
     */
    async exchangeCodeForTokens(authCode) {
        try {
            const { tokens } = await this.oauth2Client.getToken(authCode);

            // 토큰 설정 및 저장
            this.oauth2Client.setCredentials(tokens);
            await this.saveTokens(tokens);

            console.log('토큰 교환 성공');
            return tokens;
        } catch (error) {
            console.error('토큰 교환 실패:', error.message);
            throw error;
        }
    }

    /**
     * 토큰 상태 체크 (6개월 미사용 방지용)
     */
    async checkTokenHealth() {
        try {
            // 간단한 API 호출로 토큰 유효성 검증
            const response = await this.youtube.channels.list({
                part: 'id',
                mine: true
            });

            if (response.data.items && response.data.items.length > 0) {
                console.log('토큰 상태: 정상');

                // last_used 타임스탬프 업데이트
                const tokens = await this.loadTokens();
                if (tokens) {
                    tokens.last_used = new Date().toISOString();
                    await this.saveTokens(tokens);
                }

                return true;
            }
        } catch (error) {
            console.error('토큰 상태 체크 실패:', error.message);

            // 401 에러인 경우 토큰 갱신 시도
            if (error.code === 401) {
                try {
                    await this.refreshAccessToken();
                    return await this.checkTokenHealth(); // 재시도
                } catch (refreshError) {
                    if (refreshError.message === 'REFRESH_TOKEN_EXPIRED') {
                        return false;
                    }
                    throw refreshError;
                }
            }

            throw error;
        }
    }

    /**
     * 자동 토큰 관리 스케줄러 시작
     */
    startAutoRefresh(intervalMinutes = 50) {
        // 액세스 토큰이 보통 60분 만료이므로, 50분마다 체크
        const intervalMs = intervalMinutes * 60 * 1000;

        // 즉시 한 번 실행
        this.refreshIfNeeded(this.oauth2Client.credentials);

        // 정기적으로 실행
        this.refreshInterval = setInterval(async () => {
            try {
                await this.loadTokens(); // 토큰 로드 및 자동 갱신
                console.log(`[${new Date().toLocaleString()}] 토큰 체크 완료`);
            } catch (error) {
                console.error('자동 갱신 실패:', error.message);
            }
        }, intervalMs);

        console.log(`자동 토큰 갱신 스케줄러 시작 (${intervalMinutes}분 간격)`);
    }

    /**
     * 주기적 헬스 체크 (6개월 미사용 방지)
     */
    startHealthCheck(intervalDays = 7) {
        // 일주일에 한 번 토큰 사용 기록
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.checkTokenHealth();
                console.log(`[${new Date().toLocaleString()}] 헬스 체크 완료`);
            } catch (error) {
                console.error('헬스 체크 실패:', error.message);
            }
        }, intervalMs);

        console.log(`토큰 헬스 체크 시작 (${intervalDays}일 간격)`);
    }

    /**
     * 정리 작업
     */
    stop() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            console.log('자동 갱신 스케줄러 중지');
        }

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            console.log('헬스 체크 중지');
        }
    }
}

// 사용 예제
async function main() {
    // 설정
    const tokenManager = new YouTubeTokenManager({
        clientId: process.env.YOUTUBE_CLIENT_ID,
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
        redirectUri: process.env.YOUTUBE_REDIRECT_URI,
        tokenPath: './youtube-tokens.json'
    });

    try {
        // 저장된 토큰 로드
        const tokens = await tokenManager.loadTokens();

        if (!tokens) {
            // 토큰이 없으면 초기 인증 필요
            console.log('초기 인증이 필요합니다.');
            const authUrl = tokenManager.generateAuthUrl();
            console.log('인증 URL:', authUrl);

            // 사용자가 인증 후 받은 코드로 토큰 교환
            // const authCode = '인증_코드_입력';
            // await tokenManager.exchangeCodeForTokens(authCode);
        } else {
            console.log('토큰 로드 성공');

            // 자동 갱신 시작 (50분마다)
            tokenManager.startAutoRefresh(50);

            // 헬스 체크 시작 (7일마다)
            tokenManager.startHealthCheck(7);

            // API 사용 예제
            const youtube = tokenManager.youtube;
            const response = await youtube.channels.list({
                part: 'snippet,statistics',
                mine: true
            });

            if (response.data.items && response.data.items.length > 0) {
                const channel = response.data.items[0];
                console.log('채널 정보:', {
                    title: channel.snippet.title,
                    subscribers: channel.statistics.subscriberCount
                });
            }
        }
    } catch (error) {
        console.error('오류 발생:', error.message);
    }
}

// Express 서버와 통합 예제
const express = require('express');

function setupExpressRoutes(app, tokenManager) {
    // 인증 시작
    app.get('/auth/youtube', (req, res) => {
        const authUrl = tokenManager.generateAuthUrl([
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/youtube.upload'
        ]);
        res.redirect(authUrl);
    });

    // 인증 콜백
    app.get('/auth/youtube/callback', async (req, res) => {
        const { code } = req.query;

        try {
            await tokenManager.exchangeCodeForTokens(code);
            res.send('인증 성공! 토큰이 저장되었습니다.');
        } catch (error) {
            res.status(500).send(`인증 실패: ${error.message}`);
        }
    });

    // 토큰 상태 확인
    app.get('/api/token-status', async (req, res) => {
        try {
            const isHealthy = await tokenManager.checkTokenHealth();
            const tokens = tokenManager.oauth2Client.credentials;

            res.json({
                healthy: isHealthy,
                accessTokenExpiry: new Date(tokens.expiry_date).toLocaleString(),
                hasRefreshToken: !!tokens.refresh_token
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { YouTubeTokenManager, setupExpressRoutes };

// 독립 실행 시
if (require.main === module) {
    main();
}