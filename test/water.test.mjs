import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { COLD_SECS, DEFAULT_WATER, IDLE_PAUSE, LEVEL_GAP, WaterReminder } from '../lib/water-core.js'
import { WaterScene } from '../lib/water.js'
import { loadWater, saveWater } from '../lib/water-store.js'

const NOON = new Date(2026, 10, 16, 12, 0, 0)
const NIGHT = new Date(2026, 10, 16, 23, 0, 0)

function reminder(extra = {}) {
  const saved = []
  const r = new WaterReminder({ ...DEFAULT_WATER, ...extra }, (p) => saved.push(p), () => 0)
  return { r, saved }
}

// ---------- 状态机 ----------

test('到点提醒，不理就每 5 分钟加一级，第 4 级是 finale', () => {
  const { r } = reminder()
  assert.deepEqual(r.update(45 * 60 - 1, 0, false, NOON), [])
  assert.deepEqual(r.update(1, 0, false, NOON), [{ type: 'level', level: 1, welcome: false }])
  assert.deepEqual(r.update(LEVEL_GAP, 0, false, NOON), [{ type: 'level', level: 2, welcome: false }])
  assert.deepEqual(r.update(LEVEL_GAP, 0, false, NOON), [{ type: 'level', level: 3, welcome: false }])
  assert.deepEqual(r.update(LEVEL_GAP, 0, false, NOON), [{ type: 'level', level: 4, welcome: false }])
  assert.equal(r.phase, 'finale')
})

test('人不在电脑前不计时；夜里不提醒；忙的时候先不升级', () => {
  const { r } = reminder()
  r.update(45 * 60, IDLE_PAUSE, false, NOON)
  assert.equal(r.elapsed, 0)
  r.update(45 * 60, 0, false, NIGHT)
  assert.equal(r.elapsed, 0)
  assert.deepEqual(r.update(45 * 60, 0, true, NOON), [], '跟练中：到点了也不打扰')
  assert.equal(r.update(10, 0, false, NOON)[0].level, 1, '空下来马上提醒')
})

test('离开很久回来：先欢迎、先喝水', () => {
  const { r } = reminder()
  r.update(30 * 60, 0, false, NOON)
  r.update(10, 1000, false, NOON) // 离开了 1000 秒
  assert.deepEqual(r.update(10, 0, false, NOON), [{ type: 'level', level: 1, welcome: true }])
})

test('喝了：记杯数、重新计时；等会儿：10 分钟后再来', () => {
  const { r, saved } = reminder()
  r.update(45 * 60, 0, false, NOON)
  assert.deepEqual(r.drink(NOON), { kind: 'cheers', n: 1, wasCold: false })
  assert.deepEqual(saved.at(-1), { water_cups: { date: '2026-11-16', n: 1 } })
  assert.equal(r.phase, 'wait')
  r.update(45 * 60, 0, false, NOON)
  assert.ok(r.snooze())
  assert.deepEqual(r.update(599, 0, false, NOON), [])
  assert.equal(r.update(1, 0, false, NOON)[0].level, 1)
  assert.equal(r.cups(new Date(2026, 10, 17, 12)), 0, '第二天从 0 杯算')
})

test('气跑后回来：没喝进抠门模式；路上喝了马上回来和好', () => {
  const { r } = reminder()
  r.force(4)
  r.left()
  assert.ok(r.awayFor >= 180)
  r.update(r.awayFor, 0, false, NOON)
  assert.equal(r.phase, 'back')
  r.returned()
  assert.equal(r.cold, COLD_SECS)
  assert.equal(r.drink(NOON).wasCold, true)

  const b = reminder().r
  b.force(4)
  b.left()
  assert.equal(b.drink(NOON).kind, 'late')
  assert.deepEqual(b.update(10, 0, false, NOON), [{ type: 'return', drank: true }])
})

test('设置存盘：读坏文件回默认值，写了能读回来', () => {
  const dir = mkdtempSync(join(tmpdir(), 'water-'))
  const file = join(dir, 'sub', 'water.json')
  assert.deepEqual(loadWater(file), DEFAULT_WATER)
  saveWater(file, { ...DEFAULT_WATER, water_interval: 60 })
  assert.equal(loadWater(file).water_interval, 60)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).water_interval, 60)
})

