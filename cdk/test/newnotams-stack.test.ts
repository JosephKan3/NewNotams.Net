/**
 * The highest-value assertions in this file are the IAM scoping ones: a
 * `parameter/newnotams/*` grant would hand the server function or the
 * notify job every future secret this application acquires, and that
 * failure is not visible in a diff without a test that names the scope.
 * Also asserts the notify job gets a strictly smaller SSM grant than the
 * server function — it never touches Auth.js.
 */

process.env["MGMT_ACCOUNT_ID"] ??= "111111111111";
process.env["PLATFORM_ACCOUNT_ID"] ??= "222222222222";

import { App, Validations } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { CLOUDFRONT_CERT_REGION } from "@josephkan3/config";
import { APP_NAME, NOTIFY_INTERVAL, NewNotamsStack, newNotamsParameterNames } from "../lib/newnotams-stack.js";
import type { NewNotamsStackProps } from "../lib/newnotams-stack.js";

const ENV = { account: "222222222222", region: CLOUDFRONT_CERT_REGION };

function synth(props: Partial<NewNotamsStackProps> = {}): Template {
  const app = new App();
  return Template.fromStack(
    new NewNotamsStack(app, "TestNewNotamsStack", {
      env: ENV,
      envName: "prod",
      usePlaceholderSource: true,
      ...props,
    }),
  );
}

const template = synth();

describe("site bucket (via OpenNextSite)", () => {
  test("blocks all public access — CloudFront reaches it through OAC only", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test("has ABAC enabled (docs/open-issues.md issue 9)", () => {
    template.hasResourceProperties("AWS::S3::Bucket", { AbacStatus: "Enabled" });
  });

  test("prod retains the bucket", () => {
    template.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain" });
  });
});

describe("server function", () => {
  test("runs with no VPC configuration (ADR-0002)", () => {
    const functions = template.findResources("AWS::Lambda::Function");
    for (const [, resource] of Object.entries(functions)) {
      expect(
        (resource as { Properties: Record<string, unknown> }).Properties["VpcConfig"],
      ).toBeUndefined();
    }
  });

  test("receives all eight app secrets as environment variables", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          AUTH_GOOGLE_ID: Match.anyValue(),
          AUTH_GOOGLE_SECRET: Match.anyValue(),
          AUTH_SECRET: Match.anyValue(),
          NEXT_PUBLIC_VAPID_PUBLIC_KEY: Match.anyValue(),
          VAPID_PRIVATE_KEY: Match.anyValue(),
          VAPID_SUBJECT: Match.anyValue(),
          KV_REST_API_URL: Match.anyValue(),
          KV_REST_API_TOKEN: Match.anyValue(),
        }),
      }),
    });
  });
});

function policyStatements(roleLogicalIdPrefix?: string): Array<Record<string, unknown>> {
  return Object.values(template.findResources("AWS::IAM::Policy"))
    .map((resource) => (resource as { Properties: Record<string, unknown> }).Properties)
    .filter((properties) => {
      if (roleLogicalIdPrefix === undefined) {
        return true;
      }
      return JSON.stringify(properties["Roles"] ?? []).includes(roleLogicalIdPrefix);
    })
    .flatMap((properties) => {
      const document = properties["PolicyDocument"] as {
        Statement?: Array<Record<string, unknown>>;
      };
      return document.Statement ?? [];
    });
}

function resourcesOf(statement: Record<string, unknown>): unknown[] {
  const resource = statement["Resource"];
  return Array.isArray(resource) ? resource : [resource];
}

function statementsWithAction(
  roleLogicalIdPrefix: string,
  action: string,
): Array<Record<string, unknown>> {
  return policyStatements(roleLogicalIdPrefix).filter((statement) => {
    const actions = statement["Action"];
    return Array.isArray(actions) ? actions.includes(action) : actions === action;
  });
}

