const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const sequelize = require("./db");
const Profile = require("../models/profileModel");
const { classifyAgeGroup } = require("../utils/classification");
const { getCountryNameByIso } = require("../utils/countryLookup");

const GENDERS = new Set(["male", "female"]);

const DATA_PATH = path.join(__dirname, "..", "..", "data", "profiles.json");

function isUuidV7Like(id) {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())
  );
}

function isIsoCountryId(v) {
  return typeof v === "string" && /^[A-Z]{2}$/i.test(v.trim());
}

function validateRecord(raw, index) {
  const prefix = `profiles.json[${index}]`;

  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: `${prefix}: record must be an object` };
  }

  const id = raw.id;
  const name = raw.name;
  const gender = raw.gender;
  const gender_probability = raw.gender_probability;
  const country_id = raw.country_id;
  const country_probability = raw.country_probability;
  const created_at = raw.created_at;

  if (!isUuidV7Like(id)) {
    return { ok: false, reason: `${prefix}: invalid id` };
  }
  if (typeof name !== "string" || name.trim() === "") {
    return { ok: false, reason: `${prefix}: invalid name` };
  }
  if (typeof gender !== "string" || !GENDERS.has(gender.trim().toLowerCase())) {
    return { ok: false, reason: `${prefix}: invalid gender` };
  }

  const genderProbability = Number(gender_probability);
  if (!Number.isFinite(genderProbability)) {
    return { ok: false, reason: `${prefix}: invalid gender_probability` };
  }

  let ageNum = raw.age;
  if (typeof ageNum === "string" && /^-?\d+$/.test(ageNum.trim())) {
    ageNum = parseInt(ageNum.trim(), 10);
  }
  if (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 150) {
    return { ok: false, reason: `${prefix}: invalid age` };
  }

  if (!isIsoCountryId(country_id)) {
    return { ok: false, reason: `${prefix}: invalid country_id` };
  }

  const countryProbability = Number(country_probability);
  if (!Number.isFinite(countryProbability)) {
    return { ok: false, reason: `${prefix}: invalid country_probability` };
  }
  if (typeof created_at !== "string" || created_at.trim() === "") {
    return { ok: false, reason: `${prefix}: invalid created_at` };
  }

  const normalizedName = name.trim().toLowerCase();
  const cid = country_id.trim().toUpperCase();

  return {
    ok: true,
    row: {
      id: id.trim(),
      name: normalizedName,
      gender: gender.trim().toLowerCase(),
      gender_probability: genderProbability,
      age: ageNum,
      age_group: classifyAgeGroup(ageNum),
      country_id: cid,
      country_name: getCountryNameByIso(cid) || cid,
      country_probability: countryProbability,
      created_at: created_at.trim()
    }
  };
}

async function run() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Seed file not found: ${DATA_PATH}`);
    process.exit(1);
  }

  let records;
  try {
    const text = fs.readFileSync(DATA_PATH, "utf8");
    records = JSON.parse(text);
  } catch (e) {
    console.error("Failed to read or parse profiles.json:", e.message);
    process.exit(1);
  }

  if (!Array.isArray(records)) {
    console.error("profiles.json must contain a JSON array");
    process.exit(1);
  }

  const rows = [];
  for (let i = 0; i < records.length; i += 1) {
    const v = validateRecord(records[i], i);
    if (!v.ok) {
      console.error(v.reason);
      process.exit(1);
    }
    rows.push(v.row);
  }

  const nameCounts = new Map();
  const idSet = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const { name: n, id: rowId } = rows[i];
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
    if (idSet.has(rowId)) {
      console.error(`Duplicate id in seed file: ${rowId} (row index ${i})`);
      process.exit(1);
    }
    idSet.add(rowId);
  }

  const duplicateNames = [...nameCounts.entries()].filter(([, c]) => c > 1);
  if (duplicateNames.length > 0) {
    const summary = duplicateNames
      .slice(0, 25)
      .map(([n, c]) => `"${n}" (${c}×)`)
      .join(", ");
    console.error(
      `Seed aborted: duplicate name(s) in profiles.json (${duplicateNames.length} name(s)). First examples: ${summary}`
    );
    process.exit(1);
  }

  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  if (rows.length === 0) {
    console.log("No records to insert.");
    await sequelize.close();
    return;
  }

  const names = rows.map((r) => r.name);
  const alreadyPresent = new Set();
  const chunkSize = 400;
  for (let i = 0; i < names.length; i += chunkSize) {
    const slice = names.slice(i, i + chunkSize);
    const chunkRows = await Profile.findAll({
      attributes: ["name"],
      where: { name: { [Op.in]: slice } },
      raw: true
    });
    for (const r of chunkRows) {
      alreadyPresent.add(r.name);
    }
  }
  const skippedCount = rows.filter((r) => alreadyPresent.has(r.name)).length;

  await Profile.bulkCreate(rows, {
    ignoreDuplicates: true,
    validate: true
  });

  const totalInDb = await Profile.count();
  const attemptedNew = rows.length - skippedCount;

  console.log(
    `Seed completed: ${rows.length} valid row(s) in file; ${skippedCount} skipped (name already in DB); attempted up to ${attemptedNew} new insert(s). Total profiles in DB: ${totalInDb}.`
  );
  if (skippedCount > 0 && skippedCount <= 30) {
    const skippedNames = rows.filter((r) => alreadyPresent.has(r.name)).map((r) => r.name);
    console.log(`Skipped names: ${skippedNames.join(", ")}`);
  } else if (skippedCount > 30) {
    console.log(`(${skippedCount} skipped; omitting name list — first 10 shown)`);
    console.log(
      rows
        .filter((r) => alreadyPresent.has(r.name))
        .slice(0, 10)
        .map((r) => r.name)
        .join(", ")
    );
  }
  await sequelize.close();
}

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
