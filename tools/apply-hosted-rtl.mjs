#!/usr/bin/env node
/**
 * apply-hosted-rtl.mjs — inject the Persian RTL patch into the hosted Freebuff UI.
 *
 * Since the 2026-10-31 desktop update the chat window is no longer the local
 * orchestrator page: the app opens https://freebuff.com in a sandboxed window
 * whose preload is `electron/hosted-preload.cjs` inside app.asar. Patching the
 * local ui/*.css|js files can no longer reach the chat, so the injected block
 * lives in that preload instead.
 *
 * What it does:
 *   1. builds one self-contained block = CSS (hosted variant) + Vazirmatn
 *      (base64 -> blob: URL at runtime) + the dir="auto" sweep from
 *      freebuff-rtl.js;
 *   2. rewrites resources/app.asar so `electron/hosted-preload.cjs` ends with
 *      that block (idempotent: the previous block is stripped first, so an app
 *      update that ships a new upstream preload is handled correctly);
 *   3. verifies the new archive entry by entry against the SHA256 hashes the
 *      asar header already carries, then leaves a .bak of the untouched file.
 *
 * Usage:
 *   node tools/apply-hosted-rtl.mjs [--install <dir>] [--dry-run] [--verify-only]
 *
 * Electron fuses on this build keep EnableEmbeddedAsarIntegrityValidation off,
 * so a modified app.asar still loads. OnlyLoadAppFromAsar is on, which is why
 * the archive itself (not a resources/app folder) is the patch target.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const MARKER = '/* freebuff-rtl-hosted v1'
const TARGET = '/electron/hosted-preload.cjs'
const ASAR = 'app.asar'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dryRun = args.includes('--dry-run')
const verifyOnly = args.includes('--verify-only')
const quiet = args.includes('--quiet')

const installDir =
  opt('--install') || path.join(process.env.LOCALAPPDATA, 'Programs', '@codebufffreebuff-desktop')
const asarPath = path.join(installDir, 'resources', ASAR)

function log(...parts) {
  if (!quiet) console.log(...parts)
}
function fail(message) {
  console.error('ERROR: ' + message)
  process.exitCode = 1
  throw new Error(message)
}

/* ---------------------------------------------------------------- asar I/O */

function readAsar(file) {
  const buf = fs.readFileSync(file)
  const sizeField = buf.readUInt32LE(0)
  if (sizeField !== 4) fail(`${file} is not an asar archive (size field ${sizeField})`)
  const pickleSize = buf.readUInt32LE(4)
  const jsonLen = buf.readUInt32LE(12)
  const jsonStart = 16
  const json = buf.subarray(jsonStart, jsonStart + jsonLen).toString('utf8')
  const header = JSON.parse(json)
  const dataStart = 8 + pickleSize
  return { buf, header, jsonLen, pickleSize, dataStart }
}

