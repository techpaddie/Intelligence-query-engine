const { where, fn, col } = require("sequelize");
const { v7: uuidv7 } = require("uuid");
const Profile = require("../models/profileModel");
const { fetchGenderize } = require("./genderizeService");
const { fetchAgify } = require("./agifyService");
const { fetchNationalize } = require("./nationalizeService");
const { classifyAgeGroup } = require("../utils/classification");
const { getCountryNameByIso } = require("../utils/countryLookup");
const { findProfilesWithFilters } = require("../utils/queryBuilder");
const { AppError, ExternalApiError } = require("../utils/errors");

const creationLocks = new Map();

function sanitizeName(name) {
  return name.trim().toLowerCase();
}

function withNameLock(name, task) {
  const existingChain = creationLocks.get(name) || Promise.resolve();
  let release;
  const nextChain = new Promise((resolve) => {
    release = resolve;
  });
  creationLocks.set(name, existingChain.then(() => nextChain));

  return existingChain
    .then(task)
    .finally(() => {
      release();
      if (creationLocks.get(name) === nextChain) {
        creationLocks.delete(name);
      }
    });
}

async function createProfile(nameInput) {
  const normalizedName = sanitizeName(nameInput);

  return withNameLock(normalizedName, async () => {
    const existing = await Profile.findOne({
      where: where(fn("lower", col("name")), normalizedName)
    });

    if (existing) {
      return {
        alreadyExists: true,
        profile: existing
      };
    }

    let genderizeData;
    let agifyData;
    let nationalizeData;

    try {
      [genderizeData, agifyData, nationalizeData] = await Promise.all([
        fetchGenderize(normalizedName),
        fetchAgify(normalizedName),
        fetchNationalize(normalizedName)
      ]);
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }
      throw new AppError("internal error while calling external APIs", 500);
    }

    const validCountries = nationalizeData.country.filter(
      (country) =>
        country &&
        typeof country.country_id === "string" &&
        typeof country.probability === "number"
    );

    if (validCountries.length === 0) {
      throw new ExternalApiError("Nationalize");
    }

    const topCountry = validCountries.reduce((max, current) =>
      current.probability > max.probability ? current : max
    );

    if (
      typeof topCountry.country_id !== "string" ||
      typeof topCountry.probability !== "number"
    ) {
      throw new ExternalApiError("Nationalize");
    }

    const countryId = String(topCountry.country_id).toUpperCase();
    const countryName = getCountryNameByIso(countryId);

    try {
      const profile = await Profile.create({
        id: uuidv7(),
        name: normalizedName,
        gender: genderizeData.gender,
        gender_probability: genderizeData.probability,
        age: agifyData.age,
        age_group: classifyAgeGroup(agifyData.age),
        country_id: countryId,
        country_name: countryName || countryId,
        country_probability: topCountry.probability,
        created_at: new Date().toISOString()
      });

      return {
        alreadyExists: false,
        profile
      };
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") {
        const profile = await Profile.findOne({
          where: where(fn("lower", col("name")), normalizedName)
        });
        return {
          alreadyExists: true,
          profile
        };
      }
      throw new AppError("internal database error", 500);
    }
  });
}

async function getProfileById(id) {
  const profile = await Profile.findByPk(id);
  if (!profile) {
    throw new AppError("Profile not found", 404);
  }
  return profile;
}

async function listProfiles({ filters, sort_by, order, page, limit }) {
  const { rows, count } = await findProfilesWithFilters(
    Profile,
    filters,
    sort_by,
    order,
    page,
    limit
  );

  return {
    data: rows,
    total: count,
    page,
    limit
  };
}

async function deleteProfileById(id) {
  const deletedRows = await Profile.destroy({
    where: { id }
  });

  if (deletedRows === 0) {
    throw new AppError("Profile not found", 404);
  }
}

module.exports = {
  createProfile,
  getProfileById,
  listProfiles,
  deleteProfileById
};
