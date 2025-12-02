-- YouTube description/comment 버그 등록
INSERT INTO bugs (
  id,
  title,
  summary,
  status,
  metadata,
  created_at,
  updated_at
) VALUES (
  CONCAT('BUG-', UNIX_TIMESTAMP()),
  'YouTube description/comment가 설정되지 않음',
  'unified-worker.js에서 longform 타입의 경우 description 생성 로직이 없어서 빈 문자열로 전달되는 버그. Line 720에서 content.youtube_description을 읽으려 하지만 이 필드가 content 테이블에 없음. 상품이 아닌 경우 description이 설정되지 않음.\n\n수정사항:\n1. Line 720: description 빈 문자열로 초기화\n2. Line 722-731: content_setting에서 tags 읽기\n3. Line 771-774: 상품 아닌 경우 기본 description 설정\n4. Line 828-836: tags를 해시태그로 변환하여 추가',
  'resolved',
  JSON_OBJECT(
    'affected_files', JSON_ARRAY('src/workers/unified-worker.js'),
    'fixed_lines', JSON_ARRAY(720, 722, 771, 828),
    'type', 'missing_feature',
    'fix_commit', 'YouTube description 로직 수정'
  ),
  NOW(),
  NOW()
);
