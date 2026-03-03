const D_SCALE_DEFAULT = 1.46;

const nameInput = document.getElementById("nameInput");
const dInput = document.getElementById("dInput");
const yInput = document.getElementById("yInput");
const rawInput = document.getElementById("rawInput");
const resultOutput = document.getElementById("resultOutput");
const trendGraphsTitle = document.getElementById("trendGraphsTitle");
const estimateBtn = document.getElementById("estimateBtn");
const clearBtn = document.getElementById("clearBtn");
const wrappedViewBtn = document.getElementById("wrappedViewBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const monthModeInputs = Array.from(document.querySelectorAll('input[name="monthMode"]'));
const trendBasisInputs = Array.from(document.querySelectorAll('input[name="trendBasis"]'));
const RAW_INPUT_STORAGE_KEY = "duprEstimatorRawInput";
const FALLBACK_SAMPLE_URL = "assets/data/ben_johns_data.txt";

let latestParsedMatches = [];
let overallChartInstance = null;
let partnerChartInstance = null;
let lowerChartInstance = null;
let higherChartInstance = null;
let oppHigherChartInstance = null;
let oppLowerChartInstance = null;
let eventChartInstance = null;
let monthViewMode = "monthOnly";
let trendBasisMode = "percent";
let latestMonthSeries = null;

const checkedTrendBasis = trendBasisInputs.find((input) => input.checked);
if (checkedTrendBasis) trendBasisMode = checkedTrendBasis.value === "month" ? "month" : "percent";

if (typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined") {
  Chart.register(ChartDataLabels);
}

function setResultText(text) {
  resultOutput.value = text;
}

function loadRawInputFromStorage() {
  try {
    const saved = localStorage.getItem(RAW_INPUT_STORAGE_KEY) || "";
    if (saved && rawInput && !rawInput.value.trim()) {
      rawInput.value = saved;
    }
    return saved;
  } catch (_) {
    // Ignore storage access errors (e.g. privacy mode restrictions).
    return "";
  }
}

function getStoredRawInput() {
  try {
    return localStorage.getItem(RAW_INPUT_STORAGE_KEY) || "";
  } catch (_) {
    return "";
  }
}

function saveRawInputToStorage() {
  try {
    if (!rawInput) return;
    const value = rawInput.value || "";
    if (!value.trim()) {
      localStorage.removeItem(RAW_INPUT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(RAW_INPUT_STORAGE_KEY, value);
  } catch (_) {
    // Ignore storage access errors.
  }
}

function updateTrendGraphsTitle(userName) {
  if (!trendGraphsTitle) return;
  const cleanedName = String(userName || "").trim();
  trendGraphsTitle.textContent = cleanedName
    ? `DUPR Trend Graphs for ${cleanedName}`
    : "DUPR Trend Graphs";
}

function applyWrappedTrendMode(data, basisMode) {
  if (!data || !data.trendByAxis) return data;
  const key = basisMode === "month" ? "month" : "percent";
  const trend = data.trendByAxis[key] || data.trendByAxis.percent || data.trendByAxis.month || null;
  if (!trend) {
    data.earliestEst = null;
    data.latestEst = null;
    data.trendGroupSize = 0;
    data.trendStartLabel = null;
    data.trendEndLabel = null;
    data.trendFooterLabel = null;
    data.trendGroupPill = null;
    return data;
  }
  data.trendAxisMode = key;
  data.earliestEst = trend.earliestEst;
  data.latestEst = trend.latestEst;
  data.trendGroupSize = trend.trendGroupSize;
  data.trendStartLabel = trend.startLabel;
  data.trendEndLabel = trend.endLabel;
  data.trendFooterLabel = trend.footerLabel;
  data.trendGroupPill = trend.groupPill;
  return data;
}

function toChartPointMonths(arr) {
  return arr.map((v) => (v == null ? null : Number(v.toFixed(3))));
}

function renderMonthChart(canvasId, title, data, modeLabel, color, xLabels, xAxisTitle) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;
  const existingMap = {
    overallChart: overallChartInstance,
    partnerChart: partnerChartInstance,
    lowerChart: lowerChartInstance,
    higherChart: higherChartInstance,
    oppHigherChart: oppHigherChartInstance,
    oppLowerChart: oppLowerChartInstance,
    eventChart: eventChartInstance,
  };
  const existing = existingMap[canvasId];
  if (existing) existing.destroy();

  const plottedData = toChartPointMonths(data);

  const instance = new Chart(canvas, {
    type: "line",
    data: {
      labels: xLabels,
      datasets: [
        {
          label: modeLabel,
          data: plottedData,
          borderColor: color,
          backgroundColor: `${color}33`,
          tension: 0.2,
          spanGaps: true,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      animation: false,
      plugins: {
        legend: { labels: { color: "#dfe8ff" } },
        title: {
          display: true,
          text: title,
          color: "#dfe8ff",
          font: { size: 12 },
        },
        datalabels: {
          color: "#e8f0ff",
          anchor: "end",
          align: "top",
          offset: 4,
          clamp: true,
          formatter: (value) => (value == null ? "" : Number(value).toFixed(3)),
          display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null,
        },
      },
      scales: {
        x: {
          title: { display: true, text: xAxisTitle, color: "#b9c7e8" },
          ticks: { color: "#b9c7e8" },
          grid: { color: "rgba(150,170,210,0.2)" },
        },
        y: {
          title: { display: true, text: "Estimated DUPR", color: "#b9c7e8" },
          ticks: { color: "#b9c7e8" },
          grid: { color: "rgba(150,170,210,0.2)" },
        },
      },
    },
  });

  if (canvasId === "overallChart") overallChartInstance = instance;
  if (canvasId === "partnerChart") partnerChartInstance = instance;
  if (canvasId === "lowerChart") lowerChartInstance = instance;
  if (canvasId === "higherChart") higherChartInstance = instance;
  if (canvasId === "oppHigherChart") oppHigherChartInstance = instance;
  if (canvasId === "oppLowerChart") oppLowerChartInstance = instance;
  if (canvasId === "eventChart") eventChartInstance = instance;
  return instance;
}

function currentModeLabel() {
  if (trendBasisMode === "month") {
    return monthViewMode === "monthOnly" ? "Each Month Bucket" : "Cumulative (last X months)";
  }
  return monthViewMode === "monthOnly" ? "Each 20% Time Bucket (oldest to newest)" : "Cumulative from Oldest (0% to X%)";
}

function updateModeToggleLabels() {
  const cumulativeEl = document.getElementById("modeLabelCumulative");
  const sliceEl = document.getElementById("modeLabelSlice");
  if (!cumulativeEl || !sliceEl) return;
  if (trendBasisMode === "month") {
    cumulativeEl.textContent = "Cumulative (last X months)";
    sliceEl.textContent = "Each month bucket";
  } else {
    cumulativeEl.textContent = "Cumulative from oldest (0% to X%)";
    sliceEl.textContent = "Each 20% time bucket (oldest to newest)";
  }
}

function renderAllMonthCharts() {
  if (!latestMonthSeries) return;
  const useMonthOnly = monthViewMode === "monthOnly";
  const modeLabel = currentModeLabel();
  const axisSeries = trendBasisMode === "month" ? latestMonthSeries.month : latestMonthSeries.percent;
  if (!axisSeries) return;

  const xLabels = trendBasisMode === "month"
    ? (useMonthOnly ? ["6", "5", "4", "3", "2", "1"] : ["6", "5", "4", "3", "2", "1"])
    : (useMonthOnly
      ? ["Oldest 0-20%", "20-40%", "40-60%", "60-80%", "Newest 80-100%"]
      : ["0-20% (oldest to X%)", "0-40%", "0-60%", "0-80%", "0-100% (all games)"]);
  const xAxisTitle = trendBasisMode === "month" ? "Months Ago" : "Game Timeline % Range";
  const basisTitle = trendBasisMode === "month" ? "month window" : "game timeline percentage";

  renderMonthChart(
    "overallChart",
    `Overall DUPR by ${basisTitle} (${modeLabel})`,
    useMonthOnly ? axisSeries.overall.monthOnly : axisSeries.overall.cumulative,
    modeLabel,
    "#5da8ff",
    xLabels,
    xAxisTitle
  );
  renderMonthChart(
    "partnerChart",
    `Partners within 0.2 DUPR of you (${basisTitle}, ${modeLabel})`,
    useMonthOnly ? axisSeries.partner.monthOnly : axisSeries.partner.cumulative,
    modeLabel,
    "#6fcf97",
    xLabels,
    xAxisTitle
  );
  renderMonthChart(
    "lowerChart",
    `Lower-teammate DUPR by ${basisTitle} (${modeLabel})`,
    useMonthOnly ? axisSeries.lower.monthOnly : axisSeries.lower.cumulative,
    modeLabel,
    "#f2b84b",
    xLabels,
    xAxisTitle
  );
  renderMonthChart(
    "higherChart",
    `Higher-teammate DUPR by ${basisTitle} (${modeLabel})`,
    useMonthOnly ? axisSeries.higher.monthOnly : axisSeries.higher.cumulative,
    modeLabel,
    "#d07cff",
    xLabels,
    xAxisTitle
  );
  renderMonthChart(
    "oppHigherChart",
    `Against higher-rated opponent teams (${basisTitle}, ${modeLabel})`,
    useMonthOnly ? axisSeries.oppHigher.monthOnly : axisSeries.oppHigher.cumulative,
    modeLabel,
    "#ff8fab",
    xLabels,
    xAxisTitle
  );
  renderMonthChart(
    "oppLowerChart",
    `Against lower-rated opponent teams (${basisTitle}, ${modeLabel})`,
    useMonthOnly ? axisSeries.oppLower.monthOnly : axisSeries.oppLower.cumulative,
    modeLabel,
    "#5eead4",
    xLabels,
    xAxisTitle
  );
}

function smoothSeries(values, windowSize) {
  const n = values.length;
  if (!n) return [];
  const w = Math.max(1, Math.min(windowSize, n));
  const half = Math.floor(w / 2);
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - half);
    const end = Math.min(n - 1, i + half);
    for (let j = start; j <= end; j += 1) {
      const v = values[j];
      if (Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    out[i] = count ? sum / count : null;
  }
  return out;
}

function renderEventChart(labels, values) {
  const canvas = document.getElementById("eventChart");
  if (!canvas || typeof Chart === "undefined") return null;
  if (eventChartInstance) eventChartInstance.destroy();

  const numericValues = values.filter((v) => Number.isFinite(v));
  let yMin;
  let yMax;
  if (numericValues.length) {
    const rawMin = Math.min(...numericValues);
    const rawMax = Math.max(...numericValues);
    const spread = Math.max(rawMax - rawMin, 0.02);
    const pad = spread * 0.15;
    yMin = Math.max(1.0, rawMin - pad);
    yMax = Math.min(7.0, rawMax + pad);
  }

  const trendWindow = numericValues.length >= 10 ? 5 : 3;
  const smoothedValues = smoothSeries(values, trendWindow);

  eventChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Trend curve",
          data: smoothedValues.map((v) => (v == null ? null : Number(v.toFixed(3)))),
          showLine: true,
          spanGaps: true,
          borderColor: "#93c5fd",
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
        {
          label: "Event points",
          data: values.map((v) => (v == null ? null : Number(v.toFixed(3)))),
          showLine: false,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: "#6aaaff",
          pointBorderColor: "#d7e7ff",
          pointBorderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      animation: false,
      plugins: {
        legend: { labels: { color: "#dfe8ff" } },
        datalabels: {
          color: "#e8f0ff",
          anchor: "end",
          align: "top",
          offset: 4,
          clamp: true,
          formatter: (value) => (value == null ? "" : Number(value).toFixed(3)),
          display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null,
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#b9c7e8",
            maxRotation: 45,
            minRotation: 15,
            autoSkip: false,
          },
          grid: { color: "rgba(150,170,210,0.2)" },
        },
        y: {
          title: { display: true, text: "Estimated DUPR", color: "#b9c7e8" },
          beginAtZero: false,
          min: yMin,
          max: yMax,
          ticks: { color: "#b9c7e8" },
          grid: { color: "rgba(150,170,210,0.2)" },
        },
      },
    },
  });
  return eventChartInstance;
}

function isFloatLine(s) {
  return /^[0-9]+\.[0-9]+$/.test(String(s).trim());
}

function isIntScoreLine(s) {
  return /^\d{1,2}$/.test(String(s).trim());
}

function toDateAtMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthNameToIndex(raw) {
  const m = String(raw).toLowerCase();
  const map = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };
  return Object.prototype.hasOwnProperty.call(map, m) ? map[m] : null;
}

