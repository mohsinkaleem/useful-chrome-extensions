import { describe, it, expect } from 'vitest';
import { selectDeadLinkBatch } from '../src/dead-link-queue.js';

const links = (...ids) => ids.map((id) => ({ id }));

describe('selectDeadLinkBatch', () => {
  it('takes the first batch when nothing has been processed', () => {
    const { batch, pending } = selectDeadLinkBatch(links('a', 'b', 'c', 'd'), new Set(), 2);

    expect(batch.map((b) => b.id)).toEqual(['a', 'b']);
    expect(pending).toBe(2);
  });

  it('skips already-processed ids on resume', () => {
    const { batch, pending } = selectDeadLinkBatch(
      links('a', 'b', 'c', 'd'),
      new Set(['a', 'b']),
      2,
    );

    expect(batch.map((b) => b.id)).toEqual(['c', 'd']);
    expect(pending).toBe(0);
  });

  it('never skips an unprocessed link when the list shrinks mid-pass', () => {
    // The regression: 6 dead links, batch of 3. Run 1 handles a, b, c and two of
    // them revive, so run 2 sees a 4-entry list. An index cursor of 3 would slice
    // past d and e and never check them.
    const runOne = selectDeadLinkBatch(links('a', 'b', 'c', 'd', 'e', 'f'), new Set(), 3);
    expect(runOne.batch.map((b) => b.id)).toEqual(['a', 'b', 'c']);

    const processed = new Set(runOne.batch.map((b) => b.id));

    // a and b came back to life, so getDeadLinks() no longer reports them.
    const runTwo = selectDeadLinkBatch(links('c', 'd', 'e', 'f'), processed, 3);

    expect(runTwo.batch.map((b) => b.id)).toEqual(['d', 'e', 'f']);
    expect(runTwo.pending).toBe(0);
  });

  it('covers every link across repeated shrinking passes', () => {
    let remaining = links('a', 'b', 'c', 'd', 'e', 'f', 'g');
    const processed = new Set();
    const seen = [];

    for (let pass = 0; pass < 10; pass++) {
      const { batch, pending } = selectDeadLinkBatch(remaining, processed, 2);
      if (batch.length === 0) break;

      for (const bookmark of batch) {
        seen.push(bookmark.id);
        processed.add(bookmark.id);
      }
      // Every processed link revives, shrinking the list the hardest way.
      remaining = remaining.filter((b) => !processed.has(b.id));
      if (pending === 0 && remaining.length === 0) break;
    }

    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('reports zero pending once every link is processed', () => {
    const { batch, pending } = selectDeadLinkBatch(links('a', 'b'), new Set(['a', 'b']), 5);

    expect(batch).toEqual([]);
    expect(pending).toBe(0);
  });
});
