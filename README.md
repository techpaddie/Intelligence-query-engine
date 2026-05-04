# Intelligence Query Engine (Profiles API)

Production-ready REST API for profile persistence, structured filtering, and **rule-based natural language search** over the same database layer as Stage 1.

## Requirements

- Node.js 18+
- npm

## Install & run

```bash
npm install
npm start
```

Default port: `3000` (override with `PORT`).

## Seed data

Place your full **2026** profile export at:

`data/profiles.json` (JSON array of objects).

Then:

```bash
npm run seed
```

The seed script is **idempotent**: it uses `bulkCreate` with `ignoreDuplicates: true` on the unique `name` index, normalizes names to lowercase, validates every required field, and skips invalid rows by exiting with an error (no partial invalid inserts).

## API overview

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/profiles` | Create or return existing profile by `name` (Stage 1 behavior preserved). |
| `GET` | `/api/profiles/:id` | Fetch one profile by UUID v7 `id`. |
| `GET` | `/api/profiles` | List profiles with **filters, sort, pagination** (Stage 2). |
| `GET` | `/api/profiles/search?q=...` | Natural language search → same list response shape (Stage 2). |
| `DELETE` | `/api/profiles/:id` | Delete profile by `id`. |

### CORS

Responses include:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

`OPTIONS` requests return **204** with no body.

### List: `GET /api/profiles`

**Filters** (combinable with **AND** semantics, all enforced in SQL via Sequelize):

- `gender` — `male` \| `female`
- `age_group` — `child` \| `teenager` \| `adult` \| `senior`
- `country_id` — two-letter ISO alpha-2 (e.g. `KE`)
- `min_age`, `max_age` — integers (invalid pairs such as `min_age` > `max_age` → **400**)
- `min_gender_probability`, `min_country_probability` — decimals in `[0, 1]`

**Sorting**

- `sort_by` — `age` \| `created_at` \| `gender_probability`
- `order` — `asc` \| `desc`

Defaults: `sort_by=created_at`, `order=desc`.

**Pagination**

- `page` — integer ≥ `1` (default `1`)
- `limit` — integer `1`–`50` (default `10`)

**Response shape (strict)**

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 123,
  "data": [ /* Profile instances */ ]
}
```

**Validation errors**

- Unknown query parameters → **400** `{ "status": "error", "message": "Invalid query parameters" }`
- Bad *values* (e.g. `gender=other`, `limit=100`, `min_age` > `max_age`) → **400** with the same message
- Bad *types* (e.g. `page=abc`, `min_age=12.5`) → **422** with the same message

### Search: `GET /api/profiles/search?q=...`

Optional pagination and sort query keys match the list endpoint (`page`, `limit`, `sort_by`, `order`).

If `q` is missing or blank → **400** with `Invalid query parameters`.

If the natural language string cannot be interpreted → **400**:

```json
{ "status": "error", "message": "Unable to interpret query" }
```

On success, the response matches the list endpoint format (`status`, `page`, `limit`, `total`, `data`).

---

## 1. Natural language parsing approach

Parsing is implemented in `src/services/queryParserService.js` using **regular expressions and keyword rules only** (no LLM, no external AI).

### Keywords supported

**Gender**

- `male`, `males` → `gender = male`
- `female`, `females` → `gender = female`
- Phrases matching `male` **and** `female` together (e.g. `male and female`, `males and females`), or **`male or female`** / **`female or male`**, set `gender` to `["male", "female"]` (SQL `IN` — both genders in this schema).

**Age (numeric)**

- `above N` → `min_age = N` (regex: `\babove\s+(\d{1,3})\b`)
- `below N` → `max_age = N` (regex: `\bbelow\s+(\d{1,3})\b`)
- `between N and M` → `min_age = N`, `max_age = M` (regex: `\bbetween\s+(\d{1,3})\s+and\s+(\d{1,3})\b`)
  - If `N > M`, the query is rejected as uninterpretable.

**Age groups**

- `child` / `children`
- `teenager` / `teenagers`
- `adult` / `adults`
- `senior` / `seniors` / `senior citizens`

**Special**

- `young` → `min_age = 16`, `max_age = 24` **only when** no explicit numeric age condition (`above`, `below`, `between`) was parsed.

**Country**

- Country names are resolved using `data/iso3166-slim-2.json` plus a small alias table in `src/utils/countryLookup.js`.
- Matching is **longest-name-first** with ASCII normalization (case folding + stripping diacritics) and non-letter boundaries to reduce false positives.

