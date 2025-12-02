# 리팩토링 스펙 문서

> ⚠️ **이 문서에 명시된 변경사항은 절대 되돌리면 안 됨**
>
> 여기 적힌 내용을 무시하고 코드를 수정하면 앱이 동작하지 않음

---

## 1. script_content 컬럼 삭제 (2025-11-28)

### 변경 사유
- 대본 내용이 DB에 저장되면 용량 문제 발생
- 파일 기반으로 이동하여 폴더 구조와 일관성 유지

### 핵심 규칙

| 항목 | 설명 |
|------|------|
| **삭제된 컬럼** | `content.script_content` |
| **migration** | `migrations/013_drop_script_content_column.sql` |
| **대체 방법** | `tasks/{content_id}/story.json` 파일에서 읽기 |
| **함수** | `getScriptContent(contentId)` in `src/lib/content.ts` |

### ❌ 절대 하면 안 되는 것

```sql
-- 이거 하면 에러남!!! 컬럼 없음!!!
SELECT script_content FROM content WHERE ...
UPDATE content SET script_content = ? WHERE ...
```

### ✅ 올바른 방법

```typescript
// 대본 읽기
import { getScriptContent } from '@/lib/content';
const script = getScriptContent(contentId);  // story.json에서 읽음

// 대본 저장
const storyPath = path.join(backendPath, 'tasks', contentId, 'story.json');
fs.writeFileSync(storyPath, JSON.stringify(storyJson, null, 2), 'utf-8');
```

### 영향받는 파일 (마커 추가됨)

- `src/lib/content.ts` - getScriptContent 함수
- `src/lib/automation-scheduler.ts` - 스케줄러에서 대본 읽기
- `src/app/api/my-scripts/route.ts` - 대본 목록 API
- `src/app/api/automation/get-story/route.ts` - story.json 조회 API
- `src/app/api/scripts/format/route.ts` - 대본 포맷팅 저장
- `src/app/api/scripts/status/[id]/route.ts` - 대본 상태 확인

---

## 2. 삭제된 컬럼 목록 (절대 다시 추가 금지)

| 테이블 | 컬럼명 | 삭제 날짜 | 대체 방법 |
|--------|--------|-----------|-----------|
| content | script_content | 2025-11-28 | story.json 파일 |
| content | use_claude_local | - | 제거됨 |
| content | tts_voice | - | 제거됨 |
| content | format | - | prompt_format 사용 |
| content | type | - | 제거됨 (Queue Spec v3) |

---

## 3. 영상 대본 보기 기능 (2025-11-28)

### 추가된 기능
- 완료된 영상 카드에 📄 대본 버튼 추가
- 클릭 시 story.json 내용을 모달로 표시
- 복사 기능 포함

### 위치
- `src/app/my-content/page.tsx`
  - `videoScriptModal` 상태
  - `handleViewVideoScript()` 함수
  - 영상 카드 버튼 영역에 📄 대본 버튼

---

## 변경 이력

| 날짜 | 작업 | 담당 |
|------|------|------|
| 2025-11-28 | script_content 파일 기반 전환 | Claude |
| 2025-11-28 | 영상 대본 보기 버튼 추가 | Claude |
