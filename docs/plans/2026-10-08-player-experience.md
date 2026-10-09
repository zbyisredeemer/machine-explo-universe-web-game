# Player experience upgrade — 1.6.0-rc.1

Goal: make the existing four-chapter adventure easier to enter and more rewarding to explore, with audible and visible feedback throughout play.

Scope chosen from current game inspection: contextual onboarding, optional salvage discoveries with durable progress, stronger encounter completion feedback, chapter-specific ambient sound/music, and animated environment accents. Keep authored chapters, robot rigs, existing combat rules and v1 save compatibility.

Implementation:
1. Add a data-driven optional cache system: three clearly named locations per chapter, map/scan markers, once-only rewards, a completion bonus, persistent validated IDs and journal entries. Rewards never block story progress.
2. Simplify the initial guide to three core actions and a collapsible full control list. Add a dismissible contextual training strip that recognises actual movement/jump/dash/fire, stays out of combat UI and persists completion.
3. Give enemy defeats and cleared patrol groups explicit transient feedback without extra rewards; add an encounter completion sound. Add per-chapter ambient harmonies and sparse musical phrases, with separate music/effects levels and pause/blur suspension. Keep all audio synthesized locally.
4. Add bounded, shared-geometry atmosphere accents per chapter (industrial beacons, drifting pollen, time fragments, orbiting shards). Respect low graphics and reduced motion; avoid new combat obstacles.
5. Add unit tests for reward idempotence, save migration and training rules, plus browser tests for real interaction, save/reload, settings, responsive layout and resource bounds. Integrate the new suite into verification and packaging.
6. Run the existing full release checks; document measured results, capture screenshots and produce updated source/offline artifacts. Do not label aesthetic improvements as storefront certification.
