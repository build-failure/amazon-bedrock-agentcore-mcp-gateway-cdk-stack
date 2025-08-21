import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as custom from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface CustomJWTAuthorizerConfig {
  readonly discoveryUrl: string;
  readonly allowedAudience?: string[];
  readonly allowedClients?: string[];
}

export interface AgentCoreGatewayProps {
  readonly gatewayName?: string;
  readonly description?: string;
  readonly executionRole: iam.Role;
  /**
   * JWT authorizer configuration for inbound authentication.
   * Must provide either allowedAudience or allowedClients.
   */
  readonly jwtAuthorizer: CustomJWTAuthorizerConfig;
  /**
   * Enable semantic search for intelligent tool discovery.
   * Can only be set during creation, not updated later.
   *
   * @default false
   */
  readonly enableSemanticSearch?: boolean;
  /**
   * Exception verbosity level. Use DEBUG for granular exception messages.
   *
   * @default - sanitized messages for end users
   */
  readonly exceptionLevel?: 'DEBUG';
  /**
   * KMS key ARN for encrypting gateway data.
   *
   * @default - AWS managed encryption
   */
  readonly kmsKeyArn?: string;
  /**
   * The instructions for using the Model Context Protocol gateway. These instructions provide guidance on how to interact with the gateway.
   *
   * @default - no instructions provided
   */
  readonly instructions?: string;
}

export class AgentCoreGateway extends Construct {
  public readonly gatewayId: string;
  public readonly gatewayArn: string;
  public readonly gatewayUrl: string;

  constructor(scope: Construct, id: string, props: AgentCoreGatewayProps) {
    super(scope, id);

    // Region and account ID are not needed since we use props.jwtAuthorizer

    // Build protocol configuration
    const protocolConfiguration: any = {
      mcp: {
        supportedVersions: ['2025-03-26'],
      },
    };

    if (props.enableSemanticSearch) {
      protocolConfiguration.mcp.searchType = 'SEMANTIC';
    }
    if (props.instructions) {
      protocolConfiguration.mcp.instructions = props.instructions;
    }

    const gatewayName =
      props.gatewayName ??
      cdk.Names.uniqueResourceName(this, {
        maxLength: 100,
        separator: '-',
        allowedSpecialCharacters: '',
      });
    const gateway = new custom.AwsCustomResource(this, 'Gateway', {
      onCreate: {
        service: 'bedrock-agentcore-control',
        action: 'CreateGateway',
        parameters: {
          name: gatewayName,
          description: props.description,
          protocolType: 'MCP',
          protocolConfiguration,
          roleArn: props.executionRole.roleArn,
          authorizerType: 'CUSTOM_JWT',
          authorizerConfiguration: {
            customJWTAuthorizer: {
              discoveryUrl: props.jwtAuthorizer.discoveryUrl,
              allowedAudience: props.jwtAuthorizer.allowedAudience,
              allowedClients: props.jwtAuthorizer.allowedClients,
            },
          },
          exceptionLevel: props.exceptionLevel,
          kmsKeyArn: props.kmsKeyArn,
        },
        physicalResourceId: custom.PhysicalResourceId.fromResponse('gatewayId'),
      },
      onUpdate: {
        service: 'bedrock-agentcore-control',
        action: 'UpdateGateway',
        parameters: {
          gatewayIdentifier: new custom.PhysicalResourceIdReference(),
          name: gatewayName,
          description: props.description,
          protocolType: 'MCP',
          protocolConfiguration,
          roleArn: props.executionRole.roleArn,
          authorizerType: 'CUSTOM_JWT',
          authorizerConfiguration: {
            customJWTAuthorizer: {
              discoveryUrl: props.jwtAuthorizer.discoveryUrl,
              allowedAudience: props.jwtAuthorizer.allowedAudience,
              allowedClients: props.jwtAuthorizer.allowedClients,
            },
          },
          exceptionLevel: props.exceptionLevel,
          kmsKeyArn: props.kmsKeyArn,
        },
        physicalResourceId: custom.PhysicalResourceId.fromResponse('gatewayId'),
      },
      onDelete: {
        service: 'bedrock-agentcore-control',
        action: 'DeleteGateway',
        parameters: {
          gatewayIdentifier: new custom.PhysicalResourceIdReference(),
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'bedrock-agentcore:CreateGateway',
            'bedrock-agentcore:UpdateGateway',
            'bedrock-agentcore:DeleteGateway',
            'bedrock-agentcore:GetGateway',
            'bedrock-agentcore:*',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [props.executionRole.roleArn],
        }),
      ]),
      installLatestAwsSdk: true,
    });

    // Add dependency to ensure role is created first
    gateway.node.addDependency(props.executionRole);

    this.gatewayId = gateway.getResponseField('gatewayId');
    this.gatewayArn = gateway.getResponseField('gatewayArn');
    this.gatewayUrl = gateway.getResponseField('gatewayUrl');
  }
}

