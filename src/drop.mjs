/** Capture directory paths synchronously while the drop's data store is readable.
 * @param transfer - Native drop data.
 * @param pathFor - Desktop bridge resolving a File to its existing host path.
 * @returns Unique directory paths and the count lacking a host path.
 */
export function directoryPaths(transfer, pathFor) {
  const paths = new Set();
  let missing = 0;
  for (const item of transfer.items) {
    if (item.kind !== 'file' || item.webkitGetAsEntry?.()?.isDirectory !== true) continue;
    const file = item.getAsFile();
    const path = file && pathFor ? pathFor(file) : '';
    if (typeof path === 'string' && path.length > 0) paths.add(path);
    else missing += 1;
  }
  return { paths: [...paths], missing };
}

/** Install scoped drop interception without consuming composer attachments or internal row moves.
 * @param options - DOM, directory bridge, Workspace create callback, and status publisher.
 * @returns Async disposer awaiting any started registration after removing listeners.
 */
export function installDropEvents({ document, window, pathFor, create, publish }) {
  const selector = '[data-slot="sidebar.workspaces"], [data-slot="conversation.hero.workspace"]';
  let disposed = false;
  let operation;
  const region = event => event.target?.closest?.(selector);
  const fileTransfer = event => event.dataTransfer?.types.includes('Files') ? event.dataTransfer : null;
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const reset = () => { if (!operation && !disposed) publish({ kind: 'idle' }); };
  const onOver = event => {
    const transfer = fileTransfer(event);
    const target = region(event);
    if (!transfer || !target) return;
    stop(event);
    transfer.dropEffect = operation ? 'none' : 'copy';
    if (!operation) {
      // Slot anchors use display:contents; their rendered child owns the rectangle.
      const rect = (target.firstElementChild ?? target).getBoundingClientRect();
      publish({ kind: 'drag', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
    }
  };
  const onLeave = event => {
    if (region(event) && !region({ target: event.relatedTarget })) reset();
    if (!event.relatedTarget) reset();
  };
  const onDrop = event => {
    const transfer = fileTransfer(event);
    if (!transfer || !region(event)) { reset(); return; }
    stop(event);
    if (operation) return;
    let captured;
    try { captured = directoryPaths(transfer, pathFor); }
    catch (error) { publish({ kind: 'error', detail: String(error.message ?? error) }); return; }
    if (!captured.paths.length) {
      publish({ kind: captured.missing ? 'unsupported' : 'foldersOnly' });
      return;
    }
    publish({ kind: 'busy' });
    operation = (async () => {
      const added = [];
      const errors = [];
      for (const path of captured.paths) {
        if (disposed) break;
        try { const workspace = await create({ path }); added.push(workspace.title || workspace.path); }
        catch (error) { errors.push(`${path}: ${String(error.message ?? error)}`); }
      }
      if (!disposed) publish({ kind: errors.length || captured.missing ? 'partial' : 'success', added, errors, missing: captured.missing });
    })().finally(() => { operation = undefined; });
  };
  const onOutsideOver = event => { if (fileTransfer(event) && !region(event)) reset(); };
  document.addEventListener('dragenter', onOver, true);
  document.addEventListener('dragover', onOver, true);
  document.addEventListener('dragover', onOutsideOver, true);
  document.addEventListener('dragleave', onLeave, true);
  document.addEventListener('drop', onDrop, true);
  window.addEventListener('dragend', reset);
  window.addEventListener('blur', reset);
  return async () => {
    disposed = true;
    document.removeEventListener('dragenter', onOver, true);
    document.removeEventListener('dragover', onOver, true);
    document.removeEventListener('dragover', onOutsideOver, true);
    document.removeEventListener('dragleave', onLeave, true);
    document.removeEventListener('drop', onDrop, true);
    window.removeEventListener('dragend', reset);
    window.removeEventListener('blur', reset);
    await operation;
  };
}
