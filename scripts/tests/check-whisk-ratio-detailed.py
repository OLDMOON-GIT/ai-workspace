#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Whisk 비율 선택 상세 확인 스크립트
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
import time

def check_whisk_ratio():
    """Whisk 비율 선택 상세 확인"""
    print("=" * 80)
    print("🔍 Whisk 비율 선택 상세 확인")
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

        # Step 1: 비율 선택 버튼 찾아서 클릭
        print(f"\n🔍 Step 1: 비율 선택 드롭다운 열기...")

        menu_result = driver.execute_script("""
            const allElements = Array.from(document.querySelectorAll('button, div[role="button"]'));

            // "비율", "aspect", "ratio" 등의 텍스트나 아이콘을 포함하는 요소 찾기
            const ratioElements = allElements.filter(elem => {
                const text = (elem.textContent || '').toLowerCase();
                const ariaLabel = (elem.getAttribute('aria-label') || '').toLowerCase();
                const innerText = (elem.innerText || '').toLowerCase();

                return text.includes('aspect_ratio') ||
                       text.includes('비율') ||
                       text.includes('aspect') ||
                       text.includes('ratio') ||
                       ariaLabel.includes('비율') ||
                       ariaLabel.includes('aspect');
            });

            if (ratioElements.length > 0) {
                // 첫 번째 요소 클릭
                ratioElements[0].click();
                return {
                    opened: true,
                    element: ratioElements[0].tagName,
                    text: ratioElements[0].textContent.substring(0, 100)
                };
            }

            return {opened: false};
        """)

        if menu_result.get('opened'):
            print(f"✅ 비율 드롭다운 클릭 완료")
            print(f"   요소: {menu_result.get('element')}")
            print(f"   텍스트: {menu_result.get('text')}")
            time.sleep(2)  # 메뉴 열릴 때까지 대기
        else:
            print(f"⚠️ 비율 드롭다운을 찾지 못함")

        # Step 2: 모든 버튼 상세 출력
        print(f"\n📋 Step 2: 페이지의 모든 버튼 (처음 30개):")

        all_buttons = driver.execute_script("""
            const allButtons = Array.from(document.querySelectorAll('button'));

            return allButtons.slice(0, 30).map((btn, idx) => {
                const rect = btn.getBoundingClientRect();
                const text = btn.textContent.trim();

                return {
                    index: idx,
                    text: text.substring(0, 50),
                    ariaLabel: btn.getAttribute('aria-label'),
                    ariaSelected: btn.getAttribute('aria-selected'),
                    ariaPressed: btn.getAttribute('aria-pressed'),
                    ariaExpanded: btn.getAttribute('aria-expanded'),
                    className: btn.className.substring(0, 50),
                    visible: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0,
                    position: {
                        left: Math.round(rect.left),
                        top: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                };
            });
        """)

        for btn in all_buttons:
            if btn['visible']:  # 보이는 버튼만
                status = ""
                if btn['ariaSelected'] == 'true':
                    status = " ⭐ SELECTED"
                if btn['ariaPressed'] == 'true':
                    status = " ⭐ PRESSED"

                print(f"\n버튼 {btn['index'] + 1}:{status}")
                print(f"  텍스트: '{btn['text']}'")
                if btn['ariaLabel']:
                    print(f"  aria-label: {btn['ariaLabel']}")
                if btn['ariaSelected']:
                    print(f"  aria-selected: {btn['ariaSelected']}")
                if btn['ariaPressed']:
                    print(f"  aria-pressed: {btn['ariaPressed']}")
                if btn['ariaExpanded']:
                    print(f"  aria-expanded: {btn['ariaExpanded']}")
                print(f"  위치: L={btn['position']['left']} T={btn['position']['top']} W={btn['position']['width']} H={btn['position']['height']}")

        # Step 3: 비율 버튼만 찾기
        print(f"\n🎯 Step 3: 비율 버튼 (1:1, 9:16, 16:9, 등):")

        ratio_buttons = driver.execute_script("""
            const allButtons = Array.from(document.querySelectorAll('button'));

            // 숫자:숫자 형식의 텍스트를 가진 버튼만 필터링
            const ratioButtons = allButtons.filter(btn => {
                const text = btn.textContent.trim();
                // 정규식: 숫자:숫자
                const regex = /^\\d+:\\d+$/;
                return regex.test(text);
            });

            return ratioButtons.map((btn, idx) => {
                const rect = btn.getBoundingClientRect();
                return {
                    index: idx,
                    text: btn.textContent.trim(),
                    ariaSelected: btn.getAttribute('aria-selected'),
                    ariaPressed: btn.getAttribute('aria-pressed'),
                    visible: rect.width > 0 && rect.height > 0,
                    position: {
                        left: Math.round(rect.left),
                        top: Math.round(rect.top)
                    }
                };
            });
        """)

        if ratio_buttons:
            for btn in ratio_buttons:
                status = ""
                if btn['ariaSelected'] == 'true' or btn['ariaPressed'] == 'true':
                    status = " ⭐ 현재 선택됨!"
                print(f"  {btn['text']}{status} (visible: {btn['visible']}, pos: {btn['position']})")
        else:
            print(f"  ⚠️ 비율 버튼을 찾을 수 없습니다")

        return True

    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        print("\n" + "=" * 80)
        print("✅ 확인 완료")
        print("=" * 80)


if __name__ == "__main__":
    success = check_whisk_ratio()
    sys.exit(0 if success else 1)
