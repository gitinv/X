import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

/**
 * Documented alternative to Amplify. RedLadySaaS does not construct this.
 * Tasks run in public subnets with a public IP. The database is not open to the internet.
 * The database security group allows only the task security group, so there is no NAT gateway.
 */
export class FargateAlternative extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC }],
    });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    const database = new rds.DatabaseInstance(this, "Database", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: false,
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromGeneratedSecret("salonadmin"),
      databaseName: "redlady_platform",
      deletionProtection: true,
    });
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Web", {
      cluster,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      desiredCount: 1,
      cpu: 512,
      memoryLimitMiB: 1024,
      taskImageOptions: { image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/node:20-bookworm") },
    });
    database.connections.allowDefaultPortFrom(service.service, "Fargate tasks only");
  }
}
