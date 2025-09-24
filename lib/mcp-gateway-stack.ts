import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as custom from 'aws-cdk-lib/custom-resources';
import * as fs from 'fs';
import * as path from 'path';
import { AgentCoreCognitoUserPool } from './agent-core-cognito';
import { AgentCoreGateway, AgentCoreGatewayExecutionRole, AgentCoreGatewayTarget, IntegrationTarget } from './agent-core-gateway';

export interface IntegrationTargetConfig {
  type: string;
  enabled: boolean;
  config: {
    apiKey?: string;
    baseUrl?: string;
    auth?: {
      parameterName?: string;
      prefix?: string;
    };
    [key: string]: any;
  };
}

export interface McpGatewayStackProps extends cdk.StackProps {
  gatewayName?: string;
  gatewayDescription?: string;
  enableSemanticSearch?: boolean;
  exceptionLevel?: 'DEBUG';
  // Configuration for integration targets
  integrationTargets?: IntegrationTargetConfig[];
}

export class McpGatewayStack extends cdk.Stack {
  public readonly cognitoUserPool: AgentCoreCognitoUserPool;
  public readonly gatewayExecutionRole: AgentCoreGatewayExecutionRole;
  public readonly mcpGateway: AgentCoreGateway;
  public readonly schemaBucket: s3.Bucket;
  public readonly integrationTargets: Record<string, IntegrationTarget> = {};

