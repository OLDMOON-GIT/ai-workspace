/**
 * DeployButton 컴포넌트 테스트
 */

import { render, screen, fireEvent } from '@testing-library/react';
import DeployButton from '@/components/DeployButton';

// next/navigation mock
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('DeployButton', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it('버튼이 렌더링되어야 함', () => {
    render(<DeployButton />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('버튼 텍스트가 올바르게 표시되어야 함', () => {
    render(<DeployButton />);
    expect(screen.getByText('🌐 Google Sites 배포 설정')).toBeInTheDocument();
  });

  it('클릭 시 설정 페이지로 이동해야 함', () => {
    render(<DeployButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockPush).toHaveBeenCalledWith('/admin/settings?tab=google-sites');
  });

  it('그라데이션 스타일이 적용되어야 함', () => {
    render(<DeployButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-gradient-to-r');
    expect(button).toHaveClass('from-blue-600');
    expect(button).toHaveClass('to-cyan-600');
  });

  it('hover 스타일 클래스가 있어야 함', () => {
    render(<DeployButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('hover:from-blue-500');
    expect(button).toHaveClass('hover:to-cyan-500');
  });

  it('transition 클래스가 있어야 함', () => {
    render(<DeployButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('transition-all');
  });
});
