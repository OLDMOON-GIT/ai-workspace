/**
 * ErrorMessage 컴포넌트 테스트
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ErrorMessage from '@/components/ErrorMessage';

// clipboard API mock
const mockClipboard = {
  writeText: jest.fn().mockResolvedValue(undefined),
};

Object.assign(navigator, {
  clipboard: mockClipboard,
});

describe('ErrorMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('에러 메시지를 렌더링해야 함', () => {
    render(<ErrorMessage message="테스트 에러 메시지" />);
    expect(screen.getByText('테스트 에러 메시지')).toBeInTheDocument();
  });

  it('복사 버튼이 렌더링되어야 함', () => {
    render(<ErrorMessage message="테스트" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('📋 복사')).toBeInTheDocument();
  });

  it('복사 버튼 클릭 시 클립보드에 복사되어야 함', async () => {
    render(<ErrorMessage message="복사할 에러" />);

    const button = screen.getByRole('button');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockClipboard.writeText).toHaveBeenCalledWith('복사할 에러');
  });

  it('복사 후 버튼 텍스트가 변경되어야 함', async () => {
    render(<ErrorMessage message="테스트" />);

    const button = screen.getByRole('button');

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText('✓ 복사됨')).toBeInTheDocument();
    });
  });

  it('2초 후 버튼 텍스트가 원래대로 돌아와야 함', async () => {
    render(<ErrorMessage message="테스트" />);

    const button = screen.getByRole('button');

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText('✓ 복사됨')).toBeInTheDocument();
    });

    // 2초 경과
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByText('📋 복사')).toBeInTheDocument();
    });
  });

  it('에러 메시지가 pre 태그로 렌더링되어야 함', () => {
    render(<ErrorMessage message="에러" />);
    const pre = screen.getByText('에러');
    expect(pre.tagName).toBe('PRE');
  });

  it('긴 에러 메시지도 렌더링되어야 함', () => {
    const longMessage = 'Error: ' + 'a'.repeat(500);
    render(<ErrorMessage message={longMessage} />);
    expect(screen.getByText(longMessage)).toBeInTheDocument();
  });

  it('줄바꿈이 있는 에러 메시지도 렌더링되어야 함', () => {
    const multilineMessage = 'Line 1\nLine 2\nLine 3';
    render(<ErrorMessage message={multilineMessage} />);
    // pre 태그 내에서 텍스트를 찾기
    const preElement = document.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement?.textContent).toBe(multilineMessage);
  });

  it('복사 버튼에 title 속성이 있어야 함', () => {
    render(<ErrorMessage message="테스트" />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', '에러 메시지 복사');
  });
});
