// 一次跟练：拿 dsh-pet 的占用锁，按计划报动作、循环播动作动画、气泡倒计时、休息喝水，练完欢呼。
//
// 时间怎么走：每一段（动作 / 休息）有自己的剩余毫秒数，只在「她在练」的时候扣——播一遍动画扣这遍的真实时长，
// 休息时每拍等几秒。暂停期间不扣，继续之后接着扣。
//
// 暂停有两种来路：
//   - 右键「更多 → 暂停锻炼」：插件自己放锁；
//   - 用户拖 / 点了桌宠：dsh-pet 直接把锁收走（cause = preempted）。下一次操作会发现锁丢了，当作暂停。
// 继续都走右键「更多 → 继续锻炼」，重新拿锁、重新摆姿势。
import { LINES, MOVES, POSTURES, stepLabel } from './moves.js'

const LOCK_TTL = 60_000
const LAZY_CHANCE = 0.55
const TERMINAL = new Set(['ended', 'failed', 'cancelled'])

export class LockLost extends Error {
  constructor(why) {
    super(`占用锁丢了：${why}`)
    this.why = why
  }
}
class Stopped extends Error {}

/** 计划 → 一串段落：动作、休息交替，最后一个动作后面不休息 */
export function buildTimeline(plan) {
  const rounds = Math.max(1, plan.rounds ?? 1)
  const steps = plan.steps
  const out = []
  for (let r = 0; r < rounds; r++) {
    steps.forEach((step, i) => {
      out.push({ kind: 'move', step, secs: step.secs })
      const lastOfRound = i === steps.length - 1
      if (lastOfRound && r === rounds - 1) return
      const rest = lastOfRound ? (plan.round_rest ?? 30) : (step.rest ?? plan.rest ?? 15)
      const next = lastOfRound ? steps[0] : steps[i + 1]
      if (rest > 0) out.push({ kind: 'rest', secs: rest, next })
    })
  }
  return out
}

export class WorkoutSession {
  constructor({ api, pet, plan, clips, clipUrl, log = () => {}, onStatus = () => {}, now = Date.now, random = Math.random, sleep }) {
    Object.assign(this, { api, pet, plan, clips, clipUrl, log, onStatus, now, random })
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.surface = 'web'
    this.lockId = null
    this.posture = null
    this.status = 'idle'
    this.wantPause = false
    this.wantStop = false
    this.wake = null
  }

  pause() {
    if (this.status === 'running') this.wantPause = true
  }
  resume() {
    if (this.status === 'paused') this.wake?.()
  }
  stop() {
    this.wantStop = true
    this.wake?.()
  }

  setStatus(s) {
    this.status = s
    this.onStatus(s)
  }

  async run() {
    const timeline = buildTimeline(this.plan)
    this.setStatus('running')
    try {
      await this.acquire()
      await this.say(LINES.ready, { speak: true, duration: 3000 })
      for (const seg of timeline) {
        let left = seg.secs * 1000
        let fresh = true
        this.lazy = seg.kind === 'move' && !MOVES[seg.step.move].posture && seg.secs >= 20 && this.random() < LAZY_CHANCE
          ? { at: left * (0.35 + this.random() * 0.3) } : null
        this.saidLast = false
        let lockRetries = 0
        while (left > 0) {
          try {
            if (await this.checkpoint()) fresh = true // 暂停回来，当成新开始这一段：重新摆姿势、重新报动作
            left -= seg.kind === 'move' ? await this.moveTick(seg, left, fresh) : await this.restTick(seg, left, fresh)
            fresh = false
            lockRetries = 0
          } catch (err) {
            if (!(err instanceof LockLost)) throw err
            this.lockId = null
            if (err.why === 'preempted') {
              this.wantPause = true // 用户拖 / 点了她：dsh-pet 已经把锁收走，我们当暂停
              this.pausedByUser = true
            } else if (++lockRetries > 3) {
              throw err
            }
          }
        }
      }
      await this.leavePosture()
      await this.play('cheer')
      await this.say(LINES.done, { speak: true })
      this.setStatus('done')
    } catch (err) {
      if (!(err instanceof Stopped)) {
        this.log(`跟练中断：${err.message}`)
        await this.releaseLock()
        await this.sayFree(`练不下去了：${err.message}`)
      } else {
        await this.releaseLock()
        await this.sayFree(LINES.stopped)
      }
      this.setStatus('stopped')
    } finally {
      await this.releaseLock()
    }
  }

  /** 每拍开始前：要停就停，要暂停就放锁等「继续」。暂停回来了返回 true */
  async checkpoint() {
    if (this.wantStop) throw new Stopped()
    if (!this.wantPause) return false
    this.wantPause = false
    await this.releaseLock()
    await this.sayFree(this.pausedByUser ? LINES.grabbed : LINES.paused)
    this.pausedByUser = false
    this.setStatus('paused')
    await new Promise((r) => (this.wake = r))
    this.wake = null
    if (this.wantStop) throw new Stopped()
    this.setStatus('running')
    this.posture = null // 暂停期间她回去过自己的待机动画，姿势从站着重新来
    await this.acquire()
    return true
  }

