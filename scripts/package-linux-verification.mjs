// A local, content-addressed handoff directory. No archive tool, upload, or installer.
import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const top = new Set(['README.md', 'CONTRIBUTING.md', '.gitignore', 'package.json', 'pnpm-lock.yaml']);
const folders = new Map([
  ['src', /\.mjs$/u], ['test', /\.mjs$/u], ['scripts', /\.(?:mjs|sh|md)$/u],
  ['specs', /\.(?:md|ts)$/u], ['schemas', /\.schema\.json$/u], ['examples', /\.json$/u], ['docs', /\.md$/u]
]);
const maxFiles = 1024, maxBytes = 32 * 1024 * 1024;
const excludedDirectories = new Set(['node_modules', 'artifacts', 'runtime', 'coverage', 'dist', 'build']);
const refuse = message => { throw new Error(message); };
const normalized = value => typeof value === 'string' && /^[A-Za-z0-9._/-]+$/u.test(value)
  && !value.startsWith('/') && !value.includes('//') && !value.split('/').some(part => part === '.' || part === '..');
const within = (root, value) => { const relative = path.relative(root, value); return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`); };

function allowed(relative) {
  if (top.has(relative)) return true;
  const [folder, ...rest] = relative.split('/');
  return folders.has(folder) && rest.length > 0 && !rest.some(part => part.startsWith('.') || excludedDirectories.has(part)) && folders.get(folder).test(relative);
}

async function sourceNames(root) {
  const names = [];
  async function walk(directory, relative) {
    const details = await lstat(directory);
    if (details.isSymbolicLink() || !details.isDirectory()) refuse('Source directory is not an ordinary directory.');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`, absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) refuse('Symlinks are excluded from the Linux handoff.');
      if (entry.isDirectory()) { if (!entry.name.startsWith('.') && !excludedDirectories.has(entry.name)) await walk(absolute, child); }
      else if (entry.isFile() && allowed(child)) names.push(child);
    }
  }
  for (const name of top) {
    const entry = await lstat(path.join(root, name));
    if (entry.isSymbolicLink() || !entry.isFile()) refuse('Required root input is not an ordinary file.');
    names.push(name);
  }
  for (const folder of folders.keys()) await walk(path.join(root, folder), folder);
  names.sort();
  if (names.length > maxFiles || !names.every(normalized)) refuse('Source paths exceed the handoff bounds.');
  return names;
}

function manifestDigest(files) { return hash(Buffer.from(JSON.stringify(files))); }
function metadata(files) {
  return { bundle_version: 1, protocol_version: '0.1.0', node_engine: '>=22', package_manager: 'pnpm@11.25.0',
    content_sha256: manifestDigest(files), file_count: files.length, total_bytes: files.reduce((n, f) => n + f.bytes, 0), files };
}

export async function verifyLinuxBundle(directory, { allowGenerated = true } = {}) {
  const root = path.resolve(directory), details = await lstat(root);
  if (details.isSymbolicLink() || !details.isDirectory()) refuse('The handoff must be an ordinary directory.');
  const manifestPath = path.join(root, 'linux-verification-manifest.json');
  const manifestStat = await lstat(manifestPath);
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile() || manifestStat.size > 512 * 1024) refuse('The manifest is invalid.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.bundle_version !== 1 || manifest.protocol_version !== '0.1.0' || manifest.node_engine !== '>=22'
    || manifest.package_manager !== 'pnpm@11.25.0' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > maxFiles) refuse('The manifest metadata is incompatible.');
  const seen = new Set(); let total = 0;
  for (const file of manifest.files) {
    if (!normalized(file.path) || !allowed(file.path) || seen.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0
      || !/^[0-9a-f]{64}$/u.test(file.sha256)) refuse('The manifest file list is invalid.');
    seen.add(file.path); total += file.bytes;
    if (total > maxBytes) refuse('The handoff exceeds its size bound.');
    let parent = root;
    for (const part of file.path.split('/')) {
      parent = path.join(parent, part); const info = await lstat(parent);
      if (info.isSymbolicLink()) refuse('A handoff path contains a symlink.');
    }
    const content = await readFile(parent);
    if (content.length !== file.bytes || hash(content) !== file.sha256) refuse('A handoff file does not match its SHA-256 record.');
  }
  if (manifest.files.some((file, i) => i && manifest.files[i - 1].path >= file.path) || manifest.file_count !== seen.size
    || manifest.total_bytes !== total || manifest.content_sha256 !== manifestDigest(manifest.files)) refuse('The manifest aggregate digest is invalid.');
  for (const name of top) if (!seen.has(name)) refuse('A required handoff input is missing.');
  for (const name of ['scripts/run-linux-verification.sh', 'scripts/package-linux-verification.mjs', 'scripts/verify-reference.mjs']) if (!seen.has(name)) refuse('A required verification script is missing.');
  const actual = await sourceNames(root);
  if (actual.length !== seen.size || actual.some(name => !seen.has(name))) refuse('Unexpected source files were added to the handoff.');
  const rootEntries = await readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.name === 'linux-verification-manifest.json' || top.has(entry.name) || folders.has(entry.name)) continue;
    if (allowGenerated && entry.name === 'node_modules' && entry.isDirectory()) continue;
    refuse('Unexpected files or configuration were added to the handoff.');
  }
  // Reports generated by this handoff are optional outputs, never inputs to the digest.
  for (const folder of folders.keys()) {
    async function extras(directory, relative) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink()) refuse('Symlinks are excluded from handoff source directories.');
        if (entry.isDirectory()) await extras(path.join(directory, entry.name), name);
        else if (!seen.has(name) && !(allowGenerated && /^docs\/review\/phase-[34]-[A-Za-z0-9.-]+\.json$/u.test(name))) refuse('Unexpected source-directory output is present.');
      }
    }
    await extras(path.join(root, folder), folder);
  }
  const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (packageMetadata.packageManager !== manifest.package_manager || packageMetadata.engines?.node !== manifest.node_engine) refuse('Package manager or Node policy disagrees with the manifest.');
  return { directory: root, content_sha256: manifest.content_sha256, file_count: seen.size, total_bytes: total };
}