// ---------- 借 dsh-pet 演出来 ----------

// 假的 dsh-pet：动画 5 秒播完，记下所有调用；假时钟，不真等。grab() = 用户点了她（锁被收走）
function fakePet() {
  const clock = { t: NOON.getTime() }
  const calls = []
  let lock = null
  let n = 0
  const pet = {
    clock,
    calls,
    get locked() {
      return !!lock
    },
    grab() {
      lock = null
    },
    api: {
      async lock(p, surface, lockId) {
        if (lockId && lockId !== lock) return { ok: false, reason: 'lock-lost', cause: 'preempted' }
        if (!lockId && lock) return { ok: false, reason: 'locked' }
        if (!lockId) {
          if (surface !== 'desktop') return { ok: false, reason: 'pet-not-displayed', display: 'desktop' }
          lock = `lk-${++n}`
          calls.push(['lock'])
        }
        return { ok: true, lockId: lock }
      },
      async release(p, lockId) {
        if (lockId === lock) {
          lock = null
          calls.push(['release'])
        }
        return { ok: true }
      },
      async anim(p, s, l, body) {
        if (l !== lock) return { ok: false, reason: 'lock-lost', cause: 'preempted' }
        calls.push(['anim', body.url.split('/').pop(), body.facing])
        return { ok: true, playbackId: `pb-${calls.length}` }
      },
      async playback() {
        clock.t += 5000
        return { status: 'ended' }
      },
      async say(p, s, l, body) {
        if (lock && l !== lock) return { ok: false, reason: l ? 'lock-lost' : 'locked', cause: 'preempted' }
        calls.push(['say', body.text])
        return { ok: true }
      },
      async position(p, s, l, body) {
        if (l !== lock) return { ok: false, reason: 'lock-lost', cause: 'preempted' }
        calls.push(['walk', body.x])
        return { ok: true, x: body.x, y: body.y }
      },
      async pose() {
        return { ok: true, x: 0.8, y: 0.9, facing: 'left' }
      },
    },
  }
  return pet
}

const clipNames = ['drink', 'water_offer', 'water_offer_b', 'water_offer_b2', 'water_knock', 'water_throw', 'water_leave',
  'water_return_sulk', 'water_return_makeup', 'water_cheers']
const clips = Object.fromEntries(clipNames.map((k) => [k, { file: `${k}.webm` }]))

function scene(pet, { onSleep } = {}) {
  const cfg = { ...DEFAULT_WATER }
  const w = new WaterScene({
    api: pet.api,
    clips,
    clipUrl: (k) => `http://127.0.0.1:1/dsh-pet-workout/clips/${k}.webm`,
    cfg,
    now: () => pet.clock.t,
    sleep: async (ms) => {
      pet.clock.t += ms
      onSleep?.(pet.clock.t)
    },
    random: () => 0,
  })
  return w
}

const anims = (pet) => pet.calls.filter((c) => c[0] === 'anim').map((c) => `${c[1]}/${c[2]}`)
const says = (pet) => pet.calls.filter((c) => c[0] === 'say').map((c) => c[1])

test('第 1 级：递水、提示点她、等一会儿，然后把锁还回去', async () => {
  const pet = fakePet()
  const w = scene(pet)
  await w.tick(45 * 60)
  await w.queue
  assert.deepEqual(anims(pet), ['water_offer.webm/left'])
  assert.match(says(pet)[0], /点我一下 = 喝了/)
  assert.equal(pet.locked, false)
  assert.deepEqual(w.labels(), ['我喝水了（今天 0/8）', '等会儿再喝', '今天别催我喝水', '喝水提醒：每 45 分钟'])
})

