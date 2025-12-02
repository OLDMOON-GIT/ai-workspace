# 대본영상제작 스펙

## 개요
"대본영상제작"은 대본(script)을 기반으로 이미지를 생성하고, 이를 조합하여 영상을 자동으로 제작하는 기능입니다.

## 핵심 기능
1. **대본 저장**: content 테이블에 script_content로 저장
2. **이미지 생성**: Whisk/ImageFX/Crawl 등을 통해 이미지 자동 생성
3. **영상 제작**: 생성된 이미지 + TTS 음성으로 영상 합성
4. **유튜브 업로드**: 완성된 영상을 유튜브에 자동 업로드

## 데이터 흐름

### 1. 대본 생성 단계
- **위치**: `/api/scripts/generate`
- **동작**:
  1. Claude/GPT 등으로 대본 JSON 생성
  2. content 테이블에 저장 (script_content 컬럼)

#### 대본 JSON 구조
```json
{
  "title": "영상 제목",
  "metadata": {
    "category": "일반/상품",
    "genre": "shortform/longform"
  },
  "scenes": [
    {
      "scene_number": 1,
      "scene_type": "hook",
      "text": "나레이션 텍스트",
      "image_prompt": "이미지 생성용 프롬프트"
    }
  ],
  "product_info": {  // 상품 카테고리만
    "thumbnail": "상품 썸네일 URL",
    "deep_link": "쿠팡 딥링크"
  }
}
```

### 2. 이미지 생성 단계
- **위치**: 백엔드 `image_crawler_working.py`
- **트리거**: task_schedule 상태가 `waiting_for_upload`일 때

#### 이미지 소스 옵션
| 옵션 | 설명 | 사용처 |
|------|------|--------|
| `upload` | 사용자 직접 업로드 | 내 콘텐츠 |
| `whisk` | Google Whisk로 생성 | 자동화 |
| `imagefx` | Google ImageFX로 생성 | 자동화 |
| `crawl` | 웹 이미지 크롤링 | 자동화 |
| `dalle` | DALL-E 3로 생성 | 영상 제작 |
| `imagen3` | Imagen 3로 생성 | 영상 제작 |

#### 이미지 저장 위치
```
trend-video-backend/tasks/{script_id}/
├── story.json           # 대본 JSON
├── scene_00_hook.jpeg   # 씬 0 이미지 (hook)
├── scene_01_problem.jpeg
├── scene_02_solution.jpeg
├── scene_03_cta.jpeg
├── product_thumbnail.jpg # 상품 썸네일 (상품 카테고리만)
└── thumbnail.jpg        # 영상 썸네일 (선택)
```

#### 이미지 파일명 패턴
- `scene_{씬번호}_{씬타입}.{확장자}` - Whisk/ImageFX가 생성
- `scene_{씬번호}.{확장자}` - 업로드된 이미지
- `{숫자}.{확장자}` - 직접 업로드 (01.jpg, 02.png 등)

### 3. 영상 제작 단계
- **위치**: `/api/generate-video-upload` → Python `create_video_from_folder.py`
- **트리거**: 자동화 또는 수동 "영상 제작" 버튼

#### API 요청 파라미터
```typescript
{
  scriptId: string,      // content_id
  imageSource: 'none' | 'dalle' | 'imagen3',  // 'none' = 폴더에 있는 이미지 사용
  videoFormat: 'shortform' | 'longform',
  ttsVoice: string,      // TTS 음성 선택
}
```

#### imageSource 처리 로직
```typescript
// normalizeImageSource 함수
if (source === 'crawl' || source === 'whisk' || source === 'imagefx' || source === 'upload') {
  return 'none';  // 폴더에 있는 이미지 사용
}
```

#### 영상 제작 프로세스
1. tasks/{script_id}/ 폴더에서 이미지 파일 검색
2. story.json 로드
3. TTS 음성 생성 (Azure Edge TTS)
4. 이미지 + 음성으로 각 씬 영상 생성
5. 모든 씬 영상 병합
6. 자막 추가 (선택)
7. 최종 영상 저장

### 4. 유튜브 업로드 단계
- **위치**: `/api/automation/upload-youtube`
- **트리거**: task_schedule 상태가 `ready_to_upload`일 때

## 자동화 상태 흐름
```
pending → script_processing → waiting_for_upload → image_processing
       → video_processing → ready_to_upload → youtube_processing → completed
```

| 상태 | 설명 | 다음 단계 |
|------|------|----------|
| `pending` | 예약됨 | script_processing |
| `script_processing` | 대본 생성 중 | waiting_for_upload |
| `waiting_for_upload` | 이미지 대기 중 | image_processing |
| `image_processing` | 이미지 생성 중 | video_processing |
| `video_processing` | 영상 제작 중 | ready_to_upload |
| `ready_to_upload` | 업로드 대기 | youtube_processing |
| `youtube_processing` | 유튜브 업로드 중 | completed |
| `completed` | 완료 | - |

## 이미지 시퀀스 정렬 규칙

### 핵심 원칙: "시퀀스 > 시간순"

1. **시퀀스 번호 있으면** → 시퀀스 순서로 정렬
2. **시퀀스 번호 없으면** → 파일 수정 시간순

### 시퀀스 번호 추출 패턴 (우선순위)

```javascript
// 1. 숫자로 시작: "1.jpg", "02.png"
/^(\d+)\./

// 2. scene_XX_ 패턴: "scene_00_hook.jpeg" (Whisk/ImageFX)
/^scene_(\d+)_/

// 3. _숫자. 또는 -숫자. 패턴: "image_01.jpg"
/[_-](\d{1,3})\./

// 4. (숫자) 패턴: "Image_fx (47).jpg"
/\((\d+)\)/  // 단, /[_-]\w{8,}/ 없을 때만
```

### 적용 위치
- Frontend: `GET /api/tasks/[id]/images`
- Backend: `create_video_from_folder.py` `extract_sequence()`

## 관련 파일

### Frontend (trend-video-frontend)
| 파일 | 역할 |
|------|------|
| `src/app/api/generate-video-upload/route.ts` | 영상 생성 API |
| `src/app/api/videos/generate/route.ts` | 자동화용 영상 생성 wrapper |
| `src/app/api/automation/upload-media/route.ts` | 미디어 업로드 API |
| `src/lib/automation-scheduler.ts` | 자동화 스케줄러 |
| `src/lib/automation.ts` | 자동화 유틸리티 |

### Backend (trend-video-backend)
| 파일 | 역할 |
|------|------|
| `src/video_generator/create_video_from_folder.py` | 영상 생성 메인 |
| `src/image_crawler/image_crawler_working.py` | Whisk/ImageFX 이미지 생성 |

## DB 스키마

### content 테이블 (대본 저장)
```sql
content_id TEXT PRIMARY KEY,
user_id TEXT NOT NULL,
title TEXT,
script_content TEXT,    -- 대본 JSON
prompt_format TEXT,     -- shortform/longform/product
video_path TEXT,        -- 영상 경로 (완료 후)
thumbnail_path TEXT,    -- 썸네일 경로
status TEXT,            -- pending/processing/completed/failed
created_at TEXT,
updated_at TEXT
```

### task_schedule 테이블 (자동화 스케줄)
```sql
id TEXT PRIMARY KEY,
script_id TEXT,         -- content_id 참조
video_id TEXT,          -- 생성된 영상의 content_id
status TEXT,            -- 자동화 상태
media_mode TEXT,        -- whisk/imagefx/upload 등
scheduled_time TEXT,
created_at TEXT,
updated_at TEXT
```
