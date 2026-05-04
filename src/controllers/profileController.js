const {
  createProfile,
  getProfileById,
  listProfiles,
  deleteProfileById
} = require("../services/profileService");
const { parseNaturalLanguageQuery } = require("../services/queryParserService");
const {
  validateNameInput,
  validateProfileListQuery,
  validateProfileSearchQuery
} = require("../utils/validator");

async function createProfileHandler(req, res, next) {
  try {
    const { name } = req.body;
    validateNameInput(name);

    const result = await createProfile(name);
    if (result.alreadyExists) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: result.profile
      });
    }

    return res.status(201).json({
      status: "success",
      data: result.profile
    });
  } catch (error) {
    return next(error);
  }
}

async function getProfileByIdHandler(req, res, next) {
  try {
    const profile = await getProfileById(req.params.id);
    return res.status(200).json({
      status: "success",
      data: profile
    });
  } catch (error) {
    return next(error);
  }
}

async function getAllProfilesHandler(req, res, next) {
  try {
    const parsed = validateProfileListQuery(req.query);
    const result = await listProfiles(parsed);
    return res.status(200).json({
      status: "success",
      page: result.page,
      limit: result.limit,
      total: result.total,
      data: result.data
    });
  } catch (error) {
    return next(error);
  }
}

async function searchProfilesHandler(req, res, next) {
  try {
    const pagination = validateProfileSearchQuery(req.query);
    const parsed = parseNaturalLanguageQuery(req.query.q);
    if (parsed.status === "error") {
      return res.status(400).json(parsed);
    }

    const result = await listProfiles({
      filters: parsed.filters,
      sort_by: pagination.sort_by,
      order: pagination.order,
      page: pagination.page,
      limit: pagination.limit
    });

    return res.status(200).json({
      status: "success",
      page: result.page,
      limit: result.limit,
      total: result.total,
      data: result.data
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteProfileByIdHandler(req, res, next) {
  try {
    await deleteProfileById(req.params.id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createProfileHandler,
  getProfileByIdHandler,
  getAllProfilesHandler,
  searchProfilesHandler,
  deleteProfileByIdHandler
};
