import { createHash } from 'node:crypto';
import { fingerprint } from './scripts/release-inputs.mjs';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'distribution-metadata',
      generateBundle() {
        for (const file of ['LICENSE', 'THIRD_PARTY_LICENSES.txt']) {
          this.emitFile({
            type: 'asset',
            fileName: file === 'LICENSE' ? 'LICENSE.txt' : file,
            source: readFileSync(new URL(file, import.meta.url)),
          });
        }
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source:
            JSON.stringify({
              game: 'alien-body',
              version,
              sourceHash: createHash('sha256')
                .update(
                  JSON.stringify(
                    fingerprint([
                      'src',
                      'public',
                      'index.html',
                      'package-lock.json',
                      'vite.config.js',
                    ]),
                  ),
                )
                .digest('hex'),
            }) + '\n',
        });
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
