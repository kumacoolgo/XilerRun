const API_BASE = "";

const authSection = document.getElementById("auth-section");
const trackerSection = document.getElementById("tracker-section");
const authMsg = document.getElementById("auth-message");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const registerBtn = document.getElementById("register-btn");
const userEmailEl = document.getElementById("user-email");
const statusText = document.getElementById("status-text");
const currentDistanceEl = document.getElementById("current-distance");
const currentDurationEl = document.getElementById("current-duration");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const runsList = document.getElementById("runs-list");
const logoutBtn = document.getElementById("logout-btn");

const runDetail = document.getElementById("run-detail");
const detailSummary = document.getElementById("detail-summary");
const detailStats = document.getElementById("detail-stats");
const detailSplits = document.getElementById("detail-splits");

const weeklyStatsEl = document.getElementById("weekly-stats");
const monthlyStatsEl = document.getElementById("monthly-stats");
const bestStatsEl = document.getElementById("best-stats");
const exportCsvBtn = document.getElementById("export-csv-btn");
const weeklyGoalInput = document.getElementById("weekly-goal-input");
const weeklyGoalSaveBtn = document.getElementById("weekly-goal-save");
const weeklyGoalBar = document.getElementById("weekly-goal-bar");
const weeklyGoalText = document.getElementById("weekly-goal-text");

const weeklyChartCanvas = document.getElementById("weekly-chart");
const monthlyChartCanvas = document.getElementById("monthly-chart");

// 这些元素现在只用到一部分，没有对应的 UI 也没关系
const gpxInput = document.getElementById("gpx-input");
const importGpxBtn = document.getElementById("import-gpx-btn");

// 新增：消息和截图列表元素
const gpsMsg = document.getElementById("gps-message");
const photoMessage = document.getElementById("photo-message");
const gpxMessage = document.getElementById("gpx-message");
const photoList = document.getElementById("photo-list");

let token = localStorage.getItem("runTrackerToken") || null;
let currentUserEmail = localStorage.getItem("runTrackerEmail") || null;

let watchId = null;
let points = [];
let runStartTime = null;
let timerInterval = null;

let map = null;
let trackLayer = null;

let currentRunId = null;
let lastWeeklyStats = null;

// ===== 工具函数 =====
function setAuthMessage(msg, ok = false) {
  authMsg.textContent = msg || "";
  authMsg.classList.toggle("ok", ok);
}

function setGpsMessage(msg, ok = false) {
  if (!gpsMsg) return;
  gpsMsg.textContent = msg || "";
  gpsMsg.classList.toggle("ok", ok);
}

function setPhotoMessage(msg, ok = false) {
  if (!photoMessage) return;
  photoMessage.textContent = msg || "";
  photoMessage.classList.toggle("ok", ok);
}

function setGpxMessage(msg, ok = false) {
  if (!gpxMessage) return;
  gpxMessage.textContent = msg || "";
  gpxMessage.classList.toggle("ok", ok);
}

function formatDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const hh = h > 0 ? h.toString().padStart(2, "0") + ":" : "";
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return `${hh}${mm}:${ss}`;
}

