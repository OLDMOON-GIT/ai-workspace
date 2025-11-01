"""
Claude.ai 로그인 상태 체크 스크립트
서버 시작 시 자동으로 실행되어 로그인 상태를 확인합니다.
"""
import asyncio
import sys
from playwright.async_api import async_playwright
from colorama import Fore, Style, init
import os
import pathlib

init(autoreset=True)

async def check_claude_login():
    """Claude.ai 로그인 상태 확인"""

    print(f"\n{Fore.YELLOW}{'='*80}{Style.RESET_ALL}")
    print(f"{Fore.YELLOW}{Style.BRIGHT}Claude.ai 로그인 상태 확인{Style.RESET_ALL}")
    print(f"{Fore.YELLOW}{'='*80}{Style.RESET_ALL}\n")

    # 프로젝트별로 다른 프로필 사용
    automation_profile = os.path.join(os.getcwd(), '.chrome-automation-profile-aggregator')
    pathlib.Path(automation_profile).mkdir(exist_ok=True)

    async with async_playwright() as p:
        try:
            # Chrome 프로필로 브라우저 실행 (headless)
            context = await p.chromium.launch_persistent_context(
                automation_profile,
                headless=True,
                channel='chrome',
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                    '--no-default-browser-check',
                ],
                timeout=30000,
            )

            page = await context.new_page()

            # Claude.ai 접속
            print(f"{Fore.CYAN}[CHECK] Claude.ai 접속 중...{Style.RESET_ALL}")
            await page.goto('https://claude.ai/', wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)

            # 로그인 페이지 감지
            page_content = await page.content()
            login_indicators = [
                'Continue with Google',
                'Continue with email',
                'Continue with SSO',
                'Sign in',
                'Log in'
            ]

            is_login_page = any(indicator in page_content for indicator in login_indicators)

            if is_login_page:
                print(f"{Fore.RED}{'='*80}{Style.RESET_ALL}")
                print(f"{Fore.RED}{Style.BRIGHT}❌ Claude.ai 로그인이 필요합니다!{Style.RESET_ALL}")
                print(f"{Fore.RED}{'='*80}{Style.RESET_ALL}\n")
                print(f"{Fore.YELLOW}브라우저 창을 열어 로그인하세요...{Style.RESET_ALL}\n")

                await page.close()
                await context.close()

                # Headful 모드로 다시 실행 (브라우저 창 표시)
                context_headful = await p.chromium.launch_persistent_context(
                    automation_profile,
                    headless=False,
                    channel='chrome',
                    args=[
                        '--disable-blink-features=AutomationControlled',
                        '--disable-dev-shm-usage',
                    ],
                    timeout=60000,
                )

                page_headful = await context_headful.new_page()
                await page_headful.goto('https://claude.ai/', wait_until='networkidle')

                print(f"{Fore.YELLOW}브라우저 창에서 Claude.ai에 로그인하세요.{Style.RESET_ALL}")
                print(f"{Fore.YELLOW}로그인 완료 후 아무 키나 누르세요...{Style.RESET_ALL}")

                input()

                # 로그인 확인
                await asyncio.sleep(2)

                # 입력 필드 찾기
                selectors = [
                    'div[contenteditable="true"]',
                    '[contenteditable="true"]',
                    'textarea',
                    'div[role="textbox"]',
                ]

                found = False
                for selector in selectors:
                    try:
                        await page_headful.wait_for_selector(selector, timeout=3000)
                        found = True
                        break
                    except:
                        continue

                await context_headful.close()

                if found:
                    print(f"\n{Fore.GREEN}{'='*80}{Style.RESET_ALL}")
                    print(f"{Fore.GREEN}{Style.BRIGHT}✅ 로그인 성공! 세션이 저장되었습니다.{Style.RESET_ALL}")
                    print(f"{Fore.GREEN}{'='*80}{Style.RESET_ALL}\n")
                    return True
                else:
                    print(f"\n{Fore.RED}❌ 로그인에 실패했습니다. 다시 시도해주세요.{Style.RESET_ALL}\n")
                    return False
            else:
                # 입력 필드 확인
                selectors = [
                    'div[contenteditable="true"]',
                    '[contenteditable="true"]',
                    'textarea',
                    'div[role="textbox"]',
                ]

                found = False
                for selector in selectors:
                    try:
                        await page.wait_for_selector(selector, timeout=3000)
                        found = True
                        break
                    except:
                        continue

                await page.close()
                await context.close()

                if found:
                    print(f"{Fore.GREEN}{'='*80}{Style.RESET_ALL}")
                    print(f"{Fore.GREEN}{Style.BRIGHT}✅ Claude.ai 로그인 상태 정상{Style.RESET_ALL}")
                    print(f"{Fore.GREEN}{'='*80}{Style.RESET_ALL}\n")
                    return True
                else:
                    print(f"{Fore.YELLOW}⚠️ 로그인 상태를 확인할 수 없습니다.{Style.RESET_ALL}\n")
                    return False

        except Exception as e:
            print(f"{Fore.RED}❌ 로그인 체크 중 오류: {str(e)}{Style.RESET_ALL}\n")
            return False

if __name__ == '__main__':
    result = asyncio.run(check_claude_login())
    sys.exit(0 if result else 1)
