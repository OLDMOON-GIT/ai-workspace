"""
Test email sending
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

# .env 파일에서 이메일 설정 가져오기
env_file = os.path.join(os.getcwd(), '.env')
if os.path.exists(env_file):
    print(f"[INFO] Loading .env file from {env_file}")
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()
                print(f"[INFO] Loaded {key.strip()}")
else:
    print(f"[WARN] .env file not found at {env_file}")

from_email = os.environ.get('GMAIL_USER')
password = os.environ.get('GMAIL_APP_PASSWORD')
to_email = "moony75@gmail.com"

print(f"\n[INFO] From: {from_email}")
print(f"[INFO] To: {to_email}")
print(f"[INFO] Password: {'*' * len(password) if password else 'NOT SET'}\n")

if not from_email or not password:
    print("[ERROR] Email credentials not found!")
    print("[INFO] Create .env file with:")
    print("GMAIL_USER=your-email@gmail.com")
    print("GMAIL_APP_PASSWORD=your-16-digit-app-password")
    exit(1)

try:
    # 이메일 생성
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = f"Test Email from Multi-AI Aggregator - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"

    body = """This is a test email from Multi-AI Aggregator.

If you receive this email, the email configuration is working correctly!

Test sent at: """ + datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    msg.attach(MIMEText(body, 'plain', 'utf-8'))

    # Gmail SMTP 서버로 전송
    print("[INFO] Connecting to Gmail SMTP server...")
    with smtplib.SMTP('smtp.gmail.com', 587) as server:
        print("[INFO] Starting TLS...")
        server.starttls()
        print("[INFO] Logging in...")
        server.login(from_email, password)
        print("[INFO] Sending email...")
        server.send_message(msg)

    print(f"\n[OK] Email sent successfully to {to_email}!")
    print("[OK] Check your inbox!")

except Exception as e:
    print(f"\n[ERROR] Failed to send email: {e}")
    print("\nTroubleshooting:")
    print("1. Check if GMAIL_USER and GMAIL_APP_PASSWORD are correct in .env")
    print("2. Make sure you're using App Password, not regular Gmail password")
    print("3. Get App Password at: https://myaccount.google.com/apppasswords")
