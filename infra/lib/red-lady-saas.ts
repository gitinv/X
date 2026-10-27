import * as cdk from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class RedLadySaaS extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
    });

    // Aurora retired 16.4 for new clusters. Override with -c dbEngineVersion=16.x if needed.
    const engineVersion = String(this.node.tryGetContext("dbEngineVersion") ?? "16.8");
    const engine = rds.DatabaseClusterEngine.auroraPostgres({
      version: rds.AuroraPostgresEngineVersion.of(engineVersion, engineVersion.split(".")[0]!),
    });
    // Capacity in ACUs. Min 0 lets Aurora pause when idle (staging); production can pass -c dbMinCapacity=0.5.
    const minCapacity = Number(this.node.tryGetContext("dbMinCapacity") ?? 0);
    const maxCapacity = Number(this.node.tryGetContext("dbMaxCapacity") ?? 2);
    const autoPauseMinutes = Number(this.node.tryGetContext("dbAutoPauseMinutes") ?? 10);
    const parameterGroup = new rds.ParameterGroup(this, "ClusterParameters", {
      engine,
      parameters: { "rds.force_ssl": "1" },
    });
    const cluster = new rds.DatabaseCluster(this, "SalonData", {
      engine,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      writer: rds.ClusterInstance.serverlessV2("writer", { publiclyAccessible: true }),
      serverlessV2MinCapacity: minCapacity,
      serverlessV2MaxCapacity: maxCapacity,
      ...(minCapacity === 0 ? { serverlessV2AutoPauseDuration: cdk.Duration.minutes(autoPauseMinutes) } : {}),
      storageEncrypted: true,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      defaultDatabaseName: "redlady_platform",
      parameterGroup,
      credentials: rds.Credentials.fromGeneratedSecret("salonadmin", {
        excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
      }),
      clusterIdentifier: "redlady-saas",
    });
    cluster.connections.allowDefaultPortFrom(ec2.Peer.anyIpv4(), "Amplify compute cannot join this VPC. TLS is required.");

    const urlSecret = new secretsmanager.Secret(this, "DatabaseUrl", {
      secretName: "redlady-saas/database-url",
      description: "Full postgres URL for the platform database, including sslmode=require.",
      secretStringValue: cdk.SecretValue.unsafePlainText("pending"),
    });

    const publisher = new lambda.Function(this, "DatabaseUrlPublisher", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(30),
      environment: {
        MASTER_SECRET_ARN: cluster.secret!.secretArn,
        URL_SECRET_ARN: urlSecret.secretArn,
        DB_NAME: "redlady_platform",
      },
      code: lambda.Code.fromInline(`
const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
exports.handler = async () => {
  const client = new SecretsManagerClient({});
  const secret = await client.send(new GetSecretValueCommand({ SecretId: process.env.MASTER_SECRET_ARN }));
  const parsed = JSON.parse(secret.SecretString);
  const user = encodeURIComponent(parsed.username);
  const password = encodeURIComponent(parsed.password);
  const url = "postgresql://" + user + ":" + password + "@" + parsed.host + ":" + parsed.port + "/" + process.env.DB_NAME + "?schema=public&sslmode=require";
  await client.send(new PutSecretValueCommand({ SecretId: process.env.URL_SECRET_ARN, SecretString: url }));
  return { ok: true };
};
      `),
    });
    cluster.secret!.grantRead(publisher);
    urlSecret.grantWrite(publisher);
    const publish = new cr.AwsCustomResource(this, "PublishDatabaseUrl", {
      onCreate: {
        service: "Lambda",
        action: "invoke",
        parameters: { FunctionName: publisher.functionName, InvocationType: "RequestResponse" },
        physicalResourceId: cr.PhysicalResourceId.of("redlady-database-url"),
      },
      onUpdate: {
        service: "Lambda",
        action: "invoke",
        parameters: { FunctionName: publisher.functionName, InvocationType: "RequestResponse" },
        physicalResourceId: cr.PhysicalResourceId.of("redlady-database-url"),
      },
      installLatestAwsSdk: false,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({ actions: ["lambda:InvokeFunction"], resources: [publisher.functionArn] }),
      ]),
    });
    publish.node.addDependency(publisher);

    const photoKey = new kms.Key(this, "PhotoKey", {
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      description: "Service photo encryption for Red Lady Spa",
    });
    const photos = new s3.Bucket(this, "ServicePhotos", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: photoKey,
      bucketKeyEnabled: true,
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.governance(cdk.Duration.days(365 * 3)),
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Phones upload straight to S3 with a presigned PUT, so the app's sites need CORS.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: (this.node.tryGetContext("photoCorsOrigins") as string | undefined)?.split(",") ?? [
            "https://staging.redladyspa.com",
            "https://app.redladyspa.com",
            "https://*.redladyspa.com",
            "http://localhost:3000",
          ],
          allowedHeaders: ["content-type", "x-amz-checksum-sha256"],
          maxAge: 3000,
        },
      ],
    });

    const amplifyRole = new iam.Role(this, "AmplifyServiceRole", {
      assumedBy: new iam.ServicePrincipal("amplify.amazonaws.com"),
      description: "Service and SSR role for a new Amplify app. Do not attach this to d3axxvf73krhuf.",
    });
    photos.grantRead(amplifyRole);
    photos.grantPut(amplifyRole);
    photoKey.grantEncryptDecrypt(amplifyRole);
    urlSecret.grantRead(amplifyRole);
    cluster.secret!.grantRead(amplifyRole);
    amplifyRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:salon/tenants/*`],
      }),
    );
    amplifyRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["rds-db:connect"],
        resources: [`arn:aws:rds-db:${this.region}:${this.account}:dbuser:${cluster.clusterResourceIdentifier}/*`],
      }),
    );

    // Lets Amplify write the server (SSR) logs to CloudWatch under /aws/amplify/<app id>.
    // Same shape as the AWS-managed AmplifySSRLoggingPolicy.
    amplifyRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogGroup"],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/amplify/*`],
      }),
    );
    amplifyRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/amplify/*:log-stream:*`],
      }),
    );
    amplifyRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:DescribeLogGroups"],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:*`],
      }),
    );

    const providerArn = this.node.tryGetContext("githubOidcProviderArn") as string | undefined;
    const provider = providerArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, "GitHubOidc", providerArn)
      : new iam.OpenIdConnectProvider(this, "GitHubOidc", {
          url: "https://token.actions.githubusercontent.com",
          clientIds: ["sts.amazonaws.com"],
        });
    const deployRole = new iam.Role(this, "GitHubDeployRole", {
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        StringLike: {
          "token.actions.githubusercontent.com:sub": ["repo:gitinv/X:ref:refs/heads/main", "repo:gitinv/X:ref:refs/heads/staging"],
        },
      }),
      description: "GitHub Actions for gitinv/X main and staging. Do not use this on the existing marketing Amplify app.",
    });
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: [amplifyRole.roleArn] }));
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["amplify:StartJob", "amplify:CreateDeployment", "amplify:GetJob", "amplify:GetApp", "amplify:GetBranch", "amplify:ListJobs"],
        resources: [`arn:aws:amplify:${this.region}:${this.account}:apps/*`],
      }),
    );

    new cdk.CfnOutput(this, "DatabaseUrlSecretArn", { value: urlSecret.secretArn });
    new cdk.CfnOutput(this, "ClusterEndpoint", { value: cluster.clusterEndpoint.hostname });
    new cdk.CfnOutput(this, "PhotoBucketName", { value: photos.bucketName });
    new cdk.CfnOutput(this, "AmplifyServiceRoleArn", { value: amplifyRole.roleArn });
    new cdk.CfnOutput(this, "GitHubDeployRoleArn", { value: deployRole.roleArn });
  }
}
