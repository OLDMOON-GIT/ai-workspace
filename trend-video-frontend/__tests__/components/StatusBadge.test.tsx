/**
 * StatusBadge 컴포넌트 테스트
 */

import { render, screen } from '@testing-library/react';
import StatusBadge from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('pending 상태를 렌더링해야 함', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('대기 중')).toBeInTheDocument();
  });

  it('processing 상태를 렌더링해야 함', () => {
    render(<StatusBadge status="processing" />);
    expect(screen.getByText('진행 중')).toBeInTheDocument();
  });

  it('completed 상태를 렌더링해야 함', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('완료')).toBeInTheDocument();
  });

  it('failed 상태를 렌더링해야 함', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('실패')).toBeInTheDocument();
  });

  it('cancelled 상태를 렌더링해야 함', () => {
    render(<StatusBadge status="cancelled" />);
    expect(screen.getByText('취소됨')).toBeInTheDocument();
  });

  it('pending 상태에 올바른 스타일 클래스가 적용되어야 함', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText('대기 중');
    expect(badge).toHaveClass('bg-yellow-500/20');
    expect(badge).toHaveClass('text-yellow-300');
  });

  it('completed 상태에 올바른 스타일 클래스가 적용되어야 함', () => {
    render(<StatusBadge status="completed" />);
    const badge = screen.getByText('완료');
    expect(badge).toHaveClass('bg-green-500/20');
    expect(badge).toHaveClass('text-green-300');
  });

  it('failed 상태에 올바른 스타일 클래스가 적용되어야 함', () => {
    render(<StatusBadge status="failed" />);
    const badge = screen.getByText('실패');
    expect(badge).toHaveClass('bg-red-500/20');
    expect(badge).toHaveClass('text-red-300');
  });

  it('span 요소로 렌더링되어야 함', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText('대기 중');
    expect(badge.tagName).toBe('SPAN');
  });

  it('기본 스타일 클래스가 적용되어야 함', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText('대기 중');
    expect(badge).toHaveClass('rounded');
    expect(badge).toHaveClass('px-2');
    expect(badge).toHaveClass('py-1');
    expect(badge).toHaveClass('text-xs');
    expect(badge).toHaveClass('font-semibold');
  });
});
