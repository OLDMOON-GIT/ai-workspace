#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Whisk에서 현재 선택된 비율 확인 스크립트
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

def check_current_ratio():
    """현재 Whisk에서 선택된 비율 확인"""
    print("=" * 80)
    print("🔍 Whisk 현재 선택 비율 확인")
    print("=" * 80)

    # Chrome 옵션 설정
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        # 기존 Chrome에 연결
        driver = webdriver.Chrome(options=chrome_options)
        print("✅ 실행 중인 Chrome에 연결 완료")

        # Whisk 페이지로 이동
        whisk_url = "https://labs.google/fx/ko/tools/whisk/project"
        print(f"\n📍 Whisk 페이지 이동: {whisk_url}")
        driver.get(whisk_url)
        time.sleep(3)

        # 현재 URL 확인
        current_url = driver.current_url
        print(f"   현재 URL: {current_url}")

        # 모든 버튼의 텍스트와 상태 확인
        print(f"\n📋 페이지의 모든 비율 관련 버튼:")

        result = driver.execute_script("""
            // 모든 버튼 찾기
            const allButtons = Array.from(document.querySelectorAll('button'));

            // 비율처럼 보이는 버튼들 필터링
            const ratioButtons = allButtons.filter(btn => {
                const text = btn.textContent.trim();
                // "숫자:숫자" 형식 또는 "비율", "aspect", "ratio" 키워드
                return /\d+:\d+/.test(text) ||
                       text.includes('비율') ||
                       text.includes('aspect') ||
                       btn.getAttribute('aria-label')?.includes('ratio');
            });

            // 각 버튼의 정보 수집
            return ratioButtons.map((btn, idx) => {
                const rect = btn.getBoundingClientRect();
                return {
                    index: idx,
                    text: btn.textContent.trim(),
                    ariaLabel: btn.getAttribute('aria-label'),
                    ariaSelected: btn.getAttribute('aria-selected'),
                    ariaPressed: btn.getAttribute('aria-pressed'),
                    className: btn.className,
                    visible: rect.width > 0 && rect.height > 0 && rect.left >= 0,
                    position: {
                        left: Math.round(rect.left),
                        top: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                };
            });
        """)

        for btn_info in result:
            print(f"\n버튼 {btn_info['index'] + 1}:")
            print(f"  텍스트: {btn_info['text']}")
            print(f"  aria-label: {btn_info['ariaLabel']}")
            print(f"  aria-selected: {btn_info['ariaSelected']}")
            print(f"  aria-pressed: {btn_info['ariaPressed']}")
            print(f"  className: {btn_info['className'][:100] if btn_info['className'] else 'None'}...")
            print(f"  visible: {btn_info['visible']}")
            print(f"  position: {btn_info['position']}")

            # 선택된 버튼 강조
            if btn_info['ariaSelected'] == 'true' or btn_info['ariaPressed'] == 'true':
                print(f"  ⭐ 이 버튼이 선택되어 있습니다!")

        # 현재 선택된 비율 찾기
        print(f"\n🎯 현재 선택된 비율:")
        selected = driver.execute_script("""
            const allButtons = Array.from(document.querySelectorAll('button'));

            // aria-selected="true" 또는 aria-pressed="true"인 버튼 찾기
            const selected = allButtons.filter(btn => {
                return btn.getAttribute('aria-selected') === 'true' ||
                       btn.getAttribute('aria-pressed') === 'true';
            });

            return selected.map(btn => ({
                text: btn.textContent.trim(),
                ariaLabel: btn.getAttribute('aria-label')
            }));
        """)

        if selected:
            for sel in selected:
                print(f"   ✅ {sel['text']} (aria-label: {sel['ariaLabel']})")
        else:
            print(f"   ⚠️ 선택된 버튼을 찾을 수 없습니다")

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
    success = check_current_ratio()
    sys.exit(0 if success else 1)
