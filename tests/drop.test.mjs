import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { directoryPaths, installDropEvents } from '../src/drop.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function item(path, isDirectory = true) {
  const file = { path };
  return {
    kind: 'file',
    webkitGetAsEntry: () => ({ isDirectory }),
    getAsFile: () => file,
  };
}

function transfer(items, types = ['Files']) {
  return { items, types, dropEffect: 'none' };
}

class Events {
  listeners = [];
  addEventListener(type, callback, capture = false) {
    this.listeners.push({ type, callback, capture });
  }
  removeEventListener(type, callback, capture = false) {
    const index = this.listeners.findIndex(listener =>
      listener.type === type && listener.callback === callback && listener.capture === capture);
    if (index !== -1) this.listeners.splice(index, 1);
  }
  emit(type, event) {
    for (const listener of [...this.listeners]) {
      if (listener.type === type) listener.callback(event);
      if (event.stopped) break;
    }
    return event;
  }
}

const rectangle = { left: 10, top: 20, width: 300, height: 200 };
function target(inside = true) {
  const anchor = { firstElementChild: { getBoundingClientRect: () => rectangle } };
  return { closest: selector => {
    assert.equal(selector, '[data-slot="sidebar.workspaces"], [data-slot="conversation.hero.workspace"]');
    return inside ? anchor : null;
  } };
}
function event(dataTransfer, inside = true) {
  return {
    target: target(inside), dataTransfer, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
}
function harness(create = async ({ path }) => ({ path })) {
  const document = new Events();
  const window = new Events();
  const statuses = [];
  const calls = [];
  const dispose = installDropEvents({
    document, window, pathFor: file => file.path,
    create: request => { calls.push(request); return create(request); },
    publish: status => statuses.push(status),
  });
  return { document, window, calls, statuses, dispose };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

// The bridge receives actual host paths; entry metadata models browser directory detection.
test('captures real existing directory paths and ignores a real ordinary file', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workspace-drop-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, 'folder.with.extension');
  const file = join(root, 'file-without-extension');
  await mkdir(folder);
  await writeFile(file, 'ordinary file');
  const items = await Promise.all([folder, file].map(async path => item(path, (await stat(path)).isDirectory())));
  const resolvedFiles = [];
  assert.deepEqual(directoryPaths(transfer(items), value => {
    resolvedFiles.push(value.path);
    return value.path;
  }), { paths: [folder], missing: 0 });
  assert.deepEqual(resolvedFiles, [folder]);
});

test('deduplicates resolved directory paths while preserving first occurrence', () => {
  assert.deepEqual(directoryPaths(transfer([item('a'), item('b'), item('a')]), file => file.path),
    { paths: ['a', 'b'], missing: 0 });
});

test('ignores strings, absent entry metadata, and ordinary files', () => {
  const never = () => { assert.fail('must not resolve a non-directory'); };
  assert.deepEqual(directoryPaths(transfer([
    { kind: 'string', getAsFile: never },
    { kind: 'file', getAsFile: never },
    { ...item('file', false), getAsFile: never },
  ]), never), { paths: [], missing: 0 });
});

test('directories lacking bridge paths publish unsupported and do not create workspaces', async t => {
  const h = harness();
  t.after(h.dispose);
  h.document.emit('drop', event(transfer([item(''), item(undefined)])));
  assert.deepEqual(h.statuses, [{ kind: 'unsupported' }]);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(directoryPaths(transfer([item('directory')]), undefined), { paths: [], missing: 1 });
});

test('ordinary-file drops publish foldersOnly and do not create workspaces', async t => {
  const h = harness();
  t.after(h.dispose);
  h.document.emit('drop', event(transfer([item('file', false)])));
  assert.deepEqual(h.statuses, [{ kind: 'foldersOnly' }]);
  assert.deepEqual(h.calls, []);
});

test('outside-region file drag and drop remain unconsumed', async t => {
  const h = harness();
  t.after(h.dispose);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    const dispatched = h.document.emit(type, event(transfer([item('folder')]), false));
    assert.equal(dispatched.prevented, false);
    assert.equal(dispatched.stopped, false);
  }
  assert.deepEqual(h.calls, []);
  assert.ok(h.statuses.every(status => status.kind === 'idle'));
});

