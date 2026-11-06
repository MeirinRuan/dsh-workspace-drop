# Workspace Drop guide

[中文](guide.zh.md) · [README](../README.md) · [License](../LICENSE)

## Installation

This bundle supports DSH `0.2.2-rc.1` only. Development requires Node.js `^22.19.0 || >=24.0.0` and pnpm `11.28.5`.

In DSH Plugin Manager, install the release tarball from `https://github.com/MeirinRuan/dsh-workspace-drop/releases/latest/download/dsh-workspace-drop.tgz`, then enable `dsh-workspace-drop`. You can also install a local checkout after building it. The bundle patch adds the workspace-drop plugin, whose client contributes a `shell.overlay` entry.

Disable the old `@local/dsh-workspace-drop` bundle before enabling this public package. They share the same overlay, event listeners and locale namespace and must not be enabled together.

Disable or uninstall this bundle in Plugin Manager to remove its listeners, locale dictionaries, styles and overlay. Unloading waits for a started registration and stops subsequent queued registrations. Existing workspace registrations remain available.

## Behavior

Drag one or more local folders from your file manager onto the left workspace list or the workspace picker on the new-conversation screen. Releasing them registers their existing paths through DSH's `workspaces.create` service. The workspace list updates immediately; select a workspace to start a conversation. Existing registrations are reused and files stay in their original locations.

Directory paths are captured synchronously through the desktop `__DSH_HOST_PATHS__.pathFor` bridge during the drop. Duplicate paths within one drop are deduplicated, and directories are registered sequentially. A failure does not stop later folders from being processed.

Successful additions show a top-center success toast listing workspace titles, held for six seconds before fading out. Partial failures show both registered workspace titles and individual errors; Dismiss closes the details. Ordinary files are rejected with a folder-only message. While registration is in progress, additional drops in the target region are consumed without starting a second operation.

Composer attachments and internal session row moves keep their existing behavior. This plugin adds no model tools, prompts or session events. Workspace selection continues to determine the working directory for new conversations.

## Development

Clone the [repository](https://github.com/MeirinRuan/dsh-workspace-drop) and run these commands from its root:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm pack --out /path/outside/checkout/dsh-workspace-drop.tgz
```

The [build script](https://github.com/MeirinRuan/dsh-workspace-drop/blob/main/scripts/build.mjs) uses this package's pinned esbuild dependency; no DSH source checkout is needed. The package manager configuration allows esbuild's build step. React and DSH UI primitives are supplied by the DSH module loader, so they are external to the client bundle. `prepack` rebuilds the client before producing an archive.

The [behavior tests](https://github.com/MeirinRuan/dsh-workspace-drop/blob/main/tests/drop.test.mjs) cover directory intake, deduplication, unsupported paths, scoped interception, partial results, concurrent drops and unload cleanup. They use Node's built-in test runner and mocked DOM events; their temporary filesystem data is created under the operating system's temporary directory. Keep any extra validation output outside the checkout.

The [market entry](https://github.com/MeirinRuan/dsh-workspace-drop/blob/main/market/MeirinRuan__dsh-workspace-drop.yml) is a submission draft. Submit it only after the GitHub repository is at least one day old.

## Limitations

Folder registration requires a desktop window exposing the host path bridge. An ordinary browser cannot reveal a dropped folder's original absolute path. The plugin displays that limitation instead of guessing a path or uploading a copy. This also applies when the browser and DSH host run on different machines.

Drop targets depend on the DSH DOM slot anchors `sidebar.workspaces` and `conversation.hero.workspace`; compatibility with other DSH versions is not declared. The Node behavior tests simulate drop events and do not verify a real file-manager-to-desktop drag or a live backend registration.
