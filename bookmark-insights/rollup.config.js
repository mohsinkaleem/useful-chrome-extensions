import svelte from 'rollup-plugin-svelte';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import css from 'rollup-plugin-css-only';

const production = !process.env.ROLLUP_WATCH;

export default [
  {
    input: 'src/sidepanel.js',
    output: {
      sourcemap: !production,
      format: 'es',
      file: 'public/sidepanel.js',
      inlineDynamicImports: true
    },
    plugins: [
      svelte({
        compilerOptions: {
          dev: !production
        }
      }),
      css({ output: 'sidepanel.css' }),
      resolve({
        browser: true,
        dedupe: ['svelte'],
        preferBuiltins: false
      }),
      commonjs(),
      production && terser()
    ],
    watch: {
      clearScreen: false
    }
  },
  {
    input: 'src/dashboard.js',
    // The entry exports nothing, so let Rollup fold it into the main chunk
    // instead of emitting a facade that only re-exports it.
    preserveEntrySignatures: false,
    output: {
      sourcemap: !production,
      format: 'es',
      // Split rather than inline: Chart.js is roughly half the bundle and is
      // only reachable from the Insights tab, which is lazily imported.
      dir: 'public',
      entryFileNames: 'dashboard.js',
      // Unhashed so repeated builds overwrite rather than accumulate chunks
      // that `npm run dist` would then copy.
      chunkFileNames: 'dashboard-[name].js'
    },
    plugins: [
      svelte({
        compilerOptions: {
          dev: !production
        }
      }),
      css({ output: 'dashboard.css' }),
      resolve({
        browser: true,
        dedupe: ['svelte'],
        preferBuiltins: false
      }),
      commonjs(),
      production && terser()
    ],
    watch: {
      clearScreen: false
    }
  },
  {
    input: 'src/background.js',
    output: {
      sourcemap: !production,
      format: 'es',
      file: 'background.js',
      inlineDynamicImports: true
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      production && terser()
    ],
    watch: {
      clearScreen: false
    }
  },
  {
    // Dedicated worker for similarity scoring and topic detection. Loaded with
    // { type: 'module' } from analysis-client.js.
    input: 'src/analysis-worker.js',
    output: {
      sourcemap: !production,
      format: 'es',
      file: 'analysis-worker.js',
      inlineDynamicImports: true
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      production && terser()
    ],
    watch: {
      clearScreen: false
    }
  }
];
