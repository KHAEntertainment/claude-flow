import { agentLoader } from '../../src/agents/agent-loader.js';
import { performance } from 'node:perf_hooks';

describe('AgentLoader performance', () => {
  const agentName = 'researcher';

  beforeEach(async () => {
    await agentLoader.refresh();
  });

  test('lazy getAgent uses less memory than preloading all', async () => {
    const beforeSingle = process.memoryUsage().heapUsed;
    await agentLoader.getAgent(agentName);
    const afterSingle = process.memoryUsage().heapUsed;
    const singleDelta = afterSingle - beforeSingle;

    await agentLoader.refresh();
    const beforeAll = process.memoryUsage().heapUsed;
    await agentLoader.preloadAgents();
    const afterAll = process.memoryUsage().heapUsed;
    const allDelta = afterAll - beforeAll;

    expect(singleDelta).toBeLessThan(allDelta);
  });

  test('loading single agent is faster than preloading all', async () => {
    let start = performance.now();
    await agentLoader.getAgent(agentName);
    const singleTime = performance.now() - start;

    await agentLoader.refresh();
    start = performance.now();
    await agentLoader.preloadAgents();
    const allTime = performance.now() - start;

    expect(singleTime).toBeLessThan(allTime);
  });
});
