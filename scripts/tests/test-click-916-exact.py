#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
9:16 버튼 정확히 클릭 테스트
"""

import sys
import os

# UTF-8 출력 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time

def test_click_916():
    """9:16 버튼 정확히 클릭 테스트"""
    print("=" * 80)
    print("🧪 9:16 버튼 정확 클릭 테스트")
    print("=" * 80)

    # Chrome 옵션 설정
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        # 기존 Chrome에 연결
        driver = webdriver.Chrome(options=chrome_options)
        print("✅ 실행 중인 Chrome에 연결 완료")

        # 현재 URL 확인
        current_url = driver.current_url
        print(f"\n📍 현재 URL: {current_url}")

        # Step 1: 비율 메뉴 열기
        print(f"\n🔍 Step 1: 비율 메뉴 열기...")

        menu_result = driver.execute_script("""
            const allElements = Array.from(document.querySelectorAll('button'));
            const ratioElements = allElements.filter(elem => {
                const text = elem.textContent || '';
                return text.includes('aspect_ratio');
            });

            if (ratioElements.length > 0) {
                ratioElements[0].click();
                return {success: true};
            }
            return {success: false};
        """)

        if menu_result.get('success'):
            print(f"✅ 비율 메뉴 열림")
            time.sleep(2)
        else:
            print(f"⚠️ 비율 메뉴를 찾지 못함")
            return False

        # Step 2: 9:16 버튼 찾기 및 정보 확인
        print(f"\n🔍 Step 2: 9:16 버튼 찾기...")

        button_info = driver.execute_script("""
            const allButtons = Array.from(document.querySelectorAll('button'));

            // 정확히 "9:16" 텍스트만 가진 버튼 찾기
            const target_buttons = allButtons.filter(btn => {
                const text = btn.textContent.trim();
                return text === '9:16';
            });

            if (target_buttons.length > 0) {
                const btn = target_buttons[0];
                const rect = btn.getBoundingClientRect();

                // 식별을 위한 속성 추가
                btn.setAttribute('data-target-916', 'true');

                // 스타일 정보 가져오기
                const computedStyle = window.getComputedStyle(btn);

                return {
                    found: true,
                    text: btn.textContent.trim(),
                    className: btn.className,
                    border: computedStyle.border,
                    backgroundColor: computedStyle.backgroundColor,
                    color: computedStyle.color,
                    boxShadow: computedStyle.boxShadow,
                    position: {
                        left: Math.round(rect.left),
                        top: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                };
            }

            return {found: false};
        """)

        if not button_info.get('found'):
            print(f"❌ 9:16 버튼을 찾을 수 없습니다")
            return False

        print(f"✅ 9:16 버튼 발견")
        print(f"   텍스트: {button_info['text']}")
        print(f"   className: {button_info['className'][:80]}...")
        print(f"   위치: {button_info['position']}")
        print(f"   border: {button_info['border']}")
        print(f"   background: {button_info['backgroundColor']}")
        print(f"   color: {button_info['color']}")

        # Step 3: 9:16 버튼 클릭
        print(f"\n🖱️  Step 3: 9:16 버튼 클릭...")

        try:
            button = driver.find_element(By.CSS_SELECTOR, 'button[data-target-916="true"]')
            button.click()
            print(f"✅ 버튼 클릭 완료 (Selenium)")
            time.sleep(2)
        except Exception as e:
            print(f"⚠️ Selenium 클릭 실패, JavaScript로 시도: {e}")
            driver.execute_script("""
                const btn = document.querySelector('button[data-target-916="true"]');
                if (btn) btn.click();
            """)
            print(f"✅ 버튼 클릭 완료 (JavaScript)")
            time.sleep(2)

        # Step 4: 클릭 후 스타일 변화 확인
        print(f"\n🔍 Step 4: 클릭 후 스타일 변화 확인...")

        after_info = driver.execute_script("""
            const btn = document.querySelector('button[data-target-916="true"]');
            if (btn) {
                const computedStyle = window.getComputedStyle(btn);
                return {
                    border: computedStyle.border,
                    backgroundColor: computedStyle.backgroundColor,
                    color: computedStyle.color,
                    boxShadow: computedStyle.boxShadow,
                    outline: computedStyle.outline
                };
            }
            return null;
        """)

        if after_info:
            print(f"   클릭 후 border: {after_info['border']}")
            print(f"   클릭 후 background: {after_info['backgroundColor']}")
            print(f"   클릭 후 color: {after_info['color']}")
            print(f"   클릭 후 outline: {after_info.get('outline', 'none')}")

            # 변화 감지
            if after_info['border'] != button_info['border']:
                print(f"   ✅ border 변화 감지!")
            if after_info['backgroundColor'] != button_info['backgroundColor']:
                print(f"   ✅ backgroundColor 변화 감지!")
            if after_info['color'] != button_info['color']:
                print(f"   ✅ color 변화 감지!")

        # Step 5: 모든 비율 버튼의 현재 스타일 비교
        print(f"\n🎯 Step 5: 모든 비율 버튼 스타일 비교...")

        all_ratios = driver.execute_script("""
            const allButtons = Array.from(document.querySelectorAll('button'));
            const ratioButtons = allButtons.filter(btn => {
                const text = btn.textContent.trim();
                return /^\\d+:\\d+$/.test(text);
            });

            return ratioButtons.map(btn => {
                const computedStyle = window.getComputedStyle(btn);
                return {
                    text: btn.textContent.trim(),
                    border: computedStyle.border,
                    backgroundColor: computedStyle.backgroundColor,
                    boxShadow: computedStyle.boxShadow
                };
            });
        """)

        for ratio in all_ratios:
            print(f"\n   {ratio['text']}:")
            print(f"     border: {ratio['border'][:60]}...")
            print(f"     background: {ratio['backgroundColor']}")

        print(f"\n💡 육안으로 확인해주세요: 실제로 9:16이 선택되어 있나요?")

        return True

    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        print("\n" + "=" * 80)
        print("✅ 테스트 완료")
        print("=" * 80)


if __name__ == "__main__":
    success = test_click_916()
    sys.exit(0 if success else 1)
