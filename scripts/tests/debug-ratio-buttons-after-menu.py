"""디버깅: 비율 메뉴를 열고 사용 가능한 버튼들 확인"""
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# 실행 중인 Chrome에 연결
chrome_options = Options()
chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

try:
    driver = webdriver.Chrome(options=chrome_options)
    print(f"현재 URL: {driver.current_url}\n")

    # Step 1: 비율 선택 메뉴 열기
    menu_result = driver.execute_script("""
        const allElements = Array.from(document.querySelectorAll('button, div[role="button"], div[role="combobox"]'));

        // "비율", "aspect", "ratio" 등의 텍스트를 포함하는 요소 찾기
        const ratioSelectorElements = allElements.filter(elem => {
            const text = (elem.textContent || '').toLowerCase();
            const ariaLabel = (elem.getAttribute('aria-label') || '').toLowerCase();
            return text.includes('비율') ||
                   text.includes('aspect') ||
                   text.includes('ratio') ||
                   ariaLabel.includes('비율') ||
                   ariaLabel.includes('aspect') ||
                   ariaLabel.includes('ratio');
        });

        // 드롭다운 열기
        if (ratioSelectorElements.length > 0) {
            ratioSelectorElements[0].click();
            return {
                opened: true,
                element: ratioSelectorElements[0].tagName,
                text: ratioSelectorElements[0].textContent
            };
        }

        return {opened: false};
    """)

    print("1. 메뉴 열기 결과:")
    print(f"   {menu_result}\n")

    if menu_result.get('opened'):
        time.sleep(1.5)  # 메뉴가 열릴 때까지 충분히 대기

        # Step 2: 열린 메뉴에서 사용 가능한 모든 버튼 확인
        buttons_result = driver.execute_script("""
            const allButtons = Array.from(document.querySelectorAll('button'));

            // 각 버튼의 정보 수집
            const buttonInfo = allButtons.map(btn => {
                return {
                    text: btn.textContent.trim(),
                    visible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
                    className: btn.className,
                    ariaLabel: btn.getAttribute('aria-label')
                };
            });

            // 16:9, 9:16, 1:1 포함된 버튼만 필터링
            const ratioButtons = buttonInfo.filter(info => {
                const text = info.text;
                return text.includes('16:9') || text.includes('9:16') || text.includes('1:1') ||
                       text === '16:9' || text === '9:16' || text === '1:1';
            });

            return {
                totalButtons: allButtons.length,
                ratioButtons: ratioButtons,
                // 디버깅: 모든 버튼의 텍스트 (처음 20개만)
                allButtonTexts: buttonInfo.slice(0, 20).map(b => b.text)
            };
        """)

        print("2. 메뉴 열린 후 버튼 상태:")
        print(f"   전체 버튼 개수: {buttons_result['totalButtons']}")
        print(f"   비율 관련 버튼:")
        for btn in buttons_result['ratioButtons']:
            print(f"     - 텍스트: '{btn['text']}', 보임: {btn['visible']}")

        print(f"\n3. 처음 20개 버튼의 텍스트:")
        for i, text in enumerate(buttons_result['allButtonTexts'][:20], 1):
            if text:  # 비어있지 않은 것만 출력
                print(f"     {i}. '{text[:50]}'")

    driver.quit()

except Exception as e:
    print(f"오류: {e}")
    import traceback
    traceback.print_exc()