function parseDateToken(token) {
  const t = String(token).trim().replace(/\./g, "");

  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const month = Number(m[1]) - 1;
    const day = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d;
    }
  }

  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(year, month, day);
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d;
    }
  }

  m = t.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = monthNameToIndex(m[2]);
    const year = Number(m[3]);
    if (month !== null) {
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
  }

  m = t.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = monthNameToIndex(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month !== null) {
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
  }

  m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = monthNameToIndex(m[2]);
    const year = Number(m[3]);
    if (month !== null) {
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
  }

  return null;
}

function extractMatchDate(lines) {
  const today = toDateAtMidnight(new Date());
  for (const line of lines) {
    const low = line.toLowerCase();
    if (low.includes("yesterday")) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return d;
    }
    if (low.includes("today")) return today;
    const ago = low.match(/(\d+)\s+day[s]?\s+ago/);
    if (ago) {
      const d = new Date(today);
      d.setDate(d.getDate() - Number(ago[1]));
      return d;
    }
  }

  const joined = lines.join(" ");
  const patterns = [
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    /\b\d{4}-\d{1,2}-\d{1,2}\b/gi,
    /\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)-\d{4}\b/gi,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
  ];

  for (const pat of patterns) {
    const tokens = joined.match(pat) || [];
    for (const token of tokens) {
      const normalized = token.replace(/\bSept\b/gi, "Sep");
      const parsed = parseDateToken(normalized);
      if (parsed) return toDateAtMidnight(parsed);
    }
  }
  return null;
}

