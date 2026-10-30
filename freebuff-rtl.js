/**
 * freebuff-rtl.js — per-block text direction for Freebuff Desktop chat (v3).
 *
 * Sets dir="auto" on the text blocks inside chat messages so each paragraph,
 * heading, list item and table-cell text picks its own base direction from
 * its content: Persian texts lay out RTL (reading order, punctuation,
 * markers), English texts stay LTR. `dir="auto"` (unlike a CSS-only
 * `unicode-bidi: plaintext`) also drives the marker side of list items,
 * which pure CSS cannot do per item.
 *
 * Loaded as a same-origin script from the app's own server, so it passes the
 * app CSP (`script-src 'self' ...`). A MutationObserver keeps the attributes
 * applied across React re-renders and streamed messages. All work is guarded;
 * on any failure it silently stops rather than hurting the app.
 *
 * Scope: chat message text only. Terminals, file views, diffs and the rest of
 * the app are untouched.
 *
 * Tables: the app renders every table LTR (first column on the left, cells
 * left-aligned). A table is marked dir="rtl" when its header cells are
 * Arabic-script; the stylesheet then mirrors the column order and aligns cells
 * to the right. English tables are left exactly as the app draws them.
 *
 * Composer note: in the current build the message input is a contenteditable
 * div (`div.composer-input[data-composer-input]`), not a textarea — the
 * `[data-composer-input]` selector covers it, while `.composer textarea` stays
 * as a safety net in case a future build switches back. The queued-prompt
 * edit box (`.qedit`) and the Steer box (`.thread-detail-steer-input`) are
 * plain textareas; they get the same treatment from the CSS `plaintext` rule.
 * The question/ask dock labels (`.question-text`, `.question-chip`,
 * `.question-hint`, `.question-option-label`, `.question-option-desc`) and its
 * free-text input (`.question-free`, a textarea) get the same treatment.
 */
(function freebuffRtl() {
  if (typeof window === 'undefined' || !window.document) return
  if (window.__freebuffRtlV3) return
  window.__freebuffRtlV3 = true

  // Text blocks inside chat message content. *.md-table-* stays out: tables
  // must remain LTR islands.
  var BLOCK_SELECTOR = [
    '.prose p', '.prose h1', '.prose h2', '.prose h3', '.prose h4', '.prose h5', '.prose h6',
    '.prose blockquote', '.prose li', '.prose dd', '.prose dt',
    '.user-message-text', '.question-plan',
    // question/ask dock (span-based, not .prose)
    '.question-text', '.question-chip', '.question-hint',
    '.question-option-label', '.question-option-desc',
  ].join(', ')
  var TEXTAREA_SELECTOR = [
    '.composer [data-composer-input]', '.composer textarea',
    '.qedit',
    '.thread-detail-steer-input',
    '.question-free',
  ].join(', ')
  var TABLE_SELECTOR = '.prose table'

  var processed = new WeakSet()
  var tablesSeen = new WeakSet()

  function applyBlock(el) {
    if (processed.has(el)) return
    // dir="auto": Chromium computes the element's direction from its own first
    // strong character, which is exactly the wanted per-paragraph behavior.
    el.setAttribute('dir', 'auto')
    processed.add(el)
  }

  // Arabic-script code points: Arabic, Persian, Urdu, Hebrew and their
  // presentation forms. Latin letters are counted as the opposite side.
  function isRtlCode(code) {
    return (
      (code >= 0x0590 && code <= 0x05ff) ||
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0x0750 && code <= 0x077f) ||
      (code >= 0x08a0 && code <= 0x08ff) ||
      (code >= 0xfb50 && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    )
  }

  function countStrong(text, total) {
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i)
      if (isRtlCode(c)) total.rtl++
      else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) total.ltr++
    }
    return total
  }

  // The header row is the language of the table's own labels; body rows are a
  // fallback for headerless/numeric tables. Majority wins, so a table of
  // English commands stays LTR even inside a Persian thread.
  function markTable(table) {
    if (tablesSeen.has(table)) return
    tablesSeen.add(table)

    var head = table.tHead
    var total = { rtl: 0, ltr: 0 }
    if (head && head.rows.length) {
      for (var i = 0; i < head.rows.length; i++) {
        countStrong(head.rows[i].textContent || '', total)
      }
    } else if (table.rows.length) {
      countStrong(table.rows[0].textContent || '', total)
    }
    if (total.rtl + total.ltr < 2) {
      total = countStrong(table.textContent || '', { rtl: 0, ltr: 0 })
    }

    if (total.rtl > total.ltr) table.setAttribute('dir', 'rtl')
  }

  function sweep() {
    try {
      var blocks = document.querySelectorAll(BLOCK_SELECTOR)
      for (var i = 0; i < blocks.length; i++) applyBlock(blocks[i])
      var areas = document.querySelectorAll(TEXTAREA_SELECTOR)
      for (var j = 0; j < areas.length; j++) applyBlock(areas[j])
      var tables = document.querySelectorAll(TABLE_SELECTOR)
      for (var k = 0; k < tables.length; k++) markTable(tables[k])
    } catch (err) {
      /* leave the app alone if the DOM shape changed */
    }
  }

  var scheduled = false
  function schedule() {
    if (scheduled) return
    scheduled = true
    var run = function () {
      scheduled = false
      sweep()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 0)
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn()
    else document.addEventListener('DOMContentLoaded', fn, { once: true })
  }

  ready(function () {
    sweep()
    try {
      // Streamed tokens, mount/unmount and pop-out windows all re-render
      // message nodes; re-sweep after each batch, throttled to a frame.
      new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
      })
    } catch (err) {
      /* no observer: initial sweep still applied at load time */
    }
  })
})()
