const { Op, fn, col, where, cast } = require("sequelize");

function buildWhereFromFilters(filters) {
  const and = [];

  if (Array.isArray(filters.gender) && filters.gender.length > 0) {
    const vals = [
      ...new Set(
        filters.gender.map((g) => String(g).toLowerCase()).filter((g) => g === "male" || g === "female")
      )
    ];
    if (vals.length === 1) {
      and.push(where(fn("lower", col("gender")), vals[0]));
    } else if (vals.length > 1) {
      and.push({ gender: { [Op.in]: vals } });
    }
  } else if (filters.gender) {
    and.push(where(fn("lower", col("gender")), filters.gender.toLowerCase()));
  }

  if (filters.age_group) {
    and.push(where(fn("lower", col("age_group")), filters.age_group.toLowerCase()));
  }

  if (filters.country_id) {
    const cid = String(filters.country_id).trim().toUpperCase();
    and.push({ country_id: cid });
  }

  if (filters.min_age != null) {
    and.push(
      where(cast(col("age"), "INTEGER"), {
        [Op.gte]: filters.min_age
      })
    );
  }
  if (filters.max_age != null) {
    and.push(
      where(cast(col("age"), "INTEGER"), {
        [Op.lte]: filters.max_age
      })
    );
  }

  if (filters.min_gender_probability != null) {
    and.push({
      gender_probability: { [Op.gte]: filters.min_gender_probability }
    });
  }

  if (filters.min_country_probability != null) {
    and.push({
      country_probability: { [Op.gte]: filters.min_country_probability }
    });
  }

  if (and.length === 0) {
    return {};
  }
  return { [Op.and]: and };
}

function buildOrder(sortBy, order) {
  const dir = order === "asc" ? "ASC" : "DESC";
  if (sortBy === "age") {
    return [[cast(col("age"), "INTEGER"), dir]];
  }
  if (sortBy === "gender_probability") {
    return [["gender_probability", dir]];
  }
  return [["created_at", dir]];
}

function buildPagination(page, limit) {
  const offset = (page - 1) * limit;
  return { limit, offset };
}

async function findProfilesWithFilters(Profile, filters, sortBy, order, page, limit) {
  const whereClause = buildWhereFromFilters(filters);
  const orderClause = buildOrder(sortBy, order);
  const { offset, limit: lim } = buildPagination(page, limit);

  return Profile.findAndCountAll({
    where: whereClause,
    order: orderClause,
    limit: lim,
    offset
  });
}

module.exports = {
  buildWhereFromFilters,
  buildOrder,
  buildPagination,
  findProfilesWithFilters
};
