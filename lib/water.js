// 喝水提醒：到点了借 dsh-pet 那只大肥鱼来催你喝水，不理她就一级级加码。
//
//   第 1 级  到点：递水壶，气泡 + 语音
//   第 2 级  +5 分钟：示范喝水
//   第 3 级  +10 分钟：走到屏幕中间，敲屏幕、搬出 1.5L 大水
//   第 4 级  +15 分钟：大水朝你扔过来，气鼓鼓走到屏幕边上躲着，3~5 分钟后回来；回来时你还没喝，她别别扭扭的
//
// 每一级演完，她会拿着占用锁原地等一会儿（WINDOW）：这段时间**点她一下就算喝了**
// （dsh-pet 规定用户一碰，第三方的锁就被收走，我们靠这个知道你点了她）。等完就把锁还回去，她照常过她的日子，
// 不耽误 dsh-pet 显示 agent 工作状态。任何时候都能从右键「更多 → 我喝水了」报喝水。
//
// 和 desk-pet 比少了「扔大水砸碎屏幕」那一下：dsh-pet 没有盖住整块屏幕的接口，这里只播扔水的动画。
import { GOAL, INTERVALS, LEVEL_CLIPS, WaterLines, WaterReminder } from './water-core.js'
import { LockLost, Stage } from './stage.js'

const WINDOW = 45_000 // 每级演完拿着锁等多久
const HOME = { x: 0.85, y: 0.85 } // 读不到她在哪时（网页端）走回的地方
const EDGE_X = 0 // 气跑以后躲在哪：中心贴着屏幕左边，半个身子在外面
const WALK_MS = 1800
const HINT = '\n（点我一下 = 喝了）'

export const DRINK_LABEL = '我喝水了'

export class WaterScene {
  constructor({ api, clips, clipUrl, cfg, save = () => {}, idle = async () => 0, log = () => {}, random = Math.random, now = Date.now, sleep, speed = 1 }) {
    this.stage = new Stage({ api, clips, clipUrl, log, now, sleep })
    this.reminder = new WaterReminder(cfg, save, random)
    this.lines = new WaterLines(undefined, random)
    Object.assign(this, { save, idle, log, random, now, speed })
    this.queue = Promise.resolve()
    this.acting = false
    this.interrupt = false // 菜单 / 点击打断了正在等的那一级
    this.home = null // 被我们挪走之前她在哪
    this.moved = false
    this.onChange = () => {}
  }

  set pet(id) {
    if (id && !this.stage.held) this.stage.pet = id
  }

  get date() {
    return new Date(this.now())
  }

  // ----- 计时（外面每隔几秒调一次） -----
  async tick(dt, busy = false) {
    const r = this.reminder
    const idle = this.speed > 1 ? 0 : await this.idle()
    const events = r.update(dt * this.speed, idle, busy || this.acting, this.date)
    // 气跑在外面：一直拿着锁让她在屏幕边上待着。用户把她拎回来了 = 叫她回来
    if (r.phase === 'away' && this.stage.held && !this.acting) {
      try {
        await this.stage.renew()
      } catch (err) {
        if (!(err instanceof LockLost)) throw err
        this.moved = false
        r.callBack()
      }
    }
    for (const e of events) this.enqueue(() => (e.type === 'level' ? this.level(e) : this.comeBack(e.drank)))
    if (events.length) this.onChange()
  }

  enqueue(fn) {
    this.queue = this.queue.then(async () => {
      this.acting = true
      try {
        await fn()
      } catch (err) {
        this.log(`喝水提醒没演完：${err.message}`)
      } finally {
        this.acting = false
        this.onChange()
      }
    })
    return this.queue
  }

  // ----- 演出 -----
  async level({ level, welcome }) {
    const r = this.reminder
    if (r.level !== level || (r.phase !== 'remind' && r.phase !== 'finale')) return // 排队期间已经喝了 / 等会儿了
    if (!(await this.stage.acquire())) {
      if (r.phase === 'finale') r.left() // 演不了也算她气跑了，过会儿照样回来
      return
    }
    this.interrupt = false
    let keep = false
    try {
      const text = this.lines.line(welcome ? 'welcome' : level, { m: Math.round(r.interval / 60) })
      if (level >= 4) {
        keep = await this.finale(text)
        return
      }
      if (level === 3) await this.walkTo(0.5)
      await this.stage.say(text + HINT, { speak: true, duration: WINDOW })
      await this.stage.play(this.pick(LEVEL_CLIPS[level]))
      await this.stage.hold(WINDOW, () => this.interrupt || r.phase !== 'remind')
    } catch (err) {
      if (!(err instanceof LockLost)) throw err
      if (err.why === 'preempted' && (r.phase === 'remind' || r.phase === 'finale')) this.drink()
    } finally {
      if (!keep) await this.stage.release()
    }
  }

  /** 第 4 级：扔大水、气跑、躲到屏幕边上。拿着锁不放就回 true。 */
  async finale(text) {
    const r = this.reminder
    try {
      await this.stage.say(text, { speak: true, duration: 6000 })
      await this.stage.play('water_throw')
      await this.stage.say(this.lines.line('leave'), { speak: true, duration: 5000 })
      await this.stage.play('water_leave')
      await this.walkTo(EDGE_X, 2600)
    } catch (err) {
      if (!(err instanceof LockLost)) throw err
      if (err.why === 'preempted') this.reminder.drink(this.date) // 扔水的时候被点了：算晚喝的，她马上回来和好
      r.left()
      return false
    }
    r.left()
    return true
  }

