/** Build the browser module-table factory with the shell's shared React runtime. */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const output = await build({ entryPoints: [fileURLToPath(new URL('src/client.mjs', root))], bundle: true, write: false,
  platform: 'browser', format: 'cjs', target: ['chrome120'], charset: 'utf8', external: ['react', '@deepseek-ai/dsh-client-ui-primitives'] });
const text = `window.__ModuleLoader__.load({id:"dsh-workspace-drop",factory(require){const module={exports:{}};const exports=module.exports;\n${output.outputFiles[0].text}\nreturn module.exports;}});\n`;
await mkdir(new URL('lib/', root), { recursive: true });
await writeFile(new URL('lib/client.js', root), text);
console.log(`Built workspace drop: ${Buffer.byteLength(text)} bytes`);