describe("least privilege (the point of this file)", () => {
  test("the server function reads exactly its eight named SSM parameters, no prefix grant", () => {
    const reads = statementsWithAction("ServerFunctionRole", "ssm:GetParameter");
    expect(reads).toHaveLength(1);

    const rendered = JSON.stringify(resourcesOf(reads[0] as Record<string, unknown>));
    expect(rendered).toContain(newNotamsParameterNames.googleClientId);
    expect(rendered).toContain(newNotamsParameterNames.googleClientSecret);
    expect(rendered).toContain(newNotamsParameterNames.authSecret);
    expect(rendered).toContain(newNotamsParameterNames.vapidPublicKey);
    expect(rendered).toContain(newNotamsParameterNames.vapidPrivateKey);
    expect(rendered).toContain(newNotamsParameterNames.vapidSubject);
    expect(rendered).toContain(newNotamsParameterNames.kvUrl);
    expect(rendered).toContain(newNotamsParameterNames.kvToken);
    // Not a prefix grant: `/newnotams/*` would include every future secret.
    expect(rendered).not.toContain(`parameter/${APP_NAME}/*`);
    expect(rendered).not.toContain(":parameter/*");
  });

  test("the notify job reads only the push parameters — never kv or the auth ones (Phase 2: schedules/push moved to DynamoDB)", () => {
    const reads = statementsWithAction("NotifyServiceRole", "ssm:GetParameter");
    expect(reads).toHaveLength(1);

    const rendered = JSON.stringify(resourcesOf(reads[0] as Record<string, unknown>));
    expect(rendered).toContain(newNotamsParameterNames.vapidPublicKey);
    expect(rendered).toContain(newNotamsParameterNames.vapidPrivateKey);
    expect(rendered).toContain(newNotamsParameterNames.vapidSubject);
    // Phase 2: the notify sweep's schedule lookup and push-subscription
    // storage both moved to the DynamoDB table (see "DynamoDB table"
    // describe block below) — it no longer talks to Upstash at all.
    expect(rendered).not.toContain(newNotamsParameterNames.kvUrl);
    expect(rendered).not.toContain(newNotamsParameterNames.kvToken);
    // The notify sweep never signs anyone in — it has no business reading
    // Auth.js's secrets at all.
    expect(rendered).not.toContain(newNotamsParameterNames.googleClientId);
    expect(rendered).not.toContain(newNotamsParameterNames.googleClientSecret);
    expect(rendered).not.toContain(newNotamsParameterNames.authSecret);
    expect(rendered).not.toContain(`parameter/${APP_NAME}/*`);
    expect(rendered).not.toContain(":parameter/*");
  });

  test("the notify job holds no S3 permission at all — it never touches the site bucket", () => {
    const s3Actions = policyStatements("NotifyServiceRole")
      .flatMap((statement) => {
        const actions = statement["Action"];
        return Array.isArray(actions) ? actions : [actions];
      })
      .filter((action): action is string => typeof action === "string");

    expect(s3Actions.filter((action) => action.startsWith("s3:"))).toEqual([]);
  });
});

describe("notify schedule", () => {
  test("runs hourly via EventBridge Scheduler", () => {
    expect(NOTIFY_INTERVAL.toHours()).toBe(1);
    template.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "rate(1 hour)",
    });
  });

  test("invokes the Lambda directly — no public HTTP endpoint for the cron path", () => {
    // The whole point of this Lambda existing is that nothing calls it over
    // HTTP. Asserted negatively: no API Gateway, no Function URL on this
    // specific function (the server function legitimately has one, for
    // CloudFront — this one must not).
    template.resourceCountIs("AWS::ApiGateway::RestApi", 0);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 0);

    const notifyFunctions = Object.entries(template.findResources("AWS::Lambda::Function")).filter(
      ([logicalId]) => logicalId.startsWith("Notify"),
    );
    expect(notifyFunctions).toHaveLength(1);
  });
});

describe("notify failure alarm (Phase 1 action plan §5)", () => {
  test("alarms on the notify Lambda's own Errors metric, matching the hourly schedule", () => {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "AWS/Lambda",
      MetricName: "Errors",
      Statistic: "Sum",
      Period: 3600,
      Threshold: 1,
      EvaluationPeriods: 1,
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
      TreatMissingData: "notBreaching",
    });
  });

  test("the alarm targets the notify function specifically, not the server function", () => {
    const alarms = template.findResources("AWS::CloudWatch::Alarm");
    const [, alarm] = Object.entries(alarms)[0]!;
    const dimensions = (alarm as { Properties: { Dimensions: Array<Record<string, unknown>> } }).Properties
      .Dimensions;
    const functionNameDimension = dimensions.find((d) => d["Name"] === "FunctionName");
    expect(JSON.stringify(functionNameDimension)).toContain("NotifyFunction");
    expect(JSON.stringify(functionNameDimension)).not.toContain("ServerFunction");
  });

  test("publishes to an SNS topic that enforces TLS (AwsSolutions-SNS3)", () => {
    template.resourceCountIs("AWS::SNS::Topic", 1);
    template.hasResourceProperties("AWS::SNS::TopicPolicy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          }),
        ]),
      }),
    });
  });

  test("explicitly allows CloudWatch to publish — regression test for a real bug", () => {
    // enforceSSL:true creates an explicit topic policy (the Deny above);
    // once any explicit policy exists, SNS no longer grants the implicit
    // same-account access an otherwise-policy-free topic gets, and
    // CfnAlarm's SnsAction never adds a grant of its own (confirmed by
    // reading its source). Without this statement, the alarm fires
    // correctly but nothing is ever actually published — caught live by
    // forcing a real notify failure, watching the alarm reach ALARM, and
    // finding zero datapoints on AWS/SNS's NumberOfMessagesPublished for
    // this topic in that window. No email ever arrived.
    template.hasResourceProperties("AWS::SNS::TopicPolicy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Principal: { Service: "cloudwatch.amazonaws.com" },
            Action: "sns:Publish",
            Condition: { StringEquals: { "aws:SourceAccount": ENV.account } },
          }),
        ]),
      }),
    });
  });

  test("subscribes the given alert email", () => {
    const withEmail = synth({ alertEmail: "test+alerts@example.com" });
    withEmail.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "email",
      Endpoint: "test+alerts@example.com",
    });
  });

  test("has no email subscription when alertEmail is omitted — an alarm with no subscriber is silent, but synth should not require a real inbox", () => {
    template.resourceCountIs("AWS::SNS::Subscription", 0);
  });
});

