import svelte from 'rollup-plugin-svelte';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import css from 'rollup-plugin-css-only';

const production = !process.env.ROLLUP_WATCH;

export default [
  {
    input: 'src/popup.js',
    output: {
      sourcemap: true,
      format: 'es',
      file: 'public/popup.js',
      inlineDynamicImports: true
    },
    plugins: [
      svelte({
        compilerOptions: {
          dev: !production
        }
      }),
      css({ output: 'popup.css' }),
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
    output: {
      sourcemap: true,
      format: 'es',
      file: 'public/dashboard.js',
      inlineDynamicImports: true
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
    input: 'background-new.js',
    output: {
      sourcemap: true,
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
  }
];
