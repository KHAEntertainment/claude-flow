// NOTE: Test framework detected: jest
// These tests target the InMemoryToolRepository public API and emphasize search behavior,
// category/capability indexing, deprecation handling, and repository lifecycle methods.
import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryToolRepository } from '../../src/repositories/tool-repository.js';

describe('InMemoryToolRepository (unit)', () => {
  let repo: InMemoryToolRepository;

  beforeEach(() => {
    repo = new InMemoryToolRepository();
  });

  const makeTool = (name: string, extra: any = {}) => ({ name, ...extra });

  it('throws when adding a tool without a name', () => {
    // @ts-expect-error intentional missing name to validate runtime guard
    expect(() => repo.addTool({ categories: ['cat1'] } as any)).toThrow('Tool must have a name');
  });

  it('adds a tool and retrieves it by name', () => {
    const alpha = makeTool('alpha', { categories: ['cat1'], capabilities: ['cap1'] });
    repo.addTool(alpha);
    expect(repo.getTool('alpha')).toBe(alpha);
    expect(repo.getTotalTools()).toBe(1);
  });

  it('getAllTools returns all added tools', () => {
    const alpha = makeTool('alpha', { categories: ['cat1'], capabilities: ['cap1'] });
    const beta  = makeTool('beta',  { categories: ['cat1', 'cat2'], capabilities: ['cap1', 'cap2'], deprecated: true });
    const gamma = makeTool('gamma', { categories: ['cat2'], capabilities: ['cap3'] });
    const orphan = makeTool('orphan'); // no categories/capabilities
    [alpha, beta, gamma, orphan].forEach(t => repo.addTool(t));

    const all = repo.getAllTools();
    expect(all).toEqual(expect.arrayContaining([alpha, beta, gamma, orphan]));
    expect(repo.getTotalTools()).toBe(4);
  });

  describe('searchTools', () => {
    let alpha: any, beta: any, gamma: any, orphan: any;

    beforeEach(() => {
      alpha = makeTool('alpha', { categories: ['cat1'], capabilities: ['cap1'] });
      beta  = makeTool('beta',  { categories: ['cat1', 'cat2'], capabilities: ['cap1', 'cap2'], deprecated: true });
      gamma = makeTool('gamma', { categories: ['cat2'], capabilities: ['cap3'] });
      orphan = makeTool('orphan');
      [alpha, beta, gamma, orphan].forEach(t => repo.addTool(t));
    });

    it('returns only non-deprecated tools by default', () => {
      const res = repo.searchTools();
      expect(res).toEqual(expect.arrayContaining([alpha, gamma, orphan]));
      expect(res.find(t => t.name === 'beta')).toBeUndefined();
    });

    it('includes deprecated tools when includeDeprecated is true', () => {
      const res = repo.searchTools({ includeDeprecated: true });
      expect(res).toEqual(expect.arrayContaining([alpha, beta, gamma, orphan]));
    });

    it('filters by name substring (case-sensitive)', () => {
      const names = (opts: any) => repo.searchTools(opts).map(t => t.name).sort();
      expect(names({ name: 'a' })).toEqual(['alpha', 'gamma']);
      expect(names({ name: 'ALPHA' })).toEqual([]); // case-sensitive
    });

    it('filters by category', () => {
      const names = (opts: any) => repo.searchTools(opts).map(t => t.name).sort();
      expect(names({ category: 'cat1' })).toEqual(['alpha']); // beta is deprecated by default
      expect(names({ category: 'cat1', includeDeprecated: true }).sort()).toEqual(['alpha', 'beta']);
      expect(names({ category: 'catX' })).toEqual([]);
    });

    it('filters by capability', () => {
      const names = (opts: any) => repo.searchTools(opts).map(t => t.name).sort();
      expect(names({ capability: 'cap1' })).toEqual(['alpha']);
      expect(names({ capability: 'cap2' })).toEqual([]); // beta deprecated
      expect(names({ capability: 'cap2', includeDeprecated: true })).toEqual(['beta']);
      expect(names({ capability: 'capX' })).toEqual([]);
    });

    it('combines filters as intersection', () => {
      const names = (opts: any) => repo.searchTools(opts).map(t => t.name).sort();
      expect(names({ category: 'cat1', capability: 'cap1' })).toEqual(['alpha']);
      expect(names({ category: 'cat1', capability: 'cap3' })).toEqual([]); // no overlap
      expect(names({ name: 'a', category: 'cat2' })).toEqual(['gamma']); // intersects to gamma only
      expect(names({ category: 'cat1', capability: 'cap2', includeDeprecated: true })).toEqual(['beta']);
    });
  });

  it('getToolsByCategory returns tools in category and excludes removed ones', () => {
    const alpha = makeTool('alpha', { categories: ['cat1'], capabilities: ['cap1'] });
    const beta  = makeTool('beta',  { categories: ['cat1'], capabilities: ['cap2'] });
    repo.addTool(alpha); repo.addTool(beta);

    let res = repo.getToolsByCategory('cat1');
    expect(res).toEqual(expect.arrayContaining([alpha, beta]));

    repo.removeTool('alpha'); // categories map retains name, but getTool() is undefined -> filtered out
    res = repo.getToolsByCategory('cat1');
    expect(res).toEqual([beta]);
  });

  it('getToolsByCapability returns tools with capability and excludes removed ones', () => {
    const alpha = makeTool('alpha', { capabilities: ['capX'] });
    const beta  = makeTool('beta',  { capabilities: ['capX'] });
    repo.addTool(alpha); repo.addTool(beta);

    expect(repo.getToolsByCapability('capX')).toEqual(expect.arrayContaining([alpha, beta]));
    repo.removeTool('alpha');
    expect(repo.getToolsByCapability('capX')).toEqual([beta]);
    expect(repo.getToolsByCapability('unknown')).toEqual([]);
  });

  it('removeTool reports status accurately and affects retrieval', () => {
    const alpha = makeTool('alpha');
    repo.addTool(alpha);
    expect(repo.removeTool('alpha')).toBe(true);
    expect(repo.getTool('alpha')).toBeUndefined();
    expect(repo.removeTool('alpha')).toBe(false); // already removed
  });

  it('clearRepository empties tools, categories, and capabilities', () => {
    const alpha = makeTool('alpha', { categories: ['cat'], capabilities: ['cap'] });
    repo.addTool(alpha);
    expect(repo.getTotalTools()).toBe(1);

    repo.clearRepository();
    expect(repo.getTotalTools()).toBe(0);
    expect(repo.getAllTools()).toEqual([]);
    expect(repo.searchTools()).toEqual([]);
    expect(repo.getToolsByCategory('cat')).toEqual([]);
    expect(repo.getToolsByCapability('cap')).toEqual([]);
  });

  it('getTotalTools tracks additions and removals', () => {
    const a = makeTool('a'); const b = makeTool('b');
    repo.addTool(a); repo.addTool(b);
    expect(repo.getTotalTools()).toBe(2);
    repo.removeTool('a');
    expect(repo.getTotalTools()).toBe(1);
  });
});