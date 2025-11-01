"""
Send error email notification for Claude AI Multi Aggregator
Called from Node.js with error details as JSON
"""
import os
import sys
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# .env 파일에서 이메일 설정 가져오기
env_file = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_file):
    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()

from_email = os.environ.get('GMAIL_USER')
password = os.environ.get('GMAIL_APP_PASSWORD')
to_email = "moony75@gmail.com"

if not from_email or not password:
    print(json.dumps({"success": False, "error": "Email credentials not found"}))
    sys.exit(1)

try:
    # JSON 입력 읽기
    if len(sys.argv) > 1:
        # Command line argument
        error_data = json.loads(sys.argv[1])
    else:
        # stdin
        error_data = json.loads(sys.stdin.read())

    # 이메일 생성
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = f"🚨 [Claude AI] 대본 생성 에러 발생 - {error_data.get('title', 'Unknown')}"

    body = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 Claude Local AI Multi Aggregator 에러 발생
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏰ 발생 시간: {error_data.get('timestamp', '')}
📝 작업 ID: {error_data.get('taskId', '')}
📌 대본 제목: {error_data.get('title', '')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 에러 메시지:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{error_data.get('errorMessage', '')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 표준 출력 (stdout):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{error_data.get('stdout', '(출력 없음)')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 에러 출력 (stderr):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{error_data.get('stderr', '(출력 없음)')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 가능한 원인:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Claude.ai 로그인 세션 만료
2. Python 환경 문제
3. 브라우저 자동화 실패 (Playwright/Selenium)
4. 네트워크 연결 문제
5. 프롬프트 파일 읽기/쓰기 오류

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 조치 필요 사항:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. multi-ai-aggregator 로그 확인
2. Claude.ai 로그인 상태 확인
3. Python 환경 및 의존성 확인
4. 브라우저 자동화 상태 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    msg.attach(MIMEText(body, 'plain', 'utf-8'))

    # Gmail SMTP 서버로 전송
    with smtplib.SMTP('smtp.gmail.com', 587) as server:
        server.starttls()
        server.login(from_email, password)
        server.send_message(msg)

    print(json.dumps({"success": True, "message": f"Email sent to {to_email}"}))
    sys.exit(0)

except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
    sys.exit(1)
