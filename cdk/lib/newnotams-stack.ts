/**
 * NewNotamsStack — newnotams.net on Lambda + CloudFront via OpenNext, plus
 * the hourly notification sweep.
 *
 * Moved here from `home-platform`'s `applications/newnotams/` per ADR-0009
 * in that repo: this app predates `home-platform` and has its own
 * independent release cadence, so its infrastructure-as-code lives with its
 * application code, in this repo, not in a shared platform monorepo.
 * `@josephkan3/config` and `@josephkan3/constructs` (GitHub Packages, not
 * `workspace:*` — this is no longer the same pnpm workspace) still provide
 * the platform's shared profiles, tagging, and the three guardrail Aspects
 * (`NoManagedEgressAspect`, `RequiredTagsAspect`, `LogRetentionAspect`) plus
 * cdk-nag's `AwsSolutionsChecks` — see `bin/app.ts`. Those apply exactly as
 * they did in `home-platform`; moving repos does not exempt this stack from
 * them.
 *
 * `OpenNextSite` for the app itself, `ScheduledJob` for the hourly
 * notification sweep, and the grants that make this *this* application
 * rather than a generic OpenNext deployment.
 *
 * Two Lambdas, not one. OpenNext's server function (inside `OpenNextSite`)
 * handles HTTP requests; the notify sweep has no HTTP request behind it at
 * all — EventBridge Scheduler invokes it directly — so it is its own small
 * function that imports `lib/notify.ts`/`lib/push.ts` directly (now
 * same-repo relative imports, not a cross-repo checkout), rather than a
 * warm-path invocation of the full Next.js server bundle for a job that was
 * never a request.
 */

