import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useConfirm } from './useConfirm';

describe('useConfirm', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useConfirm());
    expect(result.current.confirmState.isOpen).toBe(false);
  });

  it('opens with defaults and resolves true on confirm', async () => {
    const { result } = renderHook(() => useConfirm());

    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = result.current.confirm({ title: 'Export', variant: 'warning' });
    });
    expect(result.current.confirmState).toMatchObject({
      isOpen: true,
      title: 'Export',
      variant: 'warning',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
    });

    act(() => result.current.handleConfirm());
    await expect(answer).resolves.toBe(true);
    expect(result.current.confirmState.isOpen).toBe(false);
  });

  it('resolves false on cancel', async () => {
    const { result } = renderHook(() => useConfirm());
    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = result.current.confirm({ message: 'Sure?' });
    });

    act(() => result.current.handleCancel());
    await expect(answer).resolves.toBe(false);
  });

  it('cancels a dialog that is replaced by a new one', async () => {
    const { result } = renderHook(() => useConfirm());
    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    act(() => {
      first = result.current.confirm({ title: 'first' });
    });
    act(() => {
      second = result.current.confirm({ title: 'second' });
    });

    await expect(first).resolves.toBe(false);
    expect(result.current.confirmState.title).toBe('second');

    act(() => result.current.handleConfirm());
    await expect(second).resolves.toBe(true);
  });

  it('is safe to confirm twice (the promise settles once)', async () => {
    const { result } = renderHook(() => useConfirm());
    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = result.current.confirm({});
    });
    act(() => {
      result.current.handleConfirm();
      result.current.handleCancel();
    });
    await expect(answer).resolves.toBe(true);
  });
});
