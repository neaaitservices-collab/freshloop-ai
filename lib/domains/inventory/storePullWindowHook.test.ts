import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { dispatchSettingsUpdated } from '@/lib/domains/stats/settingsEvents';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettingsDefaults';
import {
  planPullWindowLoad,
  useStorePullSensitivityDays,
  type StorePullSensitivityDays,
} from '@/hooks/use-store-pull-sensitivity-days';

type Snapshot = {
  pullDays: StorePullSensitivityDays | null;
  ready: boolean;
  failed: boolean;
};

function element(name = 'DIV') {
  const node = {
    nodeType: 1,
    nodeName: name,
    tagName: name,
    style: {},
    childNodes: [] as Array<{ textContent?: string; nodeType?: number; parentNode?: unknown }>,
    firstChild: null as unknown,
    parentNode: null as unknown,
    ownerDocument: null as unknown,
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    appendChild(child: { parentNode?: unknown; nodeType?: number; textContent?: string }) {
      child.parentNode = node;
      node.childNodes.push(child);
      node.firstChild = node.childNodes[0];
      return child;
    },
    insertBefore(child: { parentNode?: unknown }) {
      return node.appendChild(child);
    },
    removeChild(child: unknown) {
      node.childNodes = node.childNodes.filter((item) => item !== child);
      node.firstChild = node.childNodes[0] ?? null;
      return child;
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() {
      return null;
    },
    hasAttribute() {
      return false;
    },
    focus() {},
    blur() {},
    contains() {
      return false;
    },
  };
  return node;
}

function installWindow() {
  const bus = new EventTarget();
  const doc = {
    nodeType: 9,
    createElement(name: string) {
      const node = element(name);
      node.ownerDocument = doc;
      return node;
    },
    createElementNS(_namespace: string, name: string) {
      return doc.createElement(name);
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text), parentNode: null, ownerDocument: doc };
    },
    body: element('BODY'),
    documentElement: element('HTML'),
    head: element('HEAD'),
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    activeElement: null,
    visibilityState: 'visible',
    hidden: false,
  };
  const windowObj = {
    document: doc,
    event: undefined,
    addEventListener: bus.addEventListener.bind(bus),
    removeEventListener: bus.removeEventListener.bind(bus),
    dispatchEvent: bus.dispatchEvent.bind(bus),
    getSelection() {
      return null;
    },
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    HTMLElement: function HTMLElement() {},
    Node: function Node() {},
    requestAnimationFrame(callback: () => void) {
      return setTimeout(callback, 0);
    },
    cancelAnimationFrame(id: ReturnType<typeof setTimeout>) {
      clearTimeout(id);
    },
    setTimeout,
    clearTimeout,
    location: { href: 'http://localhost/' },
    getComputedStyle() {
      return { getPropertyValue: () => '' };
    },
  };
  globalThis.window = windowObj as unknown as Window & typeof globalThis;
  globalThis.document = doc as unknown as Document;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return element('DIV');
}

function settingsResponse(pullSensitivityDays: number): Response {
  return new Response(
    JSON.stringify({ success: true, settings: { pullSensitivityDays } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function Harness({
  initial,
  snapshotRef,
}: {
  initial?: number | null;
  snapshotRef: { current: Snapshot | null };
}) {
  const state = useStorePullSensitivityDays(initial);
  snapshotRef.current = {
    pullDays: state.pullDays,
    ready: state.ready,
    failed: state.failed,
  };
  return null;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test('planPullWindowLoad skips a fetch for a saved 2, 3, or 4 day window', () => {
  assert.deepEqual(planPullWindowLoad(2), { type: 'use-initial', days: 2 });
  assert.deepEqual(planPullWindowLoad(3), { type: 'use-initial', days: 3 });
  assert.deepEqual(planPullWindowLoad(4), { type: 'use-initial', days: 4 });
  assert.deepEqual(planPullWindowLoad(null), { type: 'fetch' });
  assert.deepEqual(planPullWindowLoad(undefined), { type: 'fetch' });
  assert.deepEqual(planPullWindowLoad(1), { type: 'fetch' });
});

test('a valid initial window does not fetch on mount', async () => {
  const container = installWindow();
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('settings should not be fetched');
  }) as typeof fetch;
  const snapshot: { current: Snapshot | null } = { current: null };
  const root: Root = createRoot(container as never);
  try {
    await act(async () => {
      root.render(createElement(Harness, { initial: 4, snapshotRef: snapshot }));
    });
    assert.equal(calls, 0);
    assert.equal(snapshot.current?.pullDays, 4);
    assert.equal(snapshot.current?.ready, true);
    assert.equal(snapshot.current?.failed, false);
  } finally {
    await act(async () => {
      root.unmount();
    });
    globalThis.fetch = original;
  }
});

test('a changed storePullDays prop updates the value', async () => {
  const container = installWindow();
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return settingsResponse(3);
  }) as typeof fetch;
  const snapshot: { current: Snapshot | null } = { current: null };
  const root: Root = createRoot(container as never);
  try {
    await act(async () => {
      root.render(createElement(Harness, { initial: 3, snapshotRef: snapshot }));
    });
    assert.equal(snapshot.current?.pullDays, 3);
    await act(async () => {
      root.render(createElement(Harness, { initial: 4, snapshotRef: snapshot }));
    });
    assert.equal(calls, 0);
    assert.equal(snapshot.current?.pullDays, 4);
    assert.equal(snapshot.current?.ready, true);
  } finally {
    await act(async () => {
      root.unmount();
    });
    globalThis.fetch = original;
  }
});

test('an in-flight GET resolving after a save does not overwrite the saved window', async () => {
  const container = installWindow();
  let release: ((response: Response) => void) | null = null;
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      release = resolve;
    })) as typeof fetch;
  const snapshot: { current: Snapshot | null } = { current: null };
  const root: Root = createRoot(container as never);
  try {
    await act(async () => {
      root.render(createElement(Harness, { snapshotRef: snapshot }));
    });
    assert.equal(snapshot.current?.pullDays, null);
    await act(async () => {
      dispatchSettingsUpdated({ pullSensitivityDays: 4 } as PlatformSettings);
    });
    assert.equal(snapshot.current?.pullDays, 4);
    await act(async () => {
      release?.(settingsResponse(3));
      await flush();
    });
    assert.equal(snapshot.current?.pullDays, 4);
    assert.equal(snapshot.current?.ready, true);
  } finally {
    await act(async () => {
      root.unmount();
    });
    globalThis.fetch = original;
  }
});
