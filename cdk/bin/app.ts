#!/usr/bin/env node
import { App, AspectPriority, Aspects, Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { accounts, synthesizerFor } from "@josephkan3/config";
import {
  LogRetentionAspect,
  NoManagedEgressAspect,
  RequiredTagsAspect,
} from "@josephkan3/constructs";
import { NewNotamsStack } from "../lib/newnotams-stack.js";

const app = new App();

/**
 * `-c sitePlaceholder=true` renders the stack without an OpenNext build on
 * disk. CI uses it for synth, cdk-nag and diff; a real deploy must not.
 * See `home-platform`'s `applications/personal-site/bin/app.ts` for the
 * original pattern this follows.
 */
const usePlaceholderSource = app.node.tryGetContext("sitePlaceholder") === "true";
const openNextOutputPath = app.node.tryGetContext("openNextOutputPath");
const repoRootPath = app.node.tryGetContext("repoRootPath");
const alertEmail = app.node.tryGetContext("alertEmail");

// The environment name drives both the resource profile and the bootstrap
// qualifier, so the two cannot drift.
const envName = "prod";

new NewNotamsStack(app, "NewNotamsStack", {
  env: { account: accounts.platform.id, region: accounts.platform.region },
  synthesizer: synthesizerFor(envName),
  description: "newnotams.net — Lambda + CloudFront via OpenNext, plus the hourly notify sweep.",
  envName,
  usePlaceholderSource,
  openNextOutputPath: typeof openNextOutputPath === "string" ? openNextOutputPath : undefined,
  repoRootPath: typeof repoRootPath === "string" ? repoRootPath : undefined,
  // "" is what an unset `vars.ALERT_EMAIL` resolves to in the deploy
  // workflow's `-c alertEmail=${{ vars.ALERT_EMAIL }}` -- treat it the same
  // as unset rather than creating a broken empty-string email subscription.
  alertEmail: typeof alertEmail === "string" && alertEmail.length > 0 ? alertEmail : undefined,
});

Aspects.of(app).add(new NoManagedEgressAspect());
Aspects.of(app).add(new RequiredTagsAspect(), { priority: AspectPriority.READONLY });
Aspects.of(app).add(new LogRetentionAspect());

// Same guardrail enforcement home-platform applies to every one of its own
// stacks — moving this stack's repo does not exempt it. cdk-nag 3.x is a
// validation plugin, not an Aspect.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
