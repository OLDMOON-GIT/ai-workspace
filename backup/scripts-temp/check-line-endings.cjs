const fs = require('fs');
const content = fs.readFileSync('trend-video-frontend/src/lib/automation-scheduler.ts', 'utf-8');
console.log('Has CRLF:', content.includes('\r\n'));
console.log('First 100 chars hex:', Buffer.from(content.substring(0, 100)).toString('hex').match(/.{2}/g).join(' '));
