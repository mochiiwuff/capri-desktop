'use strict';

// No extra runtime dependency on the user's Mac: ship a compiled Swift helper.
// Source development/building needs Apple's Command Line Tools (`xcode-select --install`).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform === 'darwin') {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'native', 'macos', 'CapriHelper.swift');
  const dir = path.join(root, 'native', 'bin');
  const universal = process.argv.includes('--universal');
  const archs = universal ? ['arm64', 'x86_64'] : [process.arch === 'arm64' ? 'arm64' : 'x86_64'];
  fs.mkdirSync(dir, { recursive: true });
  const outputs = archs.map((arch) => {
    const output = path.join(dir, `capri-macos-${arch}`);
    if (!fs.existsSync(output) || fs.statSync(output).mtimeMs < fs.statSync(source).mtimeMs) {
      execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos13.0`, source, '-o', output], { stdio: 'inherit' });
    }
    return output;
  });
  const target = path.join(dir, 'capri-macos');
  if (universal) execFileSync('xcrun', ['lipo', '-create', ...outputs, '-output', target]);
  else fs.copyFileSync(outputs[0], target);
  fs.chmodSync(target, 0o755);
  // electron-builder requires at least a 512px macOS icon. Reuse the existing artwork.
  execFileSync('/usr/bin/sips', ['-z', '1024', '1024', path.join(root, 'assets/icons/capri.png'),
    '--out', path.join(dir, 'capri.png')], { stdio: 'pipe' });
  console.log(`[capri] macOS helper: ${archs.join(' + ')}`);
}
