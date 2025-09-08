import { MCPServer } from '../server.js';
import { createClaudeFlowTools, ClaudeFlowToolContext } from '../claude-flow-tools.js';
import { logger } from '../../core/logger.js';
import { EventBus } from '../../core/event-bus.js';

const config = {
  transport: 'http' as const,
  host: 'localhost',
  port: 3001,
  tlsEnabled: false,
};

async function startClaudeFlowBackend() {
  const eventBus = EventBus.create(); // Assuming a static create method exists for EventBus
  const server = new MCPServer(config, eventBus, logger);

  // Register claude-flow tools
  const tools = await createClaudeFlowTools(logger);
  for (const tool of tools) {
    const originalHandler = tool.handler;
    tool.handler = async (input: unknown, context?: ClaudeFlowToolContext) => {
      // For the backend server, we don't have orchestrator, so use a basic context
      const backendContext: ClaudeFlowToolContext = {
        ...context,
        // Add any backend-specific context if needed
      } as ClaudeFlowToolContext;
      return await originalHandler(input, backendContext);
    };
    server.registerTool(tool);
  }

  await server.start();
  console.log('Claude-Flow backend MCP server started on port 3001');
  return server;
}

// Export for use in main app or separate process
export { startClaudeFlowBackend };