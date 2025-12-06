/**
 * @fileoverview script_content 컬럼 삭제 대응 리팩토링
 * @refactored 2025-11-28
 * @see .claude/REFACTORING_SPEC.md - 변경 스펙 문서 (수정 전 필독!)
 * @warning script_content 컬럼은 삭제됨. DB에서 읽으면 에러 발생.
 *          대본은 tasks/{id}/story.json 파일에서 읽어야 함.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { calculateProgress, getContentLogs, getScriptContent } from '@/lib/content';
import { getAll, getOne, run } from '@/lib/mysql';

// GET - 사용자의 대본 목록 조회 (contents 테이블 사용)
export async function GET(request: NextRequest) {
  try {
    console.log('=== 대본 목록 조회 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('사용자 ID로 대본 조회 중:', user.userId);

    // URL 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    console.log('필터 - 제한:', limit, '| 오프셋:', offset, '| 검색:', search);

    try {
      // MySQL: using imported db from sqlite wrapper
      console.log('🔍 쿼리:', 'SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?');
      console.log('🔍 파라미터:', user.userId, limit, offset);

      // 1. contents 테이블에서 대본 가져오기 (LIMIT 적용)
      let allScripts = await getAll(`
        SELECT * FROM content
        WHERE user_id = ? AND status = 'script'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [user.userId, limit + offset, 0]) as any[];

      console.log('📊 조회된 완료 대본 개수:', allScripts.length);

      // scripts_temp 테이블 제거됨 - contents만 사용
      const tempScripts: any[] = [];

      // 자동화 DB에서 스크립트 ID들의 큐 상태 조회 (진행중 + 완료 모두)
      // MySQL: using same db connection (unified database)
      const queueStatusMap: Record<string, any> = {};

      try {
        const allScriptIds = [...tempScripts.map(s => s.id), ...allScripts.map(s => s.content_id)];

        if (allScriptIds.length > 0) {
          const placeholders = allScriptIds.map(() => '?').join(',');
          const queueQuery = `
            SELECT
              tq.task_id,
              tq.status,
              t.scheduled_time
            FROM task_queue tq
            LEFT JOIN task t ON tq.task_id = t.task_id
            WHERE tq.task_id IN (${placeholders})
            ORDER BY tq.created_at DESC
          `;
          const queueRows = await getAll(queueQuery, allScriptIds) as any[];

          queueRows.forEach((row: any) => {
            if (!queueStatusMap[row.task_id]) {
              queueStatusMap[row.task_id] = {
                inQueue: true,
                queueStatus: row.status,
                scheduledTime: row.scheduled_time
              };
            }
          });
        }
      } catch (autoError) {
        console.warn('⚠️ 자동화 큐 상태 조회 실패 (무시됨):', autoError);
      }

      // tempScripts를 Script 형식으로 변환
      const tempScriptsConverted = tempScripts.map((row: any) => {
        const logs = row.logs ? JSON.parse(row.logs) : [];

        // status 매핑: PENDING/ING -> processing, ERROR -> failed, WAITING_LOGIN -> pending
        let mappedStatus: 'pending' | 'processing' | 'completed' | 'failed' = 'processing';
        if (row.status === 'PENDING' || row.status === 'WAITING_LOGIN') {
          mappedStatus = 'pending';
        } else if (row.status === 'ERROR') {
          mappedStatus = 'failed';
        } else if (row.status === 'ING') {
          mappedStatus = 'processing';
        }

        // progress 계산 (로그 개수 기반)
        let progress = 0;
        if (mappedStatus === 'processing') {
          progress = Math.min(Math.floor((logs.length / 10) * 90), 90);
        } else if (mappedStatus === 'failed') {
          progress = 0;
        }

        // 자동화 큐 상태 추가
        const queueInfo = queueStatusMap[row.id];

        return {
          id: row.id,
          userId: user.userId, // 현재 사용자로 설정 (scripts_temp에는 userId가 없음)
          title: row.title || row.originalTitle || '제목 없음',
          originalTitle: row.originalTitle,
          content: '', // 진행 중이므로 내용 없음
          status: mappedStatus,
          progress: progress,
          error: row.status === 'ERROR' ? row.message : undefined,
          type: row.type as 'longform' | 'shortform' | 'sora2',
          logs: logs.map((log: any) => typeof log === 'object' ? log.message : log),
          useClaudeLocal: row.useClaudeLocal === 1,
          aiModel: row.ai_model || 'claude',
          createdAt: row.createdAt,
          updatedAt: row.createdAt,
          // 자동화 큐 정보
          automationQueue: queueInfo
        };
      });

      // contents → Script 형식으로 변환
      const completedScripts = allScripts.map((row: any) => {
        // 로그 가져오기 (파일 기반)
        const logs = getContentLogs(row.content_id);

        // 자동화 큐 상태 추가
        const queueInfo = queueStatusMap[row.content_id];

        const status = row.status || 'completed';
        return {
          id: row.content_id,
          userId: row.user_id,
          title: row.title,
          originalTitle: row.original_title,
          content: getScriptContent(row.content_id) || '',
          status: status,
          progress: calculateProgress(status),
          error: row.error,
          type: row.prompt_format, // prompt_format → type
          logs: logs.length > 0 ? logs : undefined,
          tokenUsage: row.input_tokens || row.output_tokens ? {
            input_tokens: row.input_tokens || 0,
            output_tokens: row.output_tokens || 0
          } : undefined,
          useClaudeLocal: row.use_local_chrome === 1,
          aiModel: row.ai_model || 'claude',  // AI 모델 정보
          sourceContentId: row.source_content_id,  // 원본 컨텐츠 ID
          category: row.category,  // 카테고리
          createdAt: row.created_at,
          updatedAt: row.updated_at || row.created_at,
          // 자동화 큐 정보
          automationQueue: queueInfo
        };
      });

      // 진행 중인 대본과 완료된 대본 합치기 (최신순으로 정렬)
      allScripts = [...tempScriptsConverted, ...completedScripts].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      // 검색이 있을 경우에만 필터링
      if (search) {
        const searchLower = search.toLowerCase();
        allScripts = allScripts.filter(script =>
          script.title?.toLowerCase().includes(searchLower) ||
          script.originalTitle?.toLowerCase().includes(searchLower) ||
          script.id?.toLowerCase().includes(searchLower) ||
          script.status?.toLowerCase().includes(searchLower)
        );
        console.log('검색 후 대본 개수:', allScripts.length);
      }

      console.log('📊 전체 대본 개수 (진행중 + 완료):', allScripts.length);

      // 전체 개수 (DB에서 COUNT 쿼리로 가져오기 - 더 정확함)
      const totalRow = await getOne(`
        SELECT COUNT(*) as count FROM content
        WHERE user_id = ? AND status = 'script'
      `, [user.userId]) as any;
      const total = totalRow?.count || 0;

      // 페이징 (이미 LIMIT으로 가져왔으므로 offset만 적용)
      const scripts = allScripts.slice(offset, offset + limit);

      console.log('대본 목록:', scripts.map(s => ({ id: s.id, title: s.title, status: s.status })));

      return NextResponse.json({
        scripts,
        total,
        hasMore: offset + limit < total
      });

    } finally {
      // MySQL: pool manages connections automatically
    }

  } catch (error: any) {
    console.error('❌ Error fetching scripts:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error?.message || '대본 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE - 대본 삭제 (contents 테이블 사용)
export async function DELETE(request: NextRequest) {
  try {
    console.log('=== 대본 삭제 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');
    console.log('🗑️ 삭제 요청 scriptId:', scriptId);

    if (!scriptId) {
      console.log('❌ scriptId 없음');
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    try {
      // MySQL: using imported db from sqlite wrapper

      // 1. 자동화 데이터베이스에서 해당 스크립트와 연결된 큐 취소
      try {
        const cancelResult = await run(`
          UPDATE task_queue
          SET status = 'cancelled', error = NULL
          WHERE task_id = ? AND status IN ('waiting', 'processing')
        `, [scriptId]);
        console.log('📊 자동화 큐 취소 결과:', { changes: cancelResult.changes });
      } catch (autoError) {
        console.warn('⚠️ 자동화 DB 업데이트 실패 (무시됨):', autoError);
      }

      // 2. contents 테이블에서 삭제 시도 (소유자 확인 포함)
      const deleteQuery = 'DELETE FROM content WHERE content_id = ? AND user_id = ?';
      console.log('🔍 실행할 쿼리:', deleteQuery);
      console.log('🔍 파라미터:', { content_id: scriptId, user_id: user.userId });

      const result = await run(deleteQuery, [scriptId, user.userId]);

      console.log('📊 contents 삭제 결과:', { changes: result.changes });

      if (result.changes > 0) {
        console.log('✅ contents 테이블에서 삭제 성공');
        return NextResponse.json({
          success: true,
          message: '대본이 삭제되었습니다.'
        });
      }

      // contents에 없으면 404
      console.log('❌ 삭제 실패: contents에 없음');

      return NextResponse.json(
        { error: '컨텐츠를 찾을 수 없거나 권한이 없습니다.' },
        { status: 404 }
      );

    } catch (error: any) {
      console.error('❌ 삭제 에러:', error);
      return NextResponse.json(
        { error: error?.message || '대본 삭제 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('❌ 삭제 에러:', error);
    return NextResponse.json(
      { error: error?.message || '대본 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
