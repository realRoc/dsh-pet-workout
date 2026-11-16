// 借 dsh-pet 那只演一小段：拿占用锁、说话、点播动画、走位，演完放锁。喝水提醒用它。
// （跟练的 session.js 自己管锁，规则一样：用户拖 / 点了她，dsh-pet 当场收走锁，cause = preempted。）

const LOCK_TTL = 60_000
const TERMINAL = new Set(['ended', 'failed', 'cancelled'])

export class LockLost extends Error {
  constructor(why) {
    super(`占用锁丢了：${why}`)
    this.why = why
  }
}

export class Stage {
  constructor({ api, clips, clipUrl, log = () => {}, now = Date.now, sleep }) {
    Object.assign(this, { api, clips, clipUrl, log, now })
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.pet = 'main'
    this.surface = 'web'
    this.lockId = null
  }

  get held() {
    return !!this.lockId
  }

  /** 拿锁。拿不到（被别的插件占着、她没显示）回 false，不抛。 */
  async acquire() {
    if (this.lockId) return true
    let r = await this.api.lock(this.pet, this.surface, undefined, LOCK_TTL)
    if (!r.ok && r.reason === 'pet-not-displayed' && r.display && r.display !== 'none') {
      this.surface = r.display === 'desktop' ? 'desktop' : 'web'
      r = await this.api.lock(this.pet, this.surface, undefined, LOCK_TTL)
    }
    if (!r.ok) {
      this.log(`拿不到占用锁：${r.reason}`)
      return false
    }
    this.lockId = r.lockId
    return true
  }

  /** 续一次锁，顺便探测锁还在不在：丢了抛 LockLost（why = preempted 就是用户拖 / 点了她）。 */
  async renew() {
    if (!this.lockId) throw new LockLost('none')
    const r = await this.api.lock(this.pet, this.surface, this.lockId, LOCK_TTL)
    if (r.ok) return
    this.lockId = null
    throw new LockLost(r.reason === 'lock-lost' ? (r.cause ?? 'unknown') : r.reason)
  }

  async release() {
    if (!this.lockId) return
    const id = this.lockId
    this.lockId = null
    await this.api.release(this.pet, id)
  }

  async act(fn) {
    await this.renew()
    const res = await fn(this.lockId)
    if (res.reason === 'lock-lost' || res.reason === 'lock-required') {
      this.lockId = null
      throw new LockLost(res.cause ?? res.reason)
    }
    return res
  }

  /** 说一句。有锁带锁说，没锁就直接说（被别人占着时会失败，失败就算了）。 */
  async say(text, { speak = false, duration = 5000 } = {}) {
    const body = { text, anim: false, duration, speak }
    const res = this.lockId
      ? await this.act((lock) => this.api.say(this.pet, this.surface, lock, body))
      : await this.api.say(this.pet, this.surface, undefined, body)
    if (!res.ok) this.log(`气泡没弹出来：${res.reason}`)
  }

  /** 播一遍我们托管的动画，等它播完。缺这段动画或播不起来就跳过（气泡照样说），不让整段演出垮掉。 */
  async play(name, facing = 'left') {
    if (!this.clips[name]) return this.log(`缺动画 ${name}`)
    const res = await this.act((lock) => this.api.anim(this.pet, this.surface, lock, { url: this.clipUrl(name), facing }))
    if (!res.ok) return this.log(`点播 ${name} 被拒：${res.reason}`)
    const t0 = this.now()
    for (;;) {
      const pb = await this.api.playback(res.playbackId, 10_000)
      if (pb.ok === false || pb.status === 'failed') return this.log(`动画 ${name} 没播起来：${pb.reason}`)
      if (pb.status === 'cancelled') return this.renew() // 多半是用户拖了她：锁丢了这里会抛 LockLost
      if (TERMINAL.has(pb.status) || this.now() - t0 > 30_000) return
    }
  }

  /** 她现在在哪（只有桌面端读得到）。读不到回 null。 */
  async pose() {
    if (this.surface !== 'desktop' || !this.api.pose) return null
    const r = await this.api.pose(this.pet)
    return r.ok ? { x: r.x, y: r.y } : null
  }

  /** 在 ms 毫秒里直线走到 (x, y)，等她走到。 */
  async walk(x, y, ms) {
    const res = await this.act((lock) => this.api.position(this.pet, this.surface, lock, { x, y, mode: 'line', duration: ms }))
    if (!res.ok) return this.log(`走不过去：${res.reason}`)
    await this.sleep(ms + 1200) // 渲染端 1 秒内才发现这条指令
  }

  /** 拿着锁等一会儿（每 2 秒续一次锁）。stop() 返回 true 就提前结束。锁被收走时抛 LockLost。 */
  async hold(ms, stop = () => false) {
    const end = this.now() + ms
    while (this.now() < end && !stop()) {
      await this.sleep(Math.min(2000, end - this.now()))
      if (stop()) return
      await this.renew()
    }
  }
}
