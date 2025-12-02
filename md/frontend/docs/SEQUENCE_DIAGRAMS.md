# 시스템 시퀀스 다이어그램

> 🤖 자동 생성됨: 2025. 12. 2. 오후 12:50:33

---

## 1. 자동화 파이프라인 흐름

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Scheduler
    participant Queue
    participant Backend
    participant AI

    User->>Frontend: 제목 등록 & 스케줄 설정
    Frontend->>Scheduler: video_titles, video_schedules 저장
    Scheduler->>Queue: 예약 시간 도래 시 큐 추가
    Queue->>Backend: 대본 생성 요청
    Backend->>AI: Claude API 호출
    AI-->>Backend: 대본 반환
    Backend->>Queue: scripts 테이블 저장
    Queue->>Backend: 이미지 생성 요청
    Backend->>AI: Whisk/DALL-E 호출
    AI-->>Backend: 이미지 반환
    Backend->>Queue: 이미지 저장
    Queue->>Backend: 영상 생성 요청
    Backend-->>Queue: 영상 완료
    Queue->>Backend: YouTube 업로드
    Backend->>Frontend: youtube_uploads 저장
    Frontend-->>User: 완료 알림
```

## 2. 영상 생성 워크플로우

```mermaid
sequenceDiagram
    participant User
    participant Page
    participant API
    participant Backend
    participant Storage

    User->>Page: 대본 입력 & 미디어 업로드
    Page->>API: /api/generate-video-upload
    API->>Backend: Python 스크립트 호출
    Backend->>Storage: 이미지/비디오 처리
    Backend->>Backend: 병합 & TTS
    Backend->>Storage: 최종 영상 저장
    Backend-->>API: job_id 반환
    API-->>Page: 작업 생성 완료
    Page->>API: 폴링 /api/tasks/{id}
    API-->>Page: 진행률 업데이트
    Backend->>API: 완료 시 jobs 업데이트
    API-->>Page: status: completed
    Page-->>User: 다운로드 링크 표시
```

## 3. 큐 시스템 처리

```mermaid
sequenceDiagram
    participant Scheduler
    participant UnifiedQueue
    participant Pipeline
    participant Worker

    Scheduler->>UnifiedQueue: 새 작업 추가 (status: scheduled)
    UnifiedQueue->>Pipeline: 파이프라인 생성
    Pipeline->>Worker: 대본 생성 시작
    Worker->>UnifiedQueue: status: script_processing
    Worker-->>Pipeline: 대본 완료
    Pipeline->>UnifiedQueue: status: image_processing
    Worker->>Worker: 이미지 생성
    Worker-->>Pipeline: 이미지 완료
    Pipeline->>UnifiedQueue: status: video_processing
    Worker->>Worker: 영상 생성
    Worker-->>Pipeline: 영상 완료
    Pipeline->>UnifiedQueue: status: youtube_processing
    Worker->>Worker: YouTube 업로드
    Worker-->>Pipeline: 업로드 완료
    Pipeline->>UnifiedQueue: status: completed
```

## 4. 사용자 인증 흐름

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant API
    participant DB

    User->>Browser: 이메일/비밀번호 입력
    Browser->>API: POST /api/auth/login
    API->>DB: users 테이블 조회
    DB-->>API: 사용자 정보
    API->>API: 비밀번호 검증 (SHA256)
    API->>DB: sessions 테이블 생성
    DB-->>API: 세션 ID
    API-->>Browser: Set-Cookie: sessionId
    Browser-->>User: 로그인 완료
    User->>Browser: 페이지 접근
    Browser->>API: Cookie: sessionId
    API->>DB: sessions 조회
    DB-->>API: 유효한 세션
    API-->>Browser: 인증 성공
```

## 5. YouTube 업로드 흐름

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Backend
    participant YouTube

    User->>Frontend: 업로드 버튼 클릭
    Frontend->>API: POST /api/youtube/upload
    API->>Backend: upload_to_youtube.py
    Backend->>YouTube: OAuth 인증
    YouTube-->>Backend: 액세스 토큰
    Backend->>YouTube: 영상 업로드
    YouTube-->>Backend: video_id
    Backend->>API: youtube_uploads 저장
    API-->>Frontend: 업로드 완료
    Frontend-->>User: YouTube 링크 표시
```

---

*Last Updated: 2025. 12. 2. 오후 12:50:33*
