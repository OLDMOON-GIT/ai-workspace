#!/usr/bin/env node
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

// Get next bug ID
await conn.execute(`UPDATE bug_sequence SET next_number = next_number + 1 WHERE id = 1`);
const [rows] = await conn.execute(`SELECT next_number FROM bug_sequence WHERE id = 1`);
const nextNum = rows[0].next_number;
const bugId = `BTS-${String(nextNum).padStart(7, '0')}`;

const title = '대본 생성 Chrome을 이미지 크롤링 방식으로 실행';

const summary = `대본(스크립트) 생성 시 Chrome을 이미지 크롤링과 동일한 방식으로 실행하도록 통일.

현재:
- 이미지 크롤링: Selenium + Chrome 디버깅 모드 (--remote-debugging-port=9222)
- 대본 생성: 별도 실행 방식 (확인 필요)

요구사항:
- 대본 생성도 이미지 크롤링과 동일한 Chrome 프로필 사용
- 디버깅 모드로 실행하여 세션 공유
- 로그인 세션 유지 및 안정성 향상`;

const metadata = {
  type: 'spec',
  severity: 'MEDIUM',
  priority: 'MEDIUM',
  category: 'automation-improvement',
  source: 'script generation',
  related_files: [
    'trend-video-backend/src/scripts/script_generator.py',
    'trend-video-backend/src/image_crawler/image_crawler_working.py',
    'trend-video-backend/.chrome-automation-profile'
  ],
  full_content: `## 📋 기본 정보

- **타입**: SPEC (개선 사양)
- **생성일**: ${new Date().toLocaleString('ko-KR')}
- **우선순위**: 🟡 **MEDIUM**
- **카테고리**: automation-improvement
- **관련 파일**:
  - \`trend-video-backend/src/scripts/script_generator.py\`
  - \`trend-video-backend/src/image_crawler/image_crawler_working.py\`
  - \`trend-video-backend/.chrome-automation-profile\`

## 요구사항

대본(스크립트) 생성 시 Chrome 실행 방식을 이미지 크롤링과 동일하게 통일

### 현재 상황

**이미지 크롤링 (작동 방식):**
\`\`\`python
# Selenium 사용
# Chrome을 디버깅 모드로 별도 실행
subprocess.Popen([
    chrome_exe,
    "--remote-debugging-port=9222",
    f"--user-data-dir={profile_dir}"  # .chrome-automation-profile
])

# 이미 실행 중인 Chrome에 연결
chrome_options = Options()
chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
driver = webdriver.Chrome(service=service, options=chrome_options)
\`\`\`

**대본 생성 (현재 방식 - 확인 필요):**
- Claude AI 등 AI 서비스 호출
- Chrome 실행 방식이 이미지 크롤링과 다를 가능성

### 원하는 동작

1. **Chrome 프로필 공유**
   - \`.chrome-automation-profile\` 프로필 공통 사용
   - 모든 자동화 작업이 같은 세션 공유

2. **디버깅 모드 실행**
   - \`--remote-debugging-port=9222\`로 실행
   - 이미 실행 중인 Chrome에 연결

3. **세션 유지**
   - Claude.ai, ChatGPT 등 로그인 세션 유지
   - 재로그인 없이 작업 가능

## 구현 방안

### 1. 공통 Chrome 유틸리티 생성

\`\`\`python
# trend-video-backend/src/utils/chrome_manager.py

import subprocess
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

class ChromeManager:
    """Chrome 자동화 프로필 관리자"""

    @staticmethod
    def get_profile_path():
        """프로젝트 루트의 .chrome-automation-profile 경로 반환"""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(script_dir))
        return os.path.join(project_root, '.chrome-automation-profile')

    @staticmethod
    def is_chrome_running():
        """Chrome 디버깅 포트 활성화 여부 확인"""
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 9222))
        sock.close()
        return result == 0

    @staticmethod
    def launch_chrome_debug():
        """Chrome을 디버깅 모드로 실행"""
        if ChromeManager.is_chrome_running():
            print("✅ Chrome already running in debug mode")
            return

        chrome_exe = "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe"
        profile_dir = ChromeManager.get_profile_path()

        subprocess.Popen([
            chrome_exe,
            "--remote-debugging-port=9222",
            f"--user-data-dir={profile_dir}"
        ])
        print("🚀 Chrome launched in debug mode")

    @staticmethod
    def connect_to_chrome():
        """실행 중인 Chrome에 Selenium 연결"""
        ChromeManager.launch_chrome_debug()

        service = Service(ChromeDriverManager().install())
        chrome_options = Options()
        chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        return driver
\`\`\`

### 2. 이미지 크롤러 수정

\`\`\`python
# image_crawler_working.py
from utils.chrome_manager import ChromeManager

def main():
    # 기존 코드 대체
    driver = ChromeManager.connect_to_chrome()

    # ... 크롤링 로직
\`\`\`

### 3. 스크립트 생성기 수정

\`\`\`python
# script_generator.py
from utils.chrome_manager import ChromeManager

def generate_script_with_ai():
    # Chrome 연결
    driver = ChromeManager.connect_to_chrome()

    # Claude.ai 접속 (이미 로그인되어 있음)
    driver.get("https://claude.ai/")

    # ... AI 작업
\`\`\`

## 이점

1. **세션 공유**
   - 한 번 로그인하면 모든 자동화 작업에서 사용
   - Claude.ai 세션 만료 문제 해결

2. **일관성**
   - 모든 자동화 작업이 동일한 Chrome 환경 사용
   - 디버깅 및 유지보수 용이

3. **안정성**
   - 검증된 이미지 크롤링 방식 재사용
   - 봇 감지 우회 로직 공통 적용

## 체크리스트

- [ ] ChromeManager 유틸리티 클래스 생성
- [ ] 이미지 크롤러에서 ChromeManager 사용
- [ ] 스크립트 생성기에서 ChromeManager 사용
- [ ] setup_login.py도 통합 (Playwright → Selenium)
- [ ] 모든 AI 자동화 작업에 적용
- [ ] 테스트: 이미지 크롤링 + 스크립트 생성 연속 실행
- [ ] 문서 업데이트

## 참고

- 이미지 크롤링은 현재 안정적으로 작동 중
- 같은 방식을 다른 자동화 작업에도 적용
- Chrome 프로필 통일로 로그인 세션 관리 단순화
`
};

await conn.execute(
  `INSERT INTO bugs (
    id, type, title, summary, status,
    metadata,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
  [
    bugId,
    'spec',
    title,
    summary,
    'open',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 스펙 등록 완료: ${bugId}`);
console.log(`📄 타입: SPEC`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
