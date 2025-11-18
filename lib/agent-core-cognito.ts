import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface TokenValiditySettings {
  readonly accessToken?: cdk.Duration;
  readonly refreshToken?: cdk.Duration;
  readonly idToken?: cdk.Duration;
}

export interface JwtAuthorizerConfig {
  readonly discoveryUrl: string;
  readonly allowedClients: string[];
}

export interface ResourceServerConfig {
  readonly identifier: string;
  readonly name?: string;
}

export interface AgentCoreCognitoUserPoolProps {
  readonly userPoolName?: string;
  readonly clientName?: string;
  /**
   * Token validity settings.
   *
   * @default - 1 hour access token, 30 days refresh token
   */
  readonly tokenValidity?: TokenValiditySettings;
  /**
   * Whether to enable self sign-up for user management.
   * Note: This construct is optimized for machine-to-machine authentication.
   *
   * @default false
   */
  readonly enableSelfSignUp?: boolean;
}

export class AgentCoreCognitoUserPool extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly discoveryUrl: string;
  public readonly clientId: string;
  public readonly agentCoreResourceServer: cdk.aws_cognito.UserPoolResourceServer;

  constructor(scope: Construct, id: string, props: AgentCoreCognitoUserPoolProps = {}) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;

    // Create User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: props.userPoolName,
      selfSignUpEnabled: props.enableSelfSignUp ?? false,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.PLUS,
      standardThreatProtectionMode: cognito.StandardThreatProtectionMode.FULL_FUNCTION,

      // Enable MFA for enhanced security
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
    });

    // Create User Pool Domain for hosted UI
    const stackName = cdk.Stack.of(this).stackName;
    const account = cdk.Stack.of(this).account;

    // Create a hash-based domain prefix that's globally unique and persistent
    const hashInput = `${stackName}-${account}-${region}`;
    const hash = require('crypto')
      .createHash('sha256')
      .update(hashInput)
      .digest('hex')
      .substring(0, 8);
    const domainPrefix = `${stackName}-agent-gateway-${hash}`;

    this.userPoolDomain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: domainPrefix,
      },
    });

    const readOnlyScope = new cognito.ResourceServerScope({
      scopeName: 'read',
      scopeDescription: 'Read access',
    });
    const writeScope = new cognito.ResourceServerScope({
      scopeName: 'write',
      scopeDescription: 'Write access',
    });
    // Create default resource server for the gateway

    this.agentCoreResourceServer = this.userPool.addResourceServer('GatewayResourceServer', {
      identifier: 'gateway-resource-server',
      scopes: [readOnlyScope, writeScope],
    });

    // Create User Pool Client for machine-to-machine authentication only
    this.userPoolClient = this.userPool.addClient('GatewayClient', {
      userPoolClientName: props.clientName,
      generateSecret: true, // Required for client_credentials flow
      authFlows: {
        // Disable all user-based auth flows for machine-to-machine only
        userPassword: false,
        userSrp: false,
        custom: false,
        adminUserPassword: false,
      },
      oAuth: {
        flows: {
          // Only allow client_credentials for machine-to-machine
          authorizationCodeGrant: false,
          implicitCodeGrant: false,
          clientCredentials: true,
        },
        // Scopes will be set after resource server creation
        scopes: [
          cognito.OAuthScope.resourceServer(this.agentCoreResourceServer, readOnlyScope),
          cognito.OAuthScope.resourceServer(this.agentCoreResourceServer, writeScope),
        ],
      },
      accessTokenValidity: props.tokenValidity?.accessToken ?? cdk.Duration.hours(1),
      refreshTokenValidity: props.tokenValidity?.refreshToken ?? cdk.Duration.days(30),
      idTokenValidity: props.tokenValidity?.idToken ?? cdk.Duration.hours(1),
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // Set up discovery URL for AgentCore Gateway
    this.discoveryUrl = `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}/.well-known/openid-configuration`;
    this.clientId = this.userPoolClient.userPoolClientId;

    // Output important values
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'UserPoolDomainUrl', {
      value: `https://${this.userPoolDomain.domainName}.auth.${region}.amazoncognito.com`,
      description: 'Cognito User Pool Domain URL',
    });

    new cdk.CfnOutput(this, 'DiscoveryUrl', {
      value: this.discoveryUrl,
      description: 'OpenID Connect Discovery URL for AgentCore Gateway',
    });
  }

  /**
   * Create JWT authorizer configuration for AgentCore Gateway.
   * Uses the client ID as the allowed client for machine-to-machine authentication.
   */
  public createJwtAuthorizerConfig(): JwtAuthorizerConfig {
    return {
      discoveryUrl: this.discoveryUrl,
      allowedClients: [this.clientId],
    };
  }
}
