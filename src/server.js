const { Op } = require("sequelize");
const app = require("./app");
const sequelize = require("./database/db");
const Profile = require("./models/profileModel");
const { getCountryNameByIso } = require("./utils/countryLookup");

const PORT = process.env.PORT || 3000;

async function backfillCountryNames() {
  const rows = await Profile.findAll({
    where: {
      [Op.or]: [{ country_name: null }, { country_name: "" }]
    }
  });
  for (const row of rows) {
    const name = getCountryNameByIso(row.country_id);
    await row.update({ country_name: name || row.country_id });
  }
}

async function startServer() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await backfillCountryNames();

    app.listen(PORT, () => {
      console.log(`Profiles API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
