/**
 * Normalize data/profiles.json for seed compatibility.
 * - Flat array of profile objects (unwraps [{ profiles: [...] }])
 * - id: new UUID v7 only if missing or not UUID v7-shaped (preserves stable ids on re-run)
 * - name: trim().toLowerCase(); aborts on duplicate names after normalization
 * - age_group: always recomputed from age (same rules as classifyAgeGroup)
 * - country_name: always from ISO lookup (never trust file)
 * - gender_probability / country_probability: Number() coercion
 * - country_id: uppercased 2-letter
 * - gender: lowercase
 * - created_at: preserved if valid ISO string; else deterministic UTC from 2026-01-01
 */
const fs = require("fs");
const path = require("path");
const { v7: uuidv7 } = require("uuid");
const { classifyAgeGroup } = require("../src/utils/classification");
const { getCountryNameByIso } = require("../src/utils/countryLookup");

const DATA_PATH = path.join(__dirname, "..", "data", "profiles.json");

function isUuidV7Like(id) {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())
  );
}

function isReasonableIsoTimestamp(s) {
  if (typeof s !== "string") {
    return false;
  }
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    return false;
  }
  return !Number.isNaN(Date.parse(t));
}

function extractRows(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error("Root JSON must be an array");
  }
  if (parsed.length === 1 && parsed[0] && Array.isArray(parsed[0].profiles)) {
    return parsed[0].profiles;
  }
  if (parsed.length > 0 && parsed[0] && typeof parsed[0] === "object" && !parsed[0].id) {
    const first = parsed[0];
    if (Array.isArray(first.profiles)) {
      return first.profiles;
    }
  }
  return parsed;
}

function parseAge(value, index) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  throw new Error(`Invalid age at index ${index}: ${value}`);
}

function main() {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const rows = extractRows(parsed);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No profile rows found to normalize");
  }

  const out = [];
  const seenNames = new Set();
  const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r || typeof r !== "object") {
      throw new Error(`Invalid row at index ${i}`);
    }

    const name = String(r.name || "")
      .trim()
      .toLowerCase();
    if (!name) {
      throw new Error(`Empty name at index ${i}`);
    }
    if (seenNames.has(name)) {
      throw new Error(`Duplicate name after normalization at index ${i}: "${name}"`);
    }
    seenNames.add(name);

    const countryId = String(r.country_id || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryId)) {
      throw new Error(`Invalid country_id at index ${i} (${r.country_id})`);
    }

    const countryName = getCountryNameByIso(countryId) || countryId;

    const gender = String(r.gender || "")
      .trim()
      .toLowerCase();
    if (gender !== "male" && gender !== "female") {
      throw new Error(`Invalid gender at index ${i}: ${r.gender}`);
    }

    const age = parseAge(r.age, i);
    if (age < 0 || age > 150) {
      throw new Error(`Invalid age at index ${i}: ${age}`);
    }
    const ageGroup = classifyAgeGroup(age);

    const genderProbability = Number(r.gender_probability);
    const countryProbability = Number(r.country_probability);
    if (!Number.isFinite(genderProbability)) {
      throw new Error(`Invalid gender_probability at index ${i}`);
    }
    if (!Number.isFinite(countryProbability)) {
      throw new Error(`Invalid country_probability at index ${i}`);
    }

    let rowId = r.id;
    if (!isUuidV7Like(rowId)) {
      rowId = uuidv7();
    } else {
      rowId = String(rowId).trim();
    }

    let createdAt = r.created_at;
    if (!isReasonableIsoTimestamp(createdAt)) {
      createdAt = new Date(baseMs + i * 1000).toISOString();
    } else {
      createdAt = new Date(createdAt.trim()).toISOString();
    }

    out.push({
      id: rowId,
      name,
      gender,
      gender_probability: genderProbability,
      age,
      age_group: ageGroup,
      country_id: countryId,
      country_name: countryName,
      country_probability: countryProbability,
      created_at: createdAt
    });
  }

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`Wrote ${out.length} profiles to ${DATA_PATH}`);
}

main();