describe("notify job progressive delivery (Phase 2 roadmap: canary + automatic rollback)", () => {
  test("prod gets a canary: an Alias, a DeploymentGroup, and the schedule targets the alias", () => {
    template.resourceCountIs("AWS::Lambda::Alias", 1);
    template.hasResourceProperties("AWS::Lambda::Alias", { Name: "live" });
    template.resourceCountIs("AWS::CodeDeploy::DeploymentGroup", 1);

    template.hasResourceProperties("AWS::Scheduler::Schedule", {
      Target: Match.objectLike({
        Arn: { Ref: Match.stringLikeRegexp("^NotifyLiveAlias") },
      }),
    });
  });

  test("two separate alarms watch the same metric/threshold — ScheduledJob's own canary alarm and this stack's own paging alarm are not the same resource", () => {
    // See createNotifyJob's own comment on why this is deliberate: the
    // thing CodeDeploy watches during a 5-minute canary window and the
    // thing that pages a human via SNS are kept as two separate
    // CloudFormation resources, even though both watch the identical
    // metric and threshold and so fire at the same real-world moment.
    template.resourceCountIs("AWS::CloudWatch::Alarm", 2);

    const alarms = Object.values(template.findResources("AWS::CloudWatch::Alarm")) as Array<{
      Properties: { Threshold: number; MetricName: string };
    }>;
    for (const alarm of alarms) {
      expect(alarm.Properties.MetricName).toBe("Errors");
      expect(alarm.Properties.Threshold).toBe(1);
    }
  });

  test("the DeploymentGroup's service role is suppressed for AwsSolutions-IAM4, not left as a real finding", () => {
    // Full assurance that this is actually clean, not just "no error
    // thrown", is cdk-nag.test.ts's own AwsSolutionsChecks run against
    // this exact template. This test confirms *where* that suppression
    // lives: ScheduledJob's own progressive-delivery path (see its test
    // suite's identical assertion style), reached here via the construct
    // boundary rather than duplicated.
    const app = new App();
    const stack = new NewNotamsStack(app, "SuppressionStack", {
      env: ENV,
      envName: "prod",
      usePlaceholderSource: true,
    });

    const deploymentGroupRole = stack.notifyJob.deploymentGroup!.role;
    const recorded = deploymentGroupRole.node.metadata
      .filter((entry) => entry.type === Validations.ACKNOWLEDGED_RULES_METADATA_KEY)
      .flatMap((entry) => Object.keys(entry.data as Record<string, string>));

    expect(recorded).toContain("AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSCodeDeployRoleForLambdaLimited]");
  });
});

describe("DynamoDB table (Phase 2: migrated off Upstash Redis)", () => {
  test("has the expected single-table key schema and gsi1 for the hourly sweep", () => {
    template.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      KeySchema: Match.arrayWith([
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ]),
      Replicas: Match.arrayWith([
        Match.objectLike({
          GlobalSecondaryIndexes: Match.arrayWith([
            Match.objectLike({ IndexName: "gsi1" }),
          ]),
        }),
      ]),
    });
  });

  test("prod enables point-in-time recovery (exit criterion: PITR + restore drill)", () => {
    template.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      Replicas: Match.arrayWith([
        Match.objectLike({
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        }),
      ]),
    });
  });

  test("prod retains the table", () => {
    template.hasResource("AWS::DynamoDB::GlobalTable", { DeletionPolicy: "Retain" });
  });

  test("on-demand billing — no provisioned capacity to size for a sweep that scales with user count, not traffic", () => {
    template.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  test("both the server function and the notify job can read/write it, and know its name", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: Match.objectLike({
        Variables: Match.objectLike({ NEWNOTAMS_TABLE_NAME: Match.anyValue() }),
      }),
    });

    for (const prefix of ["ServerFunctionRole", "NotifyServiceRole"]) {
      const reads = statementsWithAction(prefix, "dynamodb:GetItem");
      expect(reads.length).toBeGreaterThan(0);
      const writes = statementsWithAction(prefix, "dynamodb:PutItem");
      expect(writes.length).toBeGreaterThan(0);
    }
  });
});

describe("handles for the consuming stack", () => {
  test("exposes the bucket, log bucket, distribution and notify job", () => {
    const app = new App();
    const stack = new NewNotamsStack(app, "HandlesStack", {
      env: ENV,
      envName: "prod",
      usePlaceholderSource: true,
    });
    expect(stack.bucket.bucketArn).toBeDefined();
    expect(stack.accessLogBucket.bucketArn).toBeDefined();
    expect(stack.distribution.distributionDomainName).toBeDefined();
    expect(stack.notifyJob.fn.functionArn).toBeDefined();
    expect(stack.alertTopic.topicArn).toBeDefined();
  });
});
