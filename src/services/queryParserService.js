const { findIsoByCountryText } = require("../utils/countryLookup");

const BOTH_GENDERS_RE =
  /\b(male|males)\b\s+and\s+\b(female|females)\b|\b(female|females)\b\s+and\s+\b(male|males)\b/i;

const MALE_OR_FEMALE_RE = /\bmale\s+or\s+female\b|\bfemale\s+or\s+male\b/i;

const BETWEEN_RE = /\bbetween\s+(\d{1,3})\s+and\s+(\d{1,3})\b/i;
const ABOVE_RE = /\babove\s+(\d{1,3})\b/i;
const BELOW_RE = /\bbelow\s+(\d{1,3})\b/i;

function parseNaturalLanguageQuery(q) {
  const err = { status: "error", message: "Unable to interpret query" };

  if (q === undefined || q === null) {
    return err;
  }
  if (typeof q !== "string" || !q.trim()) {
    return err;
  }

  const text = q.trim().toLowerCase().replace(/\s+/g, " ");

  let matched = false;
  function mark() {
    matched = true;
  }

  const filters = {};

  const countryIso = findIsoByCountryText(text);
  if (countryIso) {
    filters.country_id = countryIso;
    mark();
  }

  if (MALE_OR_FEMALE_RE.test(text) || BOTH_GENDERS_RE.test(text)) {
    filters.gender = ["male", "female"];
    mark();
  } else if (/\b(males|male)\b/.test(text)) {
    filters.gender = "male";
    mark();
  } else if (/\b(females|female)\b/.test(text)) {
    filters.gender = "female";
    mark();
  }

  if (/\bchildren\b|\bchild\b/.test(text)) {
    filters.age_group = "child";
    mark();
  } else if (/\bteenagers?\b/.test(text)) {
    filters.age_group = "teenager";
    mark();
  } else if (/\badults?\b/.test(text)) {
    filters.age_group = "adult";
    mark();
  } else if (/\bseniors?\b|\bsenior citizens\b/.test(text)) {
    filters.age_group = "senior";
    mark();
  }

  let minAge;
  let maxAge;
  let explicitNumericAge = false;

  const betweenM = text.match(BETWEEN_RE);
  if (betweenM) {
    const a = parseInt(betweenM[1], 10);
    const b = parseInt(betweenM[2], 10);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return err;
    }
    if (a > b) {
      return err;
    }
    minAge = a;
    maxAge = b;
    explicitNumericAge = true;
    mark();
  } else {
    const aboveM = text.match(ABOVE_RE);
    if (aboveM) {
      minAge = parseInt(aboveM[1], 10);
      if (Number.isNaN(minAge)) {
        return err;
      }
      explicitNumericAge = true;
      mark();
    }

    const belowM = text.match(BELOW_RE);
    if (belowM) {
      maxAge = parseInt(belowM[1], 10);
      if (Number.isNaN(maxAge)) {
        return err;
      }
      explicitNumericAge = true;
      mark();
    }
  }

  const hasYoung = /\byoung\b/.test(text);
  if (hasYoung && !explicitNumericAge) {
    minAge = 16;
    maxAge = 24;
    mark();
  }

  if (minAge != null) {
    filters.min_age = minAge;
  }
  if (maxAge != null) {
    filters.max_age = maxAge;
  }

  if (filters.min_age != null && filters.max_age != null && filters.min_age > filters.max_age) {
    return err;
  }

  if (!matched) {
    return err;
  }

  return { status: "success", filters };
}

module.exports = {
  parseNaturalLanguageQuery
};