### How parsing works (pipeline)

1. **Normalize** input: trim, lowercase, collapse whitespace.
2. **Country**: scan known country names (longest first) in the normalized text; first hit wins → `country_id` (ISO alpha-2).
3. **Gender (dual)**: if `male or female` / `female or male`, or `male`/`males` **and** `female`/`females` with `and` between → `gender: ["male", "female"]`.
4. **Else** assign **single gender** from `male`/`males` or `female`/`females` keywords.
5. **Age group** keywords (mutually overwriting in the order checked: child → teenager → adult → senior).
6. **Numeric ages**: parse `between` (exclusive with the next branch), else parse `above` and `below` independently (so both can apply).
7. **`young`**: apply the 16–24 window only if step 6 did not set any numeric age constraint.
8. If **no** signal was detected from any category, return `Unable to interpret query`.

The parser returns a compact filter object:

```json
{
  "gender": "male",
  "age_group": "adult",
  "country_id": "KE",
  "min_age": 17,
  "max_age": 24
}
```

`gender` may be a string (`"male"` / `"female"`) or an array of both when dual phrasing is detected. Only keys that were inferred are present.

---

## 2. Mapping logic (phrases → filters)

| Example query | Parsed filters |
|---------------|----------------|
| `young males` | `gender=male`, `min_age=16`, `max_age=24` |
| `females above 30` | `gender=female`, `min_age=30` |
| `people from angola` | `country_id=AO` |
| `adult males from kenya` | `gender=male`, `age_group=adult`, `country_id=KE` |
| `male and female teenagers above 17` | `gender` = `["male","female"]`, `age_group=teenager`, `min_age=17` |

**End-to-end flow (search)**

`q` → `queryParserService` → filter object → `queryBuilder` (Sequelize `WHERE` / `ORDER` / `LIMIT` / `OFFSET`) → `Profile.findAndCountAll` → HTTP JSON.

The list endpoint uses the **same** query builder; only the *source* of filters differs (query string vs parser).

---

## 3. Limitations

- **Strict vocabulary**: arbitrary English (“folks in their twenties”) is not understood unless it matches the documented keywords/patterns.
- **Ambiguity**: phrases that mention overlapping regions without a resolvable longest country token may pick an unintended country (mitigated by longest-first matching + boundary checks, but not impossible).
- **Ambiguous country names** may resolve to the wrong ISO code or not match at all (e.g. “Georgia” as country vs. US state, “America”, short forms of “Congo”, or colloquial names not in the lookup data).
- **Dual gender** is detected for `male`/`males` **and** `female`/`females` joined with **`and`**, or for **`male or female`** / **`female or male`**. Other phrasing (e.g. “either male or female”) is not supported.
- **Numeric ages** only accept integer literals in the query text (`above thirty` fails).
- **SQLite typing**: age comparisons and age sorting use `CAST(age AS INTEGER)` in SQL so numeric ranges remain correct even if legacy rows stored numeric ages with text affinity.

---

## 4. Examples (real queries → parser output)

Below are **actual** outputs from `parseNaturalLanguageQuery` in this codebase.

### Example A

**Query:** `young males`

**Output:**

```json
{
  "status": "success",
  "filters": {
    "gender": "male",
    "min_age": 16,
    "max_age": 24
  }
}
```

### Example B

**Query:** `females above 30`

**Output:**

```json
{
  "status": "success",
  "filters": {
    "gender": "female",
    "min_age": 30
  }
}
```

### Example C

**Query:** `people from angola`

**Output:**

```json
{
  "status": "success",
  "filters": {
    "country_id": "AO"
  }
}
```

### Example D

**Query:** `adult males from kenya`

**Output:**

```json
{
  "status": "success",
  "filters": {
    "country_id": "KE",
    "gender": "male",
    "age_group": "adult"
  }
}
```

### Example E

**Query:** `male and female teenagers above 17`

**Output:**

```json
{
  "status": "success",
  "filters": {
    "gender": ["male", "female"],
    "age_group": "teenager",
    "min_age": 17
  }
}
```

---

## Architecture notes

- **Query builder**: `src/utils/queryBuilder.js` centralizes Sequelize `WHERE`, `ORDER BY`, pagination (`limit`/`offset`), and `findAndCountAll` counting.
- **No in-memory filtering** for list/search: all constraints are pushed to the database.
- **Indexes** (declared on the Sequelize model): unique `name`, plus `gender` and `country_id` non-unique indexes to support common filters.

## License

ISC
