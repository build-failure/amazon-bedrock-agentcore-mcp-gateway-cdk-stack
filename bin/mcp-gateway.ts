#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { McpGatewayStack } from '../lib/mcp-gateway-stack';

// Load configuration from config.json file
const configPath = path.resolve(process.cwd(), 'config.json');
let config: any = {};

if (fs.existsSync(configPath)) {
  console.log(`Loading configuration from ${configPath}`);
  const configContent = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configContent);
} else {
  console.log('No config.json file found, using default configuration');
}

// Get gateway configuration from config file or use defaults
const gatewayConfig = config.gateway || {};
const gatewayName = gatewayConfig.name || 'McpGateway';
const gatewayDescription = gatewayConfig.description || 'MCP Gateway';
const enableSemanticSearch = gatewayConfig.enableSemanticSearch || false;
const exceptionLevel = gatewayConfig.exceptionLevel === 'DEBUG' ? 'DEBUG' : undefined;

// Get AWS configuration
const awsConfig = config.aws || {};

// Get integration targets configuration
const integrationTargets = config.integrationTargets || [];

// Create the CDK app
const app = new cdk.App();

// Create the MCP Gateway stack with a new name to avoid conflicts
new McpGatewayStack(app, 'McpGatewayStackV4', {
  // Stack configuration
  gatewayName,
  gatewayDescription,
  enableSemanticSearch,
  exceptionLevel,
  
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
