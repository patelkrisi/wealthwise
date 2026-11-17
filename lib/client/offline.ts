'use client';
// Offline queue for form entries (PRD §8): saved to IndexedDB when offline, synced when back online.
import { get, set } from 'idb-keyval';

const KEY = 'ww-offline-expenses';

export async function queueExpenses(items: any[]) {
  const cur = ((await get(KEY)) as any[]) || [];
  await set(KEY, [...cur, ...items.map((i) => ({ ...i, client_ref: i.client_ref || crypto.randomUUID() }))]);
}

export async function pendingCount() {
  return (((await get(KEY)) as any[]) || []).length;
}

export async function flushQueue(): Promise<number> {
  const cur = ((await get(KEY)) as any[]) || [];
  if (!cur.length || !navigator.onLine) return 0;
  const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cur) });
  if (res.ok) {
    await set(KEY, []);
    return cur.length;
  }
  if (res.status === 400) await set(KEY, []); // drop invalid entries rather than retrying forever
  return 0;
}
