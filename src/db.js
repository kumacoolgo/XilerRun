// src/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
    // Zeabur 当前这档 PostgreSQL 提示不支持 SSL，所以这里直接关掉
      ssl: false,
      });

      module.exports = pool;