  constructor(scope: Construct, id: string, props?: McpGatewayStackProps) {
    super(scope, id, props);

    // Create the Cognito User Pool using the agent-core-cognito construct
    this.cognitoUserPool = new AgentCoreCognitoUserPool(this, 'McpGatewayCognito', {
      userPoolName: `McpGatewayUserPool-${this.node.addr.substring(0, 8)}`,
      clientName: `McpGatewayClient-${this.node.addr.substring(0, 8)}`,
      enableSelfSignUp: false,
      tokenValidity: {
        accessToken: cdk.Duration.hours(1),
        refreshToken: cdk.Duration.days(30),
        idToken: cdk.Duration.hours(1),
      },
    });

    // Create the execution role for the MCP Gateway using the agent-core-gateway construct
    // Generate a deterministic ID for the role name to avoid conflicts
    // Use the stack name and a fixed string to ensure the same ID is generated each time
    const roleUniqueId = require('crypto')
      .createHash('sha256')
      .update(`${this.stackName}-execution-role`)
      .digest('hex')
      .substring(0, 10)
      .toUpperCase();
    
    // Create S3 bucket for OpenAPI schemas first
    this.schemaBucket = new s3.Bucket(this, 'SchemaBucket', {
      bucketName: `mcp-gateway-schemas-${this.account}-${this.region}-v3`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Add explicit bucket policy to allow Bedrock AgentCore service access
    this.schemaBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.schemaBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
        },
      })
    );

    // Create the execution role with proper S3 bucket permissions
    this.gatewayExecutionRole = new AgentCoreGatewayExecutionRole(this, 'McpGatewayExecutionRole', {
      roleName: `McpGatewayExecRole-${roleUniqueId}`,
      enableSemanticSearch: props?.enableSemanticSearch,
      s3BucketArns: [this.schemaBucket.bucketArn],
    });

    // Add additional permissions if needed
    this.gatewayExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock-agentcore:CreateApiKeyCredentialProvider',
          'bedrock-agentcore:UpdateApiKeyCredentialProvider',
          'bedrock-agentcore:DeleteApiKeyCredentialProvider',
          'bedrock-agentcore:GetApiKeyCredentialProvider',
          'bedrock-agentcore:DeleteGateway',
          'bedrock-agentcore:DeleteTarget',
          'bedrock-agentcore:*',
          'secretsmanager:CreateSecret',
          'secretsmanager:UpdateSecret',
          'secretsmanager:DeleteSecret',
          'secretsmanager:GetSecretValue',
          'secretsmanager:PutSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: ['*'],
      })
    );

    // Create the JWT authorizer config from the Cognito user pool
    const jwtAuthorizerConfig = this.cognitoUserPool.createJwtAuthorizerConfig();

    // Create the MCP Gateway using the agent-core-gateway construct
    this.mcpGateway = new AgentCoreGateway(this, 'McpGateway', {
      gatewayName: props?.gatewayName || `McpGateway-${this.node.addr.substring(0, 8)}`,
      description: props?.gatewayDescription || 'MCP Gateway with multiple integration targets',
      executionRole: this.gatewayExecutionRole,
      jwtAuthorizer: jwtAuthorizerConfig,
      enableSemanticSearch: props?.enableSemanticSearch,
      exceptionLevel: props?.exceptionLevel,
      instructions: `
        This is an MCP Gateway with support for multiple integration targets.
      `,
    });

    // Output the MCP Gateway ID
    new cdk.CfnOutput(this, 'McpGatewayId', {
      value: this.mcpGateway.gatewayId,
      description: 'ID of the MCP Gateway',
    });

    // Output the MCP Gateway ARN
    new cdk.CfnOutput(this, 'McpGatewayArn', {
      value: this.mcpGateway.gatewayArn,
      description: 'ARN of the MCP Gateway',
    });

    // Output the MCP Gateway URL
    new cdk.CfnOutput(this, 'McpGatewayUrl', {
      value: this.mcpGateway.gatewayUrl,
      description: 'URL of the MCP Gateway',
    });

    // Output the Cognito Discovery URL
    new cdk.CfnOutput(this, 'CognitoDiscoveryUrl', {
      value: this.cognitoUserPool.discoveryUrl,
      description: 'OpenID Connect Discovery URL',
    });

    // Output the schema bucket name
    new cdk.CfnOutput(this, 'SchemaBucketName', {
      value: this.schemaBucket.bucketName,
      description: 'Name of the S3 bucket containing OpenAPI schemas',
    });
    
    // Process integration targets from configuration
    if (props?.integrationTargets && props.integrationTargets.length > 0) {
      // Create integration targets based on configuration
      props.integrationTargets.forEach((targetConfig, index) => {
        // Generate processed schema with dynamic base URL replacement
        this.generateProcessedSchema(targetConfig);
        if (targetConfig.enabled) {
          const targetId = `${targetConfig.type.charAt(0).toUpperCase() + targetConfig.type.slice(1)}Target`;
          
          // Use the IntegrationTarget construct which handles all the complexity
          const integrationTarget = new IntegrationTarget(this, targetId, {
            gateway: this.mcpGateway,
            targetName: targetConfig.type,
            description: `${targetConfig.type} REST API integration`,
            openApiSchemaS3Uri: `s3://${this.schemaBucket.bucketName}/${targetConfig.type}-open-api.json`,
            apiKey: targetConfig.config.apiKey,
            auth: targetConfig.config.auth,
          });
          
          // Store the integration target
          this.integrationTargets[targetConfig.type] = integrationTarget;
          
          // Output the integration target ID
          new cdk.CfnOutput(this, `${targetConfig.type}TargetId`, {
            value: integrationTarget.target.targetId,
            description: `ID of the ${targetConfig.type} REST API target`,
          });
        }
      });
    }
  }

  private generateProcessedSchema(targetConfig: IntegrationTargetConfig): void {
    if (!targetConfig.config.baseUrl) {
      throw new Error(`Base URL is required for ${targetConfig.type} integration target`);
    }

    // Read the template schema file
    const templatePath = path.join(__dirname, '..', 'schemas', `${targetConfig.type}-open-api.json`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Schema template not found: ${templatePath}`);
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace the placeholder with the actual base URL
    const processedContent = templateContent.replace(/\{\{BASE_URL\}\}/g, targetConfig.config.baseUrl);
    
    // Generate a deterministic 10-character alphanumeric ID for the schema processor
    const schemaProcessorId = require('crypto')
      .createHash('sha256')
      .update(`${this.stackName}-${targetConfig.type}-schema`)
      .digest('hex')
      .substring(0, 10)
      .toLowerCase();

    // Create a custom resource to upload the processed schema to S3
    const schemaProcessor = new custom.AwsCustomResource(this, `${targetConfig.type}SchemaProcessor`, {
      onCreate: {
        service: 'S3',
        action: 'putObject',
        parameters: {
          Bucket: this.schemaBucket.bucketName,
          Key: `${targetConfig.type}-open-api.json`,
          Body: processedContent,
          ContentType: 'application/json',
        },
        physicalResourceId: custom.PhysicalResourceId.of(schemaProcessorId),
      },
      onUpdate: {
        service: 'S3',
        action: 'putObject',
        parameters: {
          Bucket: this.schemaBucket.bucketName,
          Key: `${targetConfig.type}-open-api.json`,
          Body: processedContent,
          ContentType: 'application/json',
        },
        physicalResourceId: custom.PhysicalResourceId.of(schemaProcessorId),
      },
      onDelete: {
        service: 'S3',
        action: 'deleteObject',
        parameters: {
          Bucket: this.schemaBucket.bucketName,
          Key: `${targetConfig.type}-open-api.json`,
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutObject', 's3:DeleteObject'],
          resources: [`${this.schemaBucket.bucketArn}/*`],
        }),
      ]),
    });

    // Ensure the schema processor depends on the bucket
    schemaProcessor.node.addDependency(this.schemaBucket);
  }
}
