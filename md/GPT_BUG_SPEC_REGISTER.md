# ChatGPT GPT Builder - 버그/스펙 자동 등록 워크플로우

## 1. API 정보

### 엔드포인트
```
POST http://oldmoon.iptime.org:2000/api/external/bugs
GET  http://oldmoon.iptime.org:2000/api/external/bugs
```

### 인증
- **API Key**: `trend-video-gpt-2024-secret-key` (또는 서버 ENV `EXTERNAL_API_KEY`)
- **Header**: `Authorization: Bearer {API_KEY}` 또는 `X-API-Key: {API_KEY}`

---

## 2. OpenAPI 스펙 (GPT Builder에 복사)

```yaml
openapi: 3.1.0
info:
  title: Trend Video External Bug/Spec API
  description: 외부 클라이언트에서 버그와 SPEC을 조회/등록하는 API
  version: 1.0.0
servers:
  - url: http://oldmoon.iptime.org:2000
    description: Production
paths:
  /api/external/bugs:
    get:
      operationId: listExternalBugs
      summary: 버그/SPEC 목록 조회
      description: status/type 조건으로 버그와 SPEC을 조회합니다.
      security:
        - bearerAuth: []
      parameters:
        - in: query
          name: status
          description: 상태 필터
          schema:
            type: string
            enum: [open, in_progress, resolved, closed, all]
            default: open
        - in: query
          name: type
          description: 타입 필터
          schema:
            type: string
            enum: [bug, spec, all]
            default: all
        - in: query
          name: limit
          description: 조회 건수 (최대 100)
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        '200':
          description: 조회 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BugListResponse'
        '401':
          description: 인증 실패
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          description: 서버 오류
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
    post:
      operationId: createExternalBug
      summary: 버그/SPEC 등록
      description: 새로운 버그 또는 SPEC을 등록합니다.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateBugRequest'
      responses:
        '200':
          description: 등록 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateBugResponse'
        '400':
          description: 잘못된 요청(필수 필드 누락 등)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '401':
          description: 인증 실패
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          description: 서버 오류
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: APIKey
      description: 'Authorization: Bearer {API_KEY} (기본 키: trend-video-gpt-2024-secret-key)'
  schemas:
    Bug:
      type: object
      properties:
        id:
          type: string
          example: BTS-0000430
        type:
          type: string
          enum: [bug, spec]
        title:
          type: string
        summary:
          type: string
          nullable: true
        status:
          type: string
          enum: [open, in_progress, resolved, closed]
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    BugListResponse:
      type: object
      properties:
        success:
          type: boolean
          example: true
        count:
          type: integer
          example: 1
        bugs:
          type: array
          items:
            $ref: '#/components/schemas/Bug'
    CreateBugRequest:
      type: object
      required: [title, type]
      properties:
        title:
          type: string
        summary:
          type: string
          nullable: true
        type:
          type: string
          enum: [bug, spec]
        priority:
          type: string
          enum: [P1, P2, P3]
          default: P2
        category:
          type: string
          nullable: true
        affectedFiles:
          type: array
          items:
            type: string
        steps:
          type: array
          items:
            type: string
        expectedBehavior:
          type: string
          nullable: true
        actualBehavior:
          type: string
          nullable: true
        metadata:
          type: object
          additionalProperties: true
    CreateBugResponse:
      type: object
      properties:
        success:
          type: boolean
          example: true
        id:
          type: string
          example: BTS-0000431
        btsId:
          type: string
          example: BTS-0000431
        message:
          type: string
          example: '등록 완료! BTS ID: BTS-0000431'
        bug:
          type: object
          properties:
            id:
              type: string
            type:
              type: string
              enum: [bug, spec]
            title:
              type: string
            summary:
              type: string
              nullable: true
            status:
              type: string
              enum: [open, in_progress, resolved, closed]
            priority:
              type: string
              enum: [P1, P2, P3]
    ErrorResponse:
      type: object
      properties:
        error:
          type: string
```

---

## 3. GPT Instructions (빌더에 붙여넣기)

아래 내용을 GPT Builder의 Instructions에 복사합니다.

```
당신은 Trend Video 프로젝트의 버그/SPEC을 자동으로 등록하고 조회하는 GPT입니다.

## 역할
사용자가 버그 또는 기능 요청(SPEC)을 설명하면, 이를 분석하여 BTS(Bug Tracking System)에 자동 등록합니다.

## 수행 절차
1) 요청 분석 → 버그/스펙 구분, 우선순위(P1/P2/P3) 추정
2) 필수 정보 정리 → 제목, 요약, 타입, 우선순위, 카테고리, 관련 파일/단계(있으면 추가)
3) 등록 전 확인 → 아래 템플릿으로 사용자에게 확인 요청
4) 확인되면 createExternalBug API 호출
5) 결과 응답 시 BTS ID와 상태 링크 안내

## 확인 템플릿
---
📋 **등록 정보 확인**

**유형**: [버그/SPEC]
**제목**: [제목]
**우선순위**: [P1/P2/P3]
**요약**:
[설명]

이대로 등록할까요?
---

## API 호출 규칙
- 인증: Authorization 헤더에 `Bearer {API_KEY}` (기본 키: trend-video-gpt-2024-secret-key)
- 엔드포인트: http://oldmoon.iptime.org:2000/api/external/bugs
- GET: 목록 조회용 (status/type/limit 사용)
- POST: 등록용 (title, type 필수)

## 응답 후 안내
- 등록되면 BTS ID를 포함해 알려주고, 오류 시 원인(인증/필수 필드 누락 등)을 전달합니다.
```

---

## 4. GPT Builder 설정 요약
- Actions: 위 OpenAPI 스펙을 Import → Bearer API Key = `trend-video-gpt-2024-secret-key`
- Base URL: `http://oldmoon.iptime.org:2000`
- 테스트: GET/POST 둘 다 Authorization 헤더에 Bearer 키 포함해 호출
