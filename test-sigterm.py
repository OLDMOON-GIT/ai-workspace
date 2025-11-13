#!/usr/bin/env python3
"""SIGTERM 테스트"""
import signal
import sys
import time

print("프로세스 시작, PID:", flush=True)

def signal_handler(signum, frame):
    print(f"시그널 수신: {signum}", flush=True)
    raise KeyboardInterrupt

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

video_id = None
upload_success = False
was_cancelled = False

try:
    print("업로드 시뮬레이션 시작...", flush=True)
    time.sleep(2)

    video_id = "test_video_123"
    print(f"video_id 저장: {video_id}", flush=True)

    print("썸네일 업로드 중... (5초)", flush=True)
    time.sleep(5)

    upload_success = True
    print("모든 작업 완료!", flush=True)

except KeyboardInterrupt:
    print("KeyboardInterrupt 감지!", flush=True)
    was_cancelled = True

finally:
    print(f"finally 블록 실행: video_id={video_id}, upload_success={upload_success}", flush=True)
    if video_id and not upload_success:
        print(f"YouTube에서 비디오 삭제: {video_id}", flush=True)

if was_cancelled:
    print("결과: 취소됨", flush=True)
    sys.exit(1)
else:
    print("결과: 성공", flush=True)
    sys.exit(0)
