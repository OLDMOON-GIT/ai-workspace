/**
 * Breadcrumb 컴포넌트 테스트
 */

import { render, screen } from '@testing-library/react';
import Breadcrumb from '@/components/Breadcrumb';

// next/navigation mock
const mockPathname = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('Breadcrumb', () => {
  beforeEach(() => {
    mockPathname.mockReset();
  });

  it('홈 경로에서는 아무것도 렌더링하지 않아야 함', () => {
    mockPathname.mockReturnValue('/');
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('/my-videos 경로에서 "내 영상" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/my-videos');
    render(<Breadcrumb />);
    expect(screen.getByText('내 영상')).toBeInTheDocument();
  });

  it('/my-scripts 경로에서 "내 대본" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/my-scripts');
    render(<Breadcrumb />);
    expect(screen.getByText('내 대본')).toBeInTheDocument();
  });

  it('/my-content 경로에서 "내 콘텐츠" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/my-content');
    render(<Breadcrumb />);
    expect(screen.getByText('내 콘텐츠')).toBeInTheDocument();
  });

  it('/coupang 경로에서 "쿠팡 파트너스" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/coupang');
    render(<Breadcrumb />);
    expect(screen.getByText('쿠팡 파트너스')).toBeInTheDocument();
  });

  it('/credits/charge 경로에서 중첩 breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/credits/charge');
    render(<Breadcrumb />);
    expect(screen.getByText('크레딧')).toBeInTheDocument();
    expect(screen.getByText('충전')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it('/credits 경로에서 "크레딧" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/credits');
    render(<Breadcrumb />);
    expect(screen.getByText('크레딧')).toBeInTheDocument();
  });

  it('/admin/users 경로에서 중첩 breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/admin/users');
    render(<Breadcrumb />);
    expect(screen.getByText('관리자')).toBeInTheDocument();
    expect(screen.getByText('사용자 관리')).toBeInTheDocument();
  });

  it('/admin/charge-requests 경로에서 중첩 breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/admin/charge-requests');
    render(<Breadcrumb />);
    expect(screen.getByText('관리자')).toBeInTheDocument();
    expect(screen.getByText('충전 요청')).toBeInTheDocument();
  });

  it('/admin/settings 경로에서 중첩 breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/admin/settings');
    render(<Breadcrumb />);
    expect(screen.getByText('관리자')).toBeInTheDocument();
    expect(screen.getByText('설정')).toBeInTheDocument();
  });

  it('/admin/user-activity 경로에서 중첩 breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/admin/user-activity');
    render(<Breadcrumb />);
    expect(screen.getByText('관리자')).toBeInTheDocument();
    expect(screen.getByText('사용자 활동')).toBeInTheDocument();
  });

  it('/admin/prompts 경로에서 중첩 breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/admin/prompts');
    render(<Breadcrumb />);
    expect(screen.getByText('관리자')).toBeInTheDocument();
    expect(screen.getByText('프롬프트 관리')).toBeInTheDocument();
  });

  it('/product 경로에서 "상품 관리" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/product');
    render(<Breadcrumb />);
    expect(screen.getByText('상품 관리')).toBeInTheDocument();
  });

  it('/admin/coupang-products 경로에서 "상품 관리" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/admin/coupang-products');
    render(<Breadcrumb />);
    expect(screen.getByText('상품 관리')).toBeInTheDocument();
  });

  it('/admin 경로에서 "관리자" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/admin');
    render(<Breadcrumb />);
    expect(screen.getByText('관리자')).toBeInTheDocument();
  });

  it('/automation 경로에서 "자동화" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/automation');
    render(<Breadcrumb />);
    expect(screen.getByText('자동화')).toBeInTheDocument();
  });

  it('/settings 경로에서 "설정" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/settings');
    render(<Breadcrumb />);
    expect(screen.getByText('설정')).toBeInTheDocument();
  });

  it('/auth 경로에서 "로그인" breadcrumb 표시', () => {
    mockPathname.mockReturnValue('/auth');
    render(<Breadcrumb />);
    expect(screen.getByText('로그인')).toBeInTheDocument();
  });

  it('nav 요소로 렌더링되어야 함', () => {
    mockPathname.mockReturnValue('/my-videos');
    render(<Breadcrumb />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('링크가 올바른 href를 가져야 함', () => {
    mockPathname.mockReturnValue('/admin/users');
    render(<Breadcrumb />);
    const link = screen.getByRole('link', { name: '관리자' });
    expect(link).toHaveAttribute('href', '/admin');
  });
});
