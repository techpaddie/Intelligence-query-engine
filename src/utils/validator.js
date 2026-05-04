const { AppError } = require("./errors");

const LIST_QUERY_KEYS = new Set([
  "gender",
  "age_group",
  "country_id",
  "min_age",
  "max_age",
  "min_gender_probability",
  "min_country_probability",
  "sort_by",
  "order",
  "page",
  "limit"
]);

const SEARCH_QUERY_KEYS = new Set(["q", "page", "limit", "sort_by", "order"]);

const GENDERS = new Set(["male", "female"]);
const AGE_GROUPS = new Set(["child", "teenager", "adult", "senior"]);
const SORT_FIELDS = new Set(["age", "created_at", "gender_probability"]);
const ORDERS = new Set(["asc", "desc"]);

function validateNameInput(name) {
  if (name === undefined || name === null) {
    throw new AppError("name is required", 400);
  }

  if (typeof name !== "string") {
    throw new AppError("name must be a string", 422);
  }

  if (name.trim() === "") {
    throw new AppError("name cannot be empty", 400);
  }
}

function throwInvalidQuery(statusCode) {
  throw new AppError("Invalid query parameters", statusCode);
}

function isEmptyQueryValue(v) {
  return v === undefined || v === null || v === "";
}

function parseStrictInt(value, label) {
  if (isEmptyQueryValue(value)) {
    return undefined;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throwInvalidQuery(422);
    }
    return value;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!/^-?\d+$/.test(t)) {
      throwInvalidQuery(422);
    }
    return parseInt(t, 10);
  }
  throwInvalidQuery(422);
}

function parseStrictFloat01(value) {
  if (isEmptyQueryValue(value)) {
    return undefined;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throwInvalidQuery(422);
    }
    return value;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") {
      return undefined;
    }
    if (!/^-?\d+(\.\d+)?$/.test(t)) {
      throwInvalidQuery(422);
    }
    return parseFloat(t);
  }
  throwInvalidQuery(422);
}

function assertKnownKeys(query, allowedSet) {
  for (const key of Object.keys(query)) {
    if (!allowedSet.has(key)) {
      throwInvalidQuery(400);
    }
    const value = query[key];
    if (Array.isArray(value)) {
      throwInvalidQuery(422);
    }
  }
}

function normalizeGender(value) {
  if (isEmptyQueryValue(value)) {
    return undefined;
  }
  if (typeof value !== "string") {
    throwInvalidQuery(422);
  }
  const g = value.trim().toLowerCase();
  if (!GENDERS.has(g)) {
    throwInvalidQuery(400);
  }
  return g;
}

function normalizeAgeGroup(value) {
  if (isEmptyQueryValue(value)) {
    return undefined;
  }
  if (typeof value !== "string") {
    throwInvalidQuery(422);
  }
  const a = value.trim().toLowerCase();
  if (!AGE_GROUPS.has(a)) {
    throwInvalidQuery(400);
  }
  return a;
}

function normalizeCountryId(value) {
  if (isEmptyQueryValue(value)) {
    return undefined;
  }
  if (typeof value !== "string") {
    throwInvalidQuery(422);
  }
  const c = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) {
    throwInvalidQuery(400);
  }
  return c;
}

function normalizeSort(value, fallback) {
  if (isEmptyQueryValue(value)) {
    return fallback;
  }
  if (typeof value !== "string") {
    throwInvalidQuery(422);
  }
  const s = value.trim().toLowerCase();
  if (!SORT_FIELDS.has(s)) {
    throwInvalidQuery(400);
  }
  return s;
}

function normalizeOrder(value, fallback) {
  if (isEmptyQueryValue(value)) {
    return fallback;
  }
  if (typeof value !== "string") {
    throwInvalidQuery(422);
  }
  const o = value.trim().toLowerCase();
  if (!ORDERS.has(o)) {
    throwInvalidQuery(400);
  }
  return o;
}

function normalizePage(value) {
  const n = parseStrictInt(value, "page");
  if (n === undefined) {
    return 1;
  }
  if (n < 1) {
    throwInvalidQuery(400);
  }
  return n;
}

function normalizeLimit(value) {
  const n = parseStrictInt(value, "limit");
  if (n === undefined) {
    return 10;
  }
  if (n < 1 || n > 50) {
    throwInvalidQuery(400);
  }
  return n;
}

function normalizeProbabilityFloor(value) {
  const n = parseStrictFloat01(value);
  if (n === undefined) {
    return undefined;
  }
  if (n < 0 || n > 1) {
    throwInvalidQuery(400);
  }
  return n;
}

function normalizeMinMaxAge(minRaw, maxRaw) {
  const minAge = parseStrictInt(minRaw, "min_age");
  const maxAge = parseStrictInt(maxRaw, "max_age");

  if (minAge !== undefined && (minAge < 0 || minAge > 150)) {
    throwInvalidQuery(400);
  }
  if (maxAge !== undefined && (maxAge < 0 || maxAge > 150)) {
    throwInvalidQuery(400);
  }
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    throwInvalidQuery(400);
  }

  return { min_age: minAge, max_age: maxAge };
}

function validateProfileListQuery(query) {
  assertKnownKeys(query, LIST_QUERY_KEYS);

  const gender = normalizeGender(query.gender);
  const age_group = normalizeAgeGroup(query.age_group);
  const country_id = normalizeCountryId(query.country_id);
  const { min_age, max_age } = normalizeMinMaxAge(query.min_age, query.max_age);
  const min_gender_probability = normalizeProbabilityFloor(query.min_gender_probability);
  const min_country_probability = normalizeProbabilityFloor(query.min_country_probability);

  const sort_by = normalizeSort(query.sort_by, "created_at");
  const order = normalizeOrder(query.order, "desc");
  const page = normalizePage(query.page);
  const limit = normalizeLimit(query.limit);

  const filters = {};
  if (gender !== undefined) {
    filters.gender = gender;
  }
  if (age_group !== undefined) {
    filters.age_group = age_group;
  }
  if (country_id !== undefined) {
    filters.country_id = country_id;
  }
  if (min_age !== undefined) {
    filters.min_age = min_age;
  }
  if (max_age !== undefined) {
    filters.max_age = max_age;
  }
  if (min_gender_probability !== undefined) {
    filters.min_gender_probability = min_gender_probability;
  }
  if (min_country_probability !== undefined) {
    filters.min_country_probability = min_country_probability;
  }

  return {
    filters,
    sort_by,
    order,
    page,
    limit
  };
}

function validateProfileSearchQuery(query) {
  assertKnownKeys(query, SEARCH_QUERY_KEYS);

  if (query.q === undefined || query.q === null) {
    throwInvalidQuery(400);
  }
  if (typeof query.q !== "string") {
    throwInvalidQuery(422);
  }
  if (query.q.trim() === "") {
    throwInvalidQuery(400);
  }

  const sort_by = normalizeSort(query.sort_by, "created_at");
  const order = normalizeOrder(query.order, "desc");
  const page = normalizePage(query.page);
  const limit = normalizeLimit(query.limit);

  return { sort_by, order, page, limit };
}

module.exports = {
  validateNameInput,
  validateProfileListQuery,
  validateProfileSearchQuery
};
