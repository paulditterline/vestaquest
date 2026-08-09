import { renderTitle } from '@vestaquest/board';
import { describe, expect, it } from 'vitest';
import { MemoryBoardTransport } from '../src/index.js';

describe('MemoryBoardTransport', () => {
  it('stores validated layouts and transition preferences', async () => {
    const transport = new MemoryBoardTransport();
    const layout = renderTitle('black');

    await transport.send(layout);
    await expect(transport.readCurrent()).resolves.toMatchObject({ layout });
    await transport.setTransition({
      transition: 'curtain',
      transitionSpeed: 'fast',
    });
    await expect(transport.getTransition()).resolves.toEqual({
      transition: 'curtain',
      transitionSpeed: 'fast',
    });
  });
});
