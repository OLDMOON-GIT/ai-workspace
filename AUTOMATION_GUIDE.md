# 완전 자동화 시스템 사용 가이드

## 개요

제목 리스트를 등록하면 예약된 시간에 자동으로 대본 생성 → 영상 생성 → 유튜브 업로드 → 예약 퍼블리시까지 완전 자동으로 진행되는 시스템입니다.

## 주요 기능

1. **제목 리스트 관리**: 영상 제목을 미리 등록하고 관리
2. **스케줄 관리**: 각 제목에 대한 실행 시간 및 유튜브 공개 시간 설정
3. **자동 파이프라인**: 대본 → 영상 → 업로드 → 퍼블리시 자동 실행
4. **실시간 모니터링**: 각 단계별 진행 상황 및 로그 확인
5. **에러 알림**: 실패 시 자동으로 이메일 알림 (moony75@gmail.com)
6. **자동 재시도**: 실패 시 최대 3회까지 자동 재시도

## 시스템 구성

### 1. 데이터베이스 테이블

#### `video_titles` - 제목 리스트
```sql
- id: 고유 ID
- title: 영상 제목
- type: shortform | longform | product
- category: 카테고리 (선택)
- tags: 태그 (선택)
- status: pending | scheduled | processing | completed | failed
- priority: 우선순위 (숫자, 높을수록 우선)
- created_at, updated_at
```

#### `video_schedules` - 스케줄
```sql
- id: 고유 ID
- title_id: 제목 ID (FK)
- scheduled_time: 파이프라인 실행 시간
- youtube_publish_time: 유튜브 공개 시간 (선택)
- status: pending | processing | completed | failed | cancelled
- script_id, video_id, youtube_upload_id: 각 단계 결과 ID
- created_at, updated_at
```

#### `automation_pipelines` - 파이프라인 실행 기록
```sql
- id: 고유 ID
- schedule_id: 스케줄 ID (FK)
- stage: script | video | upload | publish
- status: pending | running | completed | failed
- error_message: 에러 메시지
- retry_count: 재시도 횟수
- started_at, completed_at, created_at
```

#### `automation_logs` - 실행 로그
```sql
- id: 고유 ID
- pipeline_id: 파이프라인 ID (FK)
- log_level: info | warn | error | debug
- message: 로그 메시지
- metadata: 추가 정보 (JSON)
- created_at
```

#### `automation_settings` - 시스템 설정
```sql
- key: 설정 키
- value: 설정 값
- description: 설명
- updated_at
```

**기본 설정값:**
- `enabled`: 'false' (스케줄러 활성화 여부)
- `check_interval`: '60' (스케줄 체크 간격, 초)
- `max_retry`: '3' (최대 재시도 횟수)
- `alert_email`: 'moony75@gmail.com' (알림 이메일)
- `default_youtube_privacy`: 'private' (유튜브 기본 공개 설정)

### 2. API 엔드포인트

#### 제목 관리 (`/api/automation/titles`)
- `GET`: 모든 제목 조회
- `POST`: 새 제목 추가
- `PATCH`: 제목 수정
- `DELETE`: 제목 삭제

#### 스케줄 관리 (`/api/automation/schedules`)
- `GET`: 모든 스케줄 조회
- `GET ?id=xxx`: 특정 스케줄 상세 (파이프라인 포함)
- `POST`: 새 스케줄 추가
- `PATCH`: 스케줄 수정
- `DELETE`: 스케줄 삭제

#### 스케줄러 제어 (`/api/automation/scheduler`)
- `GET`: 스케줄러 상태 확인
- `POST`: 스케줄러 시작/중지
  ```json
  { "action": "start" | "stop" }
  ```
- `PATCH`: 스케줄러 설정 업데이트
  ```json
  {
    "settings": {
      "check_interval": "60",
      "max_retry": "3",
      "alert_email": "moony75@gmail.com"
    }
  }
  ```

### 3. UI 페이지

#### `/automation` - 메인 관리 페이지
- 스케줄러 상태 및 제어
- 제목 리스트 관리 (추가/삭제)
- 스케줄 관리 (추가/삭제)
- 전체 스케줄 목록 및 상태 확인

#### `/automation/pipeline/[id]` - 파이프라인 상세
- 각 단계별 실행 상태 (대본/영상/업로드/퍼블리시)
- 실시간 로그 스트림
- 에러 정보 및 재시도 횟수

## 사용 방법

### 1. 초기 설정

1. 데이터베이스 초기화
   - 첫 페이지 접속 시 자동으로 테이블 생성

2. 이메일 알림 설정
   - `automation_settings` 테이블의 `alert_email` 값 확인/수정

### 2. 제목 등록

1. `/automation` 페이지 접속
2. "새 제목 추가" 섹션에서:
   - 제목 입력
   - 타입 선택 (숏폼/롱폼/상품)
   - 카테고리, 태그 입력 (선택)
   - "추가" 버튼 클릭

### 3. 스케줄 등록

