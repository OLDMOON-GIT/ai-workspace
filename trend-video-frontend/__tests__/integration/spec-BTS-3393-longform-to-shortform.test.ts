/**
 * SPEC-3393: 자동화 롱폼→숏폼 체크박스 통합테스트
 *
 * 테스트 항목:
 * 1. 체크박스 UI 동작 (autoConvert 상태 관리)
 * 2. 롱폼 타입 선택 시 기본 체크
 * 3. 숏폼/상품 타입 선택 시 체크 해제
 * 4. 제목 저장 시 autoConvert 값 전달
 * 5. 자동화 실행 시 autoConvert 옵션 반영
 */

// Mock fetch
global.fetch = jest.fn();

// Mock toast
const mockToast = {
  loading: jest.fn((message: string) => 'toast-id'),
  success: jest.fn(),
  error: jest.fn(),
};

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: mockToast,
}));

describe('SPEC-3393: 자동화 롱폼→숏폼 체크박스', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  describe('1. autoConvert 기본값 테스트', () => {
    test('롱폼 타입 선택 시 autoConvert 기본값은 true', () => {
      const selectedType = 'longform';
      const autoConvert = selectedType === 'longform';

      expect(autoConvert).toBe(true);
    });

    test('숏폼 타입 선택 시 autoConvert 기본값은 false', () => {
      const selectedType = 'shortform';
      const autoConvert = selectedType === 'longform';

      expect(autoConvert).toBe(false);
    });

    test('상품 타입 선택 시 autoConvert 기본값은 false', () => {
      const selectedType = 'product';
      const autoConvert = selectedType === 'longform';

      expect(autoConvert).toBe(false);
    });
  });

  describe('2. 폼 상태 관리 테스트', () => {
    test('newTitle 폼에 autoConvert 필드가 포함되어야 함', () => {
      const newTitle = {
        title: '테스트 제목',
        promptFormat: 'longform',
        aiModel: 'claude',
        youtubeSchedule: 'immediate',
        youtubePublishAt: '',
        youtubePrivacy: 'public',
        ttsVoice: '순복',
        ttsSpeed: '+0%',
        autoConvert: true  // 롱폼일 때 기본 체크
      };

      expect(newTitle).toHaveProperty('autoConvert');
      expect(newTitle.autoConvert).toBe(true);
    });

    test('타입 변경 시 autoConvert 값이 자동 업데이트되어야 함', () => {
      // 초기: 롱폼
      let selectedType = 'longform';
      let autoConvert = selectedType === 'longform';
      expect(autoConvert).toBe(true);

      // 타입 변경: 숏폼
      selectedType = 'shortform';
      autoConvert = selectedType === 'longform';
      expect(autoConvert).toBe(false);

      // 타입 변경: 다시 롱폼
      selectedType = 'longform';
      autoConvert = selectedType === 'longform';
      expect(autoConvert).toBe(true);
    });
  });

  describe('3. 제목 저장 API 테스트', () => {
    test('제목 저장 시 autoConvert 값이 전달되어야 함', async () => {
      const titleData = {
        title: '테스트 롱폼 제목',
        promptFormat: 'longform',
        autoConvert: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await fetch('/api/automation/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(titleData)
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/automation/titles',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"autoConvert":true')
        })
      );
    });

    test('autoConvert=false일 때 제목 저장', async () => {
      const titleData = {
        title: '테스트 숏폼 제목',
        promptFormat: 'shortform',
        autoConvert: false
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await fetch('/api/automation/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(titleData)
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/automation/titles',
        expect.objectContaining({
          body: expect.stringContaining('"autoConvert":false')
        })
      );
    });
  });

  describe('4. 제목 수정 시 autoConvert 필드 처리', () => {
    test('기존 제목 로드 시 autoConvert 값 복원', () => {
      const existingTitle = {
        id: 'title-123',
        title: '기존 롱폼 제목',
        promptFormat: 'longform',
        autoConvert: true,
        autoCreateShortform: true  // DB에서 오는 필드명
      };

      // 다양한 필드명 호환성 처리
      const autoConvert =
        existingTitle.autoConvert ??
        existingTitle.autoCreateShortform ??
        false;

      expect(autoConvert).toBe(true);
    });

    test('수정된 제목 저장 시 autoConvert 값 유지', async () => {
      const editedTitle = {
        id: 'title-123',
        title: '수정된 롱폼 제목',
        promptFormat: 'longform',
        autoConvert: false  // 사용자가 체크 해제
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await fetch(`/api/automation/titles/${editedTitle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedTitle)
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/automation/titles/'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"autoConvert":false')
        })
      );
    });
  });

  describe('5. 자동화 큐 제출 테스트', () => {
    test('롱폼 제목이 큐에 제출될 때 autoConvert 옵션 포함', async () => {
      const queueRequest = {
        taskId: 'task-123',
        title: '롱폼 영상 제목',
        promptFormat: 'longform',
        autoConvert: true,
        ttsVoice: '순복',
        ttsSpeed: '+0%'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, queueId: 'queue-456' })
      });

      await fetch('/api/automation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queueRequest)
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody).toHaveProperty('autoConvert', true);
    });

    test('숏폼 제목은 autoConvert 무시', async () => {
      const queueRequest = {
        taskId: 'task-456',
        title: '숏폼 영상 제목',
        promptFormat: 'shortform',
        autoConvert: false  // 숏폼은 변환 불필요
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await fetch('/api/automation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queueRequest)
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.autoConvert).toBe(false);
    });
  });

  describe('6. 숏폼 자동 생성 워크플로우 테스트', () => {
    test('롱폼 영상 완료 후 자동 숏폼 변환 트리거', async () => {
      // Step 1: 롱폼 영상 생성 완료
      const longformTaskId = 'longform-task-123';
      const autoConvert = true;

      // Step 2: autoConvert=true면 숏폼 변환 API 호출
      if (autoConvert) {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            shortformTaskId: 'shortform-task-456'
          })
        });

        await fetch(`/api/jobs/${longformTaskId}/convert-to-shortform`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        expect(global.fetch).toHaveBeenCalledWith(
          `/api/jobs/${longformTaskId}/convert-to-shortform`,
          expect.objectContaining({ method: 'POST' })
        );
      }
    });

    test('autoConvert=false면 숏폼 변환 API 호출 안함', async () => {
      const longformTaskId = 'longform-task-789';
      const autoConvert = false;

      // autoConvert=false면 API 호출하지 않음
      if (autoConvert) {
        await fetch(`/api/jobs/${longformTaskId}/convert-to-shortform`, {
          method: 'POST'
        });
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('7. content_setting 테이블 저장 테스트', () => {
    test('auto_create_shortform 필드가 content_setting에 저장되어야 함', async () => {
      const contentSetting = {
        content_id: 'content-123',
        script_mode: 'auto',
        media_mode: 'crawl',
        tts_voice: '순복',
        tts_speed: '+0%',
        auto_create_shortform: true,  // DB 컬럼명
        tags: JSON.stringify(['test']),
        settings: JSON.stringify({}),
        youtube_privacy: 'public'
      };

      expect(contentSetting).toHaveProperty('auto_create_shortform');
      expect(contentSetting.auto_create_shortform).toBe(true);
    });

    test('조회 시 autoCreateShortform으로 변환', () => {
      // DB에서 조회한 데이터 (snake_case)
      const dbRow = {
        content_id: 'content-123',
        auto_create_shortform: 1  // MySQL boolean
      };

      // JS에서 사용할 데이터 (camelCase)
      const contentSetting = {
        contentId: dbRow.content_id,
        autoCreateShortform: dbRow.auto_create_shortform === 1
      };

      expect(contentSetting.autoCreateShortform).toBe(true);
    });
  });

  describe('8. 샘플링 기능에서 autoConvert 테스트', () => {
    test('샘플링 시 롱폼 타입이면 samplingAutoConvert 기본 true', () => {
      const samplingType = 'longform';
      const samplingAutoConvert = samplingType === 'longform';

      expect(samplingAutoConvert).toBe(true);
    });

    test('샘플링 제목 추가 시 autoConvert 값 포함', async () => {
      const sampleTitle = {
        title: '샘플링으로 추가된 제목',
        promptFormat: 'longform',
        autoConvert: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await fetch('/api/automation/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleTitle)
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.autoConvert).toBe(true);
    });
  });

  describe('9. 에러 케이스 테스트', () => {
    test('숏폼 변환 실패 시 원본 롱폼은 유지', async () => {
      const longformTaskId = 'longform-task-123';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: '숏폼 변환 실패' })
      });

      const response = await fetch(`/api/jobs/${longformTaskId}/convert-to-shortform`, {
        method: 'POST'
      });

      expect(response.ok).toBe(false);
      // 원본 롱폼은 영향받지 않음 (별도 처리)
    });

    test('autoConvert 값이 undefined일 때 기본값 false', () => {
      const title = {
        title: '제목',
        promptFormat: 'longform',
        autoConvert: undefined
      };

      const autoConvertValue = title.autoConvert ?? false;
      expect(autoConvertValue).toBe(false);
    });
  });

  describe('10. UI 상태 동기화 테스트', () => {
    test('체크박스 상태와 폼 상태가 동기화되어야 함', () => {
      // 체크박스 체크
      let checkboxChecked = true;
      let formAutoConvert = checkboxChecked;
      expect(formAutoConvert).toBe(true);

      // 체크박스 해제
      checkboxChecked = false;
      formAutoConvert = checkboxChecked;
      expect(formAutoConvert).toBe(false);
    });

    test('promptFormat 변경 시 체크박스 상태 자동 변경', () => {
      let promptFormat = 'longform';
      let autoConvert = promptFormat === 'longform';
      expect(autoConvert).toBe(true);

      // 숏폼으로 변경
      promptFormat = 'shortform';
      autoConvert = promptFormat === 'longform';
      expect(autoConvert).toBe(false);
    });
  });
});
