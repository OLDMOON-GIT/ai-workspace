"""Whisk 비율 선택 후 실제 선택 상태 확인"""
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# 실행 중인 Chrome에 연결
chrome_options = Options()
chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

try:
    driver = webdriver.Chrome(options=chrome_options)
    print(f"현재 URL: {driver.current_url}")

    # 현재 선택된 비율 확인
    result = driver.execute_script("""
        // 모든 비율 버튼 찾기
        const allButtons = Array.from(document.querySelectorAll('button'));
        const ratioButtons = allButtons.filter(btn => {
            const text = btn.textContent.trim();
            return text === '1:1' || text === '9:16' || text === '16:9';
        });

        console.log('비율 버튼 개수:', ratioButtons.length);

        return ratioButtons.map(btn => {
            const text = btn.textContent.trim();
            const className = btn.className;
            const isSelected = className.includes('selected') ||
                              className.includes('active') ||
                              btn.getAttribute('aria-selected') === 'true' ||
                              btn.getAttribute('aria-pressed') === 'true';

            // 스타일 확인
            const computedStyle = window.getComputedStyle(btn);
            const backgroundColor = computedStyle.backgroundColor;
            const borderColor = computedStyle.borderColor;

            console.log(`버튼 [${text}]:`, className, '| selected:', isSelected, '| bg:', backgroundColor);

            return {
                text: text,
                className: className,
                isSelected: isSelected,
                backgroundColor: backgroundColor,
                borderColor: borderColor,
                ariaSelected: btn.getAttribute('aria-selected'),
                ariaPressed: btn.getAttribute('aria-pressed')
            };
        });
    """)

    print("\n현재 비율 버튼 상태:")
    print("="*80)
    for btn in result:
        print(f"[{btn['text']}]")
        print(f"  className: {btn['className']}")
        print(f"  isSelected: {btn['isSelected']}")
        print(f"  backgroundColor: {btn['backgroundColor']}")
        print(f"  borderColor: {btn['borderColor']}")
        print(f"  aria-selected: {btn['ariaSelected']}")
        print(f"  aria-pressed: {btn['ariaPressed']}")
        print()

    # 어떤 버튼이 선택되어 있는지 확인
    selected = [btn for btn in result if btn['isSelected']]
    if selected:
        print(f"✅ 현재 선택된 비율: {selected[0]['text']}")
    else:
        print("⚠️ 선택된 비율을 찾을 수 없음 (클래스 패턴으로는 확인 안됨)")
        print("\n모든 버튼의 클래스를 확인해보세요:")
        for btn in result:
            print(f"  {btn['text']}: {btn['className']}")

    driver.quit()

except Exception as e:
    print(f"오류: {e}")
    import traceback
    traceback.print_exc()
