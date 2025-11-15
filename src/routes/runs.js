const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { XMLParser } = require("fast-xml-parser");
const db = require("../db");
const authMiddleware = require("../authMiddleware");

const router = express.Router();

router.use(authMiddleware);

// 工具：角度转弧度
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Haversine：两点距离（米）
function haversineDistance(p1, p2) {
  const R = 6371000;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 上传目录（截图）
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 截图存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const runId = req.params.id || "run";
    const name = `run_${runId}_${Date.now()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

// GPX 内存存储
const gpxUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

// ====== 结束一次跑步：POST /api/runs/finish ======
router.post("/finish", async (req, res) => {
  try {
    const userId = req.user.id;
    const { startedAt, endedAt, points } = req.body || {};

    if (!startedAt || !endedAt || !Array.isArray(points) || points.length < 2) {
      return res.status(400).json({ error: "Invalid data" });
    }

    let totalDistance = 0;
    const splits = [];
    let nextKmMark = 1000;
    let lastSplitTime = startedAt;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const d = haversineDistance(
        { lat: prev.lat, lng: prev.lng },
        { lat: curr.lat, lng: curr.lng }
      );
      totalDistance += d;

      while (totalDistance >= nextKmMark) {
        const prevAccumulated = totalDistance - d;
        const ratio =
          (nextKmMark - prevAccumulated) / d;
        const crossingTime =
          prev.ts + (curr.ts - prev.ts) * ratio;

        const splitPaceSec = Math.round(
          (crossingTime - lastSplitTime) / 1000
        );
        splits.push({
          km: nextKmMark / 1000,
          pace_sec: splitPaceSec
        });

        lastSplitTime = crossingTime;
        nextKmMark += 1000;
      }
    }

    const durationSec = Math.round((endedAt - startedAt) / 1000);
    const totalDistanceKm = totalDistance / 1000;
    const avgPaceSecPerKm = Math.round(
      durationSec / (totalDistanceKm || 1)
    );

    const result = await db.query(
      `INSERT INTO runs 
       (user_id, started_at, ended_at, total_distance_m, duration_s, avg_pace_sec_per_km, splits_json, raw_points_json)
       VALUES ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4, $5, $6, $7, $8)
       RETURNING id, started_at, ended_at, total_distance_m, duration_s, avg_pace_sec_per_km, splits_json`,
      [
        userId,
        startedAt,
        endedAt,
        Math.round(totalDistance),
        durationSec,
        avgPaceSecPerKm,
        JSON.stringify(splits),
        JSON.stringify(points)
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("/runs/finish error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ====== 列出最近 20 次跑步 ======
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      `SELECT id, started_at, ended_at, total_distance_m, duration_s, avg_pace_sec_per_km, splits_json
       FROM runs
       WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT 20`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /runs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ====== 获取某一次详情（含轨迹和截图） ======
router.get("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const id = parseInt(req.params.id, 10);

    const runResult = await db.query(
      `SELECT id, started_at, ended_at, total_distance_m, duration_s, avg_pace_sec_per_km, splits_json, raw_points_json
       FROM runs
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    const photoResult = await db.query(
      `SELECT id, url, created_at
       FROM run_photos
       WHERE run_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const run = runResult.rows[0];
    run.photos = photoResult.rows;

    res.json(run);
  } catch (err) {
    console.error("GET /runs/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ====== 上传跑步截图：POST /api/runs/:id/photo ======
router.post("/:id/photo", upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.id;
    const runId = parseInt(req.params.id, 10);

    const runResult = await db.query(
      "SELECT id FROM runs WHERE id = $1 AND user_id = $2",
      [runId, userId]
    );
    if (runResult.rows.length === 0) {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(404).json({ error: "Run not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    const result = await db.query(
      `INSERT INTO run_photos (run_id, url)
       VALUES ($1, $2)
       RETURNING id, url, created_at`,
      [runId, fileUrl]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("POST /runs/:id/photo error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ====== 导入 GPX：POST /api/runs/import-gpx ======
router.post("/import-gpx", gpxUpload.single("file"), async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: "No GPX file uploaded" });
    }

    const xml = req.file.buffer.toString("utf8");

    const parser = new XMLParser({
      ignoreAttributes: false
    });

    let gpx;
    try {
      gpx = parser.parse(xml);
    } catch (e) {
      console.error("GPX parse error:", e);
      return res.status(400).json({ error: "Invalid GPX file" });
    }

    let trkpts = [];

    if (gpx.gpx) {
      const root = gpx.gpx;
      const trks = Array.isArray(root.trk) ? root.trk : root.trk ? [root.trk] : [];
      trks.forEach((trk) => {
        const segs = Array.isArray(trk.trkseg)
          ? trk.trkseg
          : trk.trkseg
          ? [trk.trkseg]
          : [];
        segs.forEach((seg) => {
          const pts = Array.isArray(seg.trkpt)
            ? seg.trkpt
            : seg.trkpt
            ? [seg.trkpt]
            : [];
          trkpts = trkpts.concat(pts);
        });
      });
    }

    if (!trkpts.length) {
      return res.status(400).json({ error: "No track points in GPX" });
    }

    const points = [];
    let fallbackTs = Date.now();

    trkpts.forEach((pt, idx) => {
      const lat = parseFloat(pt["@_lat"]);
      const lng = parseFloat(pt["@_lon"]);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      let ts;
      if (pt.time) {
        const t = Date.parse(pt.time);
        ts = Number.isNaN(t) ? null : t;
      }
      if (!ts) {
        ts = fallbackTs + idx * 1000;
      }

      points.push({ ts, lat, lng });
    });

    if (points.length < 2) {
      return res.status(400).json({ error: "Not enough usable track points" });
    }

    let totalDistance = 0;
    const splits = [];
    let nextKmMark = 1000;
    const startedAt = points[0].ts;
    const endedAt = points[points.length - 1].ts;
    let lastSplitTime = startedAt;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const d = haversineDistance(
        { lat: prev.lat, lng: prev.lng },
        { lat: curr.lat, lng: curr.lng }
      );
      totalDistance += d;

      while (totalDistance >= nextKmMark) {
        const prevAccumulated = totalDistance - d;
        const ratio =
          (nextKmMark - prevAccumulated) / d;
        const crossingTime =
          prev.ts + (curr.ts - prev.ts) * ratio;

        const splitPaceSec = Math.round(
          (crossingTime - lastSplitTime) / 1000
        );
        splits.push({
          km: nextKmMark / 1000,
          pace_sec: splitPaceSec
        });

        lastSplitTime = crossingTime;
        nextKmMark += 1000;
      }
    }

    const durationSec = Math.round((endedAt - startedAt) / 1000);
    const totalDistanceKm = totalDistance / 1000;
    const avgPaceSecPerKm = Math.round(
      durationSec / (totalDistanceKm || 1)
    );

    const result = await db.query(
      `INSERT INTO runs
       (user_id, started_at, ended_at, total_distance_m, duration_s, avg_pace_sec_per_km, splits_json, raw_points_json)
       VALUES ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4, $5, $6, $7, $8)
       RETURNING id, started_at, ended_at, total_distance_m, duration_s, avg_pace_sec_per_km, splits_json`,
      [
        userId,
        startedAt,
        endedAt,
        Math.round(totalDistance),
        durationSec,
        avgPaceSecPerKm,
        JSON.stringify(splits),
        JSON.stringify(points)
      ]
    );

    res.json({
      from: "gpx",
      ...result.rows[0]
    });
  } catch (err) {
    console.error("POST /runs/import-gpx error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
