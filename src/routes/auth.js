const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

// 注册
router.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, hashed]
    );

    const token = crypto.randomBytes(32).toString("hex");
    await db.query("UPDATE users SET api_token = $1 WHERE id = $2", [
      token,
      result.rows[0].id
    ]);

    res.json({
      token,
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email
      }
    });
  } catch (err) {
    console.error("register error:", err);
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

// 登录
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await db.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await db.query("UPDATE users SET api_token = $1 WHERE id = $2", [
      token,
      user.id
    ]);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
