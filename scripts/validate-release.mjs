import { readdir, readFile, lstat, access } from 'node:fs/promises';
import { resolve, relative, join, dirname, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = resolve(process.argv[2] || '.');
const errors = [];
const files = [];
const skipped = new Set(['.git', 'dist', 'node_modules']);

async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(folder, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) { errors.push(`Symlink is not distributable: ${relative(root, path)}`); continue; }
    if (info.isDirectory()) await walk(path);
    else if (info.isFile()) files.push({ path, info });
  }
}

await walk(root);
const manifest = JSON.parse(await readFile(join(root, '.claude-plugin/plugin.json'), 'utf8'));
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name) || manifest.name.length > 64) errors.push('Invalid package slug');
if (!manifest.displayName || manifest.displayName.length > 64) errors.push('Invalid displayName');
if (!manifest.description || manifest.description.length > 500) errors.push('Description must fit 500 characters');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('Version must be semantic');
for (const key of ['hooks', 'mcpServers', 'lspServers', 'agents', 'commands', 'userConfig']) if (Object.hasOwn(manifest, key)) errors.push(`Skills-only manifest unexpectedly declares ${key}`);
for (const path of ['hooks', 'commands', 'agents', 'bin', '.mcp.json', '.lsp.json', 'package-lock.json', '.npmrc']) {
  try { await access(join(root, path)); errors.push(`Unexpected runtime/install surface: ${path}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
for (const name of ['README.md', 'LICENSE', 'PRIVACY.md', 'SECURITY.md', 'SUPPORT.md', 'TERMS.md']) {
  try { await access(join(root, name)); } catch { errors.push(`Missing public file: ${name}`); }
}
for (const key of ['homepage', 'repository', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl', 'termsOfServiceUrl']) {
  try { if (new URL(manifest[key]).protocol !== 'https:') errors.push(`${key} must be HTTPS`); } catch { errors.push(`Invalid public URL: ${key}`); }
}
const entries = files.filter(({ path }) => /\/skills\/[^/]+\/SKILL\.md$/.test(path));
if (entries.length !== 1) errors.push('Expected one discoverable skill');
const forbiddenName = /^(?:\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX|\.env(?:\..*)?|.*\.pyc)$/i;
const windowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const secrets = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/, /\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,}\b/, /\bapify_api_[a-zA-Z0-9]{20,}\b/];
const names = new Set();
for (const { path, info } of files) {
  const rel = relative(root, path).split(sep).join('/');
  for (const part of rel.split('/')) if (forbiddenName.test(part) || windowsName.test(part) || /[:]|[ .]$/.test(part)) errors.push(`Invalid distributable path: ${rel}`);
  if (names.has(rel.toLowerCase())) errors.push(`Case-colliding path: ${rel}`);
  names.add(rel.toLowerCase());
  if (info.size > 256 * 1024 && !/\.(?:png|jpg|jpeg|webp|gif|svg)$/.test(rel)) errors.push(`Uninspectable oversized file: ${rel}`);
  if (/\.(?:zip|tgz|pdf|dmg|exe|ico)$/.test(rel)) errors.push(`Binary archive/executable inside source: ${rel}`);
  const content = await readFile(path, 'utf8');
  if (secrets.some(pattern => pattern.test(content))) errors.push(`Possible credential: ${rel}`);
  if (/\/Users\/|\/private\/tmp\//.test(content)) errors.push(`Local machine path: ${rel}`);
  const placeholders = ['[' + 'TODO:', '[' + 'FIXME:', '<' + 'TODO>'];
  if (placeholders.some(marker => content.includes(marker))) errors.push(`Unresolved placeholder: ${rel}`);
  if (rel.endsWith('.md')) {
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      let target = match[1].split('#')[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      target = resolve(dirname(path), target);
      if (!target.startsWith(root + sep)) { errors.push(`Reference escapes plugin root: ${rel}`); continue; }
      try { await access(target); } catch { errors.push(`Missing referenced resource in ${rel}: ${match[1]}`); }
    }
  }
}
if (files.length > 512) errors.push('File count exceeds conservative directory preflight');
for (const { path } of entries) {
  const content = await readFile(path, 'utf8');
  const front = content.match(/^---\n([\s\S]+?)\n---\n/);
  if (!front || !/^name: [a-z0-9-]+$/m.test(front[1]) || !/^description: .+$/m.test(front[1])) errors.push('Skill metadata must be valid single-line discovery text');
}
const icon = resolve(root, manifest.icon);
if (!icon.startsWith(root + sep)) errors.push('Icon must be inside plugin');
try { await access(icon); } catch { errors.push('Missing icon'); }
if (!errors.length) {
  for (const name of ['plugin.json', 'marketplace.json']) {
    try { await execute('claude', ['plugin', 'validate', join(root, '.claude-plugin', name), '--strict'], { timeout: 30000 }); }
    catch { errors.push(`Native Claude strict validation failed for ${name}`); }
  }
}
process.stdout.write(JSON.stringify({ verdict: errors.length ? 'FAIL' : 'PASS', version: manifest.version, displayName: manifest.displayName, descriptionCharacters: manifest.description.length, files: files.length, skills: entries.length, runtimeDependencies: 'Node standard library; separately installed official Apify CLI for live operations', errors, limits: 'Source/package preflight only; portal and runtime canary checks remain separate' }, null, 2) + '\n');
process.exitCode = errors.length ? 1 : 0;
