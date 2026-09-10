import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadPile, savePile, clearPile, appendChunk, renderPile } from '../js/pile.js';

describe('appendChunk', () => {
  test('appends a new chunk without mutating the input pile', () => {
    const pile = { chunks: ['a'] };
    const next = appendChunk(pile, 'b');
    assert.deepEqual(pile.chunks, ['a']); // unchanged
    assert.deepEqual(next.chunks, ['a', 'b']);
  });

  test('appends to an empty pile', () => {
    const next = appendChunk({ chunks: [] }, 'first');
    assert.deepEqual(next.chunks, ['first']);
  });

  test('ignores an empty string, returning an equivalent but new pile', () => {
    const pile = { chunks: ['a'] };
    const next = appendChunk(pile, '');
    assert.deepEqual(next.chunks, ['a']);
    assert.notEqual(next, pile);
    assert.notEqual(next.chunks, pile.chunks);
  });

  test('ignores whitespace-only text', () => {
    const next = appendChunk({ chunks: ['a'] }, '   \n\t  ');
    assert.deepEqual(next.chunks, ['a']);
  });

  test('ignores a non-string value', () => {
    const next = appendChunk({ chunks: ['a'] }, null);
    assert.deepEqual(next.chunks, ['a']);
  });

  test('keeps a chunk with meaningful leading/trailing whitespace as typed', () => {
    const next = appendChunk({ chunks: [] }, '  raw  ');
    assert.deepEqual(next.chunks, ['  raw  ']);
  });
});

describe('renderPile', () => {
  test('renders zero chunks as an empty string', () => {
    assert.equal(renderPile({ chunks: [] }, '\n\n'), '');
  });

  test('renders one chunk unchanged (after trailing trim)', () => {
    assert.equal(renderPile({ chunks: ['solo'] }, '\n\n'), 'solo');
  });

  test('joins many chunks with the given separator', () => {
    assert.equal(renderPile({ chunks: ['A', 'B', 'C'] }, '\n\n'), 'A\n\nB\n\nC');
  });

  test('honours a custom separator', () => {
    assert.equal(renderPile({ chunks: ['a', 'b'] }, ' | '), 'a | b');
  });

  test('trims trailing whitespace from each chunk but keeps leading whitespace', () => {
    assert.equal(
      renderPile({ chunks: ['  A  \n', 'B\t'] }, '\n\n'),
      '  A\n\nB',
    );
  });
});

describe('localStorage-backed functions run without localStorage (Node)', () => {
  test('loadPile returns an empty pile', () => {
    assert.deepEqual(loadPile(), { chunks: [] });
  });

  test('savePile does not throw', () => {
    assert.doesNotThrow(() => savePile({ chunks: ['a'] }));
  });

  test('clearPile does not throw', () => {
    assert.doesNotThrow(() => clearPile());
  });
});

describe('pile persistence with a fake localStorage', () => {
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
      setItem: (key, value) => {
        data[key] = String(value);
      },
      removeItem: (key) => {
        delete data[key];
      },
      _data: data,
    };
  }

  test('savePile / loadPile round-trip', () => {
    const storage = makeMemoryStorage();
    withFakeLocalStorage(storage, () => {
      savePile({ chunks: ['one', 'two'] });
      assert.deepEqual(loadPile(), { chunks: ['one', 'two'] });
    });
  });

  test('loadPile returns an empty pile when nothing is stored', () => {
    const storage = makeMemoryStorage();
    withFakeLocalStorage(storage, () => {
      assert.deepEqual(loadPile(), { chunks: [] });
    });
  });

  test('loadPile returns an empty pile for corrupt JSON', () => {
    const storage = makeMemoryStorage({ 'wcopy.pile': '{ not json' });
    withFakeLocalStorage(storage, () => {
      assert.deepEqual(loadPile(), { chunks: [] });
    });
  });

  test('loadPile returns an empty pile for the wrong shape', () => {
    const storage = makeMemoryStorage({ 'wcopy.pile': JSON.stringify({ chunks: [1, 2] }) });
    withFakeLocalStorage(storage, () => {
      assert.deepEqual(loadPile(), { chunks: [] });
    });
  });

  test('clearPile removes the stored pile', () => {
    const storage = makeMemoryStorage({ 'wcopy.pile': JSON.stringify({ chunks: ['a'] }) });
    withFakeLocalStorage(storage, () => {
      clearPile();
      assert.equal('wcopy.pile' in storage._data, false);
      assert.deepEqual(loadPile(), { chunks: [] });
    });
  });

  test('a throwing localStorage.getItem is treated as an empty pile', () => {
    const storage = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: () => {
        throw new Error('boom');
      },
      removeItem: () => {
        throw new Error('boom');
      },
    };
    withFakeLocalStorage(storage, () => {
      assert.deepEqual(loadPile(), { chunks: [] });
      assert.doesNotThrow(() => savePile({ chunks: ['x'] }));
      assert.doesNotThrow(() => clearPile());
    });
  });
});
