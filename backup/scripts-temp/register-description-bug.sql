-- YouTube description/comment 빈 문자열 버그 등록
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
  'YouTube description/comment가 빈 문자열로 전달됨',
  '상품 타입인데 story.json에 youtube_description이 없는 경우 description이 빈 문자열로 남아서 Python CLI로 전달됨. 결과적으로 comment_added: false 발생.

근본 원인:
- unified-worker.js Line 788: youtube_description.text 없으면 warn만 찍고 넘어감
- description 변수가 빈 문자열로 유지됨
- metadata.json에 빈 description 기록됨
- Python CLI에서 comment_text가 빈 문자열이 되어 댓글 추가 안 됨

수정사항:
1. Line 789-790: youtube_description 없으면 기본값 설정
2. Line 794-795: story.json 파싱 실패 시 기본값 설정
3. Line 798: story.json 파일 없으면 에러 (상품은 필수)
4. Line 749-757: content_setting에서 tags 읽기
5. Line 860-867: tags를 해시태그로 변환하여 description에 추가

기본 description: ''구독과 좋아요 부탁드립니다 ❤️''
',
  'resolved',
  JSON_OBJECT(
    'affected_files', JSON_ARRAY('src/workers/unified-worker.js'),
    'fixed_lines', JSON_ARRAY(789, 794, 798, 749, 860),
    'type', 'missing_default_value',
    'fix_commit', 'd354943'
  ),
  NOW(),
  NOW()
);
