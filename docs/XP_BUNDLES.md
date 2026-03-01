# XP-Compatible Windows ZIP Bundles

The XP-compatible support flow uses the `zip` package variant (Universal ZIP).

To make the ZIP fully self-contained for Windows XP (no install), place portable binaries on the server under:

- `packages/bundles/windows/tightvnc/` (32-bit)  
  Must contain `tvnserver.exe` (and any DLLs it needs).
- `packages/bundles/windows/tightvnc64/` (64-bit, optional)  
  Must contain `tvnserver.exe` (and any DLLs it needs). The launcher will prefer this on 64-bit Windows if present.
- `packages/bundles/windows/mypal/` (recommended for XP)  
  Should contain `mypal.exe` (portable browser). This is used when the customer opened the support link in Internet Explorer on XP.

When these folders exist, the server copies them into every generated `support-<SESSION>.zip`:

- `<zip>/tightvnc/` and/or `<zip>/tightvnc64/`
- `<zip>/mypal/`

Notes:
- `packages/` is ignored by git in this repo, so these binaries stay local to the server.
- If TightVNC is missing, the ZIP still generates but `launch.bat` will instruct the user to provide a VNC server.

