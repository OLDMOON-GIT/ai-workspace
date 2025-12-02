# YouTube API 토큰 관리 시스템 (Python 버전)
# 리프레시 토큰을 사용한 자동 갱신 구현

import json
import os
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, List

import google.auth.transport.requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class YouTubeTokenManager:
    """YouTube API 토큰 자동 관리 클래스"""

    def __init__(self, client_secrets_file: str, token_file: str = 'youtube-tokens.json'):
        """
        Args:
            client_secrets_file: OAuth2 클라이언트 시크릿 파일 경로
            token_file: 토큰 저장 파일 경로
        """
        self.client_secrets_file = client_secrets_file
        self.token_file = token_file
        self.credentials: Optional[Credentials] = None
        self.youtube = None
        self.refresh_thread = None
        self.health_check_thread = None
        self.stop_threads = False

        # API 스코프 설정
        self.scopes = [
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/youtube.upload'
        ]

    def load_tokens(self) -> Optional[Credentials]:
        """저장된 토큰 로드"""
        if not os.path.exists(self.token_file):
            print(f"토큰 파일 없음: {self.token_file}")
            return None

        try:
            with open(self.token_file, 'r') as f:
                token_data = json.load(f)

            # Credentials 객체 생성
            self.credentials = Credentials(
                token=token_data.get('access_token'),
                refresh_token=token_data.get('refresh_token'),
                token_uri=token_data.get('token_uri', 'https://oauth2.googleapis.com/token'),
                client_id=token_data.get('client_id'),
                client_secret=token_data.get('client_secret'),
                scopes=self.scopes
            )

            # 토큰 만료 확인 및 갱신
            self.refresh_if_needed()

            # YouTube API 클라이언트 초기화
            self.youtube = build('youtube', 'v3', credentials=self.credentials)

            print("토큰 로드 성공")
            return self.credentials

        except Exception as e:
            print(f"토큰 로드 실패: {e}")
            return None

    def save_tokens(self) -> None:
        """토큰 파일로 저장"""
        if not self.credentials:
            return

        token_data = {
            'access_token': self.credentials.token,
            'refresh_token': self.credentials.refresh_token,
            'token_uri': self.credentials.token_uri,
            'client_id': self.credentials.client_id,
            'client_secret': self.credentials.client_secret,
            'scopes': self.credentials.scopes,
            'expiry': self.credentials.expiry.isoformat() if self.credentials.expiry else None,
            'saved_at': datetime.now().isoformat(),
            'last_used': datetime.now().isoformat()
        }

        try:
            with open(self.token_file, 'w') as f:
                json.dump(token_data, f, indent=2)
            print("토큰 저장 완료")
        except Exception as e:
            print(f"토큰 저장 실패: {e}")

    def refresh_if_needed(self) -> None:
        """액세스 토큰 만료 확인 및 자동 갱신"""
        if not self.credentials:
            return

        # 만료 5분 전에 미리 갱신
        if self.credentials.expired or (
            self.credentials.expiry and
            datetime.now() >= self.credentials.expiry - timedelta(minutes=5)
        ):
            try:
                print("액세스 토큰 갱신 필요")
                self.refresh_access_token()
            except Exception as e:
                print(f"토큰 갱신 실패: {e}")
        else:
            if self.credentials.expiry:
                remaining = self.credentials.expiry - datetime.now()
                print(f"액세스 토큰 유효 시간: {remaining.seconds // 60}분 남음")

    def refresh_access_token(self) -> None:
        """리프레시 토큰으로 액세스 토큰 갱신"""
        if not self.credentials or not self.credentials.refresh_token:
            raise Exception("리프레시 토큰 없음")

        try:
            # 토큰 갱신
            request = google.auth.transport.requests.Request()
            self.credentials.refresh(request)

            # 갱신된 토큰 저장
            self.save_tokens()

            print(f"액세스 토큰 갱신 성공")
            print(f"새 만료 시간: {self.credentials.expiry}")

        except Exception as e:
            if 'invalid_grant' in str(e) or 'Token has been expired or revoked' in str(e):
                print("리프레시 토큰 만료 - 재인증 필요")
                raise Exception("REFRESH_TOKEN_EXPIRED")
            raise e

    def generate_auth_flow(self, redirect_uri: str = 'http://localhost:8080') -> Flow:
        """OAuth2 인증 플로우 생성"""
        flow = Flow.from_client_secrets_file(
            self.client_secrets_file,
            scopes=self.scopes,
            redirect_uri=redirect_uri
        )
        return flow

    def exchange_code_for_tokens(self, auth_code: str, redirect_uri: str = 'http://localhost:8080') -> Credentials:
        """인증 코드를 토큰으로 교환"""
        flow = self.generate_auth_flow(redirect_uri)
        flow.fetch_token(code=auth_code)

        self.credentials = flow.credentials
        self.save_tokens()

        # YouTube API 클라이언트 초기화
        self.youtube = build('youtube', 'v3', credentials=self.credentials)

        print("토큰 교환 성공")
        return self.credentials

    def check_token_health(self) -> bool:
        """토큰 상태 체크 (6개월 미사용 방지)"""
        if not self.youtube:
            print("YouTube 클라이언트 초기화 필요")
            return False

        try:
            # 간단한 API 호출로 토큰 검증
            response = self.youtube.channels().list(
                part='id',
                mine=True
            ).execute()

            if response.get('items'):
                print("토큰 상태: 정상")

                # last_used 업데이트
                if os.path.exists(self.token_file):
                    with open(self.token_file, 'r') as f:
                        token_data = json.load(f)
                    token_data['last_used'] = datetime.now().isoformat()
                    with open(self.token_file, 'w') as f:
                        json.dump(token_data, f, indent=2)

                return True

        except HttpError as e:
            if e.resp.status == 401:
                print("401 에러 - 토큰 갱신 시도")
                try:
                    self.refresh_access_token()
                    return self.check_token_health()  # 재시도
                except Exception as refresh_error:
                    if str(refresh_error) == "REFRESH_TOKEN_EXPIRED":
                        return False
                    raise refresh_error
            raise e

        return False

    def _auto_refresh_worker(self, interval_minutes: int = 50):
        """자동 토큰 갱신 워커 스레드"""
        while not self.stop_threads:
            try:
                self.refresh_if_needed()
                print(f"[{datetime.now()}] 토큰 체크 완료")
            except Exception as e:
                print(f"자동 갱신 실패: {e}")

            # 지정된 간격만큼 대기
            for _ in range(interval_minutes * 60):
                if self.stop_threads:
                    break
                time.sleep(1)

    def _health_check_worker(self, interval_days: int = 7):
        """토큰 헬스 체크 워커 스레드"""
        while not self.stop_threads:
            try:
                self.check_token_health()
                print(f"[{datetime.now()}] 헬스 체크 완료")
            except Exception as e:
                print(f"헬스 체크 실패: {e}")

            # 지정된 일수만큼 대기
            for _ in range(interval_days * 24 * 60 * 60):
                if self.stop_threads:
                    break
                time.sleep(1)

    def start_auto_refresh(self, interval_minutes: int = 50):
        """자동 토큰 갱신 시작"""
        if self.refresh_thread and self.refresh_thread.is_alive():
            print("이미 자동 갱신이 실행 중")
            return

        self.stop_threads = False
        self.refresh_thread = threading.Thread(
            target=self._auto_refresh_worker,
            args=(interval_minutes,),
            daemon=True
        )
        self.refresh_thread.start()
        print(f"자동 토큰 갱신 시작 ({interval_minutes}분 간격)")

    def start_health_check(self, interval_days: int = 7):
        """주기적 헬스 체크 시작"""
        if self.health_check_thread and self.health_check_thread.is_alive():
            print("이미 헬스 체크가 실행 중")
            return

        self.stop_threads = False
        self.health_check_thread = threading.Thread(
            target=self._health_check_worker,
            args=(interval_days,),
            daemon=True
        )
        self.health_check_thread.start()
        print(f"토큰 헬스 체크 시작 ({interval_days}일 간격)")

    def stop(self):
        """모든 백그라운드 작업 중지"""
        self.stop_threads = True
        print("백그라운드 작업 중지 중...")

        if self.refresh_thread:
            self.refresh_thread.join(timeout=5)
        if self.health_check_thread:
            self.health_check_thread.join(timeout=5)

        print("모든 작업 중지 완료")

    def get_channel_info(self) -> Optional[Dict]:
        """채널 정보 가져오기 (테스트용)"""
        if not self.youtube:
            return None

        try:
            response = self.youtube.channels().list(
                part='snippet,statistics',
                mine=True
            ).execute()

            if response.get('items'):
                channel = response['items'][0]
                return {
                    'title': channel['snippet']['title'],
                    'description': channel['snippet']['description'],
                    'subscribers': channel['statistics'].get('subscriberCount', 'N/A'),
                    'videos': channel['statistics'].get('videoCount', 'N/A')
                }
        except Exception as e:
            print(f"채널 정보 조회 실패: {e}")
            return None