function looksLikeDateLine(text) {
  const t = String(text).trim();
  if (!t) return false;
  const low = t.toLowerCase();
  if (low.includes("yesterday") || low.includes("today") || low.includes("ago")) return true;
  const pats = [
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i,
    /\b\d{4}-\d{1,2}-\d{1,2}\b/i,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/i,
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?\b/i,
  ];
  return pats.some((p) => p.test(t));
}

function extractEventName(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (!looksLikeDateLine(lines[i])) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = String(lines[j]).trim();
      if (!prev) continue;
      if (!isIntScoreLine(prev) && !isFloatLine(prev)) return prev;
      break;
    }
  }
  return "";
}

function splitIntoMatchBlocks(rawText) {
  const blocks = [];
  let buf = [];
  for (const line of rawText.split(/\r?\n/)) {
    buf.push(line);
    if (/\bID:\s*[A-Z0-9]+\b/.test(line)) {
      const block = buf.join("\n").trim();
      if (block) blocks.push(block);
      buf = [];
    }
  }
  return blocks;
}

function extractMatchFromBlock(block) {
  const lines = block
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter((ln) => ln !== "");

  let matchId = "";
  for (const ln of lines) {
    const m = ln.match(/\bID:\s*([A-Z0-9]+)\b/);
    if (m) {
      matchId = m[1];
      break;
    }
  }

  const matchDate = extractMatchDate(lines);
  const eventName = extractEventName(lines);
  const players = [];
  const scoreEntries = [];

  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (isIntScoreLine(ln)) {
      scoreEntries.push({ lineIdx: i, value: Number(ln) });
      i += 1;
      continue;
    }
    if (i + 1 < lines.length && isFloatLine(lines[i + 1])) {
      players.push({ name: ln, rating: Number(lines[i + 1]), lineIdx: i });
      i += 2;
      continue;
    }
    i += 1;
  }

  if (players.length < 4 || scoreEntries.length < 2) return null;
  const p4 = players.slice(0, 4);
  const teamAEndLine = p4[1].lineIdx;
  const teamBStartLine = p4[2].lineIdx;
  const teamBEndLine = p4[3].lineIdx;

  // Supports both "single score per team" and "multiple set scores per team" layouts.
  let teamAScores = scoreEntries
    .filter((s) => s.lineIdx > teamAEndLine && s.lineIdx < teamBStartLine)
    .map((s) => s.value);
  let teamBScores = scoreEntries
    .filter((s) => s.lineIdx > teamBEndLine)
    .map((s) => s.value);

  // Fallback for formats where score lines are not clearly separated by player blocks.
  if (!teamAScores.length || !teamBScores.length) {
    const raw = scoreEntries.map((s) => s.value);
    if (raw.length >= 2) {
      const mid = Math.floor(raw.length / 2);
      teamAScores = raw.slice(0, mid);
      teamBScores = raw.slice(mid);
    }
  }
  if (!teamAScores.length || !teamBScores.length) return null;

  const scoreA = teamAScores.reduce((sum, v) => sum + v, 0);
  const scoreB = teamBScores.reduce((sum, v) => sum + v, 0);
  return {
    id: matchId,
    match_date: matchDate,
    event_name: eventName,
    team_a_p1_name: p4[0].name,
    team_a_p1_rating: p4[0].rating,
    team_a_p2_name: p4[1].name,
    team_a_p2_rating: p4[1].rating,
    team_b_p1_name: p4[2].name,
    team_b_p1_rating: p4[2].rating,
    team_b_p2_name: p4[3].name,
    team_b_p2_rating: p4[3].rating,
    score_a: scoreA,
    score_b: scoreB,
  };
}

function buildObservations(matches, userName) {
  const obs = [];
  const userLower = userName.trim().toLowerCase();
  for (const m of matches) {
    const names = [
      m.team_a_p1_name,
      m.team_a_p2_name,
      m.team_b_p1_name,
      m.team_b_p2_name,
    ];
    const namesLower = names.map((x) => String(x).trim().toLowerCase());
    const idx = namesLower.indexOf(userLower);
    if (idx === -1) continue;

    const sa = m.score_a;
    const sb = m.score_b;
    const npts = sa + sb;
    if (npts <= 0) continue;

    let partnerRating;
    let oppTeamRating;
    let youPoints;
    let partnerName;
    let opp1Name;
    let opp2Name;
    if (idx === 0 || idx === 1) {
      partnerName = idx === 0 ? m.team_a_p2_name : m.team_a_p1_name;
      partnerRating = idx === 0 ? m.team_a_p2_rating : m.team_a_p1_rating;
      oppTeamRating = (m.team_b_p1_rating + m.team_b_p2_rating) / 2.0;
      youPoints = sa;
      opp1Name = m.team_b_p1_name;
      opp2Name = m.team_b_p2_name;
    } else {
      partnerName = idx === 2 ? m.team_b_p2_name : m.team_b_p1_name;
      partnerRating = idx === 2 ? m.team_b_p2_rating : m.team_b_p1_rating;
      oppTeamRating = (m.team_a_p1_rating + m.team_a_p2_rating) / 2.0;
      youPoints = sb;
      opp1Name = m.team_a_p1_name;
      opp2Name = m.team_a_p2_name;
    }

    obs.push({
      partner_rating: Number(partnerRating),
      opp_team_rating: Number(oppTeamRating),
      you_points: Number(youPoints),
      total_points: Number(npts),
      match_id: m.id,
      match_date: m.match_date ? toDateAtMidnight(m.match_date) : null,
      event_name: m.event_name || "",
      partner_name: String(partnerName || "").trim(),
      opp1_name: String(opp1Name || "").trim(),
      opp2_name: String(opp2Name || "").trim(),
      won: youPoints > npts - youPoints,
    });
  }
  return obs;
}

