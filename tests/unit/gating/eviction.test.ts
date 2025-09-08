import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ToolGateController } from '../../../src/gating/toolset-registry.js';
import type { MCPTool } from '../../../src/utils/types.js';

describe('TTL/LRU Eviction', () => {
  let controller: ToolGateController;
  let mockTools: Record<string, MCPTool>;

  beforeEach(() => {
    // Create mock tools
    mockTools = {
      'test-tool': {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ result: 'test' })
      }
    };

    // Create mock loaders
    const loaders = {
      toolset1: async () => ({ ...mockTools }),
      toolset2: async () => ({ 'tool2': { ...mockTools['test-tool'], name: 'tool2' } }),
      toolset3: async () => ({ 'tool3': { ...mockTools['test-tool'], name: 'tool3' } }),
      toolset4: async () => ({ 'tool4': { ...mockTools['test-tool'], name: 'tool4' } })
    };

    // Create controller with short TTL for testing
    controller = new ToolGateController(loaders, {
      taskType: { enabled: false, map: {} },
      resource: { enabled: false, maxTools: 10 },
      security: { enabled: false, blocked: [] },
      autoDisableTtlMs: 1000, // 1 second for testing
      maxActiveToolsets: 3 // Cap at 3 for testing
    } as any);
  });

  describe('TTL Expiration', () => {
    it('should disable toolsets after TTL expires', async () => {
      // Enable a toolset
      await controller.enableToolset('toolset1');
      expect(controller.listActiveTools()).toContain('test-tool');

      // Mark as used
      controller.markUsed('test-tool');

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Sweep expired toolsets
      const disabled = controller.sweepExpiredToolsets();
      expect(disabled).toContain('toolset1');
      expect(controller.listActiveTools()).not.toContain('test-tool');
    });

    it('should not disable pinned toolsets after TTL', async () => {
      // Enable and pin a toolset
      await controller.enableToolset('toolset1');
      controller.pinToolset('toolset1');

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Sweep expired toolsets
      const disabled = controller.sweepExpiredToolsets();
      expect(disabled).not.toContain('toolset1');
      expect(controller.listActiveTools()).toContain('test-tool');
    });

    it('should update last used time when tool is called', async () => {
      await controller.enableToolset('toolset1');
      
      // Wait half the TTL
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Mark as used (refreshes TTL)
      controller.markUsed('test-tool');
      
      // Wait another 600ms (would expire without refresh)
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Should still be active
      const disabled = controller.sweepExpiredToolsets();
      expect(disabled).not.toContain('toolset1');
      expect(controller.listActiveTools()).toContain('test-tool');
    });
  });

  describe('LRU Cap', () => {
    it('should evict least recently used toolsets when cap is exceeded', async () => {
      // Enable toolsets up to cap
      await controller.enableToolset('toolset1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await controller.enableToolset('toolset2');
      await new Promise(resolve => setTimeout(resolve, 10));
      await controller.enableToolset('toolset3');
      
      // All should be active
      expect(controller.listActiveTools()).toHaveLength(3);
      
      // Enable one more (exceeds cap)
      await controller.enableToolset('toolset4');
      
      // toolset1 should be evicted (oldest)
      expect(controller.listActiveTools()).toHaveLength(3);
      expect(controller.listActiveTools()).toContain('tool2');
      expect(controller.listActiveTools()).toContain('tool3');
      expect(controller.listActiveTools()).toContain('tool4');
      expect(controller.listActiveTools()).not.toContain('test-tool');
    });

    it('should not evict pinned toolsets for LRU', async () => {
      // Enable and pin first toolset
      await controller.enableToolset('toolset1');
      controller.pinToolset('toolset1');
      
      await controller.enableToolset('toolset2');
      await controller.enableToolset('toolset3');
      
      // Enable one more (exceeds cap)
      await controller.enableToolset('toolset4');
      
      // toolset2 should be evicted (oldest unpinned)
      expect(controller.listActiveTools()).toContain('test-tool'); // from pinned toolset1
      expect(controller.listActiveTools()).not.toContain('tool2'); // evicted
      expect(controller.listActiveTools()).toContain('tool3');
      expect(controller.listActiveTools()).toContain('tool4');
    });

    it('should update LRU order when tools are used', async () => {
      await controller.enableToolset('toolset1');
      await controller.enableToolset('toolset2');
      await controller.enableToolset('toolset3');
      
      // Use toolset1 to make it most recent
      controller.markUsed('test-tool');
      
      // Enable one more
      await controller.enableToolset('toolset4');
      
      // toolset2 should be evicted (now oldest)
      expect(controller.listActiveTools()).toContain('test-tool'); // recently used
      expect(controller.listActiveTools()).not.toContain('tool2'); // evicted
      expect(controller.listActiveTools()).toContain('tool3');
      expect(controller.listActiveTools()).toContain('tool4');
    });
  });

  describe('Pin/Unpin', () => {
    it('should pin and unpin toolsets', async () => {
      await controller.enableToolset('toolset1');
      
      // Pin the toolset
      controller.pinToolset('toolset1');
      expect(controller.getPinnedToolsets()).toContain('toolset1');
      
      // Unpin the toolset
      controller.unpinToolset('toolset1');
      expect(controller.getPinnedToolsets()).not.toContain('toolset1');
    });

    it('should return usage statistics', async () => {
      await controller.enableToolset('toolset1');
      controller.pinToolset('toolset1');
      await controller.enableToolset('toolset2');
      
      const stats = controller.getUsageStats();
      
      expect(stats['toolset1']).toBeDefined();
      expect(stats['toolset1'].pinned).toBe(true);
      expect(stats['toolset1'].lastUsed).toBeGreaterThan(0);
      
      expect(stats['toolset2']).toBeDefined();
      expect(stats['toolset2'].pinned).toBe(false);
      expect(stats['toolset2'].lastUsed).toBeGreaterThan(0);
    });
  });
});
