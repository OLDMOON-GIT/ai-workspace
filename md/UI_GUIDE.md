# 영상제작/영상병합 UI 컴포넌트 완전 가이드

위치: src/app/page.tsx

---

## 1. 상태 관리 (State Management)

### 파일 업로드 관련 State
const [uploadedJson, setUploadedJson] = useState<File | null>(null);
const [uploadedImages, setUploadedImages] = useState<File[]>([]);
const [uploadedVideos, setUploadedVideos] = useState<File[]>([]);
const [isDraggingFiles, setIsDraggingFiles] = useState(false);
const [draggingCardIndex, setDraggingCardIndex] = useState<number | null>(null);
const [manuallyOrderedMedia, setManuallyOrderedMedia] = useState<Array<{type: 'image' | 'video'; file: File}>>([]);
const [isManualSort, setIsManualSort] = useState(false);
const [showUploadSection, setShowUploadSection] = useState(false);
const [productionMode, setProductionMode] = useState<'create' | 'merge'>('create');

---

## 2. 정렬 핸들러 함수 (Line 266-303)

### sortBySequence() - 파일명 시퀀스 번호 정렬
const sortBySequence = () => {
  let combined = [
    ...uploadedImages.map(file => ({ type: 'image' as const, file })),
    ...uploadedVideos.map(file => ({ type: 'video' as const, file }))
  ];

  combined = combined.sort((a, b) => {
    const seqA = extractSequence(a.file.name);
    const seqB = extractSequence(b.file.name);
    if (seqA !== null && seqB !== null) return seqA - seqB;
    if (seqA !== null) return -1;
    if (seqB !== null) return 1;
    return a.file.lastModified - b.file.lastModified;
  });

  setManuallyOrderedMedia(combined);
  setIsManualSort(false);
};

### sortByTimestamp() - 파일 생성시간 정렬
const sortByTimestamp = () => {
  let combined = [
    ...uploadedImages.map(file => ({ type: 'image' as const, file })),
    ...uploadedVideos.map(file => ({ type: 'video' as const, file }))
  ];
  combined = combined.sort((a, b) => a.file.lastModified - b.file.lastModified);
  setManuallyOrderedMedia(combined);
  setIsManualSort(false);
};

---

## 3. 모드 토글 버튼 (Line 2130-2154)

<button onClick={() => { setProductionMode('create'); handleRunAutomation(); }}>
  🎬 영상 제작
</button>

<button onClick={() => { setProductionMode('merge'); handleRunAutomation(); }}>
  🎞️ 영상 병합
</button>

---

## 4. 드래그앤드롭 파일 업로드 (VIDEO-MERGE 모드)

Line 3177-3644

### 주요 이벤트 핸들러:

onDragOver: isDraggingFiles = true (UI 피드백)
onDragLeave: isDraggingFiles = false
onDrop: 
  - 파일 분류: JSON, 이미지, 비디오
  - setUploadedJson() / setUploadedImages() / setUploadedVideos()
  - 중복 파일 필터링
  - 최대 50개 이미지 제한

onPaste:
  - e.clipboardData.getData('text')
  - JSON 자동 수정 (parseJsonSafely)
  - Blob -> File 변환

### 정렬 버튼 (업로드된 파일 있을 때만 표시)
<button onClick={sortBySequence}>순번순</button>
<button onClick={sortByTimestamp}>시간순</button>

### 이미지+비디오 프리뷰 그리드
- manuallyOrderedMedia.map() 반복
- aspect-[9/16] (기본) 또는 aspect-video
- 각 카드에 드래그 핸들 표시
- 삭제 버튼 (X) 우측 상단

### 카드 드래그 로직:
onDragStart: setDraggingCardIndex(globalIdx)
onDragOver: 이동 효과 표시
onDrop: 배열 재배치
  - splice를 이용한 위치 변경
  - manuallyOrderedMedia 업데이트
  - 원본 uploadedImages/Videos 동기화

---

## 5. 일반 파일 업로드 (CREATE 모드)

Line 3733-4120

### 구조:
- JSON + 이미지 업로드 영역 (imageSource === 'none')
- 이미지 소스 선택 버튼 (직접업로드, DALL-E, Imagen3)
- 드래그앤드롭 + 클립보드 붙여넣기
- 프리뷰 그리드 (위의 4번과 동일)

### 클립보드 붙여넣기 (이미지만):
onPaste:
  - e.clipboardData.items 필터링
  - 각 이미지를 timestamp 이름으로 재명명
  - clipboard_${Date.now()}.${ext}

---

## 6. 업로드된 파일 카드 (반복 구조)

manuallyOrderedMedia.map((item, globalIdx) => {
  return (
    <div draggable onDragStart/End/Over/Drop ...>
      <div className="aspect-[9/16]">
        {item.type === 'image' ? (
          <img src={URL.createObjectURL(item.file)} />
        ) : (
          <>
            <video src={URL.createObjectURL(item.file)} />
            <div className="play-icon">▶</div>
          </>
        )}
        <div className="drag-handle">≡</div>
        <button onClick={delete}>✕</button>
      </div>
      <div className="metadata">
        <p>{item.file.name}</p>
        <p>{file.size} KB • {type}</p>
      </div>
    </div>
  );
})

---

## 7. 파일 분류 로직 (반복)

const files = Array.from(e.dataTransfer.files);
const jsonFile = files.find(f => f.type === 'application/json' || f.name.endsWith('.json') || f.name.endsWith('.txt'));
const imageFiles = files.filter(f => f.type.startsWith('image/'));
const videoFiles = files.filter(f => f.type.startsWith('video/'));
const gdocFile = files.find(f => f.name.endsWith('.gdoc'));

if (gdocFile) {
  showToast('❌ Google Docs 파일(.gdoc)은 지원하지 않습니다.');
  return;
}

---

## 8. 주요 UI/UX 패턴

### 드래그 상태 표시
className={isDraggingFiles 
  ? 'border-purple-400 bg-purple-500/20' 
  : 'border-white/20 bg-white/5'}

### 파일 추가 보탄 (항상 활성화)
<label className="cursor-pointer bg-gradient-to-r from-purple-600 to-orange-600">
  추가 파일 선택
  <input type="file" multiple accept=".json,.txt,image/*,video/*" hidden />
</label>

### 전체 삭제 버튼
<button onClick={() => {
  setUploadedJson(null);
  setUploadedImages([]);
  setUploadedVideos([]);
}}>
  전체 삭제
</button>

### 빈 상태 메시지
📁 JSON/TXT 대본과 이미지/비디오 파일들을 한번에 드래그하세요

### 업로드 완료 상태
✅ 표시 + JSON 파일명 + 이미지 개수 + 정렬 버튼 + 프리뷰 그리드

---

## 9. 정렬 규칙 정리

### 자동 정렬 (useEffect)
- isManualSort = false일 때만 작동
- 시퀀스 번호 추출: /(?:scene[_-]?|^)(\d+)/i
- 정렬 순서:
  1. 시퀀스 있는 파일 (숫자순)
  2. 시퀀스 없는 파일 (생성시간순)

### 수동 정렬
- setIsManualSort(true) 설정
- 이후 자동 정렬 비활성화
- 명시적으로 다시 정렬 버튼 클릭 필요

### 새 파일 추가 시
- setIsManualSort(false) → 자동 정렬 재활성화

---

## 10. 핵심 제약사항

- 이미지 최대 50개 ([...prev, ...newFiles].slice(0, 50))
- 비디오 제한 없음
- .gdoc 파일 차단
- 중복 파일명 무시
- URL.createObjectURL() 메모리 누수 주의

