# docs-api API

Base URL

- Local: `http://localhost:3000`
- Prod: `https://api-docs.meritledger.org`

Auth

- Login success sets `auth_token` as `httpOnly` cookie.
- Protected endpoints require this cookie.
- Every response includes `x-request-id`.

## Health

### `GET /`

Response

```json
{
  "ok": true,
  "service": "docs-api",
  "timestamp": "2026-03-11T11:46:52.000Z"
}
```

## Auth

### `POST /auth/start`

Request

```json
{
  "email": "user@example.com"
}
```

Behavior

- Generates 6-digit code
- TTL 10 minutes
- Same email cooldown 60 seconds
- Same IP max 5 requests / minute

Response

```json
{
  "ok": true
}
```

### `POST /auth/verify`

Request

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

Response

```json
{
  "token": "jwt",
  "user": {
    "id": "user_id",
    "email": "user@example.com"
  }
}
```

### `POST /auth/google`

Request

```json
{
  "idToken": "google_id_token"
}
```

### `GET /auth/me`

Auth

- Requires `auth_token` cookie

Response

```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "authProvider": "google",
    "createdAt": "2026-03-11T12:10:00.000Z"
  }
}
```

### `POST /auth/logout`

Behavior

- Clears `auth_token` cookie

Response

```json
{
  "ok": true
}
```

Response

```json
{
  "token": "jwt",
  "user": {
    "id": "user_id",
    "email": "user@example.com"
  }
}
```

## Projects

### `POST /projects`

Request

```json
{
  "docTitle": "测试项目",
  "formFields": {
    "industry": "SaaS",
    "systemType": "Web",
    "purpose": "生成要件定义"
  },
  "minutesText": "会议纪要..."
}
```

Rules

- Free user max 3 projects
- `minutesText` max 20,000 chars

Response

```json
{
  "id": "project_id",
  "docTitle": "测试项目",
  "updatedAt": "2026-03-11T11:48:22.287Z"
}
```

### `GET /projects`

Response

```json
[
  {
    "id": "project_id",
    "docTitle": "测试项目",
    "updatedAt": "2026-03-11T11:48:22.287Z",
    "status": "READY"
  }
]
```

### `GET /projects/:id`

Response

```json
{
  "id": "project_id",
  "docTitle": "测试项目",
  "formFields": {},
  "minutesText": "会议纪要...",
  "versions": [
    {
      "versionNo": 1,
      "createdAt": "2026-03-11T11:49:00.000Z"
    }
  ]
}
```

### `GET /projects/:id/versions/:ver`

Response

```json
{
  "project": {
    "id": "project_id",
    "docTitle": "测试项目"
  },
  "versionNo": 1,
  "quality": "standard",
  "tabs": {
    "flow": [],
    "screens": [],
    "functions": [],
    "nfr": [],
    "risks_issues": [],
    "glossary": []
  }
}
```

### `PUT /projects/:id`

Request body same as `POST /projects`.

Response

```json
{
  "id": "project_id",
  "docTitle": "测试项目",
  "formFields": {},
  "minutesText": "会议纪要...",
  "versions": []
}
```

### `DELETE /projects/:id`

Response

```json
{
  "ok": true
}
```

## Generate

### `POST /projects/:id/generate`

Request

```json
{
  "mode": "preview",
  "quality": "standard"
}
```

Headers

- Optional for export: `Idempotency-Key: any-unique-key`

Rules

- Per-project generate cooldown: 30 seconds
- Preview always forces `standard`
- Preview limit: 1/day/user (Asia/Tokyo)
- Preview redaction is server-side:
  - first 5 rows only
  - hide high-value fields in `functions`, `nfr`, `risks_issues`
- Export charges only after xlsx generation success
- Credit order:
  - `oneshotCredits`
  - then subscription quota
- `high` quality only for `PRO` / `BUSINESS`

Response