function paceToString(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return "-";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  const ss = s.toString().padStart(2, "0");
  return `${m}'${ss}" /km`;
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  if (!options.noJson) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(API_BASE + path, {
    ...options,
    headers
  });
  if (!res.ok) {
    let msg = "请求失败";
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  if (options.raw) return res;
  return res.json();
}

function showTracker() {
  authSection.classList.add("hidden");
  trackerSection.classList.remove("hidden");
  userEmailEl.textContent = currentUserEmail ? `当前账号：${currentUserEmail}` : "";
  loadStats();
  loadRuns();
}

function showAuth() {
  trackerSection.classList.add("hidden");
  authSection.classList.remove("hidden");
}

// ===== 历史记录 & 详情 =====
async function loadRuns() {
  runsList.innerHTML = "<li>加载中...</li>";
  runDetail.classList.add("hidden");
  currentRunId = null;
  try {
    const runs = await api("/api/runs");
    if (!runs.length) {
      runsList.innerHTML = "<li>暂无记录</li>";
      return;
    }
    runsList.innerHTML = "";
    runs.forEach((r) => {
      const li = document.createElement("li");
      li.dataset.id = r.id;
      const start = new Date(r.started_at);
      const distanceKm = (r.total_distance_m / 1000).toFixed(2);
      const pace = paceToString(r.avg_pace_sec_per_km);
      li.innerHTML = `
        <strong>${start.toLocaleString()}</strong>
        <span class="meta">
          距离：${distanceKm} km，
          用时：${formatDuration(r.duration_s)}，
          平均配速：${pace}
        </span>
      `;
      li.addEventListener("click", () => {
        loadRunDetail(r.id);
      });
      runsList.appendChild(li);
    });
  } catch (err) {
    runsList.innerHTML = `<li>加载失败: ${err.message}</li>`;
  }
}

async function loadRunDetail(runId) {
  try {
    currentRunId = runId;
    detailSummary.textContent = "加载中...";
    detailStats.innerHTML = "";
    detailSplits.innerHTML = "";
    if (photoList) photoList.innerHTML = "";
    setPhotoMessage("");
    runDetail.classList.remove("hidden");

    const run = await api(`/api/runs/${runId}`);

    const start = new Date(run.started_at);
    const end = new Date(run.ended_at);
    const distanceKm = (run.total_distance_m / 1000).toFixed(2);
    const avgPace = paceToString(run.avg_pace_sec_per_km);

    detailSummary.textContent = `${start.toLocaleString()} ～ ${end
      .toLocaleTimeString()
      .replace(/:\d{2}$/, "")}`;

    detailStats.innerHTML = `
      <p>总距离：<strong>${distanceKm} km</strong></p>
      <p>总用时：<strong>${formatDuration(run.duration_s)}</strong></p>
      <p>平均配速：<strong>${avgPace}</strong></p>
    `;

    const splits = run.splits_json || [];
    if (splits.length === 0) {
      detailSplits.innerHTML = "<li>距离不足 1 公里，暂无分段</li>";
    } else {
      splits.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = `${s.km} km：${paceToString(s.pace_sec)}`;
        detailSplits.appendChild(li);
      });
    }

    const photos = run.photos || [];
    if (photoList) {
      if (!photos.length) {
        photoList.innerHTML =
          "<span class='subtext'>暂无截图。</span>";
      } else {
        photoList.innerHTML = "";
        photos.forEach((p) => {
          const img = document.createElement("img");
          img.src = p.url;
          img.alt = "跑步截图";
          photoList.appendChild(img);
        });
      }
    }

    const points = run.raw_points_json || [];
    renderMap(points);
  } catch (err) {
    detailSummary.textContent = "加载失败：" + err.message;
  }
}