test('提醒时点她一下 = 喝了：干杯、记一杯', async () => {
  const pet = fakePet()
  let grabbed = false
  const w = scene(pet, {
    onSleep: () => {
      if (!grabbed && pet.locked) {
        grabbed = true
        pet.grab()
      }
    },
  })
  await w.tick(45 * 60)
  await w.queue
  await w.queue // 喝水那段是被点之后才排上的
  assert.equal(w.reminder.cups(new Date(pet.clock.t)), 1)
  assert.ok(anims(pet).includes('water_cheers.webm/left'))
  assert.ok(says(pet).some((t) => t.includes('1/8')))
  assert.equal(w.reminder.phase, 'wait')
  assert.equal(pet.locked, false)
})

test('第 3 级走到屏幕中间敲屏幕；喝了以后走回原处', async () => {
  const pet = fakePet()
  const w = scene(pet)
  w.reminder.force(3)
  await w.level({ level: 3, welcome: false })
  assert.deepEqual(pet.calls.filter((c) => c[0] === 'walk'), [['walk', 0.5]])
  assert.ok(anims(pet).includes('water_knock.webm/left'))
  w.onMenu('我喝水了（今天 0/8）', 'main')
  await w.queue
  assert.deepEqual(pet.calls.filter((c) => c[0] === 'walk').at(-1), ['walk', 0.8], '走回 /pose 读到的原位置')
})

test('第 4 级：扔大水、气跑到屏幕边上一直占着；回来时没喝就别扭', async () => {
  const pet = fakePet()
  const w = scene(pet)
  w.reminder.force(4)
  await w.level({ level: 4, welcome: false })
  assert.deepEqual(anims(pet), ['water_throw.webm/left', 'water_leave.webm/left'])
  assert.deepEqual(pet.calls.filter((c) => c[0] === 'walk'), [['walk', 0]])
  assert.equal(w.reminder.phase, 'away')
  assert.equal(pet.locked, true, '躲着的时候锁不放')
  assert.deepEqual(w.labels().slice(0, 2), ['我喝水了（今天 0/8）', '叫她回来'])

  await w.tick(w.reminder.awayFor)
  await w.queue
  assert.equal(anims(pet).at(-1), 'water_return_sulk.webm/right', '从左边回来：镜像')
  assert.deepEqual(pet.calls.filter((c) => c[0] === 'walk').at(-1), ['walk', 0.8])
  assert.equal(pet.locked, false)
  assert.equal(w.reminder.cold, COLD_SECS)
})

test('躲着的时候喝了：马上回来和好', async () => {
  const pet = fakePet()
  const w = scene(pet)
  w.reminder.force(4)
  await w.level({ level: 4, welcome: false })
  w.onMenu('我喝水了（今天 0/8）', 'main')
  await w.tick(10)
  await w.queue
  assert.ok(says(pet).some((t) => t.includes('这还差不多')))
  assert.equal(anims(pet).at(-1), 'water_return_makeup.webm/right')
  assert.equal(w.reminder.cold, 0)
  assert.equal(pet.locked, false)
})

test('要开始跟练了：躲着的她先回来、把锁还回去', async () => {
  const pet = fakePet()
  const w = scene(pet)
  w.reminder.force(4)
  await w.level({ level: 4, welcome: false })
  await w.standDown()
  assert.equal(pet.locked, false)
  assert.equal(w.reminder.phase, 'wait')
})

test('菜单：间隔 30 → 45 → 60 → 90 → 关；今天别催我', async () => {
  const pet = fakePet()
  const w = scene(pet)
  w.onMenu('喝水提醒：每 45 分钟', 'main')
  assert.equal(w.reminder.cfg.water_interval, 60)
  w.onMenu('喝水提醒：每 60 分钟', 'main')
  w.onMenu('喝水提醒：每 90 分钟', 'main')
  assert.equal(w.reminder.enabled, false)
  assert.deepEqual(w.labels(), ['我喝水了（今天 0/8）', '喝水提醒：关'])
  w.onMenu('喝水提醒：关', 'main')
  assert.equal(w.reminder.cfg.water_interval, 30)
  w.onMenu('今天别催我喝水', 'main')
  await w.queue
  assert.ok(w.labels().includes('恢复喝水提醒'))
  await w.tick(3 * 60 * 60)
  assert.equal(w.reminder.phase, 'wait', '今天不提醒')
})