export async function packageLinuxVerification({ source = workspace, output } = {}) {
  const root = path.resolve(source), names = await sourceNames(root), captured = [], buffers = new Map(); let total = 0;
  for (const name of names) {
    const content = await readFile(path.join(root, ...name.split('/'))); total += content.length;
    if (total > maxBytes) refuse('The handoff exceeds its size bound.');
    if (name === 'scripts/run-linux-verification.sh' && content.includes(13)) refuse('The Linux runner must use LF line endings.');
    captured.push({ path: name, bytes: content.length, sha256: hash(content) }); buffers.set(name, content);
  }
  const packageMetadata = JSON.parse(buffers.get('package.json').toString('utf8'));
  if (packageMetadata.packageManager !== 'pnpm@11.25.0' || packageMetadata.engines?.node !== '>=22') refuse('Unexpected package-manager or Node policy.');
  const manifest = metadata(captured), outputRoot = path.join(root, 'artifacts', 'linux-verification');
  const destination = path.resolve(output ?? path.join(outputRoot, manifest.content_sha256));
  if (!within(outputRoot, destination)) refuse('Handoff output must remain beneath artifacts/linux-verification and cannot replace its root.');
  let parent = root;
  for (const part of path.relative(root, path.dirname(destination)).split(path.sep)) {
    parent = path.join(parent, part);
    try { const info = await lstat(parent); if (info.isSymbolicLink() || !info.isDirectory()) refuse('Output parent must be an ordinary directory.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(parent); }
  }
  // Refuse a mixed capture if the shared workspace changed during collection.
  if (JSON.stringify(await sourceNames(root)) !== JSON.stringify(names)) refuse('Source inputs changed during packaging; rerun after editing stops.');
  for (const file of captured) if (hash(await readFile(path.join(root, ...file.path.split('/')))) !== file.sha256) refuse('Source inputs changed during packaging; rerun after editing stops.');
  try { await mkdir(destination); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const verified = await verifyLinuxBundle(destination, { allowGenerated: false });
    if (verified.content_sha256 !== manifest.content_sha256) refuse('Existing output belongs to a different handoff.');
    return verified;
  }
  for (const file of captured) {
    const target = path.join(destination, ...file.path.split('/'));
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, buffers.get(file.path), { flag: 'wx' });
  }
  await writeFile(path.join(destination, 'linux-verification-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return verifyLinuxBundle(destination, { allowGenerated: false });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (args.length === 2 && args[0] === '--check') result = await verifyLinuxBundle(args[1]);
    else if (!args.length || args.length === 2 && args[0] === '--output') result = await packageLinuxVerification({ output: args[1] });
    else refuse('Usage: node scripts/package-linux-verification.mjs [--output workspace-directory | --check handoff-directory]');
    console.log(JSON.stringify({ result: 'integrity_verified', ...result }, null, 2));
  } catch (error) { console.error(`Linux handoff failed: ${error.message}`); process.exitCode = 1; }
}
