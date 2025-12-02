# 자동화 프로세스 관리 문제 수정

## 문제 상황
영상 생성이 완료되었는데도 진행 큐에 남아있고, 상태가 "processing"에서 변경되지 않는 문제

## 근본 원인

### Pipeline ID 불일치
1. **초기 자동화 시작 시** (`automation.ts:414`):
   - Pipeline ID 생성: `pipeline_1763299990220_video_bvfe8r7ji`

2. **이미지 업로드 후 재개 시** (`automation-scheduler.ts:1041`):
   - 새로운 Pipeline ID 생성: `schedule_1763299987869_44mws826a_video`
   - **문제**: 이 ID는 DB에 존재하지 않음!

3. **결과**:
   - `updatePipelineStatus()`가 존재하지 않는 ID로 UPDATE 시도
   - `addPipelineLog()`도 실패
   - `video_id`가 `video_schedules` 테이블에 저장되지 않음
   - 원래 pipeline은 "pending" 상태로 남음

## 수정 내용

### 1. Video Pipeline ID 수정 (`automation-scheduler.ts:1040-1051`)
```typescript
// 기존 코드 (잘못됨)
const videoPipelineId = schedule.id + '_video';

// 수정된 코드 (올바름)
const db = new Database(dbPath);
const videoPipeline = db.prepare(`
  SELECT id FROM automation_pipelines
  WHERE schedule_id = ? AND stage = 'video'
  LIMIT 1
`).get(schedule.id) as any;
db.close();

const videoPipelineId = videoPipeline?.id || (schedule.id + '_video');
console.log(`[Scheduler] Using video pipeline ID: ${videoPipelineId}`);
```

### 2. Upload Pipeline ID 수정 (`automation-scheduler.ts:1101-1111`)
동일한 방식으로 DB에서 기존 upload pipeline ID를 찾아서 사용

### 3. Publish Pipeline ID 수정 (`automation-scheduler.ts:1137-1147`)
동일한 방식으로 DB에서 기존 publish pipeline ID를 찾아서 사용

## 검증

### 테스트 결과
```
✅✅✅ 테스트 성공! ✅✅✅
수정된 방식은 올바른 pipeline ID를 찾습니다.
updatePipelineStatus 호출이 이제 정상 작동합니다.
```

### 테스트 파일
- `test-automation-pipeline-fix.js`: Pipeline ID 매칭 검증

## 기존 문제 해결

### 해결된 스케줄
- Schedule ID: `schedule_1763299987869_44mws826a`
- Video ID: `auto_1763300153613_wihr11l4g` (수동 업데이트 완료)
- Video Pipeline: `completed` 상태로 업데이트 완료

### 수동 수정 명령
```sql
UPDATE video_schedules
SET video_id = 'auto_1763300153613_wihr11l4g',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'schedule_1763299987869_44mws826a';

UPDATE automation_pipelines
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP
WHERE schedule_id = 'schedule_1763299987869_44mws826a'
  AND stage = 'video';
```

## 영향 범위
- ✅ 이미지 업로드 후 영상 생성 재개 시 올바른 pipeline 추적
- ✅ Pipeline 로그가 정상적으로 기록됨
- ✅ video_id가 DB에 정상 저장됨
- ✅ 진행 상태가 정확히 업데이트됨
- ✅ 완료된 작업이 큐에서 제거됨

## 추가 개선 사항
향후 고려사항:
1. Pipeline 생성 시 예측 가능한 ID 패턴 사용 (예: `{schedule_id}_{stage}`)
2. Pipeline ID를 `video_schedules` 테이블에 저장하여 조회 성능 향상
3. Pipeline 상태 변경 시 로그 강화
