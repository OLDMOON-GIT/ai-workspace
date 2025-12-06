Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """C:\Program Files\Google\Chrome\Application\chrome.exe"" --remote-debugging-port=9222 --user-data-dir=""C:\Users\oldmoon\workspace\trend-video-backend\.chrome-automation-profile"" --no-first-run --no-default-browser-check https://labs.google/fx/tools/image-fx", 1, False