import { CfnOutput, Duration, Fn, Stack } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { DEFAULT_OWNER, applyPlatformTags, domains, profileFor, ssmPaths } from "@josephkan3/config";
import { OpenNextSite, ScheduledJob, suppressNagRules } from "@josephkan3/constructs";
import * as path from "node:path";
import type { Env, EnvProfile } from "@josephkan3/config";
import type { StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

/** The application name, used for tags and the SSM parameter namespace. */
export const APP_NAME = "newnotams";

/**
 * How often the notify sweep runs. Matches the hour-granularity schedule
 * design already stored per user (`ScheduleConfig.notifyHours`, `lib/notify.ts`)
 * — running more often would invoke the Lambda for nothing every time, since
 * `getSchedulesDueAt` only ever matches once per hour per user; running less
 * often would miss some users' chosen hours entirely.
 */
export const NOTIFY_INTERVAL = Duration.hours(1);

/**
 * SSM parameters, seeded out of band. `CRON_SECRET` is deliberately absent —
 * it has no AWS equivalent, since EventBridge invokes the Lambda directly
 * and there is no public endpoint for it to protect.
 *
 * All eight are `String`, **not `SecureString`** — this needed two real,
 * live-deploy failures to arrive at, not a single design decision while
 * this stack still lived in `home-platform`, so the history is worth
 * keeping:
 *
 * 1. They were seeded as `SecureString` initially.
 * 2. `StringParameter.valueForStringParameter` — the obvious way to read
 *    them into a Lambda environment variable — fails synth outright for
 *    anything stored as `SecureString`: "Parameters [...] referenced by
 *    template have types not supported by CloudFormation."
 * 2. `SecretValue.ssmSecure(...).unsafeUnwrap()` looked like the fix — it
 *    is `SecretValue`'s own documented, intended use case — but
 *    CloudFormation's actual change-set creation rejects `ssm-secure`
 *    dynamic references in `Lambda::Function`'s `Environment.Variables`
 *    specifically; that resource/property pair is not on the short, fixed
 *    allowlist AWS documents for where `ssm-secure` works at all (RDS
 *    `MasterUserPassword`, IAM User `LoginProfile.Password`, a few others
 *    — never Lambda).
 * 3. `StringParameter.valueFromLookup` — a real `ssm:GetParameter` call
 *    made *during synth*, baking the result into the template as a
 *    literal — actually deploys. But it does not decrypt: for a
 *    `SecureString` parameter this bakes in the **raw KMS ciphertext**,
 *    not the plaintext, silently. Nothing in CDK warns about this. The
 *    resulting Lambda ran with `AUTH_GOOGLE_ID` set to an encrypted blob
 *    instead of a real client ID — Google's OAuth endpoint correctly
 *    rejected it (`Error 401: invalid_client`), which is how this was
 *    caught: a real end-to-end sign-in attempt, not a unit test or a
 *    code read, surfaced it.
 *
 * No CDK/CloudFormation-level mechanism gets a `SecureString`'s real,
 * decrypted value into a Lambda environment variable, full stop. The only
 * two working alternatives are: re-seed as plain `String` (accepted here —
 * IAM already restricts which roles can `ssm:GetParameter` on these names
 * regardless of type, so the practical access-control difference is small,
 * and this app's threat model does not call for KMS-at-rest on top of
 * that), or have the Lambda fetch and decrypt the parameter itself at
 * runtime (rejected here because `auth.ts` reads `process.env`
 * synchronously at module load, before any runtime code this construct
 * controls would get a chance to inject a value).
 *
 * `vapidPrivateKey` was the one straggler still seeded as `SecureString`
 * (re-seeded as `String` when the CI deploy-dev role's lack of direct
 * `ssm:GetParameter` surfaced it — `valueFromLookup` calls SSM with the
 * CLI's bare credentials, bypassing the assumed CFN execution role
 * entirely, so it needs its own grant regardless of parameter type; using
 * the same `valueForStringParameter` pattern as every other parameter here
 * avoids needing a second, narrower grant for a `valueFromLookup`-style
 * synth-time read).
 */
export const newNotamsParameterNames = {
  googleClientId: `/${APP_NAME}/auth/google-id`,
  googleClientSecret: `/${APP_NAME}/auth/google-secret`,
  authSecret: `/${APP_NAME}/auth/secret`,
  vapidPublicKey: `/${APP_NAME}/push/vapid-public-key`,
  vapidPrivateKey: `/${APP_NAME}/push/vapid-private-key`,
  vapidSubject: `/${APP_NAME}/push/vapid-subject`,
  kvUrl: `/${APP_NAME}/kv/url`,
  kvToken: `/${APP_NAME}/kv/token`,
} as const;

export interface NewNotamsStackProps extends StackProps {
  readonly envName: Env;

  /**
   * Directory holding `npx open-next build`'s output.
   *
   * Defaults to `<repoRoot>/.open-next`. A prop, not a constant, because CI
   * synthesizes this stack without a real build on disk (`sitePlaceholder`).
   */
  readonly openNextOutputPath?: string;

  /** Path to this repo's root. Used to locate `lambda/notify/index.ts`. */
  readonly repoRootPath?: string;

  /** See `OpenNextSiteProps.usePlaceholderSource`. */
  readonly usePlaceholderSource?: boolean;

  /**
   * Where the notify-failure alarm sends email.
   *
   * Optional so a test or CI synth doesn't need a real inbox, but every
   * real deploy should set it, since an alarm with no subscriber is a
   * missed hourly sweep nobody is ever told about.
   */
  readonly alertEmail?: string;
}

export class NewNotamsStack extends Stack {
  readonly site: OpenNextSite;
  readonly bucket: s3.Bucket;
  readonly accessLogBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly notifyJob: ScheduledJob;
  readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: NewNotamsStackProps) {
    super(scope, id, props);

    const profile = profileFor(props.envName);
    const repoRootPath = props.repoRootPath ?? defaultRepoRootPath();

    this.site = new OpenNextSite(this, "Site", {
      domainNames: [domains.product, `www.${domains.product}`],
      // ADR-0004 (home-platform): the certificate ARN crosses the
      // platform/application seam via SSM, never a CloudFormation export.
      certificate: ssm.StringParameter.valueForStringParameter(
        this,
        ssmPaths.certificateArn(domains.product),
      ),
      profile,
      openNextOutputPath: props.openNextOutputPath ?? defaultOpenNextOutputPath(repoRootPath),
      usePlaceholderSource: props.usePlaceholderSource,
      comment: `${domains.product} — Next.js on Lambda (OpenNext) plus hourly notify sweep.`,
    });

    this.bucket = this.site.bucket;
    this.accessLogBucket = this.site.logBucket;
    this.distribution = this.site.distribution;

    this.suppressDistributionFindings();
    this.grantServerSecrets();

    this.notifyJob = this.createNotifyJob(
      profile,
      repoRootPath,
      props.usePlaceholderSource === true,
    );
    this.grantNotifyJobSecrets(this.notifyJob);

    this.alertTopic = this.createNotifyFailureAlarm(this.notifyJob, props.alertEmail);

    applyPlatformTags(this, { app: APP_NAME, env: profile.env, owner: DEFAULT_OWNER });

    new CfnOutput(this, "DistributionDomainName", {
      value: this.distribution.distributionDomainName,
      description:
        "Pass this to home-platform's newnotams.net DnsStack as -c cloudFrontDomainName=... for the apex cutover.",
    });
  }

  /**
   * Same two cost/threat-model judgement calls `home-platform`'s
   * `SiteStack` makes for josephkan.ca: a product with sign-in, saved
   * searches and a database-backed schedule is a different threat model
   * than a static portfolio page, so neither finding gets a blanket "same
   * as the other site" suppression.
   */
  private suppressDistributionFindings(): void {
    suppressNagRules(this.distribution, [
      {
        id: "AwsSolutions-CFR1",
        reason:
          "Geo restriction is off (ADR-0007, home-platform). NewNotams serves " +
          "Canadian aviation weather/NOTAM data to pilots who may be planning " +
          "flights from anywhere; there is no jurisdiction whose traffic is safer " +
          "blocked than served, and the data behind it (NOTAMs, METARs, TAFs) is " +
          "already public via Nav Canada's own API.",
      },
      {
        id: "AwsSolutions-CFR2",
        reason:
          "No WAF yet. A web ACL is ~$5/mo base plus $1/rule and $0.60/M requests — " +
          "a large fraction of this app's own operating budget for one app. This app " +
          "does have real attack surface a WAF would address (sign-in, an open " +
          "weather proxy at /api/weather, now rate-limited via @upstash/ratelimit " +
          "instead). Revisit this suppression once real traffic volume is observed; " +
          "it is accepted for the initial migration, not indefinitely.",
      },
    ]);
  }

  /**
   * The app's own secrets (Google OAuth, VAPID, Upstash) — `OpenNextSite`
   * owns none of this; see its "What it does not own" doc comment.
   *
   * Populated as Lambda environment variables at deploy time, not fetched
   * at runtime: Auth.js/next-auth read these values *synchronously at
   * module load* inside `auth.ts` (`process.env.AUTH_GOOGLE_ID` evaluated
   * as the module is first imported, not inside any async handler this
   * construct controls), so they must already be present as plain
   * environment variables before the Next.js server code runs at all.
   *
   * All of these are `String` parameters — see `newNotamsParameterNames`'s
   * doc comment for the three things tried and failed before arriving at
   * "seed as `String`, not `SecureString`." `valueForStringParameter` is
   * the ordinary, correct API for a plain `String` parameter and has none
   * of `valueFromLookup`'s caveats (no synth-time AWS call, no
   * `cdk.context.json` entry, no stale-cache risk across redeploys).
   *
   * All eight parameters, including `vapidPrivateKey`, use
   * `valueForStringParameter` — see `newNotamsParameterNames`'s doc
   * comment for why `vapidPrivateKey` was the one straggler still seeded
   * as `SecureString`.
   */
  private grantServerSecrets(): void {
    const fn = this.site.serverFunction;

    fn.addEnvironment(
      "AUTH_GOOGLE_ID",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.googleClientId),
    );
    fn.addEnvironment(
      "AUTH_GOOGLE_SECRET",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.googleClientSecret),
    );
    fn.addEnvironment(
      "AUTH_SECRET",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.authSecret),
    );
    fn.addEnvironment(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.vapidPublicKey),
    );
    fn.addEnvironment(
      "VAPID_PRIVATE_KEY",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.vapidPrivateKey),
    );
    fn.addEnvironment(
      "VAPID_SUBJECT",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.vapidSubject),
    );
    fn.addEnvironment(
      "KV_REST_API_URL",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.kvUrl),
    );
    fn.addEnvironment(
      "KV_REST_API_TOKEN",
      ssm.StringParameter.valueForStringParameter(this, newNotamsParameterNames.kvToken),
    );

    this.grantSsmRead(fn.role!, "ServerFunction", [
      newNotamsParameterNames.googleClientId,
      newNotamsParameterNames.googleClientSecret,
      newNotamsParameterNames.authSecret,
      newNotamsParameterNames.vapidPublicKey,
      newNotamsParameterNames.vapidPrivateKey,
      newNotamsParameterNames.vapidSubject,
      newNotamsParameterNames.kvUrl,
      newNotamsParameterNames.kvToken,
    ]);
  }

  /**
   * The notify sweep: schedule lookup, Nav Canada fetch, push send. Needs
   * only the Upstash and VAPID parameters — it never touches Auth.js at
   * all (no sign-in happens inside a cron invocation), so it gets a
   * strictly smaller grant than the server function.
   */
  private createNotifyJob(
    profile: EnvProfile,
    repoRootPath: string,
    usePlaceholderSource: boolean,
  ): ScheduledJob {
    // See placeholder-notify-handler.ts's doc comment: ScheduledJob.entry
    // always resolves a real file on disk, unlike OpenNextSite, which has
    // its own usePlaceholderSource branch internally. This stack supplies
    // the equivalent behavior at the call site instead.
    //
    // projectRoot/depsLockFilePath are STILL needed even though the stack
    // and the app now share one repo (ADR-0009, home-platform) — moving
    // repos did not remove the actual cause, only changed its shape.
    // `cdk/` has its own package.json/package-lock.json (the CDK app's
    // own dependencies: aws-cdk-lib, the two @josephkan3 packages), which
    // makes it NodejsFunction's default projectRoot — but lambda/notify/
    // index.ts lives one level up, at the real repo root, where the APP's
    // package-lock.json and node_modules live. NodejsFunction's own
    // PathNotUnderRoot check fails outright otherwise: confirmed directly
    // against a real, non-placeholder `cdk synth` — "entryPath
    // (.../lambda/notify/index.ts) should be under projectRoot
    // (.../cdk)". An earlier version of this comment assumed sharing one
    // repo made this unnecessary; it does not, because `cdk/` and the
    // repo root are still two different directories with two different
    // lockfiles.
    const entry = usePlaceholderSource
      ? path.join(__dirname, "placeholder-notify-handler.ts")
      : path.join(repoRootPath, "lambda", "notify", "index.ts");
    const projectRoot = usePlaceholderSource ? undefined : repoRootPath;
    const depsLockFilePath = usePlaceholderSource
      ? undefined
      : path.join(repoRootPath, "package-lock.json");

    return new ScheduledJob(this, "Notify", {
      entry,
      projectRoot,
      depsLockFilePath,
      schedule: NOTIFY_INTERVAL,
      profile,
      description: "Hourly NOTAM notification sweep — direct invoke, no public endpoint.",
      scheduleDescription: "Hourly NewNotams notify sweep. Not real-time; matches notifyHours.",
      // See grantServerSecrets's comment for the full account of why these
      // are String parameters, not SecureString.
      environment: {
        KV_REST_API_URL: ssm.StringParameter.valueForStringParameter(
          this,
          newNotamsParameterNames.kvUrl,
        ),
        KV_REST_API_TOKEN: ssm.StringParameter.valueForStringParameter(
          this,
          newNotamsParameterNames.kvToken,
        ),
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: ssm.StringParameter.valueForStringParameter(
          this,
          newNotamsParameterNames.vapidPublicKey,
        ),
        VAPID_PRIVATE_KEY: ssm.StringParameter.valueForStringParameter(
          this,
          newNotamsParameterNames.vapidPrivateKey,
        ),
        VAPID_SUBJECT: ssm.StringParameter.valueForStringParameter(
          this,
          newNotamsParameterNames.vapidSubject,
        ),
      },
    });
  }

  private grantNotifyJobSecrets(job: ScheduledJob): void {
    this.grantSsmRead(job.role, "Notify", [
      newNotamsParameterNames.kvUrl,
      newNotamsParameterNames.kvToken,
      newNotamsParameterNames.vapidPublicKey,
      newNotamsParameterNames.vapidPrivateKey,
      newNotamsParameterNames.vapidSubject,
    ]);
  }

  /**
   * "One alarm that matters more than the rest": the notify job's own
   * `lambda/notify/index.ts` only throws when every user's notification
   * failed this sweep (a partial failure is logged as a warning but does
   * not fail the invocation, on purpose — see that file's own comment on
   * why a retry-everyone response to a partial failure would be worse than
   * the partial failure itself). An uncaught throw is exactly what
   * Lambda's own `Errors` metric counts, so alarming on it directly needs
   * no custom metric filter or EventBridge rule — the signal already
   * exists.
   *
   * This does not, by itself, cover "the schedule failed to invoke the
   * Lambda at all" (an IAM or EventBridge-side failure, not a Lambda
   * error) — `ScheduledJob` does not expose the underlying
   * `scheduler.CfnSchedule` to alarm on its own invocation-failure metric
   * separately, and CDK wires the schedule's IAM permission itself, making
   * that failure mode unlikely enough that it is out of scope for the
   * minimum viable version.
   *
   * A hard-coded threshold of 1 error in a 1-hour period, matching
   * `NOTIFY_INTERVAL` exactly: each invocation either throws (1) or does
   * not (0), so this alarms on the very first failed sweep rather than
   * waiting for a pattern.
   */
  private createNotifyFailureAlarm(job: ScheduledJob, alertEmail?: string): sns.Topic {
    const topic = new sns.Topic(this, "AlertTopic", {
      displayName: `${APP_NAME} alerts`,
      // AwsSolutions-SNS3: denies Publish over plain HTTP via a topic policy
      // condition. CloudWatch's own alarm-to-SNS publish already uses TLS;
      // this only closes off anyone else trying to publish insecurely.
      enforceSSL: true,
    });
    if (alertEmail !== undefined) {
      topic.addSubscription(new snsSubscriptions.EmailSubscription(alertEmail));
    }

    // Without this, the alarm below silently never notifies anyone — a real
    // bug caught by actually forcing a test failure and finding no email
    // arrived, not by code review or cdk-nag. `enforceSSL: true` creates an
    // explicit topic policy (the Deny-on-plain-HTTP statement above); once
    // *any* explicit policy exists, SNS stops granting the implicit
    // same-account access it gives an otherwise-policy-free topic, and
    // `CfnAlarm`'s AlarmActions (wired via `SnsAction`, confirmed by reading
    // its source: `SnsAction.bind()` only returns the topic ARN string, it
    // never calls `grantPublish` or adds any statement of its own) has
    // nothing granting it `sns:Publish` at all. Confirmed end to end:
    // manually broke the notify Lambda's KV endpoint, invoked it, watched
    // `aws cloudwatch describe-alarms` show `ALARM`, then found zero
    // datapoints on `AWS/SNS`'s own `NumberOfMessagesPublished` metric for
    // this topic in that window — the alarm fired, but nothing was ever
    // actually published. Scoped to this topic and this account specifically
    // (`aws:SourceAccount`), not every possible alarm, matching the pattern
    // AWS's own SNS access-control docs show for CloudWatch Alarms.
    topic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudWatchAlarmPublish",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudwatch.amazonaws.com")],
        actions: ["sns:Publish"],
        resources: [topic.topicArn],
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    );

    const alarm = new cloudwatch.Alarm(this, "NotifyFailureAlarm", {
      alarmDescription:
        "The hourly NOTAM notify sweep failed outright (every user's notification failed) " +
        "for at least one invocation. See lambda/notify/index.ts for what counts as a full " +
        "failure versus a logged partial one.",
      metric: job.fn.metricErrors({ period: NOTIFY_INTERVAL, statistic: "Sum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      // A period with no invocation at all (nothing scheduled, or the
      // schedule itself never fired) reports no datapoints, not a zero —
      // treating that as "not breaching" is correct here: EventBridge
      // Scheduler invokes hourly unconditionally, so a true "did not run"
      // is a different, rarer failure mode (see this method's own doc
      // comment) that this alarm does not claim to cover.
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
    alarm.addOkAction(new cloudwatchActions.SnsAction(topic));

    return topic;
  }

  /**
   * Named parameters only: `/newnotams/*` would be tidier and would also
   * grant every future secret this application ever has.
   */
  private grantSsmRead(role: iam.IRole, idPrefix: string, parameterNames: string[]): void {
    const arns = parameterNames.map((name) => this.parameterArn(name));
    role.attachInlinePolicy(
      new iam.Policy(this, `${idPrefix}SsmReadPolicy`, {
        statements: [
          new iam.PolicyStatement({
            sid: "ReadNamedParameters",
            actions: ["ssm:GetParameter", "ssm:GetParameters"],
            resources: arns,
          }),
        ],
      }),
    );
  }

  private parameterArn(parameterName: string): string {
    return Fn.join("", [
      `arn:${this.partition}:ssm:${this.region}:${this.account}:parameter`,
      parameterName,
    ]);
  }
}

/** This repo's root — two levels up from `cdk/lib/`. */
function defaultRepoRootPath(): string {
  return path.join(__dirname, "..", "..");
}

function defaultOpenNextOutputPath(repoRootPath: string): string {
  return path.join(repoRootPath, ".open-next");
}