export interface S3SchemaLocation {
  readonly uri: string;
  readonly bucketOwnerAccountId?: string;
}

export interface ToolSchema {
  readonly s3?: S3SchemaLocation;
  readonly inlinePayload?: string;
}

export interface LambdaTargetConfiguration {
  readonly lambdaArn: string;
  readonly toolSchema: ToolSchema;
}

export interface OpenApiTargetConfiguration {
  readonly openApiSchema: ToolSchema;
}

export interface SmithyTargetConfiguration {
  readonly smithyModel: ToolSchema;
}

export interface ApiKeyCredentialProvider {
  readonly providerArn: string;
  readonly credentialLocation: 'HEADER' | 'QUERY';
  readonly credentialParameterName: string;
  readonly credentialPrefix?: string;
}

export interface OAuth2CredentialProvider {
  readonly providerArn: string;
}

export interface CredentialProvider {
  readonly apiKeyCredentialProvider?: ApiKeyCredentialProvider;
  readonly oauth2CredentialProvider?: OAuth2CredentialProvider;
}

export interface CredentialProviderConfiguration {
  readonly credentialProviderType: 'GATEWAY_IAM_ROLE' | 'API_KEY' | 'OAUTH2';
  readonly credentialProvider?: CredentialProvider;
}

// JSII-compatible target configuration - use specific types
export interface LambdaTargetConfig {
  readonly lambdaTarget: LambdaTargetConfiguration;
}

export interface OpenApiTargetConfig {
  readonly openApiSchema: OpenApiTargetConfiguration;
}

export interface SmithyTargetConfig {
  readonly smithyModel: SmithyTargetConfiguration;
}

export interface AgentCoreGatewayTargetProps {
  readonly gateway: AgentCoreGateway;
  readonly targetName: string;
  readonly description?: string;
  readonly targetConfiguration: LambdaTargetConfig | OpenApiTargetConfig | SmithyTargetConfig;
  readonly credentialProviderConfigurations: CredentialProviderConfiguration[];
  readonly toolSchemaBucket?: s3.IBucket;
}

export class AgentCoreGatewayTarget extends Construct {
  public readonly targetId: string;
  public readonly gatewayArn: string;

  constructor(scope: Construct, id: string, props: AgentCoreGatewayTargetProps) {
    super(scope, id);

    // Convert target configuration to the format expected by the API
    // The target configuration needs to be wrapped in an 'mcp' object
    let innerConfig: any = {};
    if ('lambdaTarget' in props.targetConfiguration) {
      innerConfig.lambda = props.targetConfiguration.lambdaTarget;
    } else if ('openApiSchema' in props.targetConfiguration) {
      innerConfig.openApiSchema = props.targetConfiguration.openApiSchema;
    } else if ('smithyModel' in props.targetConfiguration) {
      innerConfig.smithyModel = props.targetConfiguration.smithyModel;
    }

    const targetConfig = {
      mcp: innerConfig,
    };

    const target = new custom.AwsCustomResource(this, 'Target', {
      onCreate: {
        service: 'bedrock-agentcore-control',
        action: 'CreateGatewayTarget',
        parameters: {
          gatewayIdentifier: props.gateway.gatewayId,
          name: props.targetName,
          description: props.description,
          targetConfiguration: targetConfig,
          credentialProviderConfigurations: props.credentialProviderConfigurations,
        },
        physicalResourceId: custom.PhysicalResourceId.fromResponse('targetId'),
      },
      onUpdate: {
        service: 'bedrock-agentcore-control',
        action: 'UpdateGatewayTarget',
        parameters: {
          gatewayIdentifier: props.gateway.gatewayId,
          targetId: new custom.PhysicalResourceIdReference(),
          name: props.targetName,
          description: props.description,
          targetConfiguration: targetConfig,
          credentialProviderConfigurations: props.credentialProviderConfigurations,
        },
        physicalResourceId: custom.PhysicalResourceId.fromResponse('targetId'),
      },
      onDelete: {
        service: 'bedrock-agentcore-control',
        action: 'DeleteGatewayTarget',
        parameters: {
          gatewayIdentifier: props.gateway.gatewayId,
          targetId: new custom.PhysicalResourceIdReference(),
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'bedrock-agentcore:CreateGatewayTarget',
            'bedrock-agentcore:UpdateGatewayTarget',
            'bedrock-agentcore:DeleteGatewayTarget',
            'bedrock-agentcore:GetGatewayTarget',
            'bedrock-agentcore:*',
          ],
          resources: ['*'],
        }),
      ]),
      installLatestAwsSdk: true,
    });

    // Add dependency to ensure gateway is created first
    target.node.addDependency(props.gateway);

    // Grant S3 read access to the custom resource Lambda if a tool schema bucket is provided
    if (props.toolSchemaBucket) {
      props.toolSchemaBucket.grantRead(target);
    }

    this.targetId = target.getResponseField('targetId');
    this.gatewayArn = target.getResponseField('gatewayArn');
  }
}

