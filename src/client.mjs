/** Add folder drop handling through the shell overlay slot. */
import React, { useEffect, useState } from 'react';
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { installDropEvents } from './drop.mjs';
import { dictionaries } from './locales.mjs';

export const name = 'workspace-drop-client';
export const inject = ['slots', 'workspaces', 'locale'];
const namespace = 'workspaceDrop';
const css = `
.dsh-workspace-drop-target{position:fixed;z-index:1000;pointer-events:none;box-sizing:border-box;border:2px dashed var(--dsw-alias-brand-primary);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;font:inherit}
.dsh-workspace-drop-status{position:fixed;pointer-events:auto;z-index:1001;left:16px;bottom:64px;max-width:min(440px,calc(100vw - 32px));max-height:50vh;overflow:auto;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;overflow-wrap:anywhere}
.dsh-workspace-drop-status ul{margin:8px 0;padding-left:20px}.dsh-workspace-drop-status button{margin-top:8px;padding:4px 10px;background:var(--dsw-alias-bg-layer-2);color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;cursor:pointer}
`;

function Overlay({ install, t }) {
  const [state, setState] = useState({ kind: 'idle', seq: 0 });
  useEffect(() => install(next => setState(previous => ({ ...next, seq: previous.seq + 1 }))), [install]);
  if (state.kind === 'idle') return null;
  if (state.kind === 'drag') return React.createElement('div', { className: 'dsh-workspace-drop-target', style: state.rect }, t('drop'));
  if (state.kind === 'success') return React.createElement(Toast, {
    key: state.seq,
    text: t('successDetail', { titles: state.added.join(t('titleSeparator')) }),
    tone: 'success', holdMs: 6000,
    onDone: () => setState(previous => ({ kind: 'idle', seq: previous.seq })),
  });
  const message = t(state.kind === 'error' ? 'failed' : state.kind);
  return React.createElement('div', { className: 'dsh-workspace-drop-status', role: state.kind === 'error' || state.kind === 'partial' ? 'alert' : 'status' },
    React.createElement('div', null, message),
    state.added?.length > 0 && React.createElement('ul', null, ...state.added.map((title, i) => React.createElement('li', { key: i }, title))),
    state.errors?.length > 0 && React.createElement('ul', null, ...state.errors.map((error, i) => React.createElement('li', { key: i }, error))),
    state.missing > 0 && React.createElement('p', null, t('unsupported')),
    state.detail && React.createElement('p', null, state.detail),
    state.kind !== 'busy' && React.createElement('button', { type: 'button', onClick: () => setState(previous => ({ kind: 'idle', seq: previous.seq })) }, t('dismiss')));
}

/** Mount locale, styles and a scoped folder-drop overlay; unloading waits for in-flight registration. */
export function apply(ctx) {
  const stops = new Set();
  const install = publish => {
    const bridge = window.__DSH_HOST_PATHS__;
    const stop = installDropEvents({ document, window,
      pathFor: typeof bridge?.pathFor === 'function' ? file => bridge.pathFor(file) : undefined,
      create: input => ctx.workspaces.create(input), publish,
    });
    stops.add(stop);
    return () => { void stop().finally(() => stops.delete(stop)); };
  };
  ctx.effect(() => ctx.locale.register(namespace, dictionaries), 'workspace-drop: locale');
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-workspace-drop'; style.textContent = css; document.head.append(style);
    return () => style.remove();
  }, 'workspace-drop: style');
  ctx.effect(() => async () => { await Promise.all([...stops].map(stop => stop())); stops.clear(); }, 'workspace-drop: pending registrations');
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'workspace-drop', locale: namespace,
    inject: () => ({ install }),
  }, Overlay));
}