  /** 回来：没喝别别扭扭，喝了就和好。 */
  async comeBack(drank) {
    const r = this.reminder
    try {
      if (this.stage.held || (await this.stage.acquire())) {
        if (this.moved) await this.walkTo((this.home ?? HOME).x, 2600)
        await this.stage.play(drank ? 'water_return_makeup' : 'water_return_sulk', 'right') // 从左边回来：侧面动画镜像
        await this.stage.say(this.lines.line(drank ? 'makeup' : 'sulk'), { speak: true, duration: 5000 })
      }
    } catch (err) {
      if (!(err instanceof LockLost)) throw err
    } finally {
      this.moved = false
      this.home = null
      await this.stage.release()
      r.returned()
    }
  }

  async cheers({ n, wasCold }) {
    const text = wasCold
      ? this.lines.line('cold_end')
      : this.lines.line(n === GOAL ? 'goal' : 'cheers', { n, goal: GOAL })
    if (!(await this.stage.acquire())) return this.stage.say(text)
    try {
      await this.stage.say(text, { speak: true, duration: 5000 })
      await this.stage.play('water_cheers')
      await this.walkHome()
    } catch (err) {
      if (!(err instanceof LockLost)) throw err
      this.moved = false
    } finally {
      await this.stage.release()
    }
  }

  /** 拿着锁说一句，被挪走过就走回去。 */
  async remark(text) {
    if (!(await this.stage.acquire())) return this.stage.say(text)
    try {
      await this.stage.say(text, { duration: 5000 })
      await this.walkHome()
    } catch (err) {
      if (!(err instanceof LockLost)) throw err
      this.moved = false
    } finally {
      await this.stage.release()
    }
  }

  async walkTo(x, ms = WALK_MS) {
    const p = await this.stage.pose()
    if (!this.moved) this.home = p
    this.moved = true
    await this.stage.walk(x, p?.y ?? this.home?.y ?? HOME.y, ms)
  }

  async walkHome() {
    if (!this.moved) return
    const to = this.home ?? HOME
    this.moved = false
    this.home = null
    await this.stage.walk(to.x, to.y, WALK_MS)
  }

  pick(list) {
    return list[Math.floor(this.random() * list.length)]
  }

  // ----- 人类的回应 -----
  drink() {
    const r = this.reminder
    const before = r.phase
    const res = r.drink(this.date)
    this.interrupt = true
    this.onChange()
    if (res.kind === 'late') {
      if (before === 'away') this.enqueue(() => this.stage.say(this.lines.line('away_drank'), { duration: 4000 }))
      return
    }
    this.enqueue(() => this.cheers(res))
  }

  snooze() {
    if (!this.reminder.snooze()) return
    this.interrupt = true
    this.enqueue(() => this.remark(this.lines.line('snooze')))
  }

  callBack() {
    this.reminder.callBack()
  }

  toggleMute() {
    const r = this.reminder
    const muted = r.muted(this.date)
    r.cfg.water_mute = muted ? '' : this.dateKey()
    this.save({ water_mute: r.cfg.water_mute })
    if (!muted) {
      this.interrupt = true
      r.update(0, 0, false, this.date) // 正在提醒的这一轮作罢
    }
    this.enqueue(() => this.remark(this.lines.line(muted ? 'unmuted' : 'muted')))
  }

  /** 间隔 30 → 45 → 60 → 90 → 关 → 30 */
  cycleInterval() {
    const cfg = this.reminder.cfg
    if (cfg.water_on === false) {
      cfg.water_on = true
      cfg.water_interval = INTERVALS[0]
    } else {
      const i = INTERVALS.indexOf(cfg.water_interval)
      if (i === INTERVALS.length - 1) cfg.water_on = false
      else cfg.water_interval = INTERVALS[i + 1] ?? INTERVALS[0]
    }
    this.save({ water_on: cfg.water_on, water_interval: cfg.water_interval })
    if (cfg.water_on === false) {
      this.interrupt = true
      this.reminder.update(0, 0, false, this.date)
    }
    this.onChange()
  }

  dateKey() {
    const d = this.date
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  /** 要开始跟练了：手上的锁都放掉，在外面躲着的叫回来。等演完再返回。 */
  async standDown() {
    this.interrupt = true
    if (this.reminder.phase === 'away') {
      this.reminder.callBack()
      for (const e of this.reminder.update(0, 0, true, this.date)) if (e.type === 'return') this.enqueue(() => this.comeBack(e.drank))
    }
    await this.queue
  }

  async dispose() {
    this.interrupt = true
    await this.stage.release()
  }

  // ----- 菜单 -----
  labels() {
    const r = this.reminder
    const now = this.date
    const out = [`${DRINK_LABEL}（今天 ${r.cups(now)}/${GOAL}）`]
    if (r.phase === 'remind') out.push('等会儿再喝')
    if (r.phase === 'away') out.push('叫她回来')
    if (r.enabled) out.push(r.muted(now) ? '恢复喝水提醒' : '今天别催我喝水')
    out.push(r.enabled ? `喝水提醒：每 ${r.cfg.water_interval} 分钟` : '喝水提醒：关')
    return out
  }

  /** 菜单被点了；不是喝水的菜单项回 false */
  onMenu(label, pet) {
    this.pet = pet
    if (label.startsWith(DRINK_LABEL)) this.drink()
    else if (label === '等会儿再喝') this.snooze()
    else if (label === '叫她回来') this.callBack()
    else if (label === '今天别催我喝水' || label === '恢复喝水提醒') this.toggleMute()
    else if (label.startsWith('喝水提醒：')) this.cycleInterval()
    else return false
    return true
  }
}
