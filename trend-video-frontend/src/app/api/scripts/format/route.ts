/**
 * @fileoverview script_content 컬럼 삭제 대응 리팩토링
 * @refactored 2025-11-28
 * @see .claude/REFACTORING_SPEC.md - 변경 스펙 문서 (수정 전 필독!)
 * @warning script_content 컬럼은 삭제됨. DB에서 읽으면 에러 발생.
 *          대본은 tasks/{id}/story.json 파일에서 읽어야 함.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getCurrentUser } from '@/lib/session';
import { extractPureJson, parseJsonSafely } from '@/lib/json-utils';
import { getOne, run } from '@/lib/mysql';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // 개발 완료 - 디버깅 로그 제거 (개발가이드 9. 로그 관리)
    // console.log('=== JSON 포맷팅 요청 시작 ===');

    const user = await getCurrentUser(request);
    // console.log('🔐 인증된 사용자:', user);

    if (!user) {
      // console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { scriptId, formattedContent } = body || {};
    // console.log('🧾 포맷팅 요청 scriptId:', scriptId, 'formattedContent 전달 여부:', Boolean(formattedContent));

    if (!scriptId) {
      // console.log('❌ scriptId 누락');
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    try {
      const script = await getOne('SELECT *, content_id as contentId FROM content WHERE content_id = ? AND user_id = ?', [scriptId, user.userId]) as any;

      if (!script) {
        // console.log('❌ 대본을 찾을 수 없거나 권한이 없습니다.');
        return NextResponse.json(
          { error: '대본을 찾을 수 없거나 권한이 없습니다.' },
          { status: 404 }
        );
      }

      // console.log('✅ 대본 조회 성공:', { id: script.id, title: script.title });

      let parsedData: any;
      let formattedContentToSave: string;

      if (formattedContent && typeof formattedContent === 'string' && formattedContent.trim().length > 0) {
        try {
          parsedData = JSON.parse(formattedContent);
          formattedContentToSave = JSON.stringify(parsedData, null, 2);
          // console.log('✅ 클라이언트에서 전달된 formattedContent 사용 (JSON)');
        } catch (overrideError: any) {
          // JSON 파싱 실패 - 상품정보 텍스트일 수 있음
          // ✅가 3개 이상 있으면 상품정보 텍스트로 간주하고 그대로 저장
          const checkMarkCount = (formattedContent.match(/✅/g) || []).length;
          if (checkMarkCount >= 3) {
            formattedContentToSave = formattedContent;
            console.log('✅ 상품정보 텍스트로 감지 - 텍스트 그대로 저장');
          } else {
            // 에러는 로그 유지
            console.error('❌ formattedContent JSON 파싱 실패:', overrideError);
            return NextResponse.json(
              { error: 'formattedContent가 올바른 JSON 형식이 아닙니다.' },
              { status: 400 }
            );
          }
        }
      } else {
        const rawContent = (script.content || '').trim();
        const cleanedContent = extractPureJson(rawContent) || rawContent;
        const parseResult = parseJsonSafely(cleanedContent, {
          logErrors: false,  // parseJsonSafely 내부 로그도 끔
          attemptFix: true
        });

        if (!parseResult.success || typeof parseResult.data === 'undefined') {
          // 에러는 로그 유지
          console.error('❌ JSON 파싱 실패 (서버 측):', parseResult.error);
          return NextResponse.json(
            { error: parseResult.error || 'JSON 파싱에 실패했습니다.' },
            { status: 400 }
          );
        }

        // console.log('✨ JSON 자동 보정 결과가 적용되었습니다.');

        parsedData = parseResult.data;
        formattedContentToSave = JSON.stringify(parsedData, null, 2);
      }
      // console.log('📏 원본 길이:', script.content.length, '→ 포맷팅 후:', formattedContentToSave.length);

      // script_content 컬럼 삭제됨 - story.json 파일에 저장
      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      const storyDir = path.join(backendPath, 'tasks', scriptId);
      const storyPath = path.join(storyDir, 'story.json');

      // 폴더 생성
      if (!fs.existsSync(storyDir)) {
        fs.mkdirSync(storyDir, { recursive: true });
      }

      // story.json 파일에 저장
      fs.writeFileSync(storyPath, formattedContentToSave, 'utf-8');

      // DB updated_at만 업데이트
      const result = await run("UPDATE content SET updated_at = NOW() WHERE content_id = ? AND user_id = ?", [scriptId, user.userId]);

      // console.log('📝 업데이트 결과:', { changes: result.changes });

      if (result.changes === 0) {
        // console.log('❌ DB 업데이트 실패');
        return NextResponse.json(
          { error: '데이터베이스 업데이트에 실패했습니다.' },
          { status: 500 }
        );
      }

      // console.log('✅ JSON 포맷팅 및 저장 성공');

      return NextResponse.json({
        success: true,
        message: 'JSON 포맷팅이 완료되었습니다.',
        formattedContent: formattedContentToSave
      });
    } catch (dbError: any) {
      console.error('❌ DB 오류:', dbError);
      throw dbError;
    }
  } catch (error: any) {
    // 에러는 로그 유지
    console.error('❌ JSON 포맷팅 에러:', error);
    return NextResponse.json(
      { error: error?.message || 'JSON 포맷팅 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
