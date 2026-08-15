import type { APIRoute } from "astro";
import {
  consumeLeadFormToken,
  leadFormSchema,
} from "../../lib/forms/lead-form";

export const prerender = false;

const RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 10 * 60 * 1000,
};

const requestHistory = new Map<string, number[]>();

export const POST: APIRoute = async ({ request }) => {
  const clientIp = getClientIp(request);

  if (!isRateLimitAllowed(clientIp)) {
    return jsonResponse({ ok: false, error: "Too many requests" }, 429);
  }

  const payload = await parseRequestPayload(request);
  const validatedData = validatePayload(payload);

  if (!validatedData) {
    return jsonResponse({ ok: false, error: "Invalid data" }, 400);
  }

  if (!consumeLeadFormToken(validatedData.formToken)) {
    return jsonResponse({ ok: false, error: "Duplicate submission" }, 409);
  }

  const turnstileValid = await verifyTurnstile(
    validatedData.turnstileToken,
    clientIp,
  );
  if (!turnstileValid) {
    return jsonResponse(
      { ok: false, error: "Turnstile verification failed" },
      403,
    );
  }

  const saved = await saveToAppsScript(validatedData, clientIp, turnstileValid);
  if (!saved) {
    return jsonResponse({ ok: false, error: "Failed to save lead" }, 502);
  }

  return jsonResponse({ ok: true, message: "Lead received" }, 200);
};

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function isRateLimitAllowed(ip: string): boolean {
  const now = Date.now();
  const history = requestHistory.get(ip) ?? [];
  const recent = history.filter((ts) => now - ts < RATE_LIMIT.windowMs);

  if (recent.length >= RATE_LIMIT.maxRequests) {
    return false;
  }

  recent.push(now);
  requestHistory.set(ip, recent);
  return true;
}

async function parseRequestPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  const clone = request.clone();

  if (contentType.includes("application/json")) {
    return await clone.json().catch(() => null);
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await clone.formData();
    return Object.fromEntries(formData.entries());
  }

  const text = await clone.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validatePayload(payload: unknown) {
  const data = typeof payload === "object" && payload ? payload : {};
  const record = data as Record<string, unknown>;

  const extracted = {
    name: String(record.name ?? ""),
    empresa: String(record.empresa ?? ""),
    cargo: String(record.cargo ?? ""),
    email: String(record.email ?? ""),
    telefono: String(record.telefono ?? ""),
    interest: String(record.interest ?? ""),
    message: String(record.message ?? ""),
    privacy: String(record.privacy ?? ""),
    website: String(record.website ?? ""),
    formToken: String(record.formToken ?? ""),
    turnstileToken: String(
      record.turnstileToken ??
        (record["cf-turnstile-response"] as string) ??
        "",
    ),
  };

  const parsed = leadFormSchema.safeParse(extracted);
  return parsed.success ? parsed.data : null;
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secretKey = import.meta.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return false;

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: ip,
      }),
    },
  );

  const result = (await response.json()) as { success: boolean };
  return result.success;
}

async function saveToAppsScript(
  data: ReturnType<typeof leadFormSchema.parse>,
  ip: string,
  turnstileOk: boolean,
): Promise<boolean> {
  const appScriptUrl = import.meta.env.APP_SCRIPT_URL;
  const appScriptSecret = import.meta.env.APP_SCRIPT_SECRET;

  if (!appScriptUrl || !appScriptSecret) {
    console.error("Missing Apps Script configuration");
    return false;
  }

  const leadId = `VTK-${crypto.randomUUID().split("-")[0]}`;

  const response = await fetch(appScriptUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: appScriptSecret,
      leadId,
      name: data.name,
      empresa: data.empresa,
      cargo: data.cargo,
      email: data.email,
      telefono: data.telefono,
      interest: data.interest,
      message: data.message,
      privacy: data.privacy,
      timestamp: new Date().toISOString(),
      source: "landing-form",
      ip,
      turnstileStatus: turnstileOk ? "ok" : "failed",
    }),
  });

  if (!response.ok) return false;

  const result = await response.json().catch(() => null);
  return result?.success === true;
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
