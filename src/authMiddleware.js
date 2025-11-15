const db = require("./db");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await db.query(
      "SELECT id, email FROM users WHERE api_token = $1",
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = {
      id: result.rows[0].id,
      email: result.rows[0].email
    };
    next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = authMiddleware;
