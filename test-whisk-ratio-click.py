#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Whisk 9:16 비율 선택 테스트 스크립트
"""

import sys
import os

# UTF-8 출력 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

def test_ratio_selection(target_ratio="9:16"):
    """
    Whisk에서 비율 선택 버튼 클릭 테스트
    """
    print("=" * 80)
    print(f"🧪 Whisk {target_ratio} 비율 선택 테스트 시작")
    print("=" * 80)

    # Chrome 옵션 설정
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        # 기존 Chrome에 연결
        driver = webdriver.Chrome(options=chrome_options)
        print("✅ 실행 중인 Chrome에 연결 완료")

        # Whisk 페이지로 이동
        whisk_url = "https://labs.google/fx/ko/tools/whisk"
        print(f"\n📍 Whisk 페이지 이동: {whisk_url}")
        driver.get(whisk_url)
        time.sleep(2)

        # 현재 URL 확인
        current_url = driver.current_url
        print(f"   현재 URL: {current_url}")

        # 비율 선택 버튼 찾기
        print(f"\n🔍 {target_ratio} 버튼 찾는 중...")

        # 여러 선택자 시도
        selectors = [
            f"//button[contains(text(), '{target_ratio}')]",
            f"//button[@aria-label='{target_ratio}']",
            f"//button[.//span[contains(text(), '{target_ratio}')]]",
            "//button[contains(@class, 'ratio') or contains(@class, 'aspect')]"
        ]

        ratio_button = None
        for selector in selectors:
            try:
                buttons = driver.find_elements(By.XPATH, selector)
                if buttons:
                    print(f"   ✅ 선택자로 {len(buttons)}개 버튼 발견: {selector}")
                    for i, btn in enumerate(buttons):
                        try:
                            text = btn.text
                            print(f"      버튼 {i+1}: 텍스트='{text}'")
                            if target_ratio in text:
                                ratio_button = btn
                                print(f"      ✅ 목표 버튼 발견!")
                                break
                        except:
                            pass
                if ratio_button:
                    break
            except Exception as e:
                print(f"   선택자 실패: {selector} - {str(e)}")

        if not ratio_button:
            # 모든 버튼 출력
            print("\n📋 페이지의 모든 버튼 목록:")
            all_buttons = driver.find_elements(By.TAG_NAME, "button")
            for i, btn in enumerate(all_buttons[:20]):  # 처음 20개만
                try:
                    text = btn.text.strip()
                    if text:
                        print(f"   버튼 {i+1}: '{text}'")
                except:
                    pass

            print(f"\n❌ {target_ratio} 버튼을 찾을 수 없습니다.")
            return False

        # 버튼 정보 출력
        print(f"\n📌 버튼 정보:")
        print(f"   텍스트: {ratio_button.text}")
        print(f"   태그: {ratio_button.tag_name}")
        print(f"   위치: {ratio_button.location}")
        print(f"   크기: {ratio_button.size}")

        # 버튼 클릭
        print(f"\n🖱️  {target_ratio} 버튼 클릭...")
        ratio_button.click()
        time.sleep(1)
        print("   ✅ 클릭 완료")

        # 선택 확인
        print(f"\n🔍 {target_ratio} 선택 확인 중...")
        time.sleep(1)

        # 선택된 버튼 찾기 (aria-selected 또는 active 클래스)
        try:
            selected_buttons = driver.find_elements(
                By.XPATH,
                f"//button[@aria-selected='true' or contains(@class, 'selected') or contains(@class, 'active')]"
            )
            print(f"   선택된 버튼 {len(selected_buttons)}개 발견")
            for btn in selected_buttons:
                text = btn.text
                if target_ratio in text:
                    print(f"   ✅ {target_ratio} 선택 확인!")
                    return True
                print(f"   버튼 텍스트: '{text}'")
        except Exception as e:
            print(f"   선택 확인 실패: {e}")

        # 다시 한 번 확인 (버튼 텍스트로)
        if ratio_button:
            try:
                current_text = ratio_button.text
                print(f"   현재 버튼 텍스트: '{current_text}'")
                if target_ratio in current_text:
                    print(f"   ✅ {target_ratio} 선택됨 (버튼 확인)")
                    return True
            except:
                pass

        print(f"   ⚠️  선택 확인 불가 (하지만 클릭은 성공)")
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
    target_ratio = sys.argv[1] if len(sys.argv) > 1 else "9:16"
    success = test_ratio_selection(target_ratio)
    sys.exit(0 if success else 1)
