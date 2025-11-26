/**
 * 아키텍처 문서 자동 업데이트 (ERD + 시퀀스 다이어그램)
 * 매일 새벽 6시 실행
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, '../../trend-video-frontend');
const DOCS_PATH = path.join(FRONTEND_PATH, 'docs');

// ERD 업데이트 (별도 스크립트)
const { updateERDDocument } = require('./update-erd-daily');

function generateSequenceDiagrams() {
  console.log('📊 시퀀스 다이어그램 생성 중...');

  let doc = '# 시스템 시퀀스 다이어그램\n\n';
  doc += `> 🤖 자동 생성됨: ${new Date().toLocaleString('ko-KR')}\n\n`;
  doc += '---\n\n';

  // 1. 자동화 파이프라인
  doc += '## 1. 자동화 파이프라인 흐름\n\n';
  doc += '```mermaid\nsequenceDiagram\n';
  doc += '    participant User\n';
  doc += '    participant Frontend\n';
  doc += '    participant Scheduler\n';
  doc += '    participant Queue\n';
  doc += '    participant Backend\n';
  doc += '    participant AI\n\n';
  doc += '    User->>Frontend: 제목 등록 & 스케줄 설정\n';
  doc += '    Frontend->>Scheduler: video_titles, video_schedules 저장\n';
  doc += '    Scheduler->>Queue: 예약 시간 도래 시 큐 추가\n';
  doc += '    Queue->>Backend: 대본 생성 요청\n';
  doc += '    Backend->>AI: Claude API 호출\n';
  doc += '    AI-->>Backend: 대본 반환\n';
  doc += '    Backend->>Queue: scripts 테이블 저장\n';
  doc += '    Queue->>Backend: 이미지 생성 요청\n';
  doc += '    Backend->>AI: Whisk/DALL-E 호출\n';
  doc += '    AI-->>Backend: 이미지 반환\n';
  doc += '    Backend->>Queue: 이미지 저장\n';
  doc += '    Queue->>Backend: 영상 생성 요청\n';
  doc += '    Backend-->>Queue: 영상 완료\n';
  doc += '    Queue->>Backend: YouTube 업로드\n';
  doc += '    Backend->>Frontend: youtube_uploads 저장\n';
  doc += '    Frontend-->>User: 완료 알림\n';
  doc += '```\n\n';

  // 2. 영상 생성 워크플로우
  doc += '## 2. 영상 생성 워크플로우\n\n';
  doc += '```mermaid\nsequenceDiagram\n';
  doc += '    participant User\n';
  doc += '    participant Page\n';
  doc += '    participant API\n';
  doc += '    participant Backend\n';
  doc += '    participant Storage\n\n';
  doc += '    User->>Page: 대본 입력 & 미디어 업로드\n';
  doc += '    Page->>API: /api/generate-video-upload\n';
  doc += '    API->>Backend: Python 스크립트 호출\n';
  doc += '    Backend->>Storage: 이미지/비디오 처리\n';
  doc += '    Backend->>Backend: 병합 & TTS\n';
  doc += '    Backend->>Storage: 최종 영상 저장\n';
  doc += '    Backend-->>API: job_id 반환\n';
  doc += '    API-->>Page: 작업 생성 완료\n';
  doc += '    Page->>API: 폴링 /api/tasks/{id}\n';
  doc += '    API-->>Page: 진행률 업데이트\n';
  doc += '    Backend->>API: 완료 시 jobs 업데이트\n';
  doc += '    API-->>Page: status: completed\n';
  doc += '    Page-->>User: 다운로드 링크 표시\n';
  doc += '```\n\n';

  // 3. 큐 시스템
  doc += '## 3. 큐 시스템 처리\n\n';
  doc += '```mermaid\nsequenceDiagram\n';
  doc += '    participant Scheduler\n';
  doc += '    participant UnifiedQueue\n';
  doc += '    participant Pipeline\n';
  doc += '    participant Worker\n\n';
  doc += '    Scheduler->>UnifiedQueue: 새 작업 추가 (status: scheduled)\n';
  doc += '    UnifiedQueue->>Pipeline: 파이프라인 생성\n';
  doc += '    Pipeline->>Worker: 대본 생성 시작\n';
  doc += '    Worker->>UnifiedQueue: status: script_processing\n';
  doc += '    Worker-->>Pipeline: 대본 완료\n';
  doc += '    Pipeline->>UnifiedQueue: status: image_processing\n';
  doc += '    Worker->>Worker: 이미지 생성\n';
  doc += '    Worker-->>Pipeline: 이미지 완료\n';
  doc += '    Pipeline->>UnifiedQueue: status: video_processing\n';
  doc += '    Worker->>Worker: 영상 생성\n';
  doc += '    Worker-->>Pipeline: 영상 완료\n';
  doc += '    Pipeline->>UnifiedQueue: status: youtube_processing\n';
  doc += '    Worker->>Worker: YouTube 업로드\n';
  doc += '    Worker-->>Pipeline: 업로드 완료\n';
  doc += '    Pipeline->>UnifiedQueue: status: completed\n';
  doc += '```\n\n';

  // 4. 인증 흐름
  doc += '## 4. 사용자 인증 흐름\n\n';
  doc += '```mermaid\nsequenceDiagram\n';
  doc += '    participant User\n';
  doc += '    participant Browser\n';
  doc += '    participant API\n';
  doc += '    participant DB\n\n';
  doc += '    User->>Browser: 이메일/비밀번호 입력\n';
  doc += '    Browser->>API: POST /api/auth/login\n';
  doc += '    API->>DB: users 테이블 조회\n';
  doc += '    DB-->>API: 사용자 정보\n';
  doc += '    API->>API: 비밀번호 검증 (SHA256)\n';
  doc += '    API->>DB: sessions 테이블 생성\n';
  doc += '    DB-->>API: 세션 ID\n';
  doc += '    API-->>Browser: Set-Cookie: sessionId\n';
  doc += '    Browser-->>User: 로그인 완료\n';
  doc += '    User->>Browser: 페이지 접근\n';
  doc += '    Browser->>API: Cookie: sessionId\n';
  doc += '    API->>DB: sessions 조회\n';
  doc += '    DB-->>API: 유효한 세션\n';
  doc += '    API-->>Browser: 인증 성공\n';
  doc += '```\n\n';

  // 5. YouTube 업로드
  doc += '## 5. YouTube 업로드 흐름\n\n';
  doc += '```mermaid\nsequenceDiagram\n';
  doc += '    participant User\n';
  doc += '    participant Frontend\n';
  doc += '    participant API\n';
  doc += '    participant Backend\n';
  doc += '    participant YouTube\n\n';
  doc += '    User->>Frontend: 업로드 버튼 클릭\n';
  doc += '    Frontend->>API: POST /api/youtube/upload\n';
  doc += '    API->>Backend: upload_to_youtube.py\n';
  doc += '    Backend->>YouTube: OAuth 인증\n';
  doc += '    YouTube-->>Backend: 액세스 토큰\n';
  doc += '    Backend->>YouTube: 영상 업로드\n';
  doc += '    YouTube-->>Backend: video_id\n';
  doc += '    Backend->>API: youtube_uploads 저장\n';
  doc += '    API-->>Frontend: 업로드 완료\n';
  doc += '    Frontend-->>User: YouTube 링크 표시\n';
  doc += '```\n\n';

  doc += '---\n\n';
  doc += `*Last Updated: ${new Date().toLocaleString('ko-KR')}*\n`;

  const outputPath = path.join(DOCS_PATH, 'SEQUENCE_DIAGRAMS.md');
  fs.writeFileSync(outputPath, doc, 'utf8');
  console.log('✅ 시퀀스 다이어그램 생성 완료:', outputPath);
}

function generateArchitectureOverview() {
  console.log('📊 아키텍처 개요 문서 생성 중...');

  let doc = '# 시스템 아키텍처 개요\n\n';
  doc += `> 🤖 자동 생성됨: ${new Date().toLocaleString('ko-KR')}\n\n`;
  doc += '---\n\n';

  doc += '## 📁 프로젝트 구조\n\n';
  doc += '```\n';
  doc += 'workspace/\n';
  doc += '├── trend-video-frontend/    # Next.js 프론트엔드\n';
  doc += '│   ├── src/app/             # 페이지 & API 라우트\n';
  doc += '│   ├── src/components/      # React 컴포넌트\n';
  doc += '│   ├── src/lib/             # 유틸리티 & DB\n';
  doc += '│   └── data/                # SQLite DB & JSON\n';
  doc += '├── trend-video-backend/     # Python 백엔드\n';
  doc += '│   ├── src/video_generator/ # 영상 생성\n';
  doc += '│   ├── src/ai_aggregator/   # AI 통합\n';
  doc += '│   └── src/image_crawler/   # 이미지 수집\n';
  doc += '└── scripts/                 # 유틸리티 스크립트\n';
  doc += '```\n\n';

  doc += '## 🏗️ 기술 스택\n\n';
  doc += '### Frontend\n';
  doc += '- **Framework**: Next.js 15 (App Router)\n';
  doc += '- **UI**: React 18, TailwindCSS\n';
  doc += '- **State**: React Hooks\n';
  doc += '- **Toast**: react-hot-toast\n\n';

  doc += '### Backend\n';
  doc += '- **Language**: Python 3.11+\n';
  doc += '- **Video**: MoviePy, FFmpeg\n';
  doc += '- **TTS**: Edge-TTS\n';
  doc += '- **AI**: Claude API, OpenAI API\n\n';

  doc += '### Database\n';
  doc += '- **SQLite**: 구조화된 데이터 (47개 테이블)\n';
  doc += '- **JSON Files**: 설정 및 간단한 데이터\n\n';

  doc += '## 🔄 시스템 아키텍처 다이어그램\n\n';
  doc += '```mermaid\ngraph TB\n';
  doc += '    subgraph Client["🖥️ 클라이언트"]\n';
  doc += '        User[사용자]\n';
  doc += '        Browser[웹 브라우저]\n';
  doc += '    end\n\n';

  doc += '    subgraph Frontend["⚛️ Frontend (Next.js)"]\n';
  doc += '        Pages[Pages<br/>page.tsx, automation/page.tsx]\n';
  doc += '        Components[Components<br/>VideoCard, MediaUploadBox]\n';
  doc += '        API[API Routes<br/>/api/generate-video-upload]\n';
  doc += '    end\n\n';

  doc += '    subgraph Backend["🐍 Backend (Python)"]\n';
  doc += '        VideoGen[Video Generator<br/>MoviePy, FFmpeg]\n';
  doc += '        ImageCrawl[Image Crawler<br/>Whisk, DALL-E]\n';
  doc += '        AIAgg[AI Aggregator<br/>Claude, GPT-4]\n';
  doc += '        YouTubeUpload[YouTube Uploader<br/>OAuth 2.0]\n';
  doc += '    end\n\n';

  doc += '    subgraph Storage["💾 데이터 저장소"]\n';
  doc += '        SQLite[(SQLite DB<br/>47 테이블)]\n';
  doc += '        Files[(파일 시스템<br/>영상, 이미지, 음성)]\n';
  doc += '        JSON[(JSON Files<br/>설정, 세션)]\n';
  doc += '    end\n\n';

  doc += '    subgraph External["🌐 외부 서비스"]\n';
  doc += '        Claude[Claude API]\n';
  doc += '        OpenAI[OpenAI API]\n';
  doc += '        YouTube[YouTube API]\n';
  doc += '        Coupang[쿠팡 파트너스]\n';
  doc += '    end\n\n';

  doc += '    %% 연결\n';
  doc += '    User --> Browser\n';
  doc += '    Browser --> Pages\n';
  doc += '    Pages --> Components\n';
  doc += '    Components --> API\n';
  doc += '    API --> VideoGen\n';
  doc += '    API --> ImageCrawl\n';
  doc += '    API --> AIAgg\n';
  doc += '    API --> YouTubeUpload\n';
  doc += '    API --> SQLite\n';
  doc += '    API --> JSON\n';
  doc += '    VideoGen --> Files\n';
  doc += '    ImageCrawl --> Files\n';
  doc += '    VideoGen --> SQLite\n';
  doc += '    AIAgg --> Claude\n';
  doc += '    AIAgg --> OpenAI\n';
  doc += '    ImageCrawl --> OpenAI\n';
  doc += '    YouTubeUpload --> YouTube\n';
  doc += '    API --> Coupang\n';
  doc += '    SQLite --> API\n';
  doc += '    Files --> API\n';
  doc += '```\n\n';

  doc += '## 📊 주요 테이블 관계\n\n';
  doc += '- **users** ← sessions, jobs, scripts, credit_history\n';
  doc += '- **jobs** ← job_logs, youtube_uploads\n';
  doc += '- **scripts** ← script_logs\n';
  doc += '- **unified_queue** → automation_pipelines → automation_logs\n';
  doc += '- **video_titles** → video_schedules → unified_queue\n\n';

  doc += '## 🔐 보안\n\n';
  doc += '- 세션 기반 인증 (Cookie)\n';
  doc += '- 비밀번호 SHA256 해싱\n';
  doc += '- YouTube OAuth 2.0\n';
  doc += '- API 키 환경변수 관리\n\n';

  doc += '---\n\n';
  doc += `*Last Updated: ${new Date().toLocaleString('ko-KR')}*\n`;

  const outputPath = path.join(DOCS_PATH, 'ARCHITECTURE_OVERVIEW.md');
  fs.writeFileSync(outputPath, doc, 'utf8');
  console.log('✅ 아키텍처 개요 문서 생성 완료:', outputPath);
}

// 실행
if (require.main === module) {
  console.log('🚀 아키텍처 문서 전체 업데이트 시작...');
  console.log(`⏰ ${new Date().toLocaleString('ko-KR')}\n`);

  try {
    // 1. ERD 업데이트
    updateERDDocument();
    console.log('');

    // 2. 시퀀스 다이어그램 생성
    generateSequenceDiagrams();
    console.log('');

    // 3. 아키텍처 개요 생성
    generateArchitectureOverview();
    console.log('');

    console.log('✅ 모든 아키텍처 문서 업데이트 완료!');
  } catch (error) {
    console.error('❌ 업데이트 실패:', error);
    process.exit(1);
  }
}
