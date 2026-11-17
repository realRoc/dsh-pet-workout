import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { clipHref, newClipKey, serveClips } from '../lib/clips.js'

const DIR = join(import.meta.dirname, '../assets/clips')
const { clips } = JSON.parse(readFileSync(join(DIR, 'clips.json'), 'utf8'))
const FILE = Object.values(clips)[0].file
const ROUTE = '/dsh-pet-workout'

function call(handler, url, { method = 'GET', headers = {} } = {}) {
  const out = { status: 0, headers: {}, body: undefined }
  handler(
    { url, method, headers },
    {
      writeHead: (status, h = {}) => Object.assign(out, { status, headers: h }),
      end: (body) => (out.body = body),
    },
  )
  return out
}

test('动画路由：带对的钥匙才给文件（桌面宠物走这条），带 CORS 头', () => {
  const key = newClipKey()
  const handler = serveClips({ clips, dir: DIR, route: ROUTE, key, rejection: () => 401 })
  const href = clipHref('http://127.0.0.1:3080', ROUTE, FILE, key)
  const u = new URL(href)
  const ok = call(handler, u.pathname + u.search)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['access-control-allow-origin'], '*')
  assert.ok(ok.body.length > 0)
  assert.equal(call(handler, u.pathname + u.search, { method: 'HEAD' }).status, 200)
})

test('动画路由：没钥匙、钥匙错、钥匙长度不对，DSH 检查又不过 → 403，不带 CORS 头', () => {
  const key = newClipKey()
  const handler = serveClips({ clips, dir: DIR, route: ROUTE, key, rejection: () => 401 })
  const path = `${ROUTE}/clips/${encodeURIComponent(FILE)}`
  for (const url of [path, `${path}?k=${newClipKey()}`, `${path}?k=short`, `${ROUTE}/clips/nope.webm`]) {
    const r = call(handler, url)
    assert.equal(r.status, 403, url)
    assert.equal(r.headers['access-control-allow-origin'], undefined)
  }
  assert.equal(call(handler, path, { method: 'OPTIONS' }).status, 403)
})

test('动画路由：过了 DSH 的访问检查（网页版、已登录）不带钥匙也行', () => {
  const handler = serveClips({ clips, dir: DIR, route: ROUTE, key: newClipKey(), rejection: () => undefined })
  assert.equal(call(handler, `${ROUTE}/clips/${encodeURIComponent(FILE)}`).status, 200)
  assert.equal(call(handler, `${ROUTE}/clips/nope.webm`).status, 404)
  assert.equal(call(handler, `${ROUTE}/clips/${encodeURIComponent(FILE)}`, { method: 'POST' }).status, 404)
})

test('动画路由：没有 connection 服务时只认钥匙', () => {
  const key = newClipKey()
  const handler = serveClips({ clips, dir: DIR, route: ROUTE, key, rejection: undefined })
  const path = `${ROUTE}/clips/${encodeURIComponent(FILE)}`
  assert.equal(call(handler, path).status, 403)
  assert.equal(call(handler, `${path}?k=${key}`).status, 200)
})
