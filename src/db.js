const { Pool } = require("pg");
require("dotenv").config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("[db] DATABASE_URL is not set. Make sure to configure it in .env or environment variables.");
}

const sslSetting = process.env.DATABASE_SSL;
let ssl;
if (sslSetting === "false") {
  ssl = false;
} else {
  ssl = { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString,
  ssl
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  query,
  pool
};
