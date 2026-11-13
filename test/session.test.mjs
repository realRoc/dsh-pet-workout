import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WorkoutSession, buildTimeline } from '../lib/session.js'

// 假的 dsh-pet：每段动画 5 秒播完，记下所有调用；用假时钟，不真等
function fakePet({ preemptAt = Infinity } = {}) {
  const clock = { t: 0 }
  const calls = []
  let lock = null
  let n = 0
  let animCount = 0
  const api = {
    async lock(pet, surface, lockId) {
      calls.push(['lock', lockId ?? 'new'])
      if (lockId && lockId !== lock) return { ok: false, reason: 'lock-lost', cause: 'preempted' }
      if (!lockId) lock = `lk-${++n}`
      return { ok: true, lockId: lock, petId: pet }
    },
    async release(pet, lockId) {
      calls.push(['release', lockId])
      if (lockId === lock) lock = null
      return { ok: true }
    },
    async anim(pet, surface, l, body) {
      if (l !== lock) return { ok: false, reason: 'lock-lost', cause: 'preempted' }
      calls.push(['anim', body.url.split('/').pop(), body.facing])
      if (++animCount === preemptAt) lock = null // 用户在这一段时拖了她
      return { ok: true, playbackId: `pb-${animCount}` }
    },
    async playback() {
      clock.t += 5000
      return { status: 'ended', matched: true }
    },
    async say(pet, surface, l, body) {
      calls.push(['say', body.text])
      return { ok: true }
    },
  }
  return { api, calls, clock }
}

const clips = Object.fromEntries(
  ['squat', 'curtsy_lunge', 'drink', 'cheer', 'wall_sit_enter', 'wall_sit_loop', 'wall_sit_exit', 'lazy_rice'].map((k) => [k, { file: `${k}.webm` }]),
)
const plan = {
  name: 't',
  rest: 8,
  steps: [
    { move: 'squat', secs: 12 },
    { move: 'curtsy_lunge', secs: 10, side: 'left' },
    { move: 'wall_sit', secs: 10 },
  ],
}

function session(fake, extra = {}) {
  return new WorkoutSession({
    api: fake.api,
    pet: 'main',
    plan,
    clips,
    clipUrl: (n) => `http://127.0.0.1:1/dsh-pet-workout/clips/${n}.webm`,
    now: () => fake.clock.t,
    sleep: async (ms) => void (fake.clock.t += ms),
    random: () => 0.99, // 不偷懒
    ...extra,
  })
}

test('timeline: 动作之间插休息，最后一个动作后不休息', () => {
  const tl = buildTimeline(plan)
  assert.deepEqual(tl.map((s) => `${s.kind}:${s.secs}`), ['move:12', 'rest:8', 'move:10', 'rest:8', 'move:10'])
})

test('跑完整个计划：动画顺序、镜像、姿势进出、欢呼、放锁', async () => {
  const fake = fakePet()
  const s = session(fake)
  await s.run()
  assert.equal(s.status, 'done')
  const anims = fake.calls.filter((c) => c[0] === 'anim').map((c) => `${c[1]}/${c[2]}`)
  assert.deepEqual(anims, [
    'squat.webm/left', 'squat.webm/left', // 12 秒：两遍 5 秒，剩 2 秒不到半遍就不再播
    'drink.webm/left', // 休息 8 秒：喝水 5 秒 + 站着等 3 秒
    'curtsy_lunge.webm/right', 'curtsy_lunge.webm/right', // 左侧镜像
    'drink.webm/left',
    'wall_sit_enter.webm/left', 'wall_sit_loop.webm/left', 'wall_sit_loop.webm/left',
    'wall_sit_exit.webm/left',
    'cheer.webm/left',
  ])
  assert.ok(fake.calls.some((c) => c[0] === 'say' && c[1].includes('练完啦')))
  assert.equal(fake.calls.at(-1)[0], 'release')
})

test('用户拖了她 → 暂停；继续后重新拿锁、重报动作', async () => {
  const fake = fakePet({ preemptAt: 1 })
  const s = session(fake, {
    onStatus: (st) => {
      if (st === 'paused') setImmediate(() => s.resume())
    },
  })
  await s.run()
  assert.equal(s.status, 'done')
  const says = fake.calls.filter((c) => c[0] === 'say').map((c) => c[1])
  assert.equal(says.filter((t) => t.startsWith('深蹲 ')).length, 2, '继续后重新报一次深蹲')
  assert.ok(fake.calls.filter((c) => c[0] === 'lock' && c[1] === 'new').length >= 2)
})

test('结束锻炼：放锁并说结束语', async () => {
  const fake = fakePet()
  const say = fake.api.say
  const s = session(fake)
  fake.api.say = async (...args) => {
    if (args[3].text.includes('还剩')) s.stop() // 练到一半点了「结束锻炼」
    return say(...args)
  }
  await s.run()
  assert.equal(s.status, 'stopped')
  assert.ok(fake.calls.some((c) => c[0] === 'say' && c[1].includes('练到这儿')))
  assert.ok(fake.calls.some((c) => c[0] === 'release'))
})