test('internal session drags without Files remain unconsumed inside the region', async t => {
  const h = harness();
  t.after(h.dispose);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    const dispatched = h.document.emit(type, event(transfer([], ['application/x-dsh-session', 'text/plain'])));
    assert.equal(dispatched.prevented, false);
    assert.equal(dispatched.stopped, false);
  }
  assert.deepEqual(h.calls, []);
  assert.ok(h.statuses.every(status => status.kind === 'idle'));
});

test('in-region drag interception publishes the rendered child rectangle', async t => {
  const h = harness();
  t.after(h.dispose);
  for (const type of ['dragenter', 'dragover']) {
    const dispatched = h.document.emit(type, event(transfer([item('folder')])));
    assert.equal(dispatched.prevented, true);
    assert.equal(dispatched.stopped, true);
    assert.equal(dispatched.dataTransfer.dropEffect, 'copy');
  }
  assert.deepEqual(h.statuses, [{ kind: 'drag', rect: rectangle }, { kind: 'drag', rect: rectangle }]);
});

test('multi-folder failures continue the queue and report additions, errors, and missing paths', async t => {
  const h = harness(async ({ path }) => {
    if (path === 'bad') throw new Error('creation failed');
    return path === 'first' ? { title: 'First', path } : { path };
  });
  t.after(h.dispose);
  h.document.emit('drop', event(transfer([item('first'), item('bad'), item('last'), item('first'), item('')])));
  await settle();
  assert.deepEqual(h.calls, [{ path: 'first' }, { path: 'bad' }, { path: 'last' }]);
  assert.deepEqual(h.statuses, [
    { kind: 'busy' },
    { kind: 'partial', added: ['First', 'last'], errors: ['bad: creation failed'], missing: 1 },
  ]);
});

test('successful drop publishes success and permits another operation after completion', async t => {
  const h = harness();
  t.after(h.dispose);
  for (const path of ['one', 'two']) {
    h.document.emit('drop', event(transfer([item(path)])));
    await settle();
  }
  assert.deepEqual(h.calls, [{ path: 'one' }, { path: 'two' }]);
  assert.deepEqual(h.statuses, [
    { kind: 'busy' }, { kind: 'success', added: ['one'], errors: [], missing: 0 },
    { kind: 'busy' }, { kind: 'success', added: ['two'], errors: [], missing: 0 },
  ]);
});

test('busy operations consume concurrent drops, deny drag effects, and preserve busy status', async t => {
  const pending = deferred();
  const h = harness(() => pending.promise);
  t.after(h.dispose);
  h.document.emit('drop', event(transfer([item('first')])));
  const over = h.document.emit('dragover', event(transfer([item('second')])));
  const drop = h.document.emit('drop', event(transfer([item('second')])));
  assert.equal(over.prevented, true);
  assert.equal(over.stopped, true);
  assert.equal(over.dataTransfer.dropEffect, 'none');
  assert.equal(drop.prevented, true);
  assert.equal(drop.stopped, true);
  h.window.emit('blur', {});
  h.window.emit('dragend', {});
  assert.deepEqual(h.calls, [{ path: 'first' }]);
  assert.deepEqual(h.statuses, [{ kind: 'busy' }]);
  pending.resolve({ path: 'first' });
  await settle();
  assert.equal(h.statuses.at(-1).kind, 'success');
});

for (const outcome of ['resolve', 'reject']) {
  test(`dispose removes listeners, awaits in-flight ${outcome}, stops queue, and suppresses late statuses`, async () => {
    const pending = deferred();
    const h = harness(() => pending.promise);
    assert.equal(h.document.listeners.length, 5);
    assert.equal(h.window.listeners.length, 2);
    h.document.emit('drop', event(transfer([item('started'), item('queued')])));
    let disposed = false;
    const disposal = h.dispose().then(() => { disposed = true; });
    assert.equal(h.document.listeners.length, 0);
    assert.equal(h.window.listeners.length, 0);
    await settle();
    assert.equal(disposed, false, 'disposal must wait for the running create');
    const after = h.document.emit('drop', event(transfer([item('after-disposal')])));
    h.window.emit('blur', {});
    assert.equal(after.prevented, false);
    assert.equal(after.stopped, false);
    if (outcome === 'resolve') pending.resolve({ title: 'Started', path: 'started' });
    else pending.reject(new Error('late failure'));
    await disposal;
    assert.equal(disposed, true);
    assert.deepEqual(h.calls, [{ path: 'started' }]);
    assert.deepEqual(h.statuses, [{ kind: 'busy' }]);
    await h.dispose();
  });
}