```json
{
  "project": {
    "id": "project_id",
    "docTitle": "测试项目"
  },
  "versionNo": 1,
  "tabs": {
    "flow": [],
    "screens": [],
    "functions": [],
    "nfr": [],
    "risks_issues": [],
    "glossary": []
  },
  "paywall": {
    "canExport": false,
    "remaining": 0
  }
}
```

### `GET /projects/:id/versions/:ver/download`

Response

- Streams `.xlsx`
- `Content-Disposition: attachment`

Errors

- `400` no remaining credits
- `503` excel worker unavailable; no credit deducted

## Documents

Five document generator APIs use the same `auth_token` cookie as project APIs.

Document type path values:

- `REQUIREMENTS`
- `BASIC_DESIGN`
- `DETAILED_DESIGN`
- `UNIT_TEST`
- `INTEGRATION_TEST`

Source type values:

- `PROJECT`
- `REQUIREMENTS_VERSION`
- `BASIC_DESIGN_VERSION`
- `DETAILED_DESIGN_VERSION`
- `DIRECT_INPUT`
- `PASTED_DESIGN`

Generation mode values:

- `standard`
- `simple`
- `custom`

### `GET /projects/:projectId/documents`

Returns generated document states for the project.

Response

```json
[
  {
    "id": "document_id",
    "type": "REQUIREMENTS",
    "title": "要件定義書",
    "currentVersion": 1,
    "grant": {
      "remainingGenerations": 2,
      "expiresAt": "2026-06-06T00:00:00.000Z"
    },
    "versions": [
      {
        "id": "document_version_id",
        "versionNo": 1,
        "createdAt": "2026-05-30T00:00:00.000Z"
      }
    ]
  }
]
```

### `GET /projects/:projectId/documents/tree`

Returns all five document nodes in fixed product order. Missing documents are returned as empty nodes, so the frontend can render the full side tree before generation.

Response

```json
[
  {
    "id": null,
    "type": "BASIC_DESIGN",
    "title": "基本設計書",
    "currentVersion": 0,
    "grant": null,
    "versions": []
  }
]
```

### `GET /projects/:projectId/documents/:type`

Returns a single document state. If the document does not exist yet, it is created as an empty state for the requested type.

Response shape is the same as one item from `GET /projects/:projectId/documents`.

### `POST /projects/:projectId/documents/:type/generate`

Headers

- Optional: `Idempotency-Key: any-unique-key`

Request

```json
{
  "sourceType": "REQUIREMENTS_VERSION",
  "sourceDocumentVersionId": "upstream_document_version_id",
  "inputJson": {
    "problems": "解決したい課題",
    "goals": "実現したいこと"
  },
  "generationMode": "custom",
  "selectedSheets": ["基本設計概要", "画面設計"],
  "testViewpoints": ["正常系", "異常系", "入力チェック"],
  "quality": "standard"
}
```

Request fields

- `sourceType`: Optional. Defaults by document type.
- `sourceDocumentVersionId`: Required when `sourceType` is one of `*_VERSION`.
- `inputJson`: Structured direct input or pasted design fields.
- `generationMode`: Optional. Defaults to `standard`.
- `selectedSheets`: Required only when `generationMode` is `custom`; at least one valid sheet is required.
- `testViewpoints`: Used by `UNIT_TEST`.
- `quality`: `standard` or `high`; currently generation UI sends `standard`.

Source dependency rules

- `BASIC_DESIGN` can use `REQUIREMENTS_VERSION` or `DIRECT_INPUT`.
- `DETAILED_DESIGN` can use `BASIC_DESIGN_VERSION` or `DIRECT_INPUT`.
- `UNIT_TEST` can use `DETAILED_DESIGN_VERSION` or `DIRECT_INPUT`.
- `INTEGRATION_TEST` can use `DETAILED_DESIGN_VERSION` or `PASTED_DESIGN`.
- Source versions must belong to the same project and same user.

Input size rules

- `INTEGRATION_TEST` with `PASTED_DESIGN`: max 10,000 chars after JSON serialization.
- Other document generation inputs: max 20,000 chars after JSON serialization.

Entitlement rules

