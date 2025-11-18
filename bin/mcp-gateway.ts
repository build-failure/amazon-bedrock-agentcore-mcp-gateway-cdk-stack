#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { McpGatewayStack } from '../lib/mcp-gateway-stack';

// Load configuration from config.json file or from CDK_CONFIG environment variable if set
const defaultConfigPath = path.resolve(process.cwd(), 'config.json');
const configPath = process.env.CDK_CONFIG ? path.resolve(process.env.CDK_CONFIG) : defaultConfigPath;
let config: any = {};

if (fs.existsSync(configPath)) {
  console.log(`Loading configuration from ${configPath}`);
  const configContent = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configContent);
} else {
  console.log(`No config file found at ${configPath}, using default configuration`);
}

// Get stack name from config file or use default
const stackName = config.stackName || 'McpGatewayStackV4';

// Get gateway configuration from config file or use defaults
const gatewayConfig = config.gateway || {};
const gatewayName = gatewayConfig.name || 'McpGateway';
const gatewayDescription = gatewayConfig.description || 'MCP Gateway';
const enableSemanticSearch = gatewayConfig.enableSemanticSearch || false;
const exceptionLevel = gatewayConfig.exceptionLevel === 'DEBUG' ? 'DEBUG' : undefined;
const authenticationType = gatewayConfig.authenticationType === 'IAM' ? 'IAM' : 'JWT';
const agentCoreSchemasBucket = gatewayConfig.agentCoreSchemasBucket;

// Get AWS configuration
const awsConfig = config.aws || {};

// Get integration targets configuration
const integrationTargets = config.integrationTargets || [];

// Create the CDK app
const app = new cdk.App();

// Create the MCP Gateway stack with the name from config
new McpGatewayStack(app, stackName, {
  // Stack configuration
  gatewayName,
  gatewayDescription,
  enableSemanticSearch,
  exceptionLevel,
  authenticationType,
  agentCoreSchemasBucket,
  
  // Integration targets configuration
  integrationTargets,
  
  // AWS environment configuration
  env: { 
    account: awsConfig.account || process.env.CDK_DEFAULT_ACCOUNT, 
    region: awsConfig.region || process.env.CDK_DEFAULT_REGION || 'us-east-1' 
  },
  
  // Stack description
  description: 'Amazon Bedrock AgentCore MCP Gateway with multiple integration targets',
});
