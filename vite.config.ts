import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import tsconfigPaths from 'vite-tsconfig-paths'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import manifest from './src/manifest.config'

const minifyJsonAssets = (): Plugin => ({
  name: 'stackprism:minify-json-assets',
  apply: 'build',
  closeBundle() {
    const distDir = path.resolve(__dirname, 'dist')
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        const stat = statSync(full)
        if (stat.isDirectory()) out.push(...walk(full))
        else if (name.endsWith('.json')) out.push(full)
      }
      return out
    }

    for (const file of walk(distDir)) {
      const original = readFileSync(file, 'utf8')
      let parsed
      try {
        parsed = JSON.parse(original)
      } catch {
        continue
      }
      const minified = JSON.stringify(parsed)
      if (minified.length < original.length) {
        writeFileSync(file, minified, 'utf8')
      }
    }
  }
})

export default defineConfig({
  plugins: [vue(), crx({ manifest }), tsconfigPaths(), minifyJsonAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      vue: 'vue/dist/vue.runtime.esm-bundler.js'
    }
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        help: path.resolve(__dirname, 'src/ui/help/index.html')
      }
    }
  }
})