function* walk(node, prefix = '') {
  for (const [name, value] of Object.entries(node.files || {})) {
    if (value.files) yield* walk(value, prefix + '/' + name)
    else yield [prefix + '/' + name, value]
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function readEntry(archive, node) {
  const start = archive.dataStart + Number(node.offset)
  return archive.buf.subarray(start, start + Number(node.size))
}

function verifyArchive(file) {
  const archive = readAsar(file)
  let checked = 0
  let mismatched = 0
  for (const [name, node] of walk(archive.header)) {
    const hash = node.integrity && node.integrity.hash
    if (!hash) continue
    checked++
    const actual = sha256(readEntry(archive, node))
    if (actual !== hash) {
      mismatched++
      console.error(`  MISMATCH ${name}: header ${hash.slice(0, 12)}… file ${actual.slice(0, 12)}…`)
    }
  }
  return { checked, mismatched }
}

/* ------------------------------------------------------------- build block */

const firstExisting = (names) => names.map((n) => path.join(REPO, n)).find((p) => fs.existsSync(p))

function buildBlock() {
  const cssPath = firstExisting(['hosted/freebuff-rtl-hosted.css', 'freebuff-rtl-hosted.css'])
  const jsPath = firstExisting(['freebuff-rtl.js'])
  const fontPath = firstExisting(['Vazirmatn-Variable.woff2', 'vazirmatn-var.woff2'])
  if (!cssPath) fail('missing hosted/freebuff-rtl-hosted.css in the kit')
  if (!jsPath) fail('missing freebuff-rtl.js in the kit')
  if (!fontPath) fail('missing the Vazirmatn woff2 in the kit')
  for (const p of [cssPath, jsPath, fontPath]) {
    if (!fs.existsSync(p)) fail('missing source file: ' + p)
  }
  const css = fs.readFileSync(cssPath, 'utf8')
  const js = fs.readFileSync(jsPath, 'utf8')
  const fontB64 = fs.readFileSync(fontPath).toString('base64')
  if (!css.includes('__RTL_FONT_URL__')) fail('hosted css lost its __RTL_FONT_URL__ placeholder')

  return [
    MARKER + ' (freebuff-rtl-patch) — generated block, do not edit here.',
    '   Rerun apply-hosted-rtl.ps1 after every app update. Delete this block to undo. */',
    ';(function freebuffRtlHosted() {',
    "  'use strict'",
    '  try {',
    '    var CSS = ' + JSON.stringify(css) + ';',
    '    var FONT_B64 = ' + JSON.stringify(fontB64) + ';',
    '    var done = false;',
    '    var fontUrl;',
    '    function font() {',
    '      if (fontUrl !== undefined) return fontUrl;',
    '      fontUrl = null;',
    '      try {',
    '        var raw = atob(FONT_B64);',
    '        var bytes = new Uint8Array(raw.length);',
    '        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);',
    "        fontUrl = URL.createObjectURL(new Blob([bytes], { type: 'font/woff2' }));",
    '      } catch (fontErr) {',
    '        fontUrl = null;',
    '      }',
    '      return fontUrl;',
    '    }',
    '    // A preload can run before documentElement exists, so installation is',
    '    // retried instead of being skipped for the lifetime of the window.',
    '    function install() {',
    '      if (done) return true;',
    '      try {',
    '        var root = document.documentElement;',
    '        if (!root) return false;',
    "        if (root.getAttribute('data-freebuff-rtl-hosted') === '1') { done = true; return true; }",
    '        var url = font();',
    '        var css = url',
    "          ? CSS.split('__RTL_FONT_URL__').join(url)",
    '          : CSS.replace(/@font-face\\s*{[^}]*}/g, \'\');',
    "        var style = document.createElement('style');",
    "        style.id = 'freebuff-rtl-hosted-style';",
    '        style.textContent = css;',
    '        (document.head || root).appendChild(style);',
    "        root.setAttribute('data-freebuff-rtl-hosted', '1');",
    '        done = true;',
    '        return true;',
    '      } catch (styleErr) {',
    '        return false;',
    '      }',
    '    }',
    '    if (!install()) {',
    '      var tries = 0;',
    '      var timer = setInterval(function () {',
    '        if (install() || ++tries > 600) clearInterval(timer);',
    '      }, 50);',
    '    }',
    '',
    // Leading `;` matters: the freebuff-rtl.js source starts with a comment and
    // an IIFE, which would otherwise chain onto the previous call expression.
    ';' + js.trim(),
    '  } catch (err) {',
    '    /* never let the patch break the app */',
    '  }',
    '})()',
    '',
  ].join('\n')
}

/* -------------------------------------------------------------- write asar */

function rewriteAsar(file, newContent) {
  const archive = readAsar(file)
  const entries = new Map(walk(archive.header))
  const node = entries.get(TARGET)
  if (!node) fail(`entry ${TARGET} not found in ${file}`)

  const upstreamBuf = readEntry(archive, node)
  const current = upstreamBuf.toString('utf8')
  // Strip any block a previous run appended, so an app update that ships a new
  // upstream preload keeps its new code and only loses our old block.
  const markerAt = current.lastIndexOf(MARKER)
  const upstream = (markerAt >= 0 ? current.slice(0, markerAt) : current).replace(/\s*$/, '')
  const next = upstream + '\n\n' + newContent
  if (next === current) {
    log('ALREADY PATCHED - nothing to do.')
    return { changed: false }
  }

  const nextBuf = Buffer.from(next, 'utf8')
  const oldData = archive.buf.subarray(archive.dataStart)
  const newOffset = oldData.length
  const integrity = {
    algorithm: 'SHA256',
    hash: sha256(nextBuf),
    blockSize: 4194304,
    blocks: [],
  }
  for (let at = 0; at < nextBuf.length; at += integrity.blockSize) {
    integrity.blocks.push(sha256(nextBuf.subarray(at, at + integrity.blockSize)))
  }
  node.offset = String(newOffset)
  node.size = nextBuf.length
  node.integrity = integrity

  let json = JSON.stringify(archive.header)
  while (Buffer.byteLength(json) % 4 !== 0) json += ' '
  const jsonLen = Buffer.byteLength(json)
  const pickleSize = jsonLen + 8
  const newDataStart = 8 + pickleSize
  const delta = newDataStart - archive.dataStart
  if (delta !== 0) {
    for (const [, entry] of entries) {
      if (entry.offset === undefined || entry.offset === null || entry.offset === '') continue
      const shifted = Number(entry.offset) + delta
      entry.offset = typeof entry.offset === 'string' ? String(shifted) : shifted
    }
    node.offset = String(newOffset)
  }

  const out = Buffer.alloc(newDataStart + oldData.length + nextBuf.length)
  out.writeUInt32LE(4, 0)
  out.writeUInt32LE(pickleSize, 4)
  out.writeUInt32LE(pickleSize - 4, 8)
  out.writeUInt32LE(jsonLen, 12)
  out.write(json, 16, 'latin1')
  oldData.copy(out, newDataStart)
  nextBuf.copy(out, newDataStart + oldData.length)

  if (dryRun) {
    log(`DRY RUN: would write ${out.length} bytes (was ${archive.buf.length})`)
    return { changed: true, dryRun: true }
  }

  const backup = file + '.freebuff-rtl.bak'
  const alreadyPatched = current.includes(MARKER)
  if (!alreadyPatched) {
    fs.copyFileSync(file, backup)
    log('backup: ' + backup)
  }

  const tmp = file + '.freebuff-rtl.new'
  fs.writeFileSync(tmp, out)
  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.renameSync(tmp, file)
      lastError = null
      break
    } catch (err) {
      lastError = err
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * attempt)
    }
  }
  if (lastError) {
    try {
      fs.copyFileSync(tmp, file)
      fs.unlinkSync(tmp)
      lastError = null
    } catch (err) {
      lastError = err
    }
  }
  if (lastError) {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    fail(`could not replace ${file} (${lastError.code || lastError.message}) — close Freebuff and run again`)
  }
  return { changed: true }
}

/* -------------------------------------------------------------------- main */

function main() {
  if (!fs.existsSync(asarPath)) fail('app.asar not found: ' + asarPath)
  log('install: ' + installDir)

  if (verifyOnly) {
    const result = verifyArchive(asarPath)
    log(`verified ${result.checked} entries, ${result.mismatched} mismatched`)
    if (result.mismatched) process.exitCode = 1
    return
  }

  const block = buildBlock()
  const result = rewriteAsar(asarPath, block)
  if (!result.changed) return
  if (result.dryRun) return

  const verification = verifyArchive(asarPath)
  if (verification.mismatched) fail(`archive self-check failed: ${verification.mismatched} mismatched entries`)

  const archive = readAsar(asarPath)
  const entry = new Map(walk(archive.header)).get(TARGET)
  const text = readEntry(archive, entry).toString('utf8')
  if (!text.includes(MARKER)) fail('patched preload does not contain the injected block')

  log(`PATCHED ${TARGET}`)
  log(`  preload now ${entry.size} bytes, archive ${archive.buf.length} bytes, ${verification.checked} entries verified`)
}

try {
  main()
} catch (err) {
  if (!process.exitCode) process.exitCode = 1
}
