# Freebuff Desktop RTL + Persian Font Patch

Community patch for [Freebuff Desktop](https://freebuff.com) (Electron, Windows) that makes
chat text render right-to-left correctly for Persian (Farsi), Arabic, Urdu and Hebrew —
while code blocks, tables, paths and the rest of the UI stay untouched.

Upstream feature requests: freebuff GitHub issues **#948** and **#1397**.

## What it does

- **Per-paragraph auto direction** in chat messages: a paragraph whose text starts with a
  strong RTL character (Persian/Arabic/Hebrew) is laid out RTL with correct punctuation and
  parentheses; English paragraphs stay LTR. Implemented with `unicode-bidi: plaintext` on
  message paragraphs plus a tiny same-origin script that sets `dir="auto"` on each text
  block (including list items — pure CSS cannot put the list bullet/number on the item's
  own side).
- **Code stays LTR**: inline code, code blocks, tables and diffs are bidi islands.
- **Composer / queued-prompt edit box / Steer box**: each **typed line** picks its own
  direction and alignment (`dir="auto"` + `unicode-bidi: plaintext`), so you can mix an
  English line and a Persian line in one message and each sits on its own side.
- **Persian font**: chat text uses [Vazirmatn](https://github.com/rastikerdar/vazirmatn)
  (variable weight 100–900, SIL OFL 1.1), served from the app's own origin (`127.0.0.1`)
  with no internet or CDN dependency. The `@font-face` is scoped with `unicode-range` to
  Arabic-script code points, so Persian/Arabic glyphs come from Vazirmatn while Latin text
  keeps the original Google Sans. Code keeps DM Mono; sidebar/buttons are untouched.

## Requirements & scope

- Windows (any modern Win10/11) — the patch edits files under `%LOCALAPPDATA%`, **no admin needed**.
- Scope is chat message text + text inputs only. No app-wide mirroring, no profile changes,
  no dependency on network at runtime.

## Install

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

Then fully close and reopen the Freebuff app.

Optional switches:

```powershell
# app installed somewhere unusual (or Linux/macOS path when ported):
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -UiPath "D:\Freebuff\resources\orchestrator\ui"

# silent, for a Startup-folder .vbs:
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Quiet
```

The installer:

1. Finds the app UI folder (`%LOCALAPPDATA%\Programs\@codebufffreebuff-desktop\resources\orchestrator\ui`).
2. Saves the untouched `index.html` as `index.html.freebuff-rtl.bak`.
3. Injects a `<style>` and a `<script src="/freebuff-rtl-user.js">` tag before `</head>`.
4. Copies `freebuff-rtl-user.js` and `Vazirmatn-Variable.woff2` next to it (served by the
   app's local server, so the app CSP accepts them).

Re-running the installer is safe — it refreshes the helper files and skips if already patched.
It also *does not* require admin and never touches your profile or settings.

## Uninstall

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1
```

It removes exactly the injected `<!-- freebuff-rtl-user-patch -->` / `<style>` / `<script>`
block from the *current* `index.html`, then deletes the helper script and font. It does not
copy `index.html.freebuff-rtl.bak` back: after an app update that backup belongs to the
previous build, and restoring it would point the new build at stale asset hashes (blank
window). Same optional `-UiPath` / `-Quiet` switches apply.

## After a Freebuff app update

The updater rewrites `index.html` and wipes the patch. Just run `install.ps1` again and
restart the app. To never think about it, drop a one-line `.vbs` into your Startup folder:

```
' %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\freebuff-rtl.vbs
CreateObject("Wscript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""C:\path\to\this-kit\install.ps1"" -Quiet", 0, False
```

## Files

| File | Role |
|---|---|
| `freebuff-rtl.css` | the stylesheet injected into the app (`<style id="freebuff-rtl-user-patch">`) |
| `freebuff-rtl.js` | same-origin script (`/freebuff-rtl-user.js`) applying `dir="auto"` per text block, with a MutationObserver for React re-renders/streaming |
| `Vazirmatn-Variable.woff2` | chat font (SIL OFL 1.1 — see below) |
| `install.ps1` / `uninstall.ps1` | installer (`-UiPath`, `-Quiet`) / remover (strips the injected block from the current `index.html`) |
| `FONT-LICENSE` | Vazirmatn font license text |

## How it works (for reviewers)

The Freebuff Desktop renderer is served from `http://127.0.0.1:<port>` by a local Bun
orchestrator reading `resources\orchestrator\ui\` from disk. The app CSP allows
`script-src 'self'`, so a same-origin script file is permitted; inline style injection
passes because only `script-src` is locked down. The patch:

- `unicode-bidi: plaintext` on `.msg.assistant .prose :is(...)` and message/user bubbles —
  every paragraph resolves its own base level from its content.
- `dir="auto"` per text block — covers list-item markers and heading alignment per item.
- `[data-composer-input]` (contenteditable div, this build) + safety-net `.composer textarea`.
- `.qedit` and `.thread-detail-steer-input` (plain textareas) for the queued-prompt edit
  box and Steer box.
- LTR islands for `.md-*` code/table elements and `code`/`pre`.

Tested against the Windows build of Freebuff Desktop (October 2026 build) with mixed
Persian/English threads, lists, code fences and tables in both light and dark themes.

## Known limitations

1. An app update removes the patch until `install.ps1` is re-run.
2. If a future build renames CSS classes (`.prose`, `.msg`, `.md-code`, …), the affected
   rules silently stop matching — safe but a good bug report if you see it.
3. Standalone file paths and mixed Latin tokens inside Persian sentences follow standard
   Unicode bidi rules; some visual scrambling there is inherent, not a bug.

## License

- Patch code: MIT (see `LICENSE`).
- Vazirmatn font: SIL Open Font License 1.1 (see `FONT-LICENSE`) — © The Vazirmatn Project
  Authors (https://github.com/rastikerdar/vazirmatn).

---

## README در فارسی

پچ جامعه‌متعلق برای رابط دسکتاپِ [Freebuff](https://freebuff.com) (ویندوز) که متن چت را
برای فارسی/عربی راست‌به‌چپ صحیح می‌کند: هر پاراگراف جهت خودش را از زبان خودش می‌گیرد،
کدها و جدول‌ها چپ‌به‌راست می‌مانند و کامپوزر و باکس‌های ویرایش هم هر خط را سمت خودش
می‌نشینند. فونت چت به **Vazirmatn** تغییر می‌کند (کاملاً آفلاین، از سرور خود اپ).

نصب: `install.ps1` را اجرا کنید، اپ را ببندید و دوباره باز کنید. حذف: `uninstall.ps1`.
بعد از هر آپدیت اپ، اجرای دوبارهٔ `install.ps1` کافی است (گزینهٔ خودکارسازی در بالا).
پچ به ادمین نیاز ندارد و هیچ تنظیم پروفایلی را دست نمی‌زند.

---

## README بالعربية (مختصر)

رقعة مجتمعية لتطبيق [Freebuff](https://freebuff.com) المكتبي (Electron، ويندوز) تجعل نص
المحادثة يُعرض من اليمين إلى اليسار بشكل صحيح للفارسية والعربية والأردية والعبرية، مع
بقاء الشيفرة والجداول والمسارات من اليسار إلى اليمين، وبقاء بقية الواجهة (الشريط الجانبي،
الأزرار) دون تغيير.

- كل فقرة تأخذ اتجاهها من لغتها تلقائيًا (`dir="auto"` + `unicode-bidi: plaintext`)، فلا
  حاجة إلى إعداد لغة.
- صندوق الكتابة وصندوق تعديل الطلبات وصندوق Steer: كل سطر مكتوب يأخذ اتجاهه ومحاذاته
  الخاصة.
- خط Vazirmatn لنصوص العربية/الفارسية فقط (`unicode-range`)، والنص اللاتيني يبقى بخطه
  الأصلي. الخط يُخدَّم من داخل التطبيق، بلا إنترنت.

التثبيت: شغّل `install.ps1`، ثم أغلق التطبيق وأعد فتحه. الإزالة: `uninstall.ps1`.
بعد كل تحديث للتطبيق أعد تشغيل `install.ps1`. لا يحتاج إلى صلاحيات مدير.
