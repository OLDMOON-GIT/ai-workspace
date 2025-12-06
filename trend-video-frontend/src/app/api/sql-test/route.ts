/**
 * SQL Mapper 테스트 API
 *
 * GET /api/sql-test - SQL Mapper 정보 조회
 * GET /api/sql-test?namespace=automation&sqlId=getPendingSchedules - 특정 SQL 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSql, getSqlMapper } from '@/lib/sql-mapper';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace');
    const sqlId = searchParams.get('sqlId');

    const mapper = getSqlMapper();

    // 특정 SQL 조회
    if (namespace && sqlId) {
      try {
        const sql = getSql(namespace, sqlId);
        return NextResponse.json({
          namespace,
          sqlId,
          sql,
          lines: sql.split('\n').length
        });
      } catch (error: any) {
        return NextResponse.json({
          error: error.message
        }, { status: 404 });
      }
    }

    // 전체 정보 조회
    const namespaces = mapper.getNamespaces();
    const summary: Record<string, string[]> = {};

    for (const ns of namespaces) {
      summary[ns] = mapper.getSqlIds(ns);
    }

    return NextResponse.json({
      initialized: true,
      namespaces,
      summary,
      totalNamespaces: namespaces.length,
      totalSqls: Object.values(summary).reduce((sum, ids) => sum + ids.length, 0),
      usage: {
        getAllInfo: 'GET /api/sql-test',
        getSingleSql: 'GET /api/sql-test?namespace=automation&sqlId=getPendingSchedules',
        listNamespace: 'GET /api/sql-test?namespace=automation'
      }
    });

  } catch (error: any) {
    console.error('SQL Test API error:', error);
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