1. 제목 리스트에서 사용할 제목 선택
2. "새 스케줄 추가" 섹션에서:
   - 제목 선택
   - 실행 시간 설정 (파이프라인 시작 시간)
   - 유튜브 공개 시간 설정 (선택, 비공개→공개 전환 시간)
   - "스케줄 추가" 버튼 클릭

### 4. 스케줄러 시작

1. "스케줄러 상태" 섹션에서 "시작" 버튼 클릭
2. 스케줄러가 60초마다 예약된 작업 확인
3. 실행 시간이 된 스케줄 자동 처리

### 5. 진행 상황 모니터링

1. 메인 페이지에서 각 스케줄의 상태 확인:
   - `pending`: 대기 중
   - `processing`: 실행 중
   - `completed`: 완료
   - `failed`: 실패

2. "상세" 버튼 클릭하여 파이프라인 상세 페이지 이동
3. 각 단계별 진행 상황 및 로그 확인

## 파이프라인 단계

### Stage 1: 대본 생성 (`script`)
- 제목과 타입을 기반으로 AI 대본 생성
- API: `/api/scripts/generate`
- 결과: `script_id`

### Stage 2: 영상 생성 (`video`)
- 생성된 대본으로 영상 제작
- 이미지 생성, TTS, 자막, 병합
- 결과: `video_id`

### Stage 3: 유튜브 업로드 (`upload`)
- 생성된 영상을 유튜브에 업로드
- 기본값: 비공개 (private)
- 결과: `youtube_upload_id`, `video_url`

### Stage 4: 유튜브 퍼블리시 (`publish`)
- `youtube_publish_time`이 설정된 경우
- 해당 시간에 비공개 → 공개로 전환
- 설정 안 된 경우: 즉시 완료

## 에러 처리

### 자동 재시도
- 각 단계 실패 시 최대 3회 자동 재시도
- 재시도 간격: 5-10초

### 에러 알림
실패 시 `moony75@gmail.com`으로 이메일 발송:
- 스케줄 ID
- 실패 단계
- 에러 메시지
- 제목, 타입, 예약 시간 등 Context 정보

### 로그 기록
모든 실행 과정은 `automation_logs` 테이블에 기록:
- `info`: 일반 정보
- `warn`: 경고 (재시도 등)
- `error`: 에러
- `debug`: 디버그 정보

## 주의사항

### 1. 영상 생성 API 미구현
현재 Stage 2 (영상 생성)는 임시 코드입니다.
실제 자동화를 위해서는 다음이 필요합니다:
```typescript
// TODO: 영상 생성 API 구현
POST /api/videos/generate
{
  "scriptId": "script_xxx",
  "autoStart": true
}
```

### 2. 유튜브 API 통합 필요
현재 Stage 3, 4 (유튜브 업로드/퍼블리시)는 임시 코드입니다.
YouTube Data API v3 통합 필요:
- OAuth 2.0 인증
- `videos.insert` (업로드)
- `videos.update` (공개 설정 변경)

### 3. 서버 재시작
서버 재시작 시 스케줄러도 재시작해야 합니다.
자동 시작을 위해 다음 코드 추가:
```typescript
// app/layout.tsx 또는 middleware.ts
import { startAutomationScheduler } from '@/lib/automation-scheduler';

if (process.env.NODE_ENV === 'production') {
  startAutomationScheduler();
}
```

### 4. 리소스 관리
- 동시에 너무 많은 작업이 실행되지 않도록 주의
- 시간 간격을 충분히 두고 스케줄 설정
- 서버 리소스 모니터링

## 트러블슈팅

### 스케줄러가 작동하지 않음
1. 스케줄러 상태 확인: "실행 중"인지 확인
2. `automation_settings`의 `enabled` 확인: 'true'인지 확인
3. 서버 로그 확인

### 파이프라인 실패
1. `/automation/pipeline/[id]` 페이지에서 에러 확인
2. 로그에서 구체적인 에러 메시지 확인
3. 실패 단계 재실행 또는 스케줄 재등록

### 이메일 알림이 오지 않음
1. `email.ts`의 SendGrid 설정 확인
2. API 키 유효성 확인
3. 이메일 주소 확인

## 향후 개선 사항

1. **영상 생성 자동화 완성**
   - 스크립트에서 영상 생성 API 개발
   - 자동 이미지 생성 통합

2. **유튜브 API 통합**
   - OAuth 인증 구현
   - 자동 업로드 및 예약 퍼블리시

3. **고급 스케줄링**
   - 반복 스케줄 (매일, 매주)
   - 우선순위 큐
   - 리소스 제한 (동시 실행 개수)

4. **모니터링 강화**
   - 대시보드 (통계, 성공률)
   - 실시간 알림 (Slack, Discord)
   - 성능 메트릭

5. **배치 작업**
   - 한 번에 여러 제목 스케줄 등록
   - CSV 임포트
   - 템플릿 기반 제목 생성

## 문의

시스템 관련 문의: moony75@gmail.com
