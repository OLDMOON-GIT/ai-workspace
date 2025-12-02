# Frontend 통합 가이드 (Trend Video Frontend)

Next.js 16(App Router) + React 19 기반 프론트엔드 문서를 모아 빠르게 실행·탐색할 수 있도록 정리했습니다.

## 목차
- [빠른 시작](#빠른-시작)
- [주요 아키텍처/데이터 문서](#주요-아키텍처데이터-문서)
- [주요 도메인/기능 가이드](#주요-도메인가능-가이드)
- [배포/운영](#배포운영)
- [테스트/품질](#테스트품질)

## 빠른 시작
- 설치: `cd trend-video-frontend && npm install`
- 환경변수 예시(`.env.local`):
  - `ADMIN_SERVER_URL=http://oldmoon.iptime.org`
  - `YOUTUBE_API_KEY=<YouTube Data API key>`
- 개발 서버: `npm run dev:no-check` (기본 포트 `2000`)
- 유닛/통합 테스트: `npm test` 또는 `npm run test:watch`

## 주요 아키텍처/데이터 문서
- 전체 개요/레이어: `md/frontend/README.md`
- 아키텍처 다이어그램: `md/frontend/docs/ARCHITECTURE_OVERVIEW.md`
- DB/ERD: `md/frontend/docs/DATABASE_ERD.md`, `md/frontend/md/TABLE_RELATIONS.md`
- 시퀀스/데이터 흐름: `md/frontend/docs/SEQUENCE_DIAGRAMS.md`, `md/frontend/docs/JSON_PARSING_GUIDE.md`

## 주요 도메인/기능 가이드
- 쿠팡 연동/배포: `md/frontend/COUPANG_PARTNERS_GUIDE.md`, `md/frontend/COUPANG_SETUP_COMPLETE.md`, `md/frontend/COUPANG_SHOP_DEPLOYMENT.md`
- 워드프레스 자동 포스팅: `md/frontend/WORDPRESS_AUTO_POST_GUIDE.md`, `md/frontend/WORDPRESS_OAUTH_SETUP.md`
- SQL 매퍼/마이그레이션: `md/frontend/SQL_MAPPER_MIGRATION_REPORT.md`, `md/frontend/sql/README.md`
- 리팩토링/성능: `md/frontend/REFACTORING_GUIDE.md`
- 기능 목록/한글 안내: `md/frontend/기능목록.md`, `md/frontend/개발가이드.md`

## 배포/운영
- Vercel 배포 가이드: `md/frontend/VERCEL_DEPLOYMENT_GUIDE.md`
- 유지보수 체크리스트: `md/frontend/MAINTENANCE.md`

## 테스트/품질
- 회귀 테스트: `md/frontend/REGRESSION_TESTS.md`, `md/frontend/REGRESSION_TEST_RESULTS.md`, `md/frontend/REGRESSION_TEST_SUMMARY.md`
- 커버리지/정렬 테스트: `md/frontend/TEST_COVERAGE_DASHBOARD.md`, `md/frontend/SORTING_TEST_REPORT.md`
- 이미지 크롤러 테스트: `md/frontend/src/tests/IMAGE_CRAWLER_TEST_GUIDE.md`
