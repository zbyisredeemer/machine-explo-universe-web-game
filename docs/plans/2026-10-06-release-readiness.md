# Open-source and commercial distribution readiness

**Goal:** Make Alien Body a maintainable, verifiable independent-game release candidate, with honest support boundaries.

**Architecture:** Preserve the local-only Three.js game. Separate persistence and release verification from gameplay. Use a single release command to own servers, run checks against the current source/build, and produce hash-verified offline and source archives.

**Tech Stack:** Node 22, Vite, Three.js, Playwright, Python 3.10+.

## Delivery decisions

Default scope: an open-source independent game that can be redistributed commercially. Improving visual content further and building a paid online service are separate product directions; neither substitutes for data safety and reproducible releases. No account service is needed for this local game.

## Implementation sequence

1. Add MIT license, contribution/security/privacy documentation, release instructions, architecture notes, issue templates, CI, pinned dependency versions and official registry configuration. Keep existing gameplay and historical documentation.
2. Fix persistence failures and recovery reporting in `src/storage.js`, `src/state.js`, `src/game.js`, `src/main.js`, `src/ui.js`, `src/experience.js`; add regression tests covering quota failures, corrupt primary, backup failure and import confirmation.
3. Add visible version/support information and privacy-preserving diagnostics export. Ensure startup and runtime failures retain a recovery path and never promise an unsuccessful save.
4. Add relative Vite assets, cross-platform offline launchers and restricted loopback serving. Test HTTP headers, symlink traversal, Host validation and version identity.
5. Unify browser discovery and configurable test URLs. Add an orchestrator that starts isolated servers, runs the complete ordered suite, captures fingerprints and fails closed on stale build/report inputs. Package source and runtime separately with licenses and checksums.
6. Run lint, unit/server tests, dependency audit, build budgets, full campaign and branch regressions, production smoke/reliability tests. Inspect actual screenshots and verify both archives. Record measured results and untested platform/store boundaries.

## Acceptance

- Fresh `npm ci`, `npm run check`, `npm run verify`, `npm run package` are documented and executable.
- All existing gameplay suites pass on the supported local Chromium environment.
- Unsuccessful storage remains visible, recovery is explicit, and no QA globals ship in production.
- An edited source, build or report invalidates release packaging.
- Source archive excludes user paths, local caches, old packages and unrelated environment configuration.
- CI is ready for a remote repository; local results are distinguished from unexecuted hosted CI and untested hardware.

There is no Git repository or remote in the supplied directory. Prepare reviewable local artifacts; do not invent a repository URL, storefront certification or hardware performance guarantee.
