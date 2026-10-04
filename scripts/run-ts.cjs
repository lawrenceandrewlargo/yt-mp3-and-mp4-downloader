// In-process TypeScript runner for restricted environments that cannot spawn esbuild.
// Normal npm scripts use tsx. This recovery tool performs no external process calls.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
require.extensions['.ts'] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  module._compile(source, filename);
};
const filename = path.resolve(process.argv[2]);
const moduleEntry = new Module(filename, module);
moduleEntry.filename = filename;
moduleEntry.paths = Module._nodeModulePaths(path.dirname(filename));
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
moduleEntry._compile(`(async () => {\n${source}\n})().catch(error => { console.error(error.message); process.exitCode = 1; });`, filename);
