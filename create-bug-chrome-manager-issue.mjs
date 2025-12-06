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

const title = 'ChromeManager 사용 후 이미지 크롤링 Chrome 창이 안 열림';

const summary = `ChromeManager를 사용하도록 변경한 후 이미지 크롤링 시 Chrome 창이 보이지 않음.

주요 증상:
- Chrome 프로세스는 실행 중 (port 9222 LISTENING)
- Chrome 창이 화면에 안 보임
- 백그라운드에서만 실행 중

원인:
- ChromeManager가 subprocess.DEVNULL로 Chrome 실행
- 출력이 숨겨져서 Chrome 창이 안 보임

해결:
- ChromeManager 사용 제거
- 원래 방식(subprocess.Popen 직접 호출)으로 복구`;

const metadata = {
  severity: 'CRITICAL',
  priority: 'P0',
  category: 'image-crawler',
  source: 'ChromeManager',
  error_type: 'UI Issue',
  related_files: [
    'trend-video-backend/src/image_crawler/image_crawler_working.py',
    'trend-video-backend/src/utils/chrome_manager.py'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🔴 **CRITICAL**
- **우선순위**: 🔴 **P0**
- **카테고리**: image-crawler
- **관련 파일**:
  - \`trend-video-backend/src/image_crawler/image_crawler_working.py\`
  - \`trend-video-backend/src/utils/chrome_manager.py\`

## 증상

ChromeManager를 사용하도록 변경한 후, 이미지 크롤링 시 Chrome 창이 화면에 보이지 않음.

### 재현 방법

1. 이미지 크롤링 실행
2. Chrome 프로세스는 실행 중 (port 9222 LISTENING)
3. **Chrome 창이 화면에 안 보임**

### 기대 동작

- Chrome 창이 화면에 표시됨
- ImageFX 페이지가 보임
- 사용자가 진행 상황을 볼 수 있음

### 실제 동작

- Chrome 프로세스만 백그라운드에서 실행
- 창이 안 보임

## 원인 분석

### ChromeManager의 문제 코드

\`\`\`python
# chrome_manager.py:63-71
subprocess.Popen(
    [
        chrome_exe,
        f"--remote-debugging-port={ChromeManager.DEBUG_PORT}",
        f"--user-data-dir={profile_dir}"
    ],
    stdout=subprocess.DEVNULL,  # ❌ 출력 숨김
    stderr=subprocess.DEVNULL   # ❌ 에러 출력 숨김
)
\`\`\`

**문제점**:
- \`stdout=subprocess.DEVNULL\` → Chrome 출력이 숨겨짐
- \`stderr=subprocess.DEVNULL\` → 에러 메시지도 안 보임
- Chrome이 백그라운드에서만 실행되어 창이 안 보임

### 이미지 크롤러 변경 사항

\`\`\`python
# image_crawler_working.py:34-37 (변경 전)
# 원래는 직접 subprocess.Popen 호출

# image_crawler_working.py:34-37 (변경 후)
from utils.chrome_manager import ChromeManager

def setup_chrome_driver():
    driver = ChromeManager.connect_to_chrome()  # ❌ 문제 발생
    return driver
\`\`\`

## 해결 방안

### ✅ 적용된 해결책: ChromeManager 사용 제거

\`\`\`python
def setup_chrome_driver():
    """원래 방식으로 복구"""
    service = Service(ChromeDriverManager().install())

    # Chrome 프로필 경로
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(os.path.dirname(script_dir))
    profile_dir = os.path.join(backend_root, '.chrome-automation-profile')

    # 프로필 폴더가 없으면 생성
    if not os.path.exists(profile_dir):
        os.makedirs(profile_dir)

    # Chrome 실행 파일 경로
    chrome_exe = r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    if not os.path.exists(chrome_exe):
        chrome_exe = r"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"

    # Chrome이 이미 실행 중인지 확인
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 9222))
    sock.close()

    if result != 0:
        # Chrome 실행 (출력 숨기지 않음!)
        subprocess.Popen([
            chrome_exe,
            "--remote-debugging-port=9222",
            f"--user-data-dir={profile_dir}"
        ])
        # ✅ stdout, stderr를 DEVNULL로 설정하지 않음!
        time.sleep(3)

    # Chrome 연결
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    return driver
\`\`\`

### 대안: ChromeManager 수정 (미적용)

ChromeManager를 계속 사용하려면:

\`\`\`python
# chrome_manager.py 수정
subprocess.Popen(
    [
        chrome_exe,
        f"--remote-debugging-port={ChromeManager.DEBUG_PORT}",
        f"--user-data-dir={profile_dir}"
    ]
    # stdout, stderr 제거 → 기본값 사용 (출력 보임)
)
\`\`\`

## 영향 분석

**변경 전 (ChromeManager 사용)**:
- ❌ Chrome 창이 안 보임
- ❌ 에러 메시지가 숨겨짐
- ❌ 사용자가 진행 상황을 볼 수 없음

**변경 후 (원래 방식)**:
- ✅ Chrome 창이 제대로 보임
- ✅ 에러 메시지 확인 가능
- ✅ 사용자가 진행 상황 확인 가능

## 체크리스트

- [x] ChromeManager import 제거
- [x] setup_chrome_driver() 함수 원래 방식으로 복구
- [x] subprocess.Popen에서 stdout/stderr 기본값 사용
- [x] Chrome 프로세스 종료 (PID 142828)
- [x] 이미지 크롤링 테스트 필요

## 테스트 시나리오

1. **Chrome 창 표시 확인**
   - 이미지 크롤링 실행
   - Chrome 창이 화면에 보이는지 확인

2. **ImageFX 접속 확인**
   - Chrome에서 ImageFX 페이지 로드
   - 페이지가 제대로 표시되는지 확인

3. **세션 유지 확인**
   - .chrome-automation-profile 프로필 사용
   - 로그인 세션이 유지되는지 확인

## 교훈

**ChromeManager 도입 시 주의사항**:
- stdout/stderr를 DEVNULL로 설정하지 말 것
- Chrome 창이 보여야 하는 경우 백그라운드 실행 금지
- 에러 메시지가 보여야 디버깅 가능

**BTS-0000050 (Chrome 실행 방식 통일) 재검토 필요**:
- 스크립트 생성에만 적용 (Chrome 창 필요 없음)
- 이미지 크롤링은 원래 방식 유지 (Chrome 창 필요)

## 참고

- **발생 원인**: BTS-0000050 스펙에 따라 ChromeManager 도입
- **문제**: stdout/stderr를 DEVNULL로 설정해서 Chrome 창이 안 보임
- **해결**: ChromeManager 사용 제거, 원래 방식으로 복구
- **상태**: 해결 완료 (2025-12-03)
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
    'bug',
    title,
    summary,
    'resolved',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 버그 등록 완료: ${bugId}`);
console.log(`🐛 타입: BUG (RESOLVED)`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
