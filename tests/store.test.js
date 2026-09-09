import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  loadState,
  saveState,
  loadLastOutput,
  saveLastOutput,
} from '../js/store.js';
import { createDefaultState } from '../js/schema.js';

function flushMicrotasks() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('createStore', () => {
  test('get() returns the current state', () => {
    const initial = createDefaultState();
    const store = createStore({ initial, save: () => {} });
    assert.equal(store.get(), initial);
  });

  test('commit mutates state, saves, and notifies subscribers', async () => {
    const initial = createDefaultState();
    const saved = [];
    const store = createStore({ initial, save: (s) => saved.push(s) });

    let notified = 0;
    let lastSeen = null;
    store.subscribe((s) => {
      notified += 1;
      lastSeen = s;
    });

    store.commit((draft) => {
      draft.settings.theme = 'dark';
    });

    assert.equal(store.get().settings.theme, 'dark');
    assert.equal(notified, 1);
    assert.equal(lastSeen.settings.theme, 'dark');

    await flushMicrotasks();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].settings.theme, 'dark');
  });

  test('patch mutates state and saves, but does not notify', async () => {
    const initial = createDefaultState();
    const saved = [];
    const store = createStore({ initial, save: (s) => saved.push(s) });

    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.patch((draft) => {
      draft.stacks[0].pieces[0].variants[0].text = 'typed text';
    });

    assert.equal(store.get().stacks[0].pieces[0].variants[0].text, 'typed text');
    assert.equal(notified, 0);

    await flushMicrotasks();
    assert.equal(saved.length, 1);
  });

  test('ten patch calls in one synchronous run cause exactly one save call', async () => {
    const initial = createDefaultState();
    let saveCount = 0;
    const store = createStore({
      initial,
      save: () => {
        saveCount += 1;
      },
    });

    for (let i = 0; i < 10; i += 1) {
      store.patch((draft) => {
        draft.settings.density = i % 2 === 0 ? 'compact' : 'comfortable';
      });
    }

    assert.equal(saveCount, 0); // not yet flushed
    await flushMicrotasks();
    assert.equal(saveCount, 1);
  });

  test('a mix of commit and patch calls in one run still coalesce to one save', async () => {
    const initial = createDefaultState();
    let saveCount = 0;
    const store = createStore({ initial, save: () => (saveCount += 1) });

    store.commit((d) => { d.settings.theme = 'light'; });
    store.patch((d) => { d.settings.density = 'compact'; });
    store.commit((d) => { d.settings.theme = 'dark'; });

    await flushMicrotasks();
    assert.equal(saveCount, 1);
  });

  test('subscribe returns a working unsubscribe function', () => {
    const initial = createDefaultState();
    const store = createStore({ initial, save: () => {} });
    let notified = 0;
    const unsubscribe = store.subscribe(() => { notified += 1; });

    store.commit((d) => { d.settings.theme = 'dark'; });
    assert.equal(notified, 1);

    unsubscribe();
    store.commit((d) => { d.settings.theme = 'light'; });
    assert.equal(notified, 1);
  });

  test('a missing save function does not throw', async () => {
    const initial = createDefaultState();
    const store = createStore({ initial });
    assert.doesNotThrow(() => {
      store.commit((d) => { d.settings.theme = 'dark'; });
    });
    await flushMicrotasks();
  });
});

describe('localStorage-backed functions run without localStorage (Node)', () => {
  test('loadState falls back to the default state', () => {
    const { state, corrupted } = loadState();
    assert.equal(corrupted, false);
    assert.equal(Array.isArray(state.stacks), true);
    assert.equal(state.stacks.length > 0, true);
  });

  test('saveState does not throw', () => {
    assert.doesNotThrow(() => saveState(createDefaultState()));
  });

  test('loadLastOutput returns null', () => {
    assert.equal(loadLastOutput(), null);
  });

  test('saveLastOutput does not throw', () => {
    assert.doesNotThrow(() => saveLastOutput('some text'));
  });
});

describe('loadState with a fake localStorage', () => {
  function withFakeLocalStorage(fakeStorage, fn) {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: fakeStorage,
      configurable: true,
    });
    try {
      return fn();
    } finally {
      if (original === undefined) {
        delete globalThis.localStorage;
      } else {
        Object.defineProperty(globalThis, 'localStorage', {
          value: original,
          configurable: true,
        });
      }
    }
  }

  function makeMemoryStorage(initialData = {}) {
    const data = { ...initialData };
    return {
      getItem: (key) => (key in data ? data[key] : null),
      setItem: (key, value) => { data[key] = String(value); },
      removeItem: (key) => { delete data[key]; },
      _data: data,
    };
  }

  test('loads and migrates a valid stored state', () => {
    const defaultState = createDefaultState();
    const storage = makeMemoryStorage({ 'wcopy.state': JSON.stringify(defaultState) });
    withFakeLocalStorage(storage, () => {
      const { state, corrupted } = loadState();
      assert.equal(corrupted, false);
      assert.deepEqual(state, defaultState);
    });
  });

  test('corrupt JSON falls back to default, stashes raw, and reports corrupted', () => {
    const storage = makeMemoryStorage({ 'wcopy.state': '{ not json' });
    withFakeLocalStorage(storage, () => {
      const { state, corrupted } = loadState();
      assert.equal(corrupted, true);
      assert.equal(Array.isArray(state.stacks), true);
      assert.equal(storage._data['wcopy.state.corrupt'], '{ not json');
    });
  });

  test('valid JSON that fails validation falls back to default and reports corrupted', () => {
    const badState = createDefaultState();
    badState.settings.theme = 'not-a-theme';
    const storage = makeMemoryStorage({ 'wcopy.state': JSON.stringify(badState) });
    withFakeLocalStorage(storage, () => {
      const { state, corrupted } = loadState();
      assert.equal(corrupted, true);
      assert.equal(Array.isArray(state.stacks), true);
    });
  });

  test('a throwing localStorage.getItem is treated as no stored data', () => {
    const storage = {
      getItem: () => { throw new Error('boom'); },
      setItem: () => { throw new Error('boom'); },
    };
    withFakeLocalStorage(storage, () => {
      const { state, corrupted } = loadState();
      assert.equal(corrupted, false);
      assert.equal(Array.isArray(state.stacks), true);
    });
  });

  test('saveState writes JSON to wcopy.state', () => {
    const storage = makeMemoryStorage();
    withFakeLocalStorage(storage, () => {
      const state = createDefaultState();
      saveState(state);
      assert.deepEqual(JSON.parse(storage._data['wcopy.state']), state);
    });
  });

  test('saveLastOutput / loadLastOutput round-trip', () => {
    const storage = makeMemoryStorage();
    withFakeLocalStorage(storage, () => {
      saveLastOutput('hello world');
      assert.equal(loadLastOutput(), 'hello world');
    });
  });

  test('a throwing setItem does not throw for saveState or saveLastOutput', () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
    };
    withFakeLocalStorage(storage, () => {
      assert.doesNotThrow(() => saveState(createDefaultState()));
      assert.doesNotThrow(() => saveLastOutput('x'));
    });
  });
});
