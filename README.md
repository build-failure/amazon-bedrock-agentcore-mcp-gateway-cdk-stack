# Amazon Bedrock AgentCore MCP Gateway CDK Stack with Multiple Integration Targets

A CDK stack that creates an Amazon Bedrock AgentCore MCP gateway with Cognito authentication and support for multiple integration targets, including JIRA.

## Architecture

- **Bedrock AgentCore MCP Gateway**: MCP interface for multiple integration targets
- **Amazon Cognito**: Authentication for the MCP gateway
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
    "exceptionLevel": "DEBUG"
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

### Adding New Integration Targets

To add a new integration target, add a new entry to the `integrationTargets` array in your `config.json` file:

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

## Deployment

1. Bootstrap your AWS environment: `cdk bootstrap`
2. Deploy the stack: `cdk deploy`
3. Create a Cognito user and set a permanent password

## Using the MCP Gateway

1. Obtain an access token using the client credentials flow
2. Include the token in your MCP client requests
3. Connect to the MCP Gateway URL
4. Use the configured integration targets to interact with external services

## Useful Commands

* `npm run build` - compile typescript to js
* `npm run watch` - watch for changes and compile
* `npm run test` - perform the jest unit tests
* `npx cdk deploy` - deploy this stack
* `npx cdk diff` - compare deployed stack with current state
* `npx cdk synth` - emit the synthesized CloudFormation template