// ===== 统计 =====
async function loadStats() {
  weeklyStatsEl.innerHTML = "<li>加载中...</li>";
  monthlyStatsEl.innerHTML = "<li>加载中...</li>";
  bestStatsEl.innerHTML = "<li>加载中...</li>";
  try {
    const data = await api("/api/stats/summary");
    const weekly = data.weekly || [];
    const monthly = data.monthly || [];
    const bests = data.bests || null;

    lastWeeklyStats = weekly;

    // 周
    if (!weekly.length) {
      weeklyStatsEl.innerHTML = "<li>暂无数据</li>";
    } else {
      weeklyStatsEl.innerHTML = "";
      weekly.forEach((w) => {
        const d = new Date(w.week_start);
        const label = `周 ${d.getFullYear()}-${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}-${d
          .getDate()
          .toString()
          .padStart(2, "0")}`;
        const distKm = (w.total_distance_m / 1000).toFixed(1);
        const li = document.createElement("li");
        li.textContent = `${label}：${distKm} km（${w.run_count} 次）`;
        weeklyStatsEl.appendChild(li);
      });
    }

    // 月
    if (!monthly.length) {
      monthlyStatsEl.innerHTML = "<li>暂无数据</li>";
    } else {
      monthlyStatsEl.innerHTML = "";
      monthly.forEach((m) => {
        const d = new Date(m.month_start);
        const label = `${d.getFullYear()}-${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}`;
        const distKm = (m.total_distance_m / 1000).toFixed(1);
        const li = document.createElement("li");
        li.textContent = `${label}：${distKm} km（${m.run_count} 次）`;
        monthlyStatsEl.appendChild(li);
      });
    }

    // 个人最佳
    if (!bests) {
      bestStatsEl.innerHTML = "<li>暂无记录</li>";
    } else {
      bestStatsEl.innerHTML = "";

      if (bests.longest_distance) {
        const bd = bests.longest_distance;
        const d = new Date(bd.started_at);
        const distKm = (bd.distance_m / 1000).toFixed(2);
        const li = document.createElement("li");
        li.textContent = `最长距离：${distKm} km（${d.toLocaleDateString()}）`;
        bestStatsEl.appendChild(li);
      }

      if (bests.fastest_avg_pace) {
        const bf = bests.fastest_avg_pace;
        const d = new Date(bf.started_at);
        const pace = paceToString(bf.avg_pace_sec_per_km);
        const li = document.createElement("li");
        li.textContent = `最快平均配速：${pace}（${(
          bf.distance_m / 1000
        ).toFixed(2)} km，${d.toLocaleDateString()}）`;
        bestStatsEl.appendChild(li);
      }

      if (bests.best_5k) {
        const b5 = bests.best_5k;
        const d = new Date(b5.started_at);
        const li = document.createElement("li");
        li.textContent = `最佳 5K：${formatDuration(
          b5.time_s
        )}（${d.toLocaleDateString()}）`;
        bestStatsEl.appendChild(li);
      }

      if (bests.best_10k) {
        const b10 = bests.best_10k;
        const d = new Date(b10.started_at);
        const li = document.createElement("li");
        li.textContent = `最佳 10K：${formatDuration(
          b10.time_s
        )}（${d.toLocaleDateString()}）`;
        bestStatsEl.appendChild(li);
      }

      if (bests.best_half_marathon) {
        const bh = bests.best_half_marathon;
        const d = new Date(bh.started_at);
        const li = document.createElement("li");
        li.textContent = `最佳半马：${formatDuration(
          bh.time_s
        )}（${d.toLocaleDateString()}）`;
        bestStatsEl.appendChild(li);
      }

      if (!bestStatsEl.children.length) {
        bestStatsEl.innerHTML =
          "<li>跑步距离还不够长，暂无有效个人最佳</li>";
      }
    }

    updateWeeklyGoalUI(weekly);
    renderWeeklyChart(weekly);
    renderMonthlyChart(monthly);
  } catch (err) {
    weeklyStatsEl.innerHTML = `<li>加载失败: ${err.message}</li>`;
    monthlyStatsEl.innerHTML = `<li>加载失败: ${err.message}</li>`;
    bestStatsEl.innerHTML = `<li>加载失败: ${err.message}</li>`;
  }
}

function updateWeeklyGoalUI(weekly) {
  const goalStr = localStorage.getItem("weeklyGoalKm");
  if (!goalStr) {
    weeklyGoalText.textContent = "未设置本周目标";
    weeklyGoalBar.style.width = "0%";
    weeklyGoalInput.value = "";
    return;
  }

  const goal = parseFloat(goalStr);
  if (isNaN(goal) || goal <= 0) {
    weeklyGoalText.textContent = "未设置本周目标";
    weeklyGoalBar.style.width = "0%";
    weeklyGoalInput.value = "";
    return;
  }

  weeklyGoalInput.value = goal;

  let latestKm = 0;
  if (weekly && weekly.length > 0) {
    latestKm = (weekly[0].total_distance_m || 0) / 1000;
  }

  const ratio = goal > 0 ? Math.min(1, latestKm / goal) : 0;
  weeklyGoalBar.style.width = `${ratio * 100}%`;

  const percent = (ratio * 100).toFixed(0);
  weeklyGoalText.textContent = `本周 ${latestKm.toFixed(
    1
  )} km / 目标 ${goal.toFixed(1)} km（${percent}%）`;
}

