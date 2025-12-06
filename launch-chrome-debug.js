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
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  }
);

chrome.stdout.on('data', (data) => {
  console.log('stdout:', data.toString());
});

chrome.stderr.on('data', (data) => {
  console.log('stderr:', data.toString());
});

chrome.on('error', (err) => {
  console.log('Error:', err);
});

chrome.on('exit', (code) => {
  console.log('Chrome exited with code:', code);
});

console.log('Chrome launched with PID:', chrome.pid);

// Keep process alive for 10 seconds to see output
setTimeout(() => {
  console.log('Timeout reached');
  process.exit(0);
}, 10000);
