#!/usr/bin/env node
import fs from 'node:fs'

const GROUP_FILE = 'scripts/run-ci-group.mjs'
const PATH_PATTERN = /['"](scripts\/[^'"\n]+?\.(?:tsx?|mjs))['"]/g
const SLEEP_CALL_PATTERN = /\bsleep\s*\(/g

function masks(source) {
  const code = Array(source.length).fill(' ')
  const comments = Array(source.length).fill(' ')
  let state = 'code'

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '\n') {
      code[index] = '\n'
      comments[index] = '\n'
      if (state === 'line-comment') state = 'code'
      continue
    }

    if (state === 'line-comment') {
      comments[index] = char
      continue
    }

    if (state === 'block-comment') {
      comments[index] = char
      if (char === '*' && next === '/') {
        comments[index + 1] = next
        index++
        state = 'code'
      }
      continue
    }

    if (state !== 'code') {
      if (char === '\\') {
        if (next === '\n') {
          code[index + 1] = '\n'
          comments[index + 1] = '\n'
        }
        index++
        continue
      }
      if ((state === 'single-quote' && char === "'")
        || (state === 'double-quote' && char === '"')
        || (state === 'template' && char === '`')) state = 'code'
      continue
    }

    if (char === '/' && next === '/') {
      comments[index] = char
      comments[index + 1] = next
      index++
      state = 'line-comment'
      continue
    }
    if (char === '/' && next === '*') {
      comments[index] = char
      comments[index + 1] = next
      index++
      state = 'block-comment'
      continue
    }
    if (char === "'") {
      state = 'single-quote'
      continue
    }
    if (char === '"') {
      state = 'double-quote'
      continue
    }
    if (char === '`') {
      state = 'template'
      continue
    }
    code[index] = char
  }

  return {
    code: code.join('').split('\n'),
    comments: comments.join('').split('\n'),
  }
}

function ignoredLine(line) {
  return /^\s*import\b/.test(line)
    || /^\s*(?:export\s+)?(?:async\s+)?function\s+sleep\s*\(/.test(line)
    || /^\s*(?:export\s+)?(?:const|let|var)\s+sleep\b/.test(line)
    || /^\s*(?:const|let|var)\s*{[^}]*\bsleep\b/.test(line)
}

const groupSource = fs.readFileSync(GROUP_FILE, 'utf8')
const groupStart = groupSource.indexOf('const GROUPS =')
const groupEnd = groupSource.indexOf('\nconst groupName', groupStart)
if (groupStart < 0 || groupEnd < 0) throw new Error('无法从 ' + GROUP_FILE + ' 定位 GROUPS 表')
const groupTable = groupSource.slice(groupStart, groupEnd)
const files = [...new Set([...groupTable.matchAll(PATH_PATTERN)].map(match => match[1]))]
const violations = []
let sleepCalls = 0

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const { code, comments } = masks(source)

  for (let index = 0; index < code.length; index++) {
    const line = code[index]
    if (ignoredLine(line)) continue
    SLEEP_CALL_PATTERN.lastIndex = 0
    const callsOnLine = [...line.matchAll(SLEEP_CALL_PATTERN)].length
    if (callsOnLine === 0) continue
    sleepCalls += callsOnLine

    const firstCommentLine = Math.max(0, index - 4)
    const tagged = comments.slice(firstCommentLine, index + 1)
      .some(comment => comment.includes('固定窗:'))
    if (!tagged) violations.push(`${file}:${index + 1}`)
  }
}

if (violations.length > 0) {
  console.error(`verify:fixed-window: ${violations.length} 个 sleep 调用缺少固定窗标签：`)
  for (const violation of violations) console.error(violation)
  console.error(`已扫描 ${files.length} 个文件、${sleepCalls} 个 sleep 调用`)
  process.exitCode = 1
} else {
  console.log(`verify:fixed-window: PASS（扫描 ${files.length} 个文件、${sleepCalls} 个 sleep 调用）`)
}
