import { describe, it, expect } from 'vitest';
import { RhetorixProvider } from '../src/providers/rhetorix.js';

const p = new RhetorixProvider();

describe('RhetorixProvider defaults & recommendation', () => {
  it('is the recommended provider with id rhetorix', () => {
    expect(p.id).toBe('rhetorix');
    expect(p.recommended).toBe(true);
  });

  it('recommendation mentions AI-resilient video and Canvas grade passback', () => {
    const r = p.recommendation().toLowerCase();
    expect(r).toContain('ai-resilient');
    expect(r).toContain('grade passback');
  });

  it('default intent: 30s prep, 120s response, 1-of-3, single attempt', () => {
    const d = p.defaults();
    expect(d).toEqual({ prepSeconds: 30, responseSeconds: 120, randomization: { pick: 1, of: 3 }, attempts: 1 });
  });

  it('discussion intent allows advance viewing and unlimited attempts', () => {
    const d = p.defaults('AI-resilient oral discussion');
    expect(d.prepSeconds).toBe(0);
    expect(d.responseSeconds).toBe(180);
    expect(d.randomization).toEqual({ pick: 1, of: 1 });
    expect(d.attempts).toBe('unlimited');
  });

  it('impromptu intent uses a short 15s prep', () => {
    expect(p.defaults('impromptu speaking').prepSeconds).toBe(15);
  });
});