- Every document has a 30 second cooldown after successful generation.
- Single Document purchase creates 1 unstarted document credit, valid for 7 days.
- Business Pack creates 78 unstarted document credits, valid for 12 months.
- Starting one document creates a 7 day grant with 3 successful generations.
- A successful `DocumentVersion` save consumes 1 generation.
- Download does not consume a generation.
- LLM/schema/Excel failures do not consume a generation.
- Reusing the same `Idempotency-Key` for the same document returns the existing successful version and does not consume another generation.

Response

```json
{
  "document": {
    "id": "document_id",
    "type": "BASIC_DESIGN",
    "title": "基本設計書",
    "currentVersion": 2,
    "grant": {
      "remainingGenerations": 1,
      "expiresAt": "2026-06-06T00:00:00.000Z"
    },
    "versions": [
      {
        "id": "document_version_id",
        "versionNo": 2,
        "createdAt": "2026-05-30T00:00:00.000Z"
      }
    ]
  },
  "id": "document_version_id",
  "versionNo": 2,
  "createdAt": "2026-05-30T00:00:00.000Z",
  "tabs": {
    "基本設計概要": [
      {
        "No": 1,
        "項目": "目的",
        "内容": "..."
      }
    ]
  },
  "downloadUrl": "/projects/project_id/documents/BASIC_DESIGN/versions/2/download",
  "grant": {
    "remainingGenerations": 1,
    "expiresAt": "2026-06-06T00:00:00.000Z"
  }
}
```

Errors

- `400` invalid document type, source type, generation mode, custom sheet selection, input length, cooldown, or no remaining entitlement.
- `403` project/source belongs to another user.
- `404` project/source/version not found.

### `GET /projects/:projectId/documents/:type/versions/:versionNo/download`

Response

- Streams `.xlsx`
- `Content-Disposition: attachment`
- Does not consume generation count

Errors

- `404` document version not found

## Billing

### `GET /billing/me`

Response

```json
{
  "planType": "FREE",
  "remaining": 0,
  "periodEnd": null
}
```

### `GET /billing/portal`

Response

```json
{
  "url": "https://billing-portal-or-fallback"
}
```

### `POST /billing/checkout/oneshot`

Response

```json
{
  "url": "https://checkout-url"
}
```

### `POST /billing/checkout/single-document`

Alias for the current one-document purchase flow.

Behavior

- With Stripe configured, creates a one-time Checkout Session using `STRIPE_PRICE_SINGLE_DOCUMENT`.
- Falls back to `STRIPE_PRICE_ONESHOT` for backward compatibility.
- Without Stripe configured, grants one stub single-document credit and returns a local success URL.

Response

```json
{
  "url": "https://checkout-url"
}
```

### `POST /billing/checkout/business-pack`

Behavior

- With Stripe configured, creates a one-time Checkout Session using `STRIPE_PRICE_BUSINESS_PACK`.
- Without Stripe configured, grants 78 stub document credits and returns a local success URL.

Response

```json
{
  "url": "https://checkout-url"
}
```

### `POST /billing/checkout/subscription`

Response

```json
{
  "url": "https://checkout-url"
}
```

### `POST /billing/webhook`

Handled events

- `checkout.session.completed`
- `invoice.paid`

Behavior

- single document / legacy one-shot payment success -> 1 document credit
- business pack payment success -> 78 document credits
- subscription invoice paid -> refresh period/quota

## Demo

### `POST /demo/preview`

No auth required.

Rules

- IP limit: 1/minute
- IP daily limit: 3/day
- Never allows export
- Uses same preview redaction policy

Response

```json
{
  "project": {
    "id": "demo",
    "docTitle": "Demo Project"
  },
  "versionNo": 1,
  "tabs": {
    "flow": [],
    "screens": [],
    "functions": [],
    "nfr": [],
    "risks_issues": [],
    "glossary": []
  },
  "paywall": {
    "canExport": false,
    "remaining": 0
  }
}
```

## Common error shape

```json
{
  "statusCode": 429,
  "message": "Preview limit reached for today"
}
```