# Flask 웹 서버 통합 예제
def create_flask_app(token_manager: YouTubeTokenManager):
    """Flask 앱 생성 및 라우트 설정"""
    from flask import Flask, request, redirect, jsonify

    app = Flask(__name__)

    @app.route('/auth/youtube')
    def auth_youtube():
        """YouTube 인증 시작"""
        flow = token_manager.generate_auth_flow(
            redirect_uri=request.url_root + 'auth/youtube/callback'
        )
        auth_url, _ = flow.authorization_url(
            access_type='offline',  # 리프레시 토큰 받기
            prompt='consent'  # 리프레시 토큰 재발급 보장
        )
        return redirect(auth_url)

    @app.route('/auth/youtube/callback')
    def auth_youtube_callback():
        """인증 콜백 처리"""
        auth_code = request.args.get('code')
        if not auth_code:
            return "인증 코드 없음", 400

        try:
            token_manager.exchange_code_for_tokens(
                auth_code,
                redirect_uri=request.url_root + 'auth/youtube/callback'
            )
            return "인증 성공! 토큰이 저장되었습니다."
        except Exception as e:
            return f"인증 실패: {e}", 500

    @app.route('/api/token-status')
    def token_status():
        """토큰 상태 확인"""
        try:
            is_healthy = token_manager.check_token_health()
            creds = token_manager.credentials

            return jsonify({
                'healthy': is_healthy,
                'has_refresh_token': bool(creds and creds.refresh_token),
                'access_token_expiry': creds.expiry.isoformat() if creds and creds.expiry else None
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/channel-info')
    def channel_info():
        """채널 정보 조회"""
        info = token_manager.get_channel_info()
        if info:
            return jsonify(info)
        return jsonify({'error': '채널 정보 조회 실패'}), 500

    return app


# 사용 예제
def main():
    # 토큰 매니저 초기화
    manager = YouTubeTokenManager(
        client_secrets_file='client_secrets.json',
        token_file='youtube-tokens.json'
    )

    # 토큰 로드
    credentials = manager.load_tokens()

    if not credentials:
        print("초기 인증이 필요합니다.")
        print("웹 서버를 시작하고 /auth/youtube로 접속하세요.")

        # Flask 앱 실행
        app = create_flask_app(manager)
        app.run(port=8080)
    else:
        # 자동 갱신 시작 (50분마다)
        manager.start_auto_refresh(50)

        # 헬스 체크 시작 (7일마다)
        manager.start_health_check(7)

        # 채널 정보 테스트
        channel_info = manager.get_channel_info()
        if channel_info:
            print(f"채널: {channel_info['title']}")
            print(f"구독자: {channel_info['subscribers']}")
            print(f"동영상 수: {channel_info['videos']}")

        # 프로그램 실행 유지
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n프로그램 종료")
            manager.stop()


if __name__ == '__main__':
    main()