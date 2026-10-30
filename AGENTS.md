# Fast maintenance

User preference: finish small changes quickly; keep progress and final replies short.

- Reuse /workspace/films. Never create a new project or duplicate checkout for routine changes.
- If the environment was reset, clone the existing repository with --depth 1. Do not fetch full history or old release archives.
- Read only the file that owns the requested behavior and nearby relevant code. Batch independent reads. Do not audit or refactor the application for a small change.
- Make the smallest complete edit. Preserve reactions, profile records, fixed recommendation membership, ranks, and unrelated UI.
- Run only checks appropriate to the edit; do not repeat successful builds or run broad browser suites for low-impact text/style changes.
- For website changes: build once, package once, commit and push the exact source, save and deploy once. Reuse known project IDs, paths, and tool schemas. No additional user confirmation is needed for an authorized publication.
- Documentation/workflow-only changes need no website build or deployment.
- Keep credentials in memory; never store or print tokens.
- Progress: one short initial update and another only if needed. Final: concrete outcome and the full working site link.

Site: https://dark-comedy-guide.nutmegmoth1.chatgpt.site
Project: appgprj_6ad134993d388191a64c79119f6561de
Source: https://github.com/Damidola/films.git

## Current hosting: GitHub Pages only

User explicitly stopped ChatGPT Sites publishing. Push changes only to Damidola/films main; GitHub Pages publishes from main /(root). Never create credentials, save versions, or deploy to ChatGPT Sites. Site URL: https://damidola.github.io/films/ . Root index opens dist/. Keep dist/library.json and the catalog/feed/favorites/good HTML copies current. Previous profile export is a local backup, not a public repository asset.