  async moveTick(seg, left, fresh) {
    const { step } = seg
    const move = MOVES[step.move]
    const label = stepLabel(step)
    // 躺着练的不镜像；其余左侧的动作镜像（dsh-pet 的 facing: right = 镜像）
    const facing = step.side === 'left' && move.posture !== 'bridge' ? 'right' : 'left'
    let spent = 0
    if (fresh) {
      await this.say(`${label} ${Math.ceil(left / 1000)} 秒！${move.cue}`, { speak: true, duration: 5000 })
      await this.enterPosture(move.posture ?? null) // 躺下 / 靠墙的过程不算练的时间
    } else if (left < (this.clips[move.clip].secs ?? 5) * 500) {
      return left // 剩的不到半遍动画：这一段就到这儿，不再多播一整遍
    } else if (this.lazy && left <= this.lazy.at) {
      this.lazy = null
      const names = Object.keys(LINES.lazy).filter((k) => this.clips[k])
      if (names.length) {
        const name = names[Math.floor(this.random() * names.length)]
        await this.say(LINES.lazy[name].thought, { duration: 3000 })
        spent += await this.play(name)
        await this.say(LINES.lazy[name].caught, { speak: true, duration: 3000 })
        return spent // 她偷懒，计时照走
      }
    } else {
      const s = Math.ceil(left / 1000)
      if (s <= 10 && !this.saidLast) {
        this.saidLast = true
        await this.say(LINES.last[Math.floor(this.random() * LINES.last.length)], { speak: true, duration: 4000 })
      } else {
        await this.say(`${label}  还剩 ${s} 秒`, { duration: 4000 })
      }
    }
    return spent + (await this.play(move.clip, facing))
  }

  async restTick(seg, left, fresh) {
    const s = Math.ceil(left / 1000)
    const next = stepLabel(seg.next)
    if (fresh) {
      const spent = await this.leavePosture()
      await this.say(LINES.rest.replace('{s}', s).replace('{next}', next), { speak: true, duration: 5000 })
      return spent + (await this.play('drink'))
    }
    // 后半段就站着等：锁住期间她自己不动，每 4 秒刷一次倒计时（顺便给锁续期）
    await this.say(`休息  还剩 ${s} 秒｜下一个：${next}`, { duration: 4500 })
    const t0 = this.now()
    await this.sleep(Math.min(left, 4000))
    return this.now() - t0
  }

  async enterPosture(want) {
    if (this.posture === want) return 0
    let spent = await this.leavePosture()
    if (want) spent += await this.play(POSTURES[want].enter)
    this.posture = want
    return spent
  }

  async leavePosture() {
    if (!this.posture) return 0
    const exit = POSTURES[this.posture].exit
    this.posture = null
    return this.play(exit)
  }

  /** 播一遍我们托管的动画，等它播完，回实际花掉的毫秒数 */
  async play(name, facing = 'left') {
    if (!this.clips[name]) throw new Error(`缺动画 ${name}`)
    const res = await this.act((lock) => this.api.anim(this.pet, this.surface, lock, { url: this.clipUrl(name), facing }))
    if (!res.ok) throw new Error(`点播 ${name} 被拒：${res.reason}`)
    const t0 = this.now()
    for (;;) {
      const pb = await this.api.playback(res.playbackId, 10_000)
      if (pb.ok === false) throw new Error(`查不到 ${name} 的播放回执：${pb.reason}`)
      if (pb.status === 'failed') throw new Error(`动画 ${name} 没播起来：${pb.reason}`)
      if (pb.status === 'cancelled') {
        await this.ensureLock() // 多半是用户拖了她：锁丢了这里会抛 LockLost
        break
      }
      if (TERMINAL.has(pb.status)) break
      if (this.now() - t0 > 30_000) break
    }
    return this.now() - t0
  }

  async say(text, { speak = false, duration = 4000 } = {}) {
    const res = await this.act((lock) => this.api.say(this.pet, this.surface, lock, { text, anim: false, duration, speak }))
    if (!res.ok) this.log(`气泡没弹出来：${res.reason}`)
  }

  /** 没拿锁时说话（暂停、结束之后） */
  async sayFree(text) {
    await this.api.say(this.pet, this.surface, undefined, { text, anim: false, duration: 5000 })
  }

  async act(fn) {
    await this.ensureLock()
    const res = await fn(this.lockId)
    if (res.reason === 'lock-lost' || res.reason === 'lock-required') throw new LockLost(res.cause ?? res.reason)
    return res
  }

  async ensureLock() {
    if (!this.lockId) return this.acquire()
    const r = await this.api.lock(this.pet, this.surface, this.lockId, LOCK_TTL)
    if (r.ok) return
    if (r.reason === 'lock-lost') throw new LockLost(r.cause ?? 'unknown')
    throw new Error(`续不上占用锁：${r.reason}`)
  }

  async acquire() {
    let r = await this.api.lock(this.pet, this.surface, undefined, LOCK_TTL)
    if (!r.ok && r.reason === 'pet-not-displayed') {
      if (r.display === 'none') throw new Error('她现在没显示出来')
      this.surface = r.display === 'desktop' ? 'desktop' : 'web'
      r = await this.api.lock(this.pet, this.surface, undefined, LOCK_TTL)
    }
    if (!r.ok) throw new Error(r.reason === 'locked' ? '她正被别的插件占着' : `拿不到占用锁：${r.reason}`)
    this.lockId = r.lockId
  }

  async releaseLock() {
    if (!this.lockId) return
    const id = this.lockId
    this.lockId = null
    await this.api.release(this.pet, id)
  }
}
