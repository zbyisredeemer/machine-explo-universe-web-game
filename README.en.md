# Alien Body

A local-first, third-person 3D single-player adventure. Explore four civilizations, upgrade a robot body, meet a companion, choose between two endings and revisit completed chapters.

**Status:** 1.6 release candidate for an independent short game. Procedural art and synthesized audio; no external assets, accounts, tracking or online services at runtime. Desktop keyboard/mouse and WebGL 2 required.

New in 1.6: contextual controls training, twelve persistent optional discoveries with story records and rewards, chapter-specific environmental accents and synthesized music, separate music/effects levels, and clearer encounter completion feedback.

## Develop

Node 22.13+ (22 or 24+), npm and Python 3.10+:

```sh
git clone https://github.com/zbyisredeemer/machine-explo-universe-web-game.git
cd machine-explo-universe-web-game
npm ci
npx playwright install chromium
npm run dev
npm run check
npm run verify
npm run package
```

Verification starts isolated servers automatically and runs the complete ordered regression suite. Output: `artifacts/alien-body-<version>-offline.zip`, `*-source.zip`, `SHA256SUMS.txt` and `verification.json`. Packaging refuses changed source/build/test evidence.

Offline ZIP: extract first, then use `start-game.cmd` (Windows), `启动游戏.command` (macOS), or `sh start-game.sh` (Linux). Python 3.10+ is required; Node is not. A source ZIP requires installation and a build first.

WASD move, mouse aim, left click shoot, right drag camera, Space double jump, Shift dash, E interact, F ability, X preview, 1–4 select module, I inspect, Esc pause. Saves stay in the current browser and origin; export them in Settings before changing either.

## License and support

MIT, including project-authored code, story, styles and procedural art definitions. Retain LICENSE and third-party notices when redistributing. Three.js uses MIT. No trademark endorsement or exclusive rights to downstream users are implied.

See [Chinese guide](README.md), [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md), [privacy](docs/PRIVACY.md), [release instructions](docs/RELEASING.md), and [tested scope / limitations](docs/QUALITY.md).
