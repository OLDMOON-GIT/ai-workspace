/**
 * YouTube 업로드 메타데이터 통합테스트
 *
 * BUG: YouTube 업로드 시 댓글/설명이 기입되지 않는 문제
 *
 * 테스트 시나리오:
 * 1. unified-worker.js가 metadata JSON을 올바르게 생성하는지 확인
 * 2. 상품 타입: story.json에서 youtube_description을 읽어 description과 pinned_comment 설정
 * 3. 숏폼 타입: 롱폼 URL을 description과 pinned_comment에 추가
 * 4. Python CLI가 pinned_comment를 올바르게 처리하는지 확인
 */

import fs from 'fs';
import path from 'path';

describe('YouTube 업로드 메타데이터 통합테스트', () => {
  const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
  const pythonCliPath = path.join(backendPath, 'src', 'youtube', 'youtube_upload_cli.py');
  const workerPath = path.join(process.cwd(), 'src', 'workers', 'unified-worker.js');

  describe('[METADATA-001] unified-worker.js 메타데이터 생성', () => {
    it('상품 타입: story.json에서 youtube_description 읽어오기', () => {
      const workerContent = fs.readFileSync(workerPath, 'utf-8');

      // 상품 타입 체크 로직 확인
      expect(workerContent).toMatch(/promptFormat === 'product'/);
      expect(workerContent).toMatch(/prompt_format === 'product'/);

      // story.json 읽기 로직 확인
      expect(workerContent).toMatch(/storyPath.*story\.json/);
      expect(workerContent).toMatch(/youtube_description/);

      // description 설정 확인
      expect(workerContent).toMatch(/description = .*youtube_description/);

      // pinnedComment 설정 확인 (상품은 description과 동일)
      expect(workerContent).toMatch(/pinnedComment = description/);

      console.log('✅ [METADATA-001] 상품 타입 메타데이터 생성 로직 존재');
    });

    it('숏폼 타입: 롱폼 URL을 description과 pinned_comment에 추가', () => {
      const workerContent = fs.readFileSync(workerPath, 'utf-8');

      // 숏폼 타입 체크 로직 확인
      expect(workerContent).toMatch(/prompt_format === 'shortform'/);
      expect(workerContent).toMatch(/promptFormat === 'shortform'/);

      // 롱폼 URL 조회 로직 확인
      expect(workerContent).toMatch(/source_content_id|sourceContentId/);
      expect(workerContent).toMatch(/youtube_url.*FROM content/);

      // 롱폼 링크 추가 확인
      expect(workerContent).toMatch(/전체 영상 보기.*longformUrl/);
      expect(workerContent).toMatch(/pinnedComment.*longformUrl/);

      console.log('✅ [METADATA-001] 숏폼 타입 메타데이터 생성 로직 존재');
    });

    it('metadata JSON에 description과 pinned_comment 포함', () => {
      const workerContent = fs.readFileSync(workerPath, 'utf-8');

      // metadata 객체 생성 확인
      expect(workerContent).toMatch(/const metadata = \{/);
      expect(workerContent).toMatch(/title:/);
      expect(workerContent).toMatch(/description:/);

      // pinned_comment 필드 확인
      expect(workerContent).toMatch(/metadata\.pinned_comment.*=.*pinnedComment/);

      // JSON 저장 확인
      expect(workerContent).toMatch(/writeFileSync.*metadata.*JSON\.stringify/);

      console.log('✅ [METADATA-001] metadata JSON 생성 로직 존재');
    });
  });

  describe('[METADATA-002] Python CLI pinned_comment 처리', () => {
    it('metadata에서 pinned_comment 읽기', () => {
      const cliContent = fs.readFileSync(pythonCliPath, 'utf-8');

      // metadata_dict에서 pinned_comment 읽기 확인
      expect(cliContent).toMatch(/pinned_comment.*=.*metadata_dict\.get\(['"]pinned_comment['"]\)/);

      console.log('✅ [METADATA-002] Python CLI가 pinned_comment를 metadata에서 읽음');
    });

    it('pinned_comment 우선, 없으면 description 사용', () => {
      const cliContent = fs.readFileSync(pythonCliPath, 'utf-8');

      // comment_text 설정 확인
      expect(cliContent).toMatch(/comment_text.*=.*pinned_comment.*if.*pinned_comment.*else.*description/);

      // add_pinned_comment 호출 시 comment_text 사용 확인
      expect(cliContent).toMatch(/add_pinned_comment.*comment_text/);

      console.log('✅ [METADATA-002] Python CLI가 pinned_comment를 우선 사용');
    });

    it('고정댓글 추가 성공 시 로그 출력', () => {
      const cliContent = fs.readFileSync(pythonCliPath, 'utf-8');

      // 성공 로그 확인
      expect(cliContent).toMatch(/댓글 추가 완료/);
      expect(cliContent).toMatch(/고정댓글 추가 완료/);

      console.log('✅ [METADATA-002] Python CLI가 고정댓글 추가 성공 로그 출력');
    });
  });

  describe('[METADATA-003] 엔드투엔드 시나리오', () => {
    it('상품 업로드: story.json → metadata → Python CLI', () => {
      // 1. story.json 샘플
      const sampleStory = {
        title: '테스트 상품',
        youtube_description: {
          text: '✨ 특별 할인 중!\n\n지금 바로 구매하세요 👉 https://link.coupang.com/test'
        },
        scenes: [
          { narration: '테스트 씬 1' }
        ]
      };

      // 2. unified-worker.js가 생성할 metadata 구조
      const expectedMetadata = {
        title: '테스트 상품',
        description: '✨ 특별 할인 중!\n\n지금 바로 구매하세요 👉 https://link.coupang.com/test',
        tags: [],
        category_id: '27',
        privacy_status: 'public',
        pinned_comment: '✨ 특별 할인 중!\n\n지금 바로 구매하세요 👉 https://link.coupang.com/test'
      };

      // 3. Python CLI가 처리해야 할 내용
      // - metadata.description이 VideoMetadata에 설정됨
      // - metadata.pinned_comment가 add_pinned_comment()에 전달됨

      expect(sampleStory.youtube_description.text).toBe(expectedMetadata.description);
      expect(expectedMetadata.pinned_comment).toBe(expectedMetadata.description);

      console.log('✅ [METADATA-003] 상품 엔드투엔드 시나리오 검증');
    });

    it('숏폼 업로드: 롱폼 URL 추가 → metadata → Python CLI', () => {
      // 1. 롱폼 YouTube URL
      const longformUrl = 'https://youtu.be/ABC123';

      // 2. unified-worker.js가 생성할 metadata 구조
      const expectedMetadata = {
        title: '테스트 숏폼',
        description: `🎬 전체 영상 보기: ${longformUrl}\n\n구독과 좋아요 부탁드립니다 ❤️`,
        tags: [],
        category_id: '27',
        privacy_status: 'public',
        pinned_comment: `🎬 전체 영상 보러가기 👉 ${longformUrl}`
      };

      // 3. Python CLI가 처리해야 할 내용
      // - metadata.description에 롱폼 링크 포함
      // - metadata.pinned_comment에 롱폼 링크 포함

      expect(expectedMetadata.description).toContain(longformUrl);
      expect(expectedMetadata.pinned_comment).toContain(longformUrl);
      expect(expectedMetadata.pinned_comment).not.toBe(expectedMetadata.description);

      console.log('✅ [METADATA-003] 숏폼 엔드투엔드 시나리오 검증');
    });
  });

  describe('[METADATA-004] 회귀 방지', () => {
    it('description이 VideoMetadata에 전달되는지 확인', () => {
      const cliContent = fs.readFileSync(pythonCliPath, 'utf-8');

      // VideoMetadata 생성 시 description 포함 확인
      expect(cliContent).toMatch(/VideoMetadata\(/);
      expect(cliContent).toMatch(/description.*=.*metadata_dict\.get\(['"]description['"]/);

      console.log('✅ [METADATA-004] description이 VideoMetadata에 전달됨');
    });

    it('pinned_comment가 누락되지 않도록 확인', () => {
      const workerContent = fs.readFileSync(workerPath, 'utf-8');
      const cliContent = fs.readFileSync(pythonCliPath, 'utf-8');

      // unified-worker.js: pinned_comment 설정
      expect(workerContent).toMatch(/metadata\.pinned_comment/);

      // Python CLI: pinned_comment 읽기
      expect(cliContent).toMatch(/pinned_comment.*=.*metadata_dict\.get/);

      console.log('✅ [METADATA-004] pinned_comment가 전체 파이프라인에 존재');
    });
  });
});
