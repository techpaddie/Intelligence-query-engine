const express = require("express");
const {
  createProfileHandler,
  getProfileByIdHandler,
  getAllProfilesHandler,
  searchProfilesHandler,
  deleteProfileByIdHandler
} = require("../controllers/profileController");

const router = express.Router();

router.post("/", createProfileHandler);
router.get("/search", searchProfilesHandler);
router.get("/:id", getProfileByIdHandler);
router.get("/", getAllProfilesHandler);
router.delete("/:id", deleteProfileByIdHandler);

module.exports = router;
