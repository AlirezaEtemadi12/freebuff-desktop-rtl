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
 * the app are untouched. Tables keep their LTR layout (dir is NOT set on them).
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

  var processed = new WeakSet()

  function applyBlock(el) {
    if (processed.has(el)) return
    // dir="auto": Chromium computes the element's direction from its own first
    // strong character, which is exactly the wanted per-paragraph behavior.
    el.setAttribute('dir', 'auto')
    processed.add(el)
  }

  function sweep() {
    try {
      var blocks = document.querySelectorAll(BLOCK_SELECTOR)
      for (var i = 0; i < blocks.length; i++) applyBlock(blocks[i])
      var areas = document.querySelectorAll(TEXTAREA_SELECTOR)
      for (var j = 0; j < areas.length; j++) applyBlock(areas[j])
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
