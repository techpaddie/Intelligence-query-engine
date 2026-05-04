const { DataTypes } = require("sequelize");
const sequelize = require("../database/db");

const Profile = sequelize.define(
  "Profile",
  {
    id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: false
    },
    gender_probability: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    age_group: {
      type: DataTypes.STRING,
      allowNull: false
    },
    country_id: {
      type: DataTypes.STRING(2),
      allowNull: false
    },
    country_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    country_probability: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    created_at: {
      type: DataTypes.STRING,
      allowNull: false
    }
  },
  {
    tableName: "profiles",
    timestamps: false,
    indexes: [
      { unique: true, fields: ["name"] },
      { fields: ["gender"] },
      { fields: ["country_id"] }
    ],
    hooks: {
      beforeValidate(profile) {
        if (profile.name && typeof profile.name === "string") {
          profile.name = profile.name.trim().toLowerCase();
        }
      }
    }
  }
);

module.exports = Profile;
