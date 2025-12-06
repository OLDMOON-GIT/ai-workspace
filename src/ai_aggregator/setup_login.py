import asyncio
import os
import pathlib
import sys
from typing import List

from playwright.async_api import async_playwright
from colorama import Fore, Style, init

init(autoreset=True)

# Function to safely kill Chrome processes (from patch-chrome-lockfile.py)
# This function helps to ensure a clean state before launching Chrome
def kill_chrome_processes(profile_path):
    print(f"{Fore.YELLOW}[INFO] Attempting to kill Chrome processes for profile: {profile_path}{Style.RESET_ALL}")
    try:
        import subprocess
        import time

        # Windows-specific command to kill Chrome processes associated with the profile
        subprocess.run(
            ['powershell', '-Command',
             f"Get-Process chrome -ErrorAction SilentlyContinue | Where-Object {{ $_.CommandLine -like '*{profile_path}*' }} | Stop-Process -Force -ErrorAction SilentlyContinue"],
            capture_output=True,
            timeout=10
        )
        time.sleep(2) # Give processes time to terminate
        print(f"{Fore.GREEN}[INFO] Successfully killed Chrome processes for profile.{Style.RESET_ALL}")
        return True
    except Exception as e:
        print(f"{Fore.YELLOW}[WARN] Could not kill Chrome processes for profile: {e}{Style.RESET_ALL}")
        return False

