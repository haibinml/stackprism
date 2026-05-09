import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const distDir = resolve(__dirname, '..', 'dist')

const walk = dir => {
  const entries = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      entries.push(...walk(full))
    } else if (name.endsWith('.json')) {
      entries.push(full)
    }
  }
  return entries
}

let totalBefore = 0
let totalAfter = 0
let count = 0

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
    totalBefore += original.length
    totalAfter += minified.length
    count += 1
  }
}

const saved = totalBefore - totalAfter
const pct = totalBefore ? ((saved / totalBefore) * 100).toFixed(1) : '0.0'
console.log(
  `[minify-json] minified ${count} files, ${(totalBefore / 1024).toFixed(1)} KB → ${(totalAfter / 1024).toFixed(1)} KB (saved ${(saved / 1024).toFixed(1)} KB, ${pct}%)`
)
