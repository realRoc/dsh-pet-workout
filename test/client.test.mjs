import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { cachedIdle } from '../lib/idle.js'
import { createPetClient } from '../lib/pet-client.js'
import { LEVEL_CLIPS } from '../lib/water-core.js'

test('客户端：position / pose 打到 dsh-pet 的对应端点，非 JSON 响应折成 ok: false', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push([init.method, url.pathname, Object.fromEntries(url.searchParams), init.body && JSON.parse(init.body)])
    return { status: url.pathname.endsWith('/pose') ? 404 : 200, text: async () => (url.pathname.endsWith('/pose') ? 'Not Found' : '{"ok":true}') }
  }
  const api = createPetClient(() => 'http://127.0.0.1:3080', fetchImpl)
  assert.deepEqual(await api.position('main', 'desktop', 'lk-1', { x: 0.5, y: 0.9, mode: 'line', duration: 1800 }), { ok: true })
  assert.deepEqual(seen[0], ['POST', '/dsh-pet-7340/position', { pet: 'main', surface: 'desktop', lock: 'lk-1' }, { x: 0.5, y: 0.9, mode: 'line', duration: 1800 }])
  const pose = await api.pose('main')
  assert.equal(pose.ok, false)
  assert.equal(pose.reason, 'http-404')
  assert.deepEqual(seen[1].slice(0, 3), ['GET', '/dsh-pet-7340/pose', { pet: 'main' }])
})

test('键鼠空闲：间隔内不重复读，用上次的值加上过去的时间', async () => {
  let t = 0
  let reads = 0
  const idle = cachedIdle(async () => (++reads, 100), 30, () => t)
  assert.equal(await idle(), 100)
  t = 10_000
  assert.equal(await idle(), 110)
  assert.equal(reads, 1)
  t = 40_000
  assert.equal(await idle(), 100)
  assert.equal(reads, 2)
})

test('动画清单：喝水和跟练要播的每段都在 assets/clips 里', () => {
  const dir = join(import.meta.dirname, '../assets/clips')
  const { frame, clips } = JSON.parse(readFileSync(join(dir, 'clips.json'), 'utf8'))
  assert.deepEqual(frame, { w: 640, h: 360, height: 265, foot: 329, cx: 325 })
  const water = [...Object.values(LEVEL_CLIPS).flat(), 'water_leave', 'water_return_sulk', 'water_return_makeup', 'water_cheers']
  for (const name of [...water, 'cheer', 'drink']) {
    assert.ok(clips[name], `清单里缺 ${name}`)
    assert.ok(readFileSync(join(dir, clips[name].file)).length > 1000, `${clips[name].file} 是空的`)
    assert.ok(clips[name].secs > 0)
  }
})
