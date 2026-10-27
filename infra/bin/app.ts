#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { RedLadySaaS } from "../lib/red-lady-saas";

const app = new cdk.App();

new RedLadySaaS(app, "RedLadySaaS", {
  env: { account: "225344348142", region: "us-east-1" },
  description: "Red Lady Spa salon data, service photos, and a GitHub deploy role. Does not change the existing marketing site.",
});
