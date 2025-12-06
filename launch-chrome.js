const { spawn } = require('child_process');

const chrome = spawn(
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  [
    '--remote-debugging-port=9222',
    '--user-data-dir=C:\\Users\\oldmoon\\workspace\\trend-video-backend\\.chrome-automation-profile',
    '--no-first-run',
    '--no-default-browser-check',
    'https://labs.google/fx/tools/image-fx'
  ],
  {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  }
);

chrome.unref();
console.log('Chrome launched with PID:', chrome.pid);
