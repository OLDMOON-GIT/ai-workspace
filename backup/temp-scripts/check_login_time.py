import os
import sys
import time

timestamp_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.last_login_setup')

if os.path.exists(timestamp_file):
    mtime = os.path.getmtime(timestamp_file)
    if time.time() - mtime < 3600:  # 1시간 = 3600초
        print("SKIP")
        sys.exit(0)

print("RUN")
