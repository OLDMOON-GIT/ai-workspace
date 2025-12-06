/**
 * ProductPreviewModal 컴포넌트 테스트
 */

import { render, screen, fireEvent } from '@testing-library/react';
import ProductPreviewModal from '@/components/ProductPreviewModal';

describe('ProductPreviewModal', () => {
  const mockOnClose = jest.fn();
  const mockProduct = {
    id: '1',
    title: '테스트 상품',
    description: '테스트 상품 설명입니다.',
    category: '전자제품',
    image_url: 'https://example.com/image.jpg',
    deep_link: 'https://coupang.com/product/1',
    original_price: 50000,
    discount_price: 40000,
    view_count: 100,
    click_count: 50,
  };

  beforeEach(() => {
    mockOnClose.mockReset();
  });

  it('product가 null이면 아무것도 렌더링하지 않아야 함', () => {
    const { container } = render(
      <ProductPreviewModal product={null} onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('상품 정보가 렌더링되어야 함', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    expect(screen.getByText('테스트 상품')).toBeInTheDocument();
    expect(screen.getByText('테스트 상품 설명입니다.')).toBeInTheDocument();
    expect(screen.getByText('전자제품')).toBeInTheDocument();
  });

  it('가격 정보가 표시되어야 함', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    expect(screen.getByText('50,000원')).toBeInTheDocument();
    expect(screen.getByText('40,000원')).toBeInTheDocument();
  });

  it('조회수가 표시되어야 함', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('딥링크가 있으면 구매 버튼 표시', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    const purchaseLink = screen.getByText('쿠팡에서 구매하기');
    expect(purchaseLink).toBeInTheDocument();
    expect(purchaseLink).toHaveAttribute('href', 'https://coupang.com/product/1');
    expect(purchaseLink).toHaveAttribute('target', '_blank');
    expect(purchaseLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('딥링크가 없으면 안내 메시지 표시', () => {
    const productWithoutLink = { ...mockProduct, deep_link: undefined };
    render(<ProductPreviewModal product={productWithoutLink} onClose={mockOnClose} />);
    expect(screen.getByText('구매 링크가 준비되지 않았습니다.')).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 시 onClose 호출', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    const closeButton = screen.getByText('닫기');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('배경 클릭 시 onClose 호출', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    const backdrop = screen.getByText('테스트 상품').closest('div')?.parentElement?.parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('모달 내부 클릭 시 onClose 호출되지 않음', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    const modalContent = screen.getByText('테스트 상품');
    fireEvent.click(modalContent);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('Escape 키 누르면 onClose 호출', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('이미지가 렌더링되어야 함', () => {
    render(<ProductPreviewModal product={mockProduct} onClose={mockOnClose} />);
    const image = screen.getByAltText('테스트 상품');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
  });

  it('할인가만 있을 때도 정상 표시', () => {
    const productWithOnlyDiscount = {
      ...mockProduct,
      original_price: undefined,
    };
    render(<ProductPreviewModal product={productWithOnlyDiscount} onClose={mockOnClose} />);
    expect(screen.getByText('40,000원')).toBeInTheDocument();
    expect(screen.queryByText('50,000원')).not.toBeInTheDocument();
  });

  it('할인가가 없으면 가격 섹션 표시 안됨', () => {
    const productWithoutPrice = {
      ...mockProduct,
      discount_price: undefined,
    };
    render(<ProductPreviewModal product={productWithoutPrice} onClose={mockOnClose} />);
    expect(screen.queryByText('40,000원')).not.toBeInTheDocument();
  });
});