/**
 * Creates a standard execution role for AgentCore Gateway with Lambda target permissions.
 */
export interface AgentCoreGatewayExecutionRoleProps {
  readonly roleName?: string;
  readonly lambdaFunctionArns?: string[];
  readonly s3BucketArns?: string[];
  /**
   * Enable semantic search permissions.
   * Required if the gateway uses semantic search.
   *
   * @default false
   */
  readonly enableSemanticSearch?: boolean;
}

export class AgentCoreGatewayExecutionRole extends iam.Role {
  constructor(scope: Construct, id: string, props: AgentCoreGatewayExecutionRoleProps = {}) {
    const region = cdk.Stack.of(scope).region;
    const accountId = cdk.Stack.of(scope).account;

    const policyStatements: iam.PolicyStatement[] = [
      // Basic AgentCore permissions
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:DescribeLogStreams',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [
          `arn:aws:logs:${region}:${accountId}:log-group:/aws/bedrock-agentcore/gateways/*`,
          `arn:aws:logs:${region}:${accountId}:log-group:/aws/bedrock-agentcore/gateways/*:log-stream:*`,
        ],
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${region}:${accountId}:log-group:*`],
      }),
      // X-Ray tracing
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      }),
      // CloudWatch metrics
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'bedrock-agentcore',
          },
        },
      }),
    ];

    // Lambda invocation permissions
    if (props.lambdaFunctionArns && props.lambdaFunctionArns.length > 0) {
      policyStatements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: props.lambdaFunctionArns,
        })
      );
    }

    // S3 permissions for tool schemas
    if (props.s3BucketArns && props.s3BucketArns.length > 0) {
      policyStatements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: props.s3BucketArns.map((arn) => `${arn}/*`),
        })
      );
    }

    // Semantic search permissions
    if (props.enableSemanticSearch) {
      policyStatements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['bedrock-agentcore:SynchronizeGatewayTargets'],
          resources: ['*'],
        })
      );
    }

    super(scope, id, {
      roleName: props.roleName,
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      inlinePolicies: {
        AgentCoreGatewayPolicy: new iam.PolicyDocument({
          statements: policyStatements,
        }),
      },
    });
  }
}

/**
 * Properties for creating an Integration MCP server target for the MCP Gateway
 */
export interface IntegrationTargetProps {
  /**
   * The MCP Gateway to add the target to
   */
  readonly gateway: AgentCoreGateway;
  
  /**
   * The name of the target
   */
  readonly targetName?: string;
  
  /**
   * Description of the target
   */
  readonly description?: string;
  
  /**
   * The S3 URI for the OpenAPI schema
   */
  readonly openApiSchemaS3Uri: string;
  
  /**
   * The API key
   */
  readonly apiKey?: string;
  
  /**
   * Authentication configuration
   */
  readonly auth?: {
    /**
     * The parameter name for the authentication header
     * @default 'Authorization'
     */
    readonly parameterName?: string;
    
    /**
     * The prefix for the authentication value
     * @default 'Basic'
     */
    readonly prefix?: string;
  };
}

/**
 * A high-level construct for creating an Integration MCP server target for the MCP Gateway
 */
export class IntegrationTarget extends Construct {
  /**
   * The underlying AgentCoreGatewayTarget
   */
  public readonly target: AgentCoreGatewayTarget;
  
  constructor(scope: Construct, id: string, props: IntegrationTargetProps) {
    super(scope, id);
    
    // Create the target configuration as a raw object to match the expected structure
    const targetConfig = {
      openApiSchema: {
        s3: {
          uri: props.openApiSchemaS3Uri
        }
      }
    };
    
    // Generate a deterministic ID based on the target name
    // This ensures the same ID is generated across deployments
    // Use the target name or a default value to ensure consistency
    const targetNameBase = props.targetName || 'integration';
    const fixedString = `${targetNameBase}-target-id`;
    // Create a simple hash from the fixed string
    const hash = require('crypto')
      .createHash('sha256')
      .update(fixedString)
      .digest('hex')
      .substring(0, 10)
      .toUpperCase();
    const uniqueId = hash;
    
    // Create a secret in AWS Secrets Manager to store the API key
    const secret = new secretsmanager.Secret(this, `${targetNameBase}ApiKeySecret`, {
      secretName: `${targetNameBase.toLowerCase()}-api-key-${uniqueId}1`,
      description: `API key for ${targetNameBase} integration`,
      secretStringValue: cdk.SecretValue.unsafePlainText(props.apiKey || 'dummy-api-key'),
    });
    
    // Get auth configuration with defaults
    const authConfig = props.auth || {};
    const parameterName = authConfig.parameterName || 'Authorization';
    const prefix = authConfig.prefix || 'Basic';

    // Create the API key credential provider using AWS CDK's AwsCustomResource
    const apiKeyCredentialProvider = new custom.AwsCustomResource(this, `${targetNameBase}ApiKeyCredentialProvider`, {
      onCreate: {
        service: 'bedrock-agentcore-control',
        action: 'createApiKeyCredentialProvider',
        parameters: {
          name: `${targetNameBase.toLowerCase()}_api_key_${uniqueId}`,
          description: `API key credential provider for ${targetNameBase} integration`,
          apiKey: props.apiKey || 'dummy-api-key',
        },
        physicalResourceId: custom.PhysicalResourceId.fromResponse('name'),
      },
  onDelete: {
    service: 'bedrock-agentcore-control',
    action: 'deleteApiKeyCredentialProvider',
    parameters: {
      name: new custom.PhysicalResourceIdReference(),
    },
  },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
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
        }),
      ]),
      installLatestAwsSdk: true,
    });
    
    // Use a hardcoded ARN format for the provider ARN
    // This is a workaround for the API key credential provider issue
    const providerArn = `arn:aws:bedrock-agentcore:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:token-vault/default/apikeycredentialprovider/${targetNameBase.toLowerCase()}_api_key_${uniqueId}`;
    
    // Extract bucket name from S3 URI for permissions
    const s3UriMatch = props.openApiSchemaS3Uri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!s3UriMatch) {
      throw new Error(`Invalid S3 URI format: ${props.openApiSchemaS3Uri}`);
    }
    const bucketName = s3UriMatch[1];
    const objectKey = s3UriMatch[2];

    // Create the target with MCP target configuration
    this.target = new AgentCoreGatewayTarget(this, `Target-${uniqueId}`, {
      gateway: props.gateway,
      // Always include the uniqueId in the target name to ensure it's unique across deployments
      targetName: `${targetNameBase}-${uniqueId}`,
      description: props.description || `${targetNameBase} MCP Server`,
      targetConfiguration: targetConfig as any,
      credentialProviderConfigurations: [
        {
          credentialProviderType: 'API_KEY',
          credentialProvider: {
            apiKeyCredentialProvider: {
              providerArn: providerArn,
              credentialLocation: 'HEADER',
              credentialParameterName: parameterName,
              credentialPrefix: prefix
            }
          }
        }
      ],
      // Pass the S3 bucket reference for permissions
      toolSchemaBucket: s3.Bucket.fromBucketName(this, `SchemaBucket-${uniqueId}`, bucketName),
    });
    
    // Add dependencies to ensure resources are created in the right order
    this.target.node.addDependency(secret);
    this.target.node.addDependency(apiKeyCredentialProvider);
  }
}
