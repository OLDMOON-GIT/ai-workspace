const fs = require('fs');
const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/bugs/start-work/route.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

const oldCode = `    // Claude CLI 프롬프트 생성
    const bugType = bug.type === 'spec' ? 'SPEC' : '버그';
    const prompt = \`\${bugId} \${bugType} 수정 작업을 시작합니다.

제목: \${bug.title}
\${bug.summary ? \`설명: \${bug.summary}\` : ''}
우선순위: \${bug.priority || 'P2'}

1. 먼저 CLAUDE.md를 읽고 개발 가이드를 숙지해주세요
2. 해당 \${bugType}를 분석하고 수정해주세요
3. 수정 완료 후 bugs 테이블에서 status를 resolved로 변경하고 resolution_note에 해결 내용을 기록해주세요\`;

    // Windows에서 새 cmd 창으로 Claude CLI 실행
    const workspacePath = 'C:\\\\Users\\\\oldmoon\\\\workspace';

    // cmd.exe를 통해 새 터미널 창에서 claude 실행
    const child = spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', \`cd /d "\${workspacePath}" && claude "\${prompt.replace(/"/g, '\\\\"')}"\`], {
      detached: true,
      stdio: 'ignore',
      shell: true
    });`;

const newCode = `    // Claude CLI 프롬프트 생성 (한 줄로 - Windows cmd 호환)
    const bugType = bug.type === 'spec' ? 'SPEC' : '버그';
    const title = (bug.title || '').replace(/"/g, "'").replace(/\\n/g, ' ').trim();
    const summary = (bug.summary || '').replace(/"/g, "'").replace(/\\n/g, ' ').substring(0, 200).trim();
    const prompt = \`\${bugId} \${bugType}: \${title}\${summary ? ' - ' + summary : ''}\`;

    // Windows에서 새 cmd 창으로 Claude CLI 실행
    const workspacePath = 'C:\\\\Users\\\\oldmoon\\\\workspace';

    // cmd.exe를 통해 새 터미널 창에서 claude 실행 (--dangerously-skip-permissions 추가)
    const child = spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', \`cd /d "\${workspacePath}" && claude --dangerously-skip-permissions "\${prompt}"\`], {
      detached: true,
      stdio: 'ignore',
      shell: true
    });`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS');
} else {
  console.log('Pattern not found');
  // Try to find any part of the pattern
  if (content.includes('Claude CLI 프롬프트 생성')) {
    console.log('Found: Claude CLI 프롬프트 생성');
  }
  if (content.includes('수정 작업을 시작합니다')) {
    console.log('Found: 수정 작업을 시작합니다');
  }
}
