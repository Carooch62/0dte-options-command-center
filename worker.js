const REPO = "Carooch62/0dte-options-command-center";
const WORKFLOW = "market-scan.yml";
const VERSION = "2026-09-29.2-execution-layer";

const ALLOWED_ORIGINS = new Set([
  "https://carooch62.github.io",
  "https://0dte-options-command-center.h69htk56cq.workers.dev",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/refresh") return handleRefresh(request, env);
    if (url.pathname === "/health") return handleHealth(env);
    return env.ASSETS.fetch(request);
  },
};

async function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "0DTE-Options-Command-Center",
  };
}

async function handleHealth(env) {
  const tokenConfigured = Boolean(env.GITHUB_TOKEN);
  const result = {
    ok: true,
    version: VERSION,
    worker: "0dte-options-command-center",
    workflow: WORKFLOW,
    executionLayer: true,
    tokenConfigured,
    tokenType: typeof env.GITHUB_TOKEN,
    githubRepo: { ok: false, status: null },
    githubWorkflow: { ok: false, status: null },
    latestRun: { status: null, conclusion: null, id: null, createdAt: null },
  };

  if (!tokenConfigured) return json(result);
  const headers = await githubHeaders(env);

  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers });
    result.githubRepo = { ok: r.ok, status: r.status };
  } catch {
    result.githubRepo = { ok: false, status: 0 };
  }

  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`, { headers });
    result.githubWorkflow = { ok: r.ok, status: r.status };
  } catch {
    result.githubWorkflow = { ok: false, status: 0 };
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=1`,
      { headers },
    );
    if (r.ok) {
      const payload = await r.json();
      const run = payload.workflow_runs?.[0];
      if (run) {
        result.latestRun = {
          status: run.status ?? null,
          conclusion: run.conclusion ?? null,
          id: run.id ?? null,
          createdAt: run.created_at ?? null,
        };
      }
    }
  } catch {
    // Health remains useful even if the latest-run lookup is unavailable.
  }

  return json(result);
}

async function handleRefresh(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "OPTIONS, POST" }, request);
  }

  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Forbidden origin" }, 403, {}, request);
  }
  if (!env.GITHUB_TOKEN) {
    return json({ error: "GITHUB_TOKEN is not configured" }, 500, {}, request);
  }

  let mode = "manual";
  try {
    const body = await request.json();
    if (body?.scan_mode === "second-wave") mode = "second-wave";
  } catch {
    // Empty body is valid and means a normal/manual scan.
  }

  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        ...(await githubHeaders(env)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { scan_mode: mode } }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return json({
      error: "GitHub workflow dispatch failed",
      status: response.status,
      detail: detail.slice(0, 500),
    }, 502, {}, request);
  }

  return json({
    ok: true,
    message: mode === "second-wave" ? "Second-wave scan started" : "Market scan started",
    workflow: WORKFLOW,
    scan_mode: mode,
    execution_layer: true,
  }, 202, {}, request);
}

function corsHeaders(request) {
  const origin = request?.headers?.get("Origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://carooch62.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status = 200, extraHeaders = {}, request = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}
