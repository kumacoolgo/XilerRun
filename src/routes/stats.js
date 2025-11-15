const express = require("express");
const db = require("../db");
const authMiddleware = require("../authMiddleware");

const router = express.Router();

router.use(authMiddleware);

// GET /api/stats/summary
// 返回：最近 8 周、最近 12 个月 + 个人最佳
router.get("/summary", async (req, res) => {
  try {
    const userId = req.user.id;

    const weeklyResult = await db.query(
      `
      SELECT
        date_trunc('week', started_at) AS week_start,
        SUM(total_distance_m) AS total_distance_m,
        SUM(duration_s) AS total_duration_s,
        COUNT(*) AS run_count
      FROM runs
      WHERE user_id = $1
        AND started_at >= NOW() - INTERVAL '8 weeks'
      GROUP BY week_start
      ORDER BY week_start DESC
      `,
      [userId]
    );

    const monthlyResult = await db.query(
      `
      SELECT
        date_trunc('month', started_at) AS month_start,
        SUM(total_distance_m) AS total_distance_m,
        SUM(duration_s) AS total_duration_s,
        COUNT(*) AS run_count
      FROM runs
      WHERE user_id = $1
        AND started_at >= NOW() - INTERVAL '12 months'
      GROUP BY month_start
      ORDER BY month_start DESC
      `,
      [userId]
    );

    const runsResult = await db.query(
      `
      SELECT id, started_at, total_distance_m, duration_s, avg_pace_sec_per_km
      FROM runs
      WHERE user_id = $1
      `,
      [userId]
    );

    const runs = runsResult.rows;
    const bests = calcBests(runs);

    res.json({
      weekly: weeklyResult.rows,
      monthly: monthlyResult.rows,
      bests
    });
  } catch (err) {
    console.error("GET /stats/summary error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 导出 CSV
router.get("/export/csv", async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      `
      SELECT id, started_at, ended_at, total_distance_m, duration_s, avg_pace_sec_per_km
      FROM runs
      WHERE user_id = $1
      ORDER BY started_at ASC
      `,
      [userId]
    );

    const rows = result.rows;
    let csv = "id,started_at,ended_at,distance_km,duration_sec,avg_pace_sec_per_km\n";

    rows.forEach((r) => {
      const distanceKm = (Number(r.total_distance_m) / 1000).toFixed(3);
      const startedAt = new Date(r.started_at).toISOString();
      const endedAt = new Date(r.ended_at).toISOString();
      csv += `${r.id},${startedAt},${endedAt},${distanceKm},${r.duration_s},${r.avg_pace_sec_per_km}\n`;
    });

    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="runs-${dateStr}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error("GET /stats/export/csv error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== 工具：计算个人最佳 =====

function calcBests(runs) {
  if (!runs || runs.length === 0) {
    return null;
  }

  let longest = null;
  let fastestAvg = null;
  let best5k = null;
  let best10k = null;
  let bestHalf = null;

  const THRESHOLD_5K = 5000;
  const THRESHOLD_10K = 10000;
  const THRESHOLD_HALF = 21097;

  for (const r of runs) {
    const dist = Number(r.total_distance_m);
    const dur = Number(r.duration_s);
    const pace = Number(r.avg_pace_sec_per_km);
    const startedAt = r.started_at;

    if (!dist || !dur) continue;

    if (!longest || dist > longest.distance_m) {
      longest = {
        run_id: r.id,
        distance_m: dist,
        started_at: startedAt
      };
    }

    if (dist >= 2000 && pace > 0) {
      if (!fastestAvg || pace < fastestAvg.avg_pace_sec_per_km) {
        fastestAvg = {
          run_id: r.id,
          avg_pace_sec_per_km: pace,
          distance_m: dist,
          started_at: startedAt
        };
      }
    }

    if (dist >= THRESHOLD_5K) {
      const t = dur * (THRESHOLD_5K / dist);
      if (!best5k || t < best5k.time_s) {
        best5k = {
          run_id: r.id,
          time_s: Math.round(t),
          started_at: startedAt
        };
      }
    }
    if (dist >= THRESHOLD_10K) {
      const t = dur * (THRESHOLD_10K / dist);
      if (!best10k || t < best10k.time_s) {
        best10k = {
          run_id: r.id,
          time_s: Math.round(t),
          started_at: startedAt
        };
      }
    }
    if (dist >= THRESHOLD_HALF) {
      const t = dur * (THRESHOLD_HALF / dist);
      if (!bestHalf || t < bestHalf.time_s) {
        bestHalf = {
          run_id: r.id,
          time_s: Math.round(t),
          started_at: startedAt
        };
      }
    }
  }

  return {
    longest_distance: longest,
    fastest_avg_pace: fastestAvg,
    best_5k: best5k,
    best_10k: best10k,
    best_half_marathon: bestHalf
  };
}

module.exports = router;