function expectedShare(teamYou, teamOpp, d) {
  return 1.0 / (1.0 + 10.0 ** (-(teamYou - teamOpp) / d));
}

function negLogLikelihood(x, observations, d) {
  let total = 0;
  for (const ob of observations) {
    const teamYou = (x + ob.partner_rating) / 2.0;
    const pRaw = expectedShare(teamYou, ob.opp_team_rating, d);
    const p = Math.min(Math.max(pRaw, 1e-9), 1 - 1e-9);
    total -= ob.you_points * Math.log(p) + (ob.total_points - ob.you_points) * Math.log(1 - p);
  }
  return total;
}

function fitRating(observations, d, bounds = [1.0, 7.0]) {
  if (!observations || observations.length === 0) return null;
  const [lo, hi] = bounds;

  let bestX = lo;
  let bestV = Number.POSITIVE_INFINITY;
  const n1 = 1201;
  for (let i = 0; i < n1; i += 1) {
    const x = lo + (i * (hi - lo)) / (n1 - 1);
    const v = negLogLikelihood(x, observations, d);
    if (v < bestV) {
      bestV = v;
      bestX = x;
    }
  }

  const lo2 = Math.max(lo, bestX - 0.25);
  const hi2 = Math.min(hi, bestX + 0.25);
  const n2 = 2001;
  for (let i = 0; i < n2; i += 1) {
    const x = lo2 + (i * (hi2 - lo2)) / (n2 - 1);
    const v = negLogLikelihood(x, observations, d);
    if (v < bestV) {
      bestV = v;
      bestX = x;
    }
  }
  return bestX;
}

function filterByPartnerGap(observations, referenceRating, maxGap) {
  return observations.filter((ob) => Math.abs(ob.partner_rating - referenceRating) <= maxGap);
}

function estimateWithPartnerGap(observations, d, maxGap) {
  const baseline = fitRating(observations, d);
  if (baseline == null) return [null, 0];
  const filtered = filterByPartnerGap(observations, baseline, maxGap);
  return [fitRating(filtered, d), filtered.length];
}

function filterByPartnerRelation(observations, referenceRating, relation) {
  if (relation === "lower") return observations.filter((ob) => ob.partner_rating < referenceRating);
  if (relation === "higher") return observations.filter((ob) => ob.partner_rating > referenceRating);
  return [];
}

function estimateWithPartnerRelation(observations, d, relation) {
  const baseline = fitRating(observations, d);
  if (baseline == null) return [null, 0];
  const filtered = filterByPartnerRelation(observations, baseline, relation);
  return [fitRating(filtered, d), filtered.length];
}

function filterByOpponentRelation(observations, referenceRating, relation) {
  if (relation === "higher") return observations.filter((ob) => ob.opp_team_rating > referenceRating);
  if (relation === "lower") return observations.filter((ob) => ob.opp_team_rating < referenceRating);
  return [];
}

function estimateWithOpponentRelation(observations, d, relation) {
  const baseline = fitRating(observations, d);
  if (baseline == null) return [null, 0];
  const filtered = filterByOpponentRelation(observations, baseline, relation);
  return [fitRating(filtered, d), filtered.length];
}

function detectMostFrequentPlayerName(matches) {
  const counts = new Map();
  const firstSeen = new Map();
  let idx = 0;
  for (const m of matches) {
    const keys = ["team_a_p1_name", "team_a_p2_name", "team_b_p1_name", "team_b_p2_name"];
    for (const key of keys) {
      const name = String(m[key] || "").trim();
      if (!name) continue;
      if (!counts.has(name)) {
        counts.set(name, 0);
        firstSeen.set(name, idx);
      }
      counts.set(name, counts.get(name) + 1);
      idx += 1;
    }
  }
  if (counts.size === 0) return null;
  let bestName = null;
  let bestCount = -1;
  let bestFirst = Number.POSITIVE_INFINITY;
  for (const [name, count] of counts.entries()) {
    const first = firstSeen.get(name);
    if (count > bestCount || (count === bestCount && first < bestFirst)) {
      bestName = name;
      bestCount = count;
      bestFirst = first;
    }
  }
  return bestName;
}

function subtractMonths(baseDate, months) {
  let year = baseDate.getFullYear();
  let month = baseDate.getMonth() + 1 - months;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  const day = baseDate.getDate();
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay));
}

function trendWord(lhs, rhs) {
  if (lhs == null || rhs == null) return "about the same";
  if (lhs > rhs + 1e-6) return "better";
  if (lhs < rhs - 1e-6) return "worse";
  return "about the same";
}

