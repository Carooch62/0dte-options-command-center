const REPO = "Carooch62/0dte-options-command-center";
const WORKFLOW = "market-scan.yml";
const ALLOWED_ORIGIN = "https://carooch62.github.io";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/refresh") {
      return handleRefresh(request, env);
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        worker: "0dte-options-command-center",
        workflow: WORKFLOW,
        tokenConfigured: Boolean(env.GITHUB_TOKEN),
      });
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleRefresh(request, env) {
  // Browser fetch() sends an OPTIONS preflight before the cross-origin POST.
  // Without this branch the browser receives 405 and never sends the POST.
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, {
      Allow: "OPTIONS, POST",
    });
  }

  const origin = request.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) {
    return json({ error: "Forbidden origin" }, 403);
  }

  if (!env.GITHUB_TOKEN) {
    return json({ error: "GITHUB_TOKEN is not configured" }, 500);
  }

  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "0DTE-Options-Command-Center",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          scan_mode: "manual",
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return json(
      {
        error: "GitHub workflow dispatch failed",
        status: response.status,
        detail: detail.slice(0, 500),
      },
      502,
    );
  }

  return json({
    ok: true,
    message: "Market scan started",
    workflow: WORKFLOW,
  }, 202);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}