async def setup_login(agents_list: List[str]):
    print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}AI Service Login Setup{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}\n")

    print(f"{Fore.CYAN}Your login will be saved for future use.{Style.RESET_ALL}\n")

    # AI service URLs
    ai_urls = {
        'chatgpt': 'https://chatgpt.com/',
        'claude': 'https://claude.ai/',
        'gemini': 'https://gemini.google.com/',
        'grok': 'https://x.com/i/grok',
    }

    async with async_playwright() as p:
        # Use a dedicated profile for automation
        # 자동화 프로필 (trend-video-backend)
        script_dir = os.path.dirname(os.path.abspath(__file__))  # src/ai_aggregator
        project_root = os.path.dirname(os.path.dirname(script_dir))  # trend-video-backend
        automation_profile = os.path.join(project_root, '.chrome-automation-profile')
        pathlib.Path(automation_profile).mkdir(exist_ok=True)

        # Clean up stale Chrome profile locks to prevent immediate crashes
        lock_files = [
            os.path.join(automation_profile, 'SingletonLock'),
            os.path.join(automation_profile, 'SingletonCookie'),
            os.path.join(automation_profile, 'SingletonSocket'),
            os.path.join(automation_profile, 'lockfile'),
        ]
        lock_remove_failed = False
        for lock_file in lock_files:
            try:
                if os.path.exists(lock_file):
                    os.remove(lock_file)
                    print(f"{Fore.YELLOW}[INFO] Removed stale lock file: {os.path.basename(lock_file)}{Style.RESET_ALL}")
            except Exception as e:
                print(f"{Fore.YELLOW}[WARN] Could not remove lock file {lock_file}: {e}{Style.RESET_ALL}")
                lock_remove_failed = True

        if lock_remove_failed:
            print(f"{Fore.YELLOW}[INFO] Killing Chrome processes using automation profile to clear locks...{Style.RESET_ALL}")
            try:
                # Use the new kill_chrome_processes function
                kill_chrome_processes(automation_profile)

                # After killing, try removing locks again
                for lock_file in lock_files:
                    try:
                        if os.path.exists(lock_file):
                            os.remove(lock_file)
                            print(f"{Fore.GREEN}[INFO] Removed lock file after killing Chrome: {os.path.basename(lock_file)}{Style.RESET_ALL}")
                    except Exception as retry_err:
                        print(f"{Fore.RED}[ERROR] Still could not remove lock file {lock_file}: {retry_err}{Style.RESET_ALL}")
            except Exception as kill_error:
                print(f"{Fore.YELLOW}[WARN] Could not clean Chrome processes: {kill_error}{Style.RESET_ALL}")

        print(f"{Fore.YELLOW}[INFO] 자동화 프로필: {project_root}{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}[INFO] Chrome 프로필 경로: {automation_profile}{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}[INFO] This profile will save your login sessions{Style.RESET_ALL}\n")

        print(f"{Fore.YELLOW}[INFO] Launching Chrome...{Style.RESET_ALL}")

        # BTS-3170: 웹훅으로 인한 TargetClosedError 발생 - 재시도 로직 제거
        async def try_launch_browser(use_chrome_channel: bool):
            """Chrome/Chromium 브라우저를 실행 (재시도 제거)"""
            channel_opt = {{'channel': 'chrome'}} if use_chrome_channel else {{}}
            browser_name = 'Chrome' if use_chrome_channel else 'Chromium'

            try:
                ctx = await p.chromium.launch_persistent_context(
                    automation_profile,
                    headless=False,
                    **channel_opt,
                    args=[
                        '--disable-blink-features=AutomationControlled',
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    ],
                    accept_downloads=True,
                    timeout=60000,
                )
                # Remove navigator.webdriver flag
                await ctx.add_init_script(""")
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                """)
                return ctx
            except Exception as e:
                raise e

        # BEGIN INDENTED BLOCK
        context = None
        try:
            context = await try_launch_browser(use_chrome_channel=True)
        except Exception as e:
            print(f"{Fore.RED}[ERROR] Could not launch Chrome: {e}{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}[INFO] Trying with Chromium instead...{Style.RESET_ALL}")
            try:
                context = await try_launch_browser(use_chrome_channel=False)
            except Exception as e2:
                print(f"{Fore.RED}[ERROR] Could not launch Chromium either: {e2}{Style.RESET_ALL}")
                raise e2

        # Open all AI services in tabs
        pages = []
        for agent_name in agents_list:
            if agent_name.lower() in ai_urls:
                url = ai_urls[agent_name.lower()]
                print(f"\n{Fore.CYAN}Opening {agent_name.upper()}...{Style.RESET_ALL}")
                page = await context.new_page()

                # Try to load page (no retries)
                try:
                    print(f"{Fore.YELLOW}  Loading {url}...{Style.RESET_ALL}")
                    await page.goto(url, wait_until='load', timeout=60000)
                    print(f"{Fore.GREEN}  [SUCCESS] {agent_name.upper()} loaded successfully{Style.RESET_ALL}")
                except Exception as e:
                    print(f"{Fore.RED}  [ERROR] {agent_name.upper()} failed to load: {e}{Style.RESET_ALL}")

                pages.append((agent_name, page))
                await asyncio.sleep(2)

        print(f"\n{Fore.GREEN}{'='*80}{Style.RESET_ALL}")
        print(f"{Fore.GREEN}All AI services opened!{Style.RESET_ALL}")
        print(f"{Fore.GREEN}{'='*80}{Style.RESET_ALL}\n")

        print(f"{Fore.YELLOW}Please login to each AI service in the browser tabs.{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}Take your time - there's no rush.{Style.RESET_ALL}\n")

        for agent_name, _ in pages:
            print(f"  - {agent_name.upper()}")

        print(f"\n{Fore.CYAN}When you're done logging in to all services:{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}Press ENTER to save and close...{Style.RESET_ALL}")

        # Simple synchronous input (blocks until Enter is pressed)
        import sys
        sys.stdin.read(1)  # Wait for any input

        print(f"\n{Fore.YELLOW}[INFO] Saving session data...{Style.RESET_ALL}")

        # Close all pages
        for _, page in pages:
            await page.close()

        # Close context to save cookies
        await context.close()
        await asyncio.sleep(1)

        print(f"\n{Fore.GREEN}{'='*80}{Style.RESET_ALL}")
        print(f"{Fore.GREEN}Setup Complete!{Style.RESET_ALL}")
        print(f"{Fore.GREEN}{'='*80}{Style.RESET_ALL}\n")

        print(f"{Fore.CYAN}You can now use the main program:{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}  python main.py -q "your question" -a chatgpt,claude{Style.RESET_ALL}\n")
        # END INDENTED BLOCK

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Setup login for AI services')
    parser.add_argument('-a', '--agents', type=str,
                        help='Comma-separated list of agents (chatgpt,claude,gemini,grok)',
                        default='chatgpt,claude,gemini,grok')

    args = parser.parse_args()
    agents = [a.strip().lower() for a in args.agents.split(',')]

    asyncio.run(setup_login(agents))