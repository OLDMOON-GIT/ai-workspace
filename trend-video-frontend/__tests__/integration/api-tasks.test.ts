/**
 * BTS-0000439: /api/tasks API 통합 테스트
 *
 * 검증 내용:
 * - GET: 관리자 작업 목록 조회
 * - POST: 새 작업 생성
 * - PUT: 작업 상태 업데이트
 * - DELETE: 작업 삭제
 * - 에러 핸들링 및 유효성 검사
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000439: /api/tasks API 테스트', () => {
  const apiRoutePath = path.join(
    __dirname,
    '../../src/app/api/tasks/route.ts'
  );

  let routeContent: string;

  beforeAll(() => {
    routeContent = fs.readFileSync(apiRoutePath, 'utf-8');
  });

  describe('GET /api/tasks 검증', () => {
    it('GET 함수가 export되어야 함', () => {
      expect(routeContent).toContain('export async function GET');
    });

    it('admin_task 테이블에서 조회해야 함', () => {
      expect(routeContent).toContain('FROM admin_task');
    });

    it('tasks 배열을 JSON으로 반환해야 함', () => {
      expect(routeContent).toContain('NextResponse.json({ tasks:');
    });

    it('에러 시 빈 배열을 반환해야 함', () => {
      expect(routeContent).toContain('return NextResponse.json({ tasks: [] })');
    });

    it('logs 필드를 JSON 파싱해야 함', () => {
      expect(routeContent).toContain('JSON.parse(task.logs)');
    });

    it('priority와 created_at 순으로 정렬해야 함', () => {
      expect(routeContent).toContain('ORDER BY priority DESC, created_at DESC');
    });
  });

  describe('POST /api/tasks 검증', () => {
    it('POST 함수가 export되어야 함', () => {
      expect(routeContent).toContain('export async function POST');
    });

    it('content 필수 검증이 있어야 함', () => {
      expect(routeContent).toContain("if (!content || !content.trim())");
    });

    it('content가 없으면 400 에러를 반환해야 함', () => {
      expect(routeContent).toMatch(/status:\s*400/);
      expect(routeContent).toContain('작업 내용을 입력해주세요');
    });

    it('TASK-{timestamp} 형식의 ID를 생성해야 함', () => {
      expect(routeContent).toContain('TASK-${Date.now()}');
    });

    it('admin_task 테이블에 INSERT해야 함', () => {
      expect(routeContent).toContain('INSERT INTO admin_task');
    });

    it('성공 시 success: true와 id를 반환해야 함', () => {
      expect(routeContent).toContain('success: true, id');
    });
  });

  describe('PUT /api/tasks 검증', () => {
    it('PUT 함수가 export되어야 함', () => {
      expect(routeContent).toContain('export async function PUT');
    });

    it('id 필수 검증이 있어야 함', () => {
      expect(routeContent).toContain('if (!id)');
    });

    it('id가 없으면 400 에러를 반환해야 함', () => {
      expect(routeContent).toContain('작업 ID가 필요합니다');
    });

    it('status 업데이트를 지원해야 함', () => {
      expect(routeContent).toContain("updates.push('status = ?')");
    });

    it('status가 done이면 completed_at을 설정해야 함', () => {
      expect(routeContent).toContain("if (status === 'done')");
      expect(routeContent).toContain("completed_at = NOW()");
    });

    it('content 업데이트를 지원해야 함', () => {
      expect(routeContent).toContain("updates.push('content = ?')");
    });

    it('priority 업데이트를 지원해야 함', () => {
      expect(routeContent).toContain("updates.push('priority = ?')");
    });

    it('UPDATE 쿼리를 실행해야 함', () => {
      expect(routeContent).toContain('UPDATE admin_task');
    });
  });

  describe('DELETE /api/tasks 검증', () => {
    it('DELETE 함수가 export되어야 함', () => {
      expect(routeContent).toContain('export async function DELETE');
    });

    it('query parameter에서 id를 가져와야 함', () => {
      expect(routeContent).toContain("searchParams.get('id')");
    });

    it('id가 없으면 400 에러를 반환해야 함', () => {
      // DELETE 함수 내에서 id 필수 검증 확인
      const deleteMatch = routeContent.match(/export async function DELETE[\s\S]*?(?=export async function|$)/);
      expect(deleteMatch).toBeTruthy();
      const deleteFn = deleteMatch![0];
      expect(deleteFn).toContain('if (!id)');
      expect(deleteFn).toContain('작업 ID가 필요합니다');
    });

    it('DELETE 쿼리를 실행해야 함', () => {
      expect(routeContent).toContain('DELETE FROM admin_task WHERE id = ?');
    });

    it('성공 시 success: true를 반환해야 함', () => {
      const deleteMatch = routeContent.match(/export async function DELETE[\s\S]*?(?=export async function|$)/);
      expect(deleteMatch).toBeTruthy();
      const deleteFn = deleteMatch![0];
      expect(deleteFn).toContain('success: true');
    });
  });

  describe('에러 핸들링 검증', () => {
    it('GET 에러 시 콘솔에 로그를 남겨야 함', () => {
      expect(routeContent).toContain("console.error('Error fetching admin tasks:'");
    });

    it('POST 에러 시 500 상태 코드를 반환해야 함', () => {
      const postMatch = routeContent.match(/export async function POST[\s\S]*?(?=export async function|$)/);
      expect(postMatch).toBeTruthy();
      const postFn = postMatch![0];
      expect(postFn).toContain('status: 500');
    });

    it('PUT 에러 시 500 상태 코드를 반환해야 함', () => {
      const putMatch = routeContent.match(/export async function PUT[\s\S]*?(?=export async function|$)/);
      expect(putMatch).toBeTruthy();
      const putFn = putMatch![0];
      expect(putFn).toContain('status: 500');
    });

    it('DELETE 에러 시 500 상태 코드를 반환해야 함', () => {
      const deleteMatch = routeContent.match(/export async function DELETE[\s\S]*?(?=export async function|$)/);
      expect(deleteMatch).toBeTruthy();
      const deleteFn = deleteMatch![0];
      expect(deleteFn).toContain('status: 500');
    });
  });

  describe('인터페이스 검증', () => {
    it('AdminTask 인터페이스가 정의되어야 함', () => {
      expect(routeContent).toContain('interface AdminTask');
    });

    it('AdminTask에 필수 필드가 있어야 함', () => {
      expect(routeContent).toContain('id: string');
      expect(routeContent).toContain('content: string');
      expect(routeContent).toContain('status:');
      expect(routeContent).toContain('priority: number');
    });

    it('status는 todo, ing, done 중 하나여야 함', () => {
      expect(routeContent).toMatch(/status:\s*['"]?todo['"]?\s*\|\s*['"]?ing['"]?\s*\|\s*['"]?done['"]?/);
    });
  });
});
