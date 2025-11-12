# Amazon Bedrock AgentCore MCP Gateway CDK Stack with Multiple Integration Targets

A CDK stack that manages an Amazon Bedrock AgentCore MCP gateway with IAM/JWT authentication and support for multiple integration targets, including JIRA and Snowflake.

## Architecture

- **Bedrock AgentCore MCP Gateway**: MCP interface for multiple integration targets
- **Authentication**: Supports JWT (with Amazon Cognito) or IAM authentication
- **IAM Role**: Permissions for the MCP gateway
- **Agent Core Constructs**: High-level CDK constructs
- **Integration Targets**: Configurable integration targets (e.g., JIRA)

## Prerequisites

- AWS CLI with appropriate credentials
- Node.js 18.x or later
- AWS CDK v2
- AWS account with access to Amazon Bedrock and Cognito
- Snowflake account with credentials

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Configure the application:
   - Create a `config.json` file in the project root (see Configuration section below)

## Configuration

The application can be configured using a `config.json` file in the project root. Here's an example configuration:

```json
{
  "gateway": {
    "name": "MyMcpGateway1",
    "description": "MCP Gateway with multiple integration targets",
    "enableSemanticSearch": false,
    "exceptionLevel": "DEBUG",
    "authenticationType": "JWT"
  },
  "integrationTargets": [
    {
      "type": "jira",
      "enabled": true,
      "config": {
        "apiKey": "your-jira-api-key",
        "baseUrl": "https://your-instance.atlassian.net",
        "auth": {
          "parameterName": "Authorization",
          "prefix": "Basic"
        }
      }
    }
    // Add more integration targets as needed
  ]
}
```

### Gateway Configuration Options

- `name`: Name of the MCP Gateway
- `description`: Description of the gateway
- `enableSemanticSearch`: Enable semantic search for tool discovery (default: false)
- `exceptionLevel`: Set to "DEBUG" for detailed error messages
- `authenticationType`: Authentication method - "JWT" (default) or "IAM"

### Integration Target Types

The stack supports two types of integration targets:

#### 1. AgentCore Built-in Integrations
Use AWS Bedrock AgentCore's pre-built OpenAPI schemas for supported services. These schemas are maintained by AWS and stored in the AgentCore sample schemas S3 bucket.

Prefix the type with `agentcore-` to use built-in integrations:

```json
{
  "gateway": {
    "name": "MyMcpGateway1",
    "agentCoreSchemasBucket": "amazonbedrockagentcore-built-sampleschemas455e0815-egpctdjskcrf"
  },
  "integrationTargets": [
    {
      "type": "agentcore-jira",
      "enabled": true,
      "config": {
        "apiKey": "your-jira-api-key"
      }
    }
  ]
}
```

**Important:** You need to specify the `agentCoreSchemasBucket` in your gateway configuration. To find your bucket name:
1. Create a JIRA integration manually in the AWS Bedrock console
2. View the target configuration to see the S3 URI
3. Extract the bucket name (e.g., `amazonbedrockagentcore-built-sampleschemas455e0815-egpctdjskcrf`)

**Note:** For JIRA, the instance URL is specified dynamically via the `customerInstanceId` parameter in each MCP request, so no `baseUrl` is needed in the configuration.

Supported AgentCore integrations:
- `agentcore-jira` - JIRA integration (uses AWS pre-built schema)
- Other integrations may be available depending on AWS's sample schemas bucket

#### 2. Custom OpenAPI Integrations
Use custom OpenAPI schemas for services not natively supported by AgentCore:

```json
{
  "type": "your-target-type",
  "enabled": true,
  "config": {
    "apiKey": "your-api-key",
    "baseUrl": "https://your-api-base-url",
    "auth": {
      "parameterName": "Authorization",
      "prefix": "Basic"
    }
  }
}
```

For custom integrations, you'll need to provide an OpenAPI schema file in the `schemas/` directory named `{type}-open-api.json`.

## Deployment

1. Bootstrap your AWS environment: `cdk bootstrap`
2. Deploy the stack: `cdk deploy`
3. Create a Cognito user and set a permanent password

## Authentication

The gateway supports two authentication types:

### JWT Authentication (Default)
Uses Amazon Cognito for JWT token-based authentication:
1. Set `"authenticationType": "JWT"` in config.json (or omit for default)
2. After deployment, create a Cognito user and set a permanent password
3. Obtain an access token using the client credentials flow
4. Include the token in your MCP client requests

### IAM Authentication
Uses AWS IAM with SigV4 signing:
1. Set `"authenticationType": "IAM"` in config.json
2. Configure your MCP client with AWS credentials
3. Requests will be authenticated using AWS SigV4 signing
4. No Cognito resources will be created

## Using the MCP Gateway

1. Authenticate using your chosen method (JWT or IAM)
2. Connect to the MCP Gateway URL
3. Use the configured integration targets to interact with external services

## Useful Commands

* `npm run build` - compile typescript to js
* `npm run watch` - watch for changes and compile
* `npm run test` - perform the jest unit tests
* `npx cdk deploy` - deploy this stack
* `npx cdk diff` - compare deployed stack with current state
* `npx cdk synth` - emit the synthesized CloudFormation template
