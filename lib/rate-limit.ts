// Shared rate limiting, backed by the same Upstash Redis instance already
// used for sessions/schedules (lib/kv.ts) — no new infrastructure, matching
// Phase 1 action plan §6's reasoning: a CloudFront/WAF rate-based rule was
// considered and rejected on cost grounds (josephkan.ca's own CFR2
// suppression already notes a web ACL is ~$5/mo base plus per-rule/request
// charges, a large fraction of this phase's whole $8-15/mo budget, for
// protecting a single route). This app already pays for Upstash regardless.

import { Ratelimit } from "@upstash/ratelimit"
import { getKv } from "@/lib/kv"

let _weatherLimiter: Ratelimit | null = null

// 30 requests per 60 seconds per client. The weather page polls this route
// on an interval while open (not a one-shot page load), so the limit needs
// headroom for normal multi-tab/multi-site use, not just a single request —
// chosen generously over tightly, since the actual goal (Phase 1 action plan
// §6) is closing an open proxy to abuse, not rate-limiting real users.
function weatherLimiter(): Ratelimit {
  if (!_weatherLimiter) {
    _weatherLimiter = new Ratelimit({
      redis: getKv(),
      limiter: Ratelimit.slidingWindow(30, "60 s"),
      prefix: "ratelimit:weather",
    })
  }
  return _weatherLimiter
}

// CloudFront always sets X-Forwarded-For (it is the origin's load balancer
// from Next.js's perspective); request.ip does not exist on the Fetch API
// Request/NextRequest this app's routes receive. The header can carry a
// comma-separated chain (client, then any intermediate proxies) — the first
// entry is the original client.
export function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  const first = forwardedFor?.split(",")[0]?.trim()
  return first && first.length > 0 ? first : "unknown"
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

export async function checkWeatherRateLimit(request: Request): Promise<RateLimitResult> {
  const identifier = clientIp(request)
  const { success, limit, remaining, reset } = await weatherLimiter().limit(identifier)
  return { allowed: success, limit, remaining, resetAt: reset }
}
