/**
 * Mock API stats service — used when VITE_USE_MOCK_STATS=true.
 * Replace with realApiStatsService in production.
 */

import type {
  ApiAggregate,
  ApiLogEntry,
  ApiName,
  ApiStatsService,
  StatsSummary,
  TimelinePoint,
  TimelineRange,
} from "@/types/apiStats";

const now = Date.now();
const mins = (m: number) => new Date(now - m * 60_000).toISOString();

const MOCK_LOGS: ApiLogEntry[] = [
  {
    id: "log_gemini_429",
    apiName: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    method: "POST",
    timestamp: mins(5),
    durationMs: 480,
    success: false,
    statusCode: 429,
    errorMessage: "Quota exceeded",
    requestHeaders: { "Content-Type": "application/json", Authorization: "Bearer [REDACTED]" },
    responseBody: { error: { message: "Quota exceeded", code: 429 } },
  },
  {
    id: "log_tavily_500",
    apiName: "tavily",
    endpoint: "https://api.tavily.com/search",
    method: "POST",
    timestamp: mins(10),
    durationMs: 200,
    success: false,
    statusCode: 500,
    errorMessage: "Internal server error",
    requestHeaders: { "Content-Type": "application/json", Authorization: "Bearer [REDACTED]" },
    responseBody: { error: "Internal server error" },
  },
  {
    id: "log_openrouter_ok",
    apiName: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    method: "POST",
    timestamp: mins(2),
    durationMs: 1800,
    success: true,
    statusCode: 200,
    quotaRemaining: "unknown",
    responseBody: { model: "deepseek/deepseek-chat:free", usage: { total_tokens: 512 } },
  },
  {
    id: "log_tavily_ok",
    apiName: "tavily",
    endpoint: "https://api.tavily.com/search",
    method: "POST",
    timestamp: mins(1),
    durationMs: 430,
    success: true,
    statusCode: 200,
    quotaRemaining: "unlimited",
    responseBody: { resultCount: 8 },
  },
  {
    id: "log_gemini_ok",
    apiName: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    method: "POST",
    timestamp: mins(3),
    durationMs: 530,
    success: true,
    statusCode: 200,
    quotaRemaining: 45,
    responseBody: { candidates: [{ content: { parts: [{ text: "{}" }] } }] },
  },
];

const MOCK_APIS: ApiAggregate[] = [
  {
    apiName: "gemini",
    displayName: "Gemini API",
    status: "healthy",
    requests: 1250,
    success: 1220,
    failed: 30,
    avgResponseMs: 530,
    lastUsedAt: mins(3),
    quotaRemaining: 45,
  },
  {
    apiName: "tavily",
    displayName: "Tavily",
    status: "offline",
    requests: 620,
    success: 610,
    failed: 10,
    avgResponseMs: 430,
    lastUsedAt: mins(30),
    quotaRemaining: "unlimited",
  },
  {
    apiName: "openrouter",
    displayName: "OpenRouter",
    status: "slow",
    requests: 250,
    success: 200,
    failed: 50,
    avgResponseMs: 1800,
    lastUsedAt: mins(5),
    quotaRemaining: "unknown",
  },
  {
    apiName: "openrouter2",
    displayName: "OpenRouter (Key 2)",
    status: "disabled",
    requests: 0,
    success: 0,
    failed: 0,
    avgResponseMs: 0,
    lastUsedAt: null,
    quotaRemaining: { label: "N/A" },
  },
];

const MOCK_SUMMARY: StatsSummary = {
  requestsToday: 2120,
  successRate: 98.4,
  avgResponseMs: 620,
  errorsToday: 5,
};

function mockTimeline(range: TimelineRange): TimelinePoint[] {
  const counts: Record<TimelineRange, number[]> = {
    "1h":  [12, 18, 22, 15, 28, 35, 42, 38, 45, 52, 48, 55],
    today: [120, 95, 88, 102, 140, 165, 180, 210, 195, 220, 250, 280,
           310, 290, 320, 340, 360, 380, 400, 420, 390, 410, 430, 450],
    "7d":  [820, 910, 780, 1050, 980, 1120, 1250],
    "30d": Array.from({ length: 30 }, (_, i) => 600 + i * 25 + (i % 5) * 40),
  };

  const labels: Record<TimelineRange, string[]> = {
    "1h":  ["12:00","12:05","12:10","12:15","12:20","12:25","12:30","12:35","12:40","12:45","12:50","12:55"],
    today: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`),
    "7d":  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
    "30d": Array.from({ length: 30 }, (_, i) => `Jul ${i + 1}`),
  };

  return counts[range].map((requests, i) => ({
    time:  new Date(now - (counts[range].length - i) * 3600_000).toISOString(),
    label: labels[range][i] ?? String(i),
    requests,
  }));
}

export const mockApiStatsService: ApiStatsService = {
  async getSummary() {
    await delay(200);
    return MOCK_SUMMARY;
  },

  async getApis() {
    await delay(200);
    return MOCK_APIS;
  },

  async getTimeline(range) {
    await delay(200);
    return { range, points: mockTimeline(range) };
  },

  async getErrors(limit = 10) {
    await delay(200);
    return MOCK_LOGS.filter((l) => !l.success).slice(0, limit);
  },

  async getLog(id) {
    await delay(150);
    const entry = MOCK_LOGS.find((l) => l.id === id);
    if (!entry) throw new Error("Log not found");
    return entry;
  },

  async getLogsForApi(apiName: ApiName, limit = 1) {
    await delay(150);
    return MOCK_LOGS
      .filter((l) => l.apiName === apiName)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  },
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
