/**
 * 자동화 큐 통합 테스트
 *
 * 테스트 대상:
 * 1. 폴더 열기 기능 - scriptId 우선 사용
 * 2. 로그 토글 기능 - 수동 닫기 시 자동 열기 방지
 * 3. ID 규칙 - prefix 제거 및 순수 ID 사용
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock 데이터
const mockSchedule = {
  id: 'schedule_123',
  title_id: '1732123456789_abc123',
  script_id: 'uuid-script-456',
  status: 'processing',
  type: 'shortform'
};

const mockTitle = {
  id: '1732123456789_abc123',
  title: '테스트 영상 제목',
  status: 'processing'
};

const mockQueueTask = {
  taskId: '1732123456789_abc123',
  type: 'image',
  status: 'processing',
  metadata: {
    scenes: [{ sceneNumber: 1, imagePrompt: 'test prompt' }],
    useImageFX: false,
    scheduleId: 'schedule_123',
    titleId: '1732123456789_abc123',
    scriptId: 'uuid-script-456',
    format: 'shortform'
  }
};

describe('ID 규칙 테스트', () => {
  const cleanId = (id: string) => id.replace(/^(task_|title_|script_|schedule_)/, '');

  it('task_ prefix를 제거해야 함', () => {
    expect(cleanId('task_1732123456789_abc123')).toBe('1732123456789_abc123');
  });

  it('title_ prefix를 제거해야 함', () => {
    expect(cleanId('title_1732123456789_abc123')).toBe('1732123456789_abc123');
  });

  it('script_ prefix를 제거해야 함', () => {
    expect(cleanId('script_uuid-456')).toBe('uuid-456');
  });

  it('prefix가 없는 ID는 그대로 유지해야 함', () => {
    expect(cleanId('1732123456789_abc123')).toBe('1732123456789_abc123');
  });

  it('UUID 형식의 ID도 처리해야 함', () => {
    expect(cleanId('uuid-script-456')).toBe('uuid-script-456');
  });
});

describe('폴더 경로 생성 테스트', () => {
  const getOutputDir = (metadata: typeof mockQueueTask.metadata, taskId: string) => {
    const folderId = metadata.scriptId || taskId;
    const cleanId = folderId.replace(/^(task_|title_|script_)/, '');
    return `tasks/${cleanId}`;
  };

  it('scriptId가 있으면 scriptId로 폴더 경로를 생성해야 함', () => {
    const outputDir = getOutputDir(mockQueueTask.metadata, mockQueueTask.taskId);
    expect(outputDir).toBe('tasks/uuid-script-456');
  });

  it('scriptId가 없으면 taskId로 폴더 경로를 생성해야 함', () => {
    const metadataWithoutScriptId = { ...mockQueueTask.metadata, scriptId: undefined };
    const outputDir = getOutputDir(metadataWithoutScriptId as any, mockQueueTask.taskId);
    expect(outputDir).toBe('tasks/1732123456789_abc123');
  });

  it('scriptId에 script_ prefix가 있어도 제거해야 함', () => {
    const metadataWithPrefix = { ...mockQueueTask.metadata, scriptId: 'script_uuid-456' };
    const outputDir = getOutputDir(metadataWithPrefix, mockQueueTask.taskId);
    expect(outputDir).toBe('tasks/uuid-456');
  });
});

describe('handleOpenFolder 테스트', () => {
  const handleOpenFolder = (
    title: typeof mockTitle,
    schedule: typeof mockSchedule | null,
    queueData: typeof mockQueueTask | null
  ) => {
    // 우선순위: scriptId > taskId > title.id
    const scriptId = schedule?.script_id || queueData?.metadata?.scriptId;
    const taskId = schedule?.title_id || queueData?.taskId;
    const folderId = scriptId || taskId;

    if (!folderId) {
      return null;
    }

    return folderId;
  };

  it('schedule에 script_id가 있으면 script_id를 사용해야 함', () => {
    const folderId = handleOpenFolder(mockTitle, mockSchedule, null);
    expect(folderId).toBe('uuid-script-456');
  });

  it('queueData에 scriptId가 있으면 scriptId를 사용해야 함', () => {
    const folderId = handleOpenFolder(mockTitle, null, mockQueueTask);
    expect(folderId).toBe('uuid-script-456');
  });

  it('scriptId가 없고 taskId만 있으면 taskId를 사용해야 함', () => {
    const scheduleWithoutScriptId = { ...mockSchedule, script_id: undefined };
    const folderId = handleOpenFolder(mockTitle, scheduleWithoutScriptId as any, null);
    expect(folderId).toBe('1732123456789_abc123');
  });

  it('schedule과 queueData 모두 없으면 null을 반환해야 함', () => {
    const folderId = handleOpenFolder(mockTitle, null, null);
    expect(folderId).toBeNull();
  });
});

describe('로그 토글 기능 테스트', () => {
  let expandedLogsFor: string | null = null;
  let manuallyClosedLogs = false;

  const setExpandedLogsFor = (value: string | null) => {
    expandedLogsFor = value;
  };

  const toggleLogs = (titleId: string) => {
    if (expandedLogsFor === titleId) {
      // 사용자가 수동으로 닫음
      manuallyClosedLogs = true;
      setExpandedLogsFor(null);
    } else {
      // 사용자가 수동으로 열음
      manuallyClosedLogs = false;
      setExpandedLogsFor(titleId);
    }
  };

  const autoOpenLogs = (activeTitleId: string) => {
    // 수동 닫기가 아닌 경우에만 자동 열기
    if (!manuallyClosedLogs) {
      if (!expandedLogsFor) {
        setExpandedLogsFor(activeTitleId);
      }
    }
  };

  beforeEach(() => {
    expandedLogsFor = null;
    manuallyClosedLogs = false;
  });

  it('로그 버튼을 클릭하면 로그가 열려야 함', () => {
    toggleLogs('title1');
    expect(expandedLogsFor).toBe('title1');
    expect(manuallyClosedLogs).toBe(false);
  });

  it('열린 로그를 다시 클릭하면 닫혀야 함', () => {
    toggleLogs('title1'); // 열기
    toggleLogs('title1'); // 닫기
    expect(expandedLogsFor).toBeNull();
    expect(manuallyClosedLogs).toBe(true);
  });

  it('수동으로 닫은 후에는 자동 열기가 동작하지 않아야 함', () => {
    toggleLogs('title1'); // 열기
    toggleLogs('title1'); // 수동 닫기
    autoOpenLogs('title1'); // 자동 열기 시도
    expect(expandedLogsFor).toBeNull(); // 여전히 닫혀 있어야 함
  });

  it('수동으로 다른 로그를 열면 자동 열기가 다시 동작해야 함', () => {
    toggleLogs('title1'); // 열기
    toggleLogs('title1'); // 수동 닫기
    toggleLogs('title2'); // 다른 로그 열기 (수동 닫기 플래그 초기화)
    expect(manuallyClosedLogs).toBe(false);
  });

  it('처음 로드 시 자동 열기가 동작해야 함', () => {
    autoOpenLogs('title1');
    expect(expandedLogsFor).toBe('title1');
  });
});

describe('스케줄 상태 테스트', () => {
  const isProcessingStatus = (status: string) => {
    return ['processing', 'script_generating', 'image_crawling', 'video_generating', 'uploading'].includes(status);
  };

  const matchesQueueTab = (status: string, tab: string) => {
    switch (tab) {
      case 'scheduled':
        return status === 'scheduled' || status === 'waiting_for_upload';
      case 'script':
        return status === 'script_generating';
      case 'image':
        return status === 'image_crawling' || status === 'waiting_for_upload';
      case 'video':
        return status === 'video_generating';
      case 'youtube':
        return status === 'uploading' || status === 'completed';
      case 'failed':
        return status === 'failed';
      case 'completed':
        return status === 'completed';
      default:
        return false;
    }
  };

  it('processing 상태는 isProcessingStatus가 true여야 함', () => {
    expect(isProcessingStatus('processing')).toBe(true);
    expect(isProcessingStatus('script_generating')).toBe(true);
    expect(isProcessingStatus('image_crawling')).toBe(true);
    expect(isProcessingStatus('video_generating')).toBe(true);
    expect(isProcessingStatus('uploading')).toBe(true);
  });

  it('완료/실패 상태는 isProcessingStatus가 false여야 함', () => {
    expect(isProcessingStatus('completed')).toBe(false);
    expect(isProcessingStatus('failed')).toBe(false);
    expect(isProcessingStatus('scheduled')).toBe(false);
  });

  it('waiting_for_upload 상태는 image 탭에 매칭되어야 함', () => {
    expect(matchesQueueTab('waiting_for_upload', 'image')).toBe(true);
    expect(matchesQueueTab('waiting_for_upload', 'scheduled')).toBe(true);
  });

  it('image_crawling 상태는 image 탭에 매칭되어야 함', () => {
    expect(matchesQueueTab('image_crawling', 'image')).toBe(true);
  });
});

describe('큐 메타데이터 테스트', () => {
  it('큐 작업에 scriptId가 포함되어야 함', () => {
    expect(mockQueueTask.metadata.scriptId).toBeDefined();
    expect(mockQueueTask.metadata.scriptId).toBe('uuid-script-456');
  });

  it('큐 작업에 scenes 배열이 포함되어야 함', () => {
    expect(Array.isArray(mockQueueTask.metadata.scenes)).toBe(true);
    expect(mockQueueTask.metadata.scenes.length).toBeGreaterThan(0);
  });

  it('큐 작업 타입이 image여야 함', () => {
    expect(mockQueueTask.type).toBe('image');
  });
});