function renderWeeklyChart(weekly) {
  if (!weeklyChartCanvas) return;
  const ctx = weeklyChartCanvas.getContext("2d");
  const w = weeklyChartCanvas.width;
  const h = weeklyChartCanvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!weekly || weekly.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px system-ui";
    ctx.fillText("暂无周数据", 10, 20);
    return;
  }

  const data = [...weekly].reverse().map(
    (item) => item.total_distance_m / 1000
  );
  const labels = [...weekly].reverse().map((item) => {
    const d = new Date(item.week_start);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const maxVal = Math.max(...data, 1);
  const padding = 20;
  const chartH = h - padding * 2;
  const chartW = w - padding * 2;
  const barCount = data.length;
  const barWidth = chartW / (barCount * 1.5);

  ctx.font = "10px system-ui";

  data.forEach((val, idx) => {
    const x =
      padding + idx * (chartW / barCount) + (chartW / barCount - barWidth) / 2;
    const barHeight = (val / maxVal) * chartH;
    const y = h - padding - barHeight;

    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "center";
    ctx.fillText(val.toFixed(1), x + barWidth / 2, y - 4);

    ctx.fillStyle = "#9ca3af";
    ctx.fillText(labels[idx], x + barWidth / 2, h - 5);
  });
}

function renderMonthlyChart(monthly) {
  if (!monthlyChartCanvas) return;
  const ctx = monthlyChartCanvas.getContext("2d");
  const w = monthlyChartCanvas.width;
  const h = monthlyChartCanvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!monthly || monthly.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px system-ui";
    ctx.fillText("暂无月数据", 10, 20);
    return;
  }

  const data = [...monthly].reverse().map(
    (item) => item.total_distance_m / 1000
  );
  const labels = [...monthly].reverse().map((item) => {
    const d = new Date(item.month_start);
    return `${d.getMonth() + 1}月`;
  });

  const maxVal = Math.max(...data, 1);
  const padding = 20;
  const chartH = h - padding * 2;
  const chartW = w - padding * 2;
  const barCount = data.length;
  const barWidth = chartW / (barCount * 1.5);

  ctx.font = "10px system-ui";

  data.forEach((val, idx) => {
    const x =
      padding + idx * (chartW / barCount) + (chartW / barCount - barWidth) / 2;
    const barHeight = (val / maxVal) * chartH;
    const y = h - padding - barHeight;

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "center";
    ctx.fillText(val.toFixed(1), x + barWidth / 2, y - 4);

    ctx.fillStyle = "#9ca3af";
    ctx.fillText(labels[idx], x + barWidth / 2, h - 5);
  });
}

// ===== 地图渲染 =====
function renderMap(points) {
  const mapContainer = document.getElementById("map");

  // 没有轨迹点的情况
  if (!points || points.length < 2) {
    // 只有在还没创建地图时才往容器里塞文字
    if (!map) {
      mapContainer.innerHTML =
        "<p style='padding:8px;font-size:0.85rem;color:#9ca3af;'>轨迹点太少</p>";
    } else {
      // 已经有地图了，就只清掉轨迹线
      if (trackLayer) {
        map.removeLayer(trackLayer);
        trackLayer = null;
      }
    }
    return;
  }

  // ❌ 不要再清空 innerHTML，否则 Leaflet 的 DOM 会被删掉
  // mapContainer.innerHTML = "";

  // 第一次创建地图
  if (!map) {
    map = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
  }

  // 清掉旧轨迹
  if (trackLayer) {
    map.removeLayer(trackLayer);
  }

  const latlngs = points.map((p) => [p.lat, p.lng]);
  trackLayer = L.polyline(latlngs, { weight: 5 }).addTo(map);

  const bounds = trackLayer.getBounds();
  map.fitBounds(bounds, { padding: [20, 20] });

  // 保底再刷新尺寸，防止偶发灰屏
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}


// ===== 登录 / 注册 / 退出 =====
loginBtn.addEventListener("click", async () => {
  setAuthMessage("");
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      return setAuthMessage("请输入邮箱和密码");
    }
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    token = data.token;
    currentUserEmail = data.user.email;
    localStorage.setItem("runTrackerToken", token);
    localStorage.setItem("runTrackerEmail", currentUserEmail);
    setAuthMessage("登录成功", true);
    showTracker();
  } catch (err) {
    setAuthMessage(err.message);
  }
});

