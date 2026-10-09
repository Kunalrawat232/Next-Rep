import { act, fireEvent } from '@testing-library/react';

/**
 * Taps a button several times in the same instant, as a real double tap does. `user.dblClick`
 * leaves a tick between the clicks, which a slow machine can stretch until the first action has
 * already finished, so it cannot show a guard that depends on state not yet re-rendered.
 */
export function tapTogether(button: HTMLElement, times = 2): void {
  act(() => {
    for (let i = 0; i < times; i += 1) fireEvent.click(button);
  });
}
