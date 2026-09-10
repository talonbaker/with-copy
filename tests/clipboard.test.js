import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextClipboardStrategy,
  detectDefaultStrategy,
  loadClipboardStrategy,
  saveClipboardStrategy,
} from '../js/clipboard.js';

describe('nextClipboardStrategy (pure strategy-decision helper, spec §4.4/§6)', () => {
  test('unseeded (null/undefined storedStrategy) behaves like read: attempts a read', () => {
    assert.deepEqual(
      nextClipboardStrategy({ storedStrategy: null, readOutcome: null }),
      { strategy: 'read', attemptRead: true },
    );
    assert.deepEqual(
      nextClipboardStrategy({ storedStrategy: undefined, readOutcome: null }),
      { strategy: 'read', attemptRead: true },
    );
  });

  test('read strategy, no outcome yet: says to attempt a read', () => {
    assert.deepEqual(
      nextClipboardStrategy({ storedStrategy: 'read', readOutcome: null }),
      { strategy: 'read', attemptRead: true },
    );
  });

  test('read strategy, a successful read: stays read', () => {
    assert.deepEqual(
      nextClipboardStrategy({ storedStrategy: 'read', readOutcome: 'ok' }),
      { strategy: 'read', attemptRead: true },
    );
  });

  test('read strategy, DENIED: demotes to paste and stops attempting reads', () => {
    assert.deepEqual(
      nextClipboardStrategy({ storedStrategy: 'read', readOutcome: 'denied' }),
      { strategy: 'paste', attemptRead: false },
    );
  });

  test('read strategy, UNSUPPORTED: demotes to paste and stops attempting reads', () => {
    assert.deepEqual(
      nextClipboardStrategy({ storedStrategy: 'read', readOutcome: 'unsupported' }),
      { strategy: 'paste', attemptRead: false },
    );
  });

  test('read strategy, an unrelated outcome (e.g. a stale NOT_FOCUSED-shaped code): stays read', () => {
    assert.deepEqual(
      nextClipboardStrategy({ storedStrategy: 'read', readOutcome: 'other' }),
      { strategy: 'read', attemptRead: true },
    );
  });

  test('paste strategy is permanent: never attempts a read again, regardless of readOutcome', () => {
    for (const readOutcome of [null, 'ok', 'denied', 'unsupported', 'other']) {
      assert.deepEqual(
        nextClipboardStrategy({ storedStrategy: 'paste', readOutcome }),
        { strategy: 'paste', attemptRead: false },
      );
    }
  });
});

describe('detectDefaultStrategy (pure seeding rule, spec §4.4)', () => {
  test('touch device with no queryable clipboard-read permission (iPhone/WebKit shape): paste', () => {
    assert.equal(
      detectDefaultStrategy({ maxTouchPoints: 5, hasQueryableClipboardReadPermission: false }),
      'paste',
    );
  });

  test('touch device that CAN query clipboard-read permission: read', () => {
    assert.equal(
      detectDefaultStrategy({ maxTouchPoints: 5, hasQueryableClipboardReadPermission: true }),
      'read',
    );
  });

  test('non-touch device (desktop shape), regardless of permission queryability: read', () => {
    assert.equal(
      detectDefaultStrategy({ maxTouchPoints: 0, hasQueryableClipboardReadPermission: false }),
      'read',
    );
    assert.equal(
      detectDefaultStrategy({ maxTouchPoints: 0, hasQueryableClipboardReadPermission: true }),
      'read',
    );
  });

  test('maxTouchPoints of 0 or a non-number is treated as non-touch', () => {
    assert.equal(
      detectDefaultStrategy({ maxTouchPoints: undefined, hasQueryableClipboardReadPermission: false }),
      'read',
    );
  });
});

describe('clipboard strategy persistence runs without localStorage (Node)', () => {
  test('loadClipboardStrategy returns null', () => {
    assert.equal(loadClipboardStrategy(), null);
  });

  test('saveClipboardStrategy does not throw', () => {
    assert.doesNotThrow(() => saveClipboardStrategy('paste'));
  });
});

describe('clipboard strategy persistence with a fake localStorage', () => {
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

  test('loadClipboardStrategy returns null when nothing is stored', () => {
    withFakeLocalStorage(makeMemoryStorage(), () => {
      assert.equal(loadClipboardStrategy(), null);
    });
  });

  test('loadClipboardStrategy returns null for a garbage stored value (never a broken migration)', () => {
    withFakeLocalStorage(makeMemoryStorage({ 'wcopy.clipboardStrategy': 'sideways' }), () => {
      assert.equal(loadClipboardStrategy(), null);
    });
  });

  test('saveClipboardStrategy then loadClipboardStrategy round-trips', () => {
    withFakeLocalStorage(makeMemoryStorage(), () => {
      saveClipboardStrategy('paste');
      assert.equal(loadClipboardStrategy(), 'paste');
      saveClipboardStrategy('read');
      assert.equal(loadClipboardStrategy(), 'read');
    });
  });

  test('a throwing storage does not throw for load or save', () => {
    const storage = {
      getItem: () => { throw new Error('boom'); },
      setItem: () => { throw new Error('boom'); },
    };
    withFakeLocalStorage(storage, () => {
      assert.equal(loadClipboardStrategy(), null);
      assert.doesNotThrow(() => saveClipboardStrategy('paste'));
    });
  });
});
