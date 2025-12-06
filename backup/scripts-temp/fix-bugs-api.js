const fs = require('fs');
const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/bugs/route.ts';
let content = fs.readFileSync(filePath, 'utf8');

const oldCode = '// POST, PATCH, DELETE는 MCP Debugger가 자동으로 처리하므로 현재는 구현하지 않음';

const newCode = `// POST: 버그 등록
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type = 'bug', title, summary, priority = 'P2', status = 'open' } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 });
    }

    const [result] = await db.query(\`
      INSERT INTO bugs (type, title, summary, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    \`, [type, title.trim(), summary || null, priority, status]) as any;

    const bugId = result.insertId;

    return NextResponse.json({
      success: true,
      bugId,
      message: \`버그 \${bugId}가 등록되었습니다\`
    });
  } catch (error: any) {
    console.error('POST /api/bugs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS');
} else {
  console.log('Pattern not found');
}