function toIsoDateOrEmpty(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(matches) {
  const headers = [
    "match_id",
    "match_date",
    "event_name",
    "team_a_p1_name",
    "team_a_p1_rating",
    "team_a_p2_name",
    "team_a_p2_rating",
    "team_b_p1_name",
    "team_b_p1_rating",
    "team_b_p2_name",
    "team_b_p2_rating",
    "score_a",
    "score_b",
  ];
  const rows = [headers.join(",")];
  for (const m of matches) {
    const row = [
      m.id || "",
      toIsoDateOrEmpty(m.match_date),
      m.event_name || "",
      m.team_a_p1_name,
      m.team_a_p1_rating,
      m.team_a_p2_name,
      m.team_a_p2_rating,
      m.team_b_p1_name,
      m.team_b_p1_rating,
      m.team_b_p2_name,
      m.team_b_p2_rating,
      m.score_a,
      m.score_b,
    ].map(csvEscape);
    rows.push(row.join(","));
  }
  return rows.join("\n");
}

function runEstimation(rawOverride = null) {
  let userName = nameInput.value.trim();
  const dText = dInput.value.trim();
  const yText = yInput.value.trim();
  const raw = (typeof rawOverride === "string" ? rawOverride : rawInput.value).trim();

  const d = dText ? Number(dText) : D_SCALE_DEFAULT;
  if (!Number.isFinite(d)) {
    setResultText("Invalid d scale. d scale must be a number.");
    return;
  }

  const partnerGap = yText ? Number(yText) : 0.2;
  if (!Number.isFinite(partnerGap) || partnerGap < 0) {
    setResultText("Invalid partner gap. Partner gap Y must be a non-negative number.");
    return;
  }

  if (!raw) {
    setResultText("Missing text. Please paste your DUPR dashboard text.");
    return;
  }

  const blocks = splitIntoMatchBlocks(raw);
  const parsed = [];
  let skipped = 0;
  for (const b of blocks) {
    const m = extractMatchFromBlock(b);
    if (!m) {
      skipped += 1;
      continue;
    }
    parsed.push(m);
  }
  latestParsedMatches = parsed;
  downloadCsvBtn.disabled = parsed.length === 0;

  if (!parsed.length) {
    setResultText("Could not parse any matches from your pasted text.");
    return;
  }

  let autoDetectedName = false;
  if (!userName) {
    const detected = detectMostFrequentPlayerName(parsed);
    if (!detected) {
      setResultText("Could not detect player name. Please enter your DUPR name manually.");
      return;
    }
    userName = detected;
    nameInput.value = detected;
    autoDetectedName = true;
  }

  const observations = buildObservations(parsed, userName);
  if (!observations.length) {
    setResultText("No parsed matches contained your name. Check spelling exactly as in DUPR.");
    return;
  }

  const est = fitRating(observations, d);
  if (est == null) {
    setResultText("Could not estimate your rating.");
    return;
  }

  const today = toDateAtMidnight(new Date());
  const datedObsCount = observations.filter((ob) => ob.match_date != null).length;
  // Trend: first 20% vs last 20% of dated matches sorted chronologically
  const datedObsSorted = observations
    .filter((ob) => ob.match_date != null)
    .sort((a, b) => a.match_date - b.match_date);

  let earliestEst = null;
  let latestEst = null;
  let trendGroupSize = 0;
  if (datedObsSorted.length >= 5) {
    trendGroupSize = Math.max(1, Math.floor(datedObsSorted.length * 0.2));
    const firstGroup = datedObsSorted.slice(0, trendGroupSize);
    const lastGroup = datedObsSorted.slice(datedObsSorted.length - trendGroupSize);
    earliestEst = fitRating(firstGroup, d);
    latestEst = fitRating(lastGroup, d);
  }

  const [estPartnerAll, cntPartnerAll] = estimateWithPartnerGap(observations, d, partnerGap);
  const [estLowerAll, cntLowerAll] = estimateWithPartnerRelation(observations, d, "lower");
  const [estHigherAll, cntHigherAll] = estimateWithPartnerRelation(observations, d, "higher");

  const lowerVsHigherWord = trendWord(estLowerAll, estHigherAll);
  const closeVsAllWord = trendWord(estPartnerAll, est);

  const duprChangeLine =
    earliestEst == null || latestEst == null
      ? `Not enough dated matches to compute DUPR trend (need at least 5).`
      : `You have changed your DUPR from ${earliestEst.toFixed(3)} to ${latestEst.toFixed(3)} (first 20% vs last 20% of your ${datedObsSorted.length} dated matches, ${trendGroupSize} matches per group).`;

  const twoMonthCutoff = subtractMonths(today, 2);
  const observationsLast2m = observations.filter(
    (ob) => ob.match_date && ob.match_date >= twoMonthCutoff
  );
  const eventNamesLast2m = [];
  const seen2m = new Set();
  for (const ob of observationsLast2m) {
    const eventName = String(ob.event_name || "").trim();
    if (!eventName || seen2m.has(eventName)) continue;
    seen2m.add(eventName);
    eventNamesLast2m.push(eventName);
  }
  const eventEstimatesLast2m = [];
  for (const eventName of eventNamesLast2m) {
    const eventObs = observationsLast2m.filter((ob) => String(ob.event_name || "").trim() === eventName);
    const eventEst = eventObs.length ? fitRating(eventObs, d) : null;
    if (eventEst != null) eventEstimatesLast2m.push(eventEst);
  }
  const last2mEventRangeLine = eventEstimatesLast2m.length
    ? `You play with a DUPR rating of between ${Math.min(...eventEstimatesLast2m).toFixed(3)} and ${Math.max(...eventEstimatesLast2m).toFixed(3)} for the last 2 months.`
    : "You play with a DUPR rating of between not enough data and not enough data for the last 2 months.";

  const outputLines = [
    `Using DUPR name: ${userName}${autoDetectedName ? " (auto-detected)" : ""}`,
    "",
    duprChangeLine,
    `You play ${lowerVsHigherWord} when playing with teammates lower than you than with teammates higher than you.`,
    `You play ${closeVsAllWord} when playing with teammates close to your rating.`,
    last2mEventRangeLine,
    "",
    `DUPR estimates for '${userName}':`,
    `All parsed matches: ${est.toFixed(3)} (matches used: ${observations.length})`,
    "",
  ];

  const percentOverallCumulative = [];
  const percentOverallBucket = [];
  const percentPartnerCumulative = [];
  const percentPartnerBucket = [];
  const percentLowerCumulative = [];
  const percentLowerBucket = [];
  const percentHigherCumulative = [];
  const percentHigherBucket = [];
  const percentOppHigherCumulative = [];
  const percentOppHigherBucket = [];
  const percentOppLowerCumulative = [];
  const percentOppLowerBucket = [];

  const monthOverallCumulative = [];
  const monthOverallBucket = [];
  const monthPartnerCumulative = [];
  const monthPartnerBucket = [];
  const monthLowerCumulative = [];
  const monthLowerBucket = [];
  const monthHigherCumulative = [];
  const monthHigherBucket = [];
  const monthOppHigherCumulative = [];
  const monthOppHigherBucket = [];
  const monthOppLowerCumulative = [];
  const monthOppLowerBucket = [];

  const percentileSource = datedObsSorted.length ? datedObsSorted : observations;
  const percentBucketCount = 5;
  const percentBuckets = [];
  const percentCumulative = [];
  for (let i = 0; i < percentBucketCount; i += 1) {
    const start = Math.floor((i * percentileSource.length) / percentBucketCount);
    const end = Math.floor(((i + 1) * percentileSource.length) / percentBucketCount);
    percentBuckets.push(percentileSource.slice(start, end));
    percentCumulative.push(percentileSource.slice(0, end));
  }

  const datedForMonth = observations.filter((ob) => ob.match_date != null);
  const monthCumulative = [];
  const monthBuckets = [];
  for (let months = 6; months >= 1; months -= 1) {
    const cutoff = subtractMonths(today, months);
    monthCumulative.push(datedForMonth.filter((ob) => ob.match_date && ob.match_date >= cutoff));
  }
  for (let months = 6; months >= 1; months -= 1) {
    const windowStart = subtractMonths(today, months);
    const windowEnd = months === 1 ? today : subtractMonths(today, months - 1);
    monthBuckets.push(
      datedForMonth.filter((ob) => ob.match_date && ob.match_date >= windowStart && ob.match_date < windowEnd)
    );
  }

  for (const scoped of percentCumulative) {
    percentOverallCumulative.push(scoped.length ? fitRating(scoped, d) : null);
    const [estPartnerScoped] = estimateWithPartnerGap(scoped, d, partnerGap);
    const [estLowerScoped] = estimateWithPartnerRelation(scoped, d, "lower");
    const [estHigherScoped] = estimateWithPartnerRelation(scoped, d, "higher");
    const [estOppHigherScoped] = estimateWithOpponentRelation(scoped, d, "higher");
    const [estOppLowerScoped] = estimateWithOpponentRelation(scoped, d, "lower");
    percentPartnerCumulative.push(estPartnerScoped);
    percentLowerCumulative.push(estLowerScoped);
    percentHigherCumulative.push(estHigherScoped);
    percentOppHigherCumulative.push(estOppHigherScoped);
    percentOppLowerCumulative.push(estOppLowerScoped);
  }

  for (const scoped of percentBuckets) {
    percentOverallBucket.push(scoped.length ? fitRating(scoped, d) : null);
    const [estPartnerExact] = estimateWithPartnerGap(scoped, d, partnerGap);
    const [estLowerExact] = estimateWithPartnerRelation(scoped, d, "lower");
    const [estHigherExact] = estimateWithPartnerRelation(scoped, d, "higher");
    const [estOppHigherExact] = estimateWithOpponentRelation(scoped, d, "higher");
    const [estOppLowerExact] = estimateWithOpponentRelation(scoped, d, "lower");
    percentPartnerBucket.push(estPartnerExact);
    percentLowerBucket.push(estLowerExact);
    percentHigherBucket.push(estHigherExact);
    percentOppHigherBucket.push(estOppHigherExact);
    percentOppLowerBucket.push(estOppLowerExact);
  }

  for (const scoped of monthCumulative) {
    monthOverallCumulative.push(scoped.length ? fitRating(scoped, d) : null);
    const [estPartnerScoped] = estimateWithPartnerGap(scoped, d, partnerGap);
    const [estLowerScoped] = estimateWithPartnerRelation(scoped, d, "lower");
    const [estHigherScoped] = estimateWithPartnerRelation(scoped, d, "higher");
    const [estOppHigherScoped] = estimateWithOpponentRelation(scoped, d, "higher");
    const [estOppLowerScoped] = estimateWithOpponentRelation(scoped, d, "lower");
    monthPartnerCumulative.push(estPartnerScoped);
    monthLowerCumulative.push(estLowerScoped);
    monthHigherCumulative.push(estHigherScoped);
    monthOppHigherCumulative.push(estOppHigherScoped);
    monthOppLowerCumulative.push(estOppLowerScoped);
  }

  for (const scoped of monthBuckets) {
    monthOverallBucket.push(scoped.length ? fitRating(scoped, d) : null);
    const [estPartnerExact] = estimateWithPartnerGap(scoped, d, partnerGap);
    const [estLowerExact] = estimateWithPartnerRelation(scoped, d, "lower");
    const [estHigherExact] = estimateWithPartnerRelation(scoped, d, "higher");
    const [estOppHigherExact] = estimateWithOpponentRelation(scoped, d, "higher");
    const [estOppLowerExact] = estimateWithOpponentRelation(scoped, d, "lower");
    monthPartnerBucket.push(estPartnerExact);
    monthLowerBucket.push(estLowerExact);
    monthHigherBucket.push(estHigherExact);
    monthOppHigherBucket.push(estOppHigherExact);
    monthOppLowerBucket.push(estOppLowerExact);
  }

  outputLines.push(
    `Partner-close estimates (only matches with |partner - you| <= ${partnerGap}):`
  );
  outputLines.push(
    estPartnerAll == null
      ? "All parsed matches with partner filter: not enough matches"
      : `All parsed matches with partner filter: ${estPartnerAll.toFixed(3)} (matches used: ${cntPartnerAll})`
  );
  outputLines.push(
    "",
    "Teammate-lower-only estimates (only matches where partner DUPR is lower than you):"
  );
  outputLines.push(
    estLowerAll == null
      ? "All parsed matches with lower-partner filter: not enough matches"
      : `All parsed matches with lower-partner filter: ${estLowerAll.toFixed(3)} (matches used: ${cntLowerAll})`
  );
  outputLines.push(
    "",
    "Teammate-higher-only estimates (only matches where partner DUPR is higher than you):"
  );
  outputLines.push(
    estHigherAll == null
      ? "All parsed matches with higher-partner filter: not enough matches"
      : `All parsed matches with higher-partner filter: ${estHigherAll.toFixed(3)} (matches used: ${cntHigherAll})`
  );
  outputLines.push("", "DUPR estimates by event name:");
  const eventLabels = [];
  const eventValues = [];
  const eventStats = new Map();
  observations.forEach((ob, idx) => {
    const eventName = String(ob.event_name || "").trim();
    if (!eventName) return;
    if (!eventStats.has(eventName)) {
      eventStats.set(eventName, { firstIndex: idx, latestDate: null });
    }
    if (ob.match_date && (!eventStats.get(eventName).latestDate || ob.match_date > eventStats.get(eventName).latestDate)) {
      eventStats.get(eventName).latestDate = ob.match_date;
    }
  });

  const eventNames = [...eventStats.entries()]
    .sort((a, b) => {
      const aDate = a[1].latestDate;
      const bDate = b[1].latestDate;
      if (aDate && bDate) return aDate - bDate; // older -> newer (newest furthest right)
      if (aDate && !bDate) return 1;
      if (!aDate && bDate) return -1;
      return b[1].firstIndex - a[1].firstIndex; // fallback: earlier in feed is newer
    })
    .map(([name]) => name);

  if (!eventNames.length) {
    outputLines.push("No event names detected in parsed matches.");
    renderEventChart([], []);
  } else {
    for (const eventName of eventNames) {
      const eventObs = observations.filter((ob) => String(ob.event_name || "").trim() === eventName);
      const eventEst = eventObs.length ? fitRating(eventObs, d) : null;
      if (eventEst != null) {
        outputLines.push(`${eventName}: ${eventEst.toFixed(3)} (matches used: ${eventObs.length})`);
        eventLabels.push(eventName);
        eventValues.push(eventEst);
      }
    }
    renderEventChart(eventLabels, eventValues);
  }

  // Top 5 teammates by wins
  const teammateCounts = new Map();
  for (const ob of observations) {
    const name = ob.partner_name;
    if (!name) continue;
    if (!teammateCounts.has(name)) teammateCounts.set(name, { wins: 0, total: 0 });
    const rec = teammateCounts.get(name);
    rec.total += 1;
    if (ob.won) rec.wins += 1;
  }
  const qualifiedTeammates = [...teammateCounts.entries()].filter(([, rec]) => rec.total > 5);

  const top5Teammates = [...qualifiedTeammates]
    .sort((a, b) => {
      const pctA = a[1].wins / a[1].total;
      const pctB = b[1].wins / b[1].total;
      return pctB - pctA || b[1].total - a[1].total;
    })
    .slice(0, 5);

  const worst5Teammates = [...qualifiedTeammates]
    .sort((a, b) => {
      const pctA = a[1].wins / a[1].total;
      const pctB = b[1].wins / b[1].total;
      return pctA - pctB || b[1].total - a[1].total;
    })
    .slice(0, 5);

  // Opponent win/loss counts
  const opponentCounts = new Map();
  for (const ob of observations) {
    for (const name of [ob.opp1_name, ob.opp2_name]) {
      if (!name) continue;
      if (!opponentCounts.has(name)) opponentCounts.set(name, { losses: 0, total: 0 });
      const rec = opponentCounts.get(name);
      rec.total += 1;
      if (!ob.won) rec.losses += 1;
    }
  }
  const qualifiedOpponents = [...opponentCounts.entries()].filter(([, rec]) => rec.total > 5);

  const top5HardestOpponents = [...qualifiedOpponents]
    .sort((a, b) => {
      const pctA = a[1].losses / a[1].total;
      const pctB = b[1].losses / b[1].total;
      return pctB - pctA || b[1].total - a[1].total;
    })
    .slice(0, 5);

  const top5EasiestOpponents = [...qualifiedOpponents]
    .sort((a, b) => {
      const pctA = a[1].losses / a[1].total;
      const pctB = b[1].losses / b[1].total;
      return pctA - pctB || b[1].total - a[1].total;
    })
    .slice(0, 5);

  const noTeammateMsg = "  No teammates with more than 5 matches together.";
  const noOpponentMsg = "  No opponents with more than 5 matches against.";

  outputLines.push("", "Best 5 teammates (highest win %, min 5 matches together):");
  if (top5Teammates.length === 0) {
    outputLines.push(noTeammateMsg);
  } else {
    top5Teammates.forEach(([name, rec], i) => {
      const pct = ((rec.wins / rec.total) * 100).toFixed(1);
      outputLines.push(`  ${i + 1}. ${name} — ${pct}% win rate (${rec.wins}W / ${rec.total - rec.wins}L, ${rec.total} matches)`);
    });
  }

  outputLines.push("", "Worst 5 teammates (lowest win %, min 5 matches together):");
  if (worst5Teammates.length === 0) {
    outputLines.push(noTeammateMsg);
  } else {
    worst5Teammates.forEach(([name, rec], i) => {
      const pct = ((rec.wins / rec.total) * 100).toFixed(1);
      outputLines.push(`  ${i + 1}. ${name} — ${pct}% win rate (${rec.wins}W / ${rec.total - rec.wins}L, ${rec.total} matches)`);
    });
  }

  outputLines.push("", "Hardest 5 opponents (highest loss %, min 5 matches against):");
  if (top5HardestOpponents.length === 0) {
    outputLines.push(noOpponentMsg);
  } else {
    top5HardestOpponents.forEach(([name, rec], i) => {
      const pct = ((rec.losses / rec.total) * 100).toFixed(1);
      outputLines.push(`  ${i + 1}. ${name} — ${pct}% loss rate (${rec.total - rec.losses}W / ${rec.losses}L, ${rec.total} matches)`);
    });
  }

  outputLines.push("", "Easiest 5 opponents (lowest loss %, min 5 matches against):");
  if (top5EasiestOpponents.length === 0) {
    outputLines.push(noOpponentMsg);
  } else {
    top5EasiestOpponents.forEach(([name, rec], i) => {
      const pct = ((rec.losses / rec.total) * 100).toFixed(1);
      outputLines.push(`  ${i + 1}. ${name} — ${pct}% loss rate (${rec.total - rec.losses}W / ${rec.losses}L, ${rec.total} matches)`);
    });
  }

  outputLines.push("", `Matches parsed: ${parsed.length} (skipped blocks: ${skipped})`);
  outputLines.push(`Matches with date detected: ${datedObsCount}`);

  // Store data for Wrapped feature
  const eventBest = eventLabels.length
    ? eventLabels.reduce((best, name, i) => (eventValues[i] > (best ? eventValues[eventLabels.indexOf(best)] : -Infinity) ? name : best), null)
    : null;
  const earliestMatchDate =
    datedObsSorted.length > 0 && datedObsSorted[0].match_date
      ? datedObsSorted[0].match_date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
  const monthStartEst = monthOverallBucket.find((v) => v != null) ?? null;
  const monthEndEst = [...monthOverallBucket].reverse().find((v) => v != null) ?? null;
  const monthTrend = monthStartEst == null || monthEndEst == null
    ? null
    : {
        earliestEst: monthStartEst,
        latestEst: monthEndEst,
        trendGroupSize: null,
        startLabel: "Then (6 months ago)",
        endLabel: "Now (this month)",
        footerLabel: "this month vs 6 months ago",
        groupPill: "monthly buckets",
      };
  const percentTrend = earliestEst == null || latestEst == null
    ? null
    : {
        earliestEst,
        latestEst,
        trendGroupSize,
        startLabel: "Then (0-20% of games)",
        endLabel: "Now (80-100% of games)",
        footerLabel: "80-100% vs 0-20% game buckets",
        groupPill: `${trendGroupSize} matches per group`,
      };

  window.latestWrappedData = {
    userName,
    overallRating: est,
    matchCount: observations.length,
    earliestMatchDate,
    earliestEst,
    latestEst,
    trendGroupSize,
    totalDatedMatches: datedObsSorted.length,
    bestEventName: eventBest,
    bestEventRating: eventBest != null ? eventValues[eventLabels.indexOf(eventBest)] : null,
    bestTeammate: top5Teammates.length > 0 ? {
      name: top5Teammates[0][0],
      winPct: (top5Teammates[0][1].wins / top5Teammates[0][1].total) * 100,
      matches: top5Teammates[0][1].total,
    } : null,
    hardestOpponent: top5HardestOpponents.length > 0 ? {
      name: top5HardestOpponents[0][0],
      lossPct: (top5HardestOpponents[0][1].losses / top5HardestOpponents[0][1].total) * 100,
      matches: top5HardestOpponents[0][1].total,
    } : null,
    easiestOpponent: top5EasiestOpponents.length > 0 ? {
      name: top5EasiestOpponents[0][0],
      lossPct: (top5EasiestOpponents[0][1].losses / top5EasiestOpponents[0][1].total) * 100,
      matches: top5EasiestOpponents[0][1].total,
    } : null,
    lowerVsHigherWord,
    closeVsAllWord,
    trendByAxis: {
      month: monthTrend,
      percent: percentTrend,
    },
  };
  applyWrappedTrendMode(window.latestWrappedData, trendBasisMode);
  document.getElementById("wrappedBtn").disabled = false;
  if (wrappedViewBtn) wrappedViewBtn.disabled = false;
  if (window.prepareWrappedInBackground) {
    window.prepareWrappedInBackground(window.latestWrappedData);
  }
  setResultText(outputLines.join("\n"));
  updateTrendGraphsTitle(userName);

  latestMonthSeries = {
    percent: {
      overall: { cumulative: percentOverallCumulative, monthOnly: percentOverallBucket },
      partner: { cumulative: percentPartnerCumulative, monthOnly: percentPartnerBucket },
      lower: { cumulative: percentLowerCumulative, monthOnly: percentLowerBucket },
      higher: { cumulative: percentHigherCumulative, monthOnly: percentHigherBucket },
      oppHigher: { cumulative: percentOppHigherCumulative, monthOnly: percentOppHigherBucket },
      oppLower: { cumulative: percentOppLowerCumulative, monthOnly: percentOppLowerBucket },
    },
    month: {
      overall: { cumulative: monthOverallCumulative, monthOnly: monthOverallBucket },
      partner: { cumulative: monthPartnerCumulative, monthOnly: monthPartnerBucket },
      lower: { cumulative: monthLowerCumulative, monthOnly: monthLowerBucket },
      higher: { cumulative: monthHigherCumulative, monthOnly: monthHigherBucket },
      oppHigher: { cumulative: monthOppHigherCumulative, monthOnly: monthOppHigherBucket },
      oppLower: { cumulative: monthOppLowerCumulative, monthOnly: monthOppLowerBucket },
    },
  };
  renderAllMonthCharts();
}

async function runFallbackOnFirstLoadIfNeeded() {
  if (rawInput.value.trim()) return;
  const inlineSample = String(window.BEN_JOHNS_DATA || "");
  if (inlineSample.trim()) {
    runEstimation(inlineSample);
    return;
  }
  const candidateUrls = [
    FALLBACK_SAMPLE_URL,
    "data/ben_johns_data.txt",
    `./${FALLBACK_SAMPLE_URL}`,
    `/${FALLBACK_SAMPLE_URL}`,
    new URL(FALLBACK_SAMPLE_URL, window.location.href).href,
  ];

  async function loadByFetch(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return "";
    return response.text();
  }

  function loadByXhr(url) {
    return new Promise((resolve) => {
      try {
        const req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.onreadystatechange = () => {
          if (req.readyState !== 4) return;
          const okStatus = req.status === 200 || req.status === 0;
          resolve(okStatus ? req.responseText : "");
        };
        req.onerror = () => resolve("");
        req.send();
      } catch (_) {
        resolve("");
      }
    });
  }

  try {
    for (const url of candidateUrls) {
      let sampleRaw = "";
      try {
        sampleRaw = await loadByFetch(url);
      } catch (_) {
        sampleRaw = "";
      }
      if (!sampleRaw.trim()) {
        sampleRaw = await loadByXhr(url);
      }
      if (sampleRaw.trim()) {
        runEstimation(sampleRaw);
        return;
      }
    }
  } catch (_) {
    // Ignore fallback fetch errors and keep default UI state.
  }
}

estimateBtn.addEventListener("click", runEstimation);
document.getElementById("wrappedBtn").addEventListener("click", () => {
  if (window.latestWrappedData) {
    applyWrappedTrendMode(window.latestWrappedData, trendBasisMode);
    startWrapped(window.latestWrappedData);
  }
});
if (wrappedViewBtn) {
  wrappedViewBtn.addEventListener("click", () => {
    if (window.latestWrappedData) {
      applyWrappedTrendMode(window.latestWrappedData, trendBasisMode);
      if (window.viewWrapped) window.viewWrapped(window.latestWrappedData);
    }
  });
}
monthModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    monthViewMode = input.value === "monthOnly" ? "monthOnly" : "cumulative";
    renderAllMonthCharts();
  });
});
trendBasisInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    trendBasisMode = input.value === "month" ? "month" : "percent";
    updateModeToggleLabels();
    renderAllMonthCharts();
    if (window.latestWrappedData) {
      applyWrappedTrendMode(window.latestWrappedData, trendBasisMode);
      if (window.prepareWrappedInBackground) {
        window.prepareWrappedInBackground(window.latestWrappedData);
      }
    }
  });
});
updateModeToggleLabels();
rawInput.addEventListener("paste", () => {
  // Wait for paste operation to populate the textarea before saving.
  setTimeout(() => {
    saveRawInputToStorage();
  }, 0);
});
rawInput.addEventListener("input", saveRawInputToStorage);
clearBtn.addEventListener("click", () => {
  rawInput.value = "";
  saveRawInputToStorage();
  updateTrendGraphsTitle("");
});
downloadCsvBtn.addEventListener("click", () => {
  if (!latestParsedMatches.length) return;
  const csv = buildCsv(latestParsedMatches);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dupr_parsed.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

loadRawInputFromStorage();
setTimeout(() => {
  const storedRawInput = getStoredRawInput();
  const inputBlank = !rawInput.value.trim();
  const storedBlank = !storedRawInput.trim();
  if (inputBlank && storedBlank) {
    runFallbackOnFirstLoadIfNeeded();
  }
}, 2000);
