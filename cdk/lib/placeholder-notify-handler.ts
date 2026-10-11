/**
 * Used only when `usePlaceholderSource` is true (CI synth, cdk-nag, diff —
 * see `OpenNextSiteProps.usePlaceholderSource`'s doc comment for why synth
 * must work with no real OpenNext build on disk). `ScheduledJob.entry` has
 * no placeholder-source concept of its own the way `OpenNextSite` does, so
 * this stack supplies one: a trivial handler that always resolves,
 * regardless of whether `lambda/notify/index.ts` exists. Never deployed for
 * real — a real deploy must pass `usePlaceholderSource: false` (the
 * default).
 */
export async function handler(): Promise<void> {
  process.stdout.write(
    `${JSON.stringify({ service: "newnotams-notify", level: "WARN", msg: "notify.placeholder_invoked" })}\n`,
  );
}
