# Dashboard appearance restore point

Classic snapshot: `9c467c06d418aed04176ba78a55de6cfb8669fc9`.
Backup branch: `backup/classic-before-liquid-glass-2026-09-30`.

- Current classic dashboard: `dashboard_v2.html` (left unchanged by the theme preview).
- Liquid Glass preview: `dashboard_glass.html`; use **Back to Classic** to switch back instantly.
- Both pages use the same scripts, market data and browser storage on the same origin. The preview changes presentation only.
- To restore the original appearance after future edits, restore `dashboard_v2.html` from the backup branch in a new commit. Do not reset main or overwrite newer scanner data and fixes.
- The backup branch preserves the complete repository at the snapshot commit. Browser-local trade journal data is not stored in Git; use the dashboard export control to back it up separately.
