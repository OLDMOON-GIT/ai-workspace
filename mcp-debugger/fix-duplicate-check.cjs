const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/app/api/bugs/route.ts';
let content = fs.readFileSync(filePath, 'utf-8');

const oldCode = `    if (!['bug', 'spec'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // AUTO_INCREMENT 사용 (id 컬럼 생략)`;

const newCode = `    if (!['bug', 'spec'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // 중복 방지: 최근 10개 버그의 title과 비교
    const [recentBugs] = await db.query(
      'SELECT id, title FROM bugs ORDER BY created_at DESC LIMIT 10'
    ) as any;

    const duplicateBug = recentBugs.find((bug: any) => bug.title === title);
    if (duplicateBug) {
      const existingId = formatBugId(duplicateBug.id);
      return NextResponse.json({
        error: \`동일한 제목의 버그가 이미 존재합니다: \${existingId}\`,
        existingId,
        duplicate: true
      }, { status: 409 });
    }

    // AUTO_INCREMENT 사용 (id 컬럼 생략)`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content);
  console.log('중복 체크 로직 추가 완료');
} else {
  console.log('수정할 코드를 찾지 못했습니다.');
  console.log('이미 중복 체크 있음:', content.includes('중복 방지'));
}
