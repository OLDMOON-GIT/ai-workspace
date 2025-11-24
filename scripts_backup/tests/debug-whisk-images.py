"""Whisk 페이지의 이미지 구조 디버깅"""
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# 실행 중인 Chrome에 연결
chrome_options = Options()
chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

try:
    driver = webdriver.Chrome(options=chrome_options)
    print(f"현재 URL: {driver.current_url}")
    print(f"페이지 제목: {driver.title}\n")

    # 페이지 정보 확인
    page_info = driver.execute_script("""
        const imgs = Array.from(document.querySelectorAll('img'));

        return {
            totalImages: imgs.length,
            images: imgs.map(img => ({
                width: img.offsetWidth,
                height: img.offsetHeight,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
                src: img.src ? img.src.substring(0, 100) : '',
                alt: img.alt || '',
                className: img.className || '',
                display: window.getComputedStyle(img).display,
                visibility: window.getComputedStyle(img).visibility
            }))
        };
    """)

    print(f"전체 이미지 개수: {page_info['totalImages']}\n")

    print("모든 이미지 정보:")
    print("="*100)
    for idx, img in enumerate(page_info['images']):
        print(f"[{idx}] offset: {img['width']}x{img['height']}, "
              f"natural: {img['naturalWidth']}x{img['naturalHeight']}, "
              f"display: {img['display']}, "
              f"visibility: {img['visibility']}")
        print(f"     className: {img['className']}")
        print(f"     src: {img['src']}")
        print(f"     alt: {img['alt']}")
        print()

    # 큰 이미지만 필터링
    print("\n큰 이미지 (offset 100x100 이상):")
    print("="*100)
    large_images = [img for img in page_info['images']
                    if img['width'] > 100 and img['height'] > 100]
    print(f"개수: {len(large_images)}\n")
    for idx, img in enumerate(large_images):
        print(f"[{idx}] {img['width']}x{img['height']} - {img['src']}")

    # natural 크기로 필터링
    print("\n\nnatural 크기 기준 (100x100 이상):")
    print("="*100)
    natural_large = [img for img in page_info['images']
                     if img['naturalWidth'] > 100 and img['naturalHeight'] > 100]
    print(f"개수: {len(natural_large)}\n")
    for idx, img in enumerate(natural_large):
        print(f"[{idx}] natural: {img['naturalWidth']}x{img['naturalHeight']}, "
              f"offset: {img['width']}x{img['height']}")
        print(f"     src: {img['src']}")
        print()

    driver.quit()

except Exception as e:
    print(f"오류: {e}")
    import traceback
    traceback.print_exc()
