/**
 * notify — the scheduled half of NewNotams.
 *
 * EventBridge Scheduler invokes this hourly (Phase 1 action plan §1, §3).
 * It replaces the old `GET /api/notify` endpoint that an external cron
 * service used to poll with a `CRON_SECRET` bearer token — there is no
 * public HTTP path for this anymore, and CRON_SECRET is unused.
 *
 * Imports lib/notify.ts and lib/push.ts via relative paths, not the `@/`
 * tsconfig alias those modules' other callers (the API routes) use. esbuild
 * — which `NodejsFunction`/`ScheduledJob` bundles this handler with — does
 * not resolve tsconfig path aliases unless explicitly configured, and
 * `ScheduledJob` deliberately exposes no such option (it is a generic
 * construct with no project-specific knowledge). Relative imports sidestep
 * the problem entirely rather than growing the shared construct a prop only
 * this one caller needs.
 *
 * KV_REST_API_URL/TOKEN and the VAPID_* env vars are read directly from
 * `process.env` by lib/kv.ts and lib/push.ts respectively — NewNotamsStack
 * (CDK side) populates them from SSM at deploy time via the Lambda's
 * `environment`, the same way personal-site's oanda-fetcher gets its
 * environment variables rather than calling SSM itself at runtime for
 * these particular values. (Unlike oanda-fetcher, these are read once into
 * Lambda environment variables by CDK/CloudFormation's own SSM dynamic
 * reference resolution at deploy time, not fetched by the handler on every
 * cold start — see NewNotamsStack's comment on why.)
 */

import { buildNotification, getSchedulesDueAt } from "../../lib/notify";
import { sendPushToUser } from "../../lib/push";

function log(event: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ service: "newnotams-notify", ...event })}\n`);
}

export async function handler(): Promise<void> {
  const startedAt = Date.now();
  const currentHour = new Date().getUTCHours();

  let schedules;
  try {
    schedules = await getSchedulesDueAt(currentHour);
  } catch (error) {
    const asError = error instanceof Error ? error : new Error(String(error));
    log({
      level: "ERROR",
      msg: "notify.schedule_lookup_failed",
      error: asError.message,
      durationMs: Date.now() - startedAt,
    });
    throw asError;
  }

  if (schedules.length === 0) {
    log({ level: "INFO", msg: "notify.none_due", hour: currentHour });
    return;
  }

  const results = await Promise.all(
    schedules.map(async (s) => {
      const built = await buildNotification({
        savedQuery: s.savedQuery,
        dismissedIds: s.dismissedIds,
      });
      if (!built.ok) {
        return { ok: false as const, userId: s.userId, error: built.error };
      }

      let sent = 0;
      for (const payload of built.result.payloads) {
        sent += await sendPushToUser(s.userId, payload);
      }
      return { ok: true as const, userId: s.userId, title: built.result.title, devicesSent: sent };
    }),
  );

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  log({
    level: failed.length > 0 ? "WARN" : "INFO",
    msg: "notify.swept",
    hour: currentHour,
    total: schedules.length,
    succeeded,
    failed: failed.length,
    failures: failed,
    durationMs: Date.now() - startedAt,
  });

  // Rethrow if everything failed, so the invocation is recorded as an error
  // and the Lambda Errors metric — the thing an alarm watches — actually
  // moves. A partial failure (some users succeeded) is logged as a warning
  // above but does not fail the whole invocation: EventBridge Scheduler's
  // retry would re-send every user's notification again, including the
  // ones that already succeeded.
  if (succeeded === 0 && failed.length > 0) {
    throw new Error(`All ${failed.length} notification(s) failed this sweep.`);
  }
}
