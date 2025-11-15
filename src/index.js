const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const runsRoutes = require("./routes/runs");
const statsRoutes = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, "..", "uploads");
app.use("/uploads", express.static(uploadsDir));

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/runs", runsRoutes);
app.use("/api/stats", statsRoutes);

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Run Tracker listening on port ${PORT}`);
});
