/**
 * @fileoverview Next.js Instrumentation Hook
 * @description 서버 시작 시 한 번 실행되는 코드
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

/**
 * BTS-3366: contents 호환성 뷰 생성
 * 구형 'contents' 테이블명을 참조하는 코드를 위한 뷰 생성
 */
async function ensureContentsView() {
  try {
    const { run, getOne } = await import('./lib/mysql');

    // 이미 contents 뷰가 있는지 확인
    const existing = await getOne<{ TABLE_NAME: string }>(
      `SELECT TABLE_NAME FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contents'`
    );

    if (existing) {
      // 이미 뷰가 존재함
      return;
    }

    // contents 뷰 생성
    await run(`
      CREATE OR REPLACE VIEW contents AS
      SELECT
        content_id AS id,
        user_id,
        'script' AS type,
        prompt_format AS format,
        title,
        original_title,
        status,
        error,
        input_tokens,
        output_tokens,
        source_content_id,
        created_at,
        updated_at
      FROM content
    `);

    console.log('✅ [INSTRUMENTATION] BTS-3366: contents 호환성 뷰 생성됨');
  } catch (error: any) {
    // 뷰 생성 실패는 치명적이지 않음 (이미 테이블이 존재할 수 있음)
    if (!error.message?.includes('already exists')) {
      console.warn('⚠️  [INSTRUMENTATION] contents 뷰 생성 실패:', error.message);
    }
  }
}

/**
 * MySQL 연결 대기 함수 (최대 30초)
 */
async function waitForMySQL(maxRetries = 10, delayMs = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { getOne } = await import('./lib/mysql');
      await getOne('SELECT 1 as test');
      console.log('✅ [INSTRUMENTATION] MySQL 연결 성공');
      return true;
    } catch (error: any) {
      if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('❌ [INSTRUMENTATION] MySQL 접속 권한 오류 - 비밀번호를 확인하세요');
        return false;
      }
      if (i < maxRetries - 1) {
        console.log(`⏳ [INSTRUMENTATION] MySQL 연결 대기 중... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  console.error('❌ [INSTRUMENTATION] MySQL 연결 실패 (타임아웃)');
  return false;
}

export async function register() {
  // 서버 사이드에서만 실행
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('🚀 [INSTRUMENTATION] Next.js 서버 시작됨');
    console.log(`📅 [INSTRUMENTATION] 시작 시간: ${new Date().toLocaleString('ko-KR')}`);

    // MySQL 연결 대기
    const mysqlReady = await waitForMySQL();
    if (!mysqlReady) {
      console.error('⚠️  [INSTRUMENTATION] MySQL 연결 실패로 복구 로직을 건너뜁니다');
      return;
    }

    try {
      // BTS-3366: contents 호환성 뷰 생성 (구형 테이블명 지원)
      await ensureContentsView();

      // 동적 임포트로 서버 전용 모듈 로드
      const { recoverStaleProcessingJobs } = await import('./lib/startup-recovery');

      // 서버 재시작 시 중단된 작업 복구
      const result = await recoverStaleProcessingJobs();

      if (result.recoveredIds.length > 0) {
        console.log(`🔄 [INSTRUMENTATION] ${result.recoveredIds.length}개의 중단된 작업이 복구되었습니다.`);
      }
    } catch (error) {
      console.error('❌ [INSTRUMENTATION] 복구 로직 실행 중 오류:', error);
    }
  }
}
