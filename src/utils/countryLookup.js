const fs = require("fs");
const path = require("path");

const ISO_PATH = path.join(__dirname, "..", "..", "data", "iso3166-slim-2.json");

const EXTRA_NAME_TO_ISO = [
  ["united states of america", "US"],
  ["united states", "US"],
  ["usa", "US"],
  ["u.s.a.", "US"],
  ["u.s.a", "US"],
  ["united kingdom", "GB"],
  ["great britain", "GB"],
  ["britain", "GB"],
  ["england", "GB"],
  ["scotland", "GB"],
  ["wales", "GB"],
  ["north korea", "KP"],
  ["south korea", "KR"],
  ["russia", "RU"],
  ["ivory coast", "CI"],
  ["czech republic", "CZ"],
  ["bolivia", "BO"],
  ["venezuela", "VE"],
  ["vietnam", "VN"],
  ["viet nam", "VN"],
  ["tanzania", "TZ"],
  ["moldova", "MD"],
  ["iran", "IR"],
  ["syria", "SY"],
  ["laos", "LA"],
  ["micronesia", "FM"],
  ["palestine", "PS"],
  ["taiwan", "TW"],
  ["hong kong", "HK"],
  ["macau", "MO"],
  ["turkey", "TR"],
  ["türkiye", "TR"],
  ["eswatini", "SZ"],
  ["swaziland", "SZ"],
  ["cabo verde", "CV"],
  ["cape verde", "CV"],
  ["democratic republic of the congo", "CD"],
  ["drc", "CD"],
  ["congo kinshasa", "CD"],
  ["republic of the congo", "CG"],
  ["congo brazzaville", "CG"]
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAscii(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let cachedSortedPatterns = null;
let cachedIsoToName = null;

function loadIsoRows() {
  const raw = fs.readFileSync(ISO_PATH, "utf8");
  return JSON.parse(raw);
}

function buildCaches() {
  if (cachedSortedPatterns && cachedIsoToName) {
    return;
  }

  const rows = loadIsoRows();
  const isoToName = {};
  const pairs = [];

  for (const row of rows) {
    const iso = row["alpha-2"];
    const name = row.name;
    isoToName[iso] = name;
    const key = normalizeAscii(name);
    if (key) {
      pairs.push({ key, iso });
    }
  }

  for (const [name, iso] of EXTRA_NAME_TO_ISO) {
    pairs.push({ key: normalizeAscii(name), iso });
  }

  pairs.sort((a, b) => b.key.length - a.key.length);
  cachedSortedPatterns = pairs;
  cachedIsoToName = isoToName;
}

function findIsoByCountryText(text) {
  buildCaches();
  const hay = normalizeAscii(text);
  if (!hay) {
    return null;
  }

  for (const { key, iso } of cachedSortedPatterns) {
    if (!key) {
      continue;
    }
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(key)}([^a-z0-9]|$)`, "i");
    if (re.test(hay)) {
      return iso;
    }
  }

  return null;
}

function getCountryNameByIso(iso) {
  buildCaches();
  if (!iso || typeof iso !== "string") {
    return "";
  }
  const upper = iso.trim().toUpperCase();
  return cachedIsoToName[upper] || upper;
}

module.exports = {
  findIsoByCountryText,
  getCountryNameByIso,
  normalizeAscii
};
