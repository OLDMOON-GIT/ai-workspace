/**
 * SourceCodeModal 컴포넌트 테스트
 */

import { render, screen, fireEvent } from '@testing-library/react';
import SourceCodeModal from '@/components/SourceCodeModal';

describe('SourceCodeModal', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    code: 'const hello = "world";',
    filename: 'test.js',
    onClose: mockOnClose,
  };

  beforeEach(() => {
    mockOnClose.mockReset();
  });

  it('code가 null이면 아무것도 렌더링하지 않아야 함', () => {
    const { container } = render(
      <SourceCodeModal code={null} filename="test.js" onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('코드가 있으면 모달이 렌더링되어야 함', () => {
    render(<SourceCodeModal {...defaultProps} />);
    expect(screen.getByText('소스 코드 보기')).toBeInTheDocument();
    expect(screen.getByText('test.js')).toBeInTheDocument();
    expect(screen.getByText('const hello = "world";')).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 시 onClose 호출', () => {
    render(<SourceCodeModal {...defaultProps} />);
    const closeButton = screen.getByText('닫기');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('배경 클릭 시 onClose 호출', () => {
    const { container } = render(<SourceCodeModal {...defaultProps} />);
    // 가장 바깥 div (backdrop)를 직접 찾음
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('모달 내부 클릭 시 onClose 호출되지 않음', () => {
    render(<SourceCodeModal {...defaultProps} />);
    const modalContent = screen.getByText('const hello = "world";');
    fireEvent.click(modalContent);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('Escape 키 누르면 onClose 호출', () => {
    render(<SourceCodeModal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('다른 키 누르면 onClose 호출되지 않음', () => {
    render(<SourceCodeModal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('X 버튼 클릭 시 onClose 호출', () => {
    render(<SourceCodeModal {...defaultProps} />);
    // X 버튼은 svg가 있는 button
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find(btn => btn.querySelector('svg'));
    if (xButton) {
      fireEvent.click(xButton);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('코드가 pre/code 태그로 렌더링되어야 함', () => {
    render(<SourceCodeModal {...defaultProps} />);
    const code = screen.getByText('const hello = "world";');
    expect(code.tagName).toBe('CODE');
    expect(code.parentElement?.tagName).toBe('PRE');
  });

  it('긴 코드도 렌더링되어야 함', () => {
    const longCode = 'function longFunction() {\n'.repeat(100) + '}';
    render(
      <SourceCodeModal code={longCode} filename="long.js" onClose={mockOnClose} />
    );
    expect(screen.getByText(/function longFunction/)).toBeInTheDocument();
  });
});