registerBtn.addEventListener("click", async () => {
  setAuthMessage("");
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      return setAuthMessage("请输入邮箱和密码");
    }
    if (password.length < 6) {
      return setAuthMessage("密码至少 6 位");
    }
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    token = data.token;
    currentUserEmail = data.user.email;
    localStorage.setItem("runTrackerToken", token);
    localStorage.setItem("runTrackerEmail", currentUserEmail);
    setAuthMessage("注册并登录成功", true);
    showTracker();
  } catch (err) {
    setAuthMessage(err.message);
  }
});

logoutBtn.addEventListener("click", () => {
  token = null;
  currentUserEmail = null;
  localStorage.removeItem("runTrackerToken");
  localStorage.removeItem("runTrackerEmail");
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  points = [];
  runStartTime = null;
  statusText.textContent = "未开始";
  currentDistanceEl.textContent = "0.00";
  currentDurationEl.textContent = "00:00";
  showAuth();
});

// ===== GPS：开始 =====
startBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    return setGpsMessage("当前浏览器不支持定位");
  }

  points = [];
  runStartTime = Date.now();
  currentDistanceEl.textContent = "0.00";
  currentDurationEl.textContent = "00:00";
  statusText.textContent = "进行中";
  setGpsMessage("正在记录 GPS...", true);

  startBtn.disabled = true;
  stopBtn.disabled = false;

  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = setInterval(() => {
    if (!runStartTime) return;
    const now = Date.now();
    const sec = Math.floor((now - runStartTime) / 1000);
    currentDurationEl.textContent = formatDuration(sec);
  }, 1000);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (accuracy && accuracy > 60) return;
      const p = {
        ts: Date.now(),
        lat: latitude,
        lng: longitude
      };
      points.push(p);

      if (points.length >= 2) {
        const dist = approxDistance(points);
        currentDistanceEl.textContent = (dist / 1000).toFixed(2);
      }
    },
    (err) => {
      console.error(err);
      setGpsMessage("获取定位失败：" + err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
});

function approxDistance(pts) {
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += haversine(pts[i - 1], pts[i]);
  }
  return sum;
}

function haversine(p1, p2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
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

// ===== GPS：停止 =====
stopBtn.addEventListener("click", async () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const runEndTime = Date.now();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusText.textContent = "未开始";

  if (!runStartTime || points.length < 2) {
    setGpsMessage("记录点太少，这次不保存");
    return;
  }

  try {
    setGpsMessage("正在上传跑步数据...", true);
    const payload = {
      startedAt: runStartTime,
      endedAt: runEndTime,
      points
    };
    const data = await api("/api/runs/finish", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const distKm = (data.total_distance_m / 1000).toFixed(2);
    const pace = paceToString(data.avg_pace_sec_per_km);
    setGpsMessage(
      `已保存：${distKm} km，用时 ${formatDuration(
        data.duration_s
      )}，平均配速 ${pace}`,
      true
    );
    loadStats();
    loadRuns();
  } catch (err) {
    console.error(err);
    setGpsMessage("上传失败：" + err.message);
  } finally {
    runStartTime = null;
    points = [];
  }
});

// ===== 导出 CSV =====
exportCsvBtn.addEventListener("click", async () => {
  try {
    if (!token) {
      alert("请先登录");
      return;
    }
    const headers = {
      Authorization: "Bearer " + token
    };
    const res = await fetch("/api/stats/export/csv", {
      headers
    });
    if (!res.ok) {
      let msg = "导出失败";
      try {
        const data = await res.json();
        if (data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `runs-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  }
});

// ===== 保存/更新本周目标 =====
weeklyGoalSaveBtn.addEventListener("click", () => {
  const v = parseFloat(weeklyGoalInput.value);
  if (isNaN(v) || v <= 0) {
    localStorage.removeItem("weeklyGoalKm");
    weeklyGoalText.textContent = "已清除本周目标";
    weeklyGoalBar.style.width = "0%";
    return;
  }
  localStorage.setItem("weeklyGoalKm", v.toString());
  updateWeeklyGoalUI(lastWeeklyStats || []);
});

// ===== 初始化 =====
if (token) {
  showTracker();
} else {
  showAuth();
}

// ===== PWA Service Worker 注册 =====
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/service-worker.js")
    .catch((err) => {
      console.warn("ServiceWorker 注册失败:", err);
    });
}
