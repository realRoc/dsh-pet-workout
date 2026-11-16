// 喝水提醒的计时和升级状态机（不碰 dsh-pet，方便测）和大肥鱼的台词。
// 移植自 desk-pet（realRoc/desk-pet）的 src/shared/water.ts，规则一致：
//
// 人在电脑前才计时（键鼠空闲 5 分钟以上算不在），夜里不提醒，跟练时先不打扰，等空下来再说。
// 到点了提醒，不理她就每 5 分钟加一级：递水 → 示范喝水 → 敲屏幕 → 扔大水、气跑，过几分钟再回来；
// 回来时你还没喝，她会进 10 分钟的「抠门模式」（话变少、语气变冷）。

export const INTERVALS = [30, 45, 60, 90] // 分钟
export const LEVEL_GAP = 300 // 每一级之间隔几秒：到点、+5、+10、+15 分钟
export const SNOOZE = 600 // 「等会儿」再等几秒
export const GOAL = 8 // 一天几杯
export const IDLE_PAUSE = 300 // 键鼠空闲这么久算人不在，停止计时
export const AWAY_LONG = 900 // 离开这么久回来，先提醒一次
export const QUIET = [22, 9] // 这段时间不提醒
export const AWAY_SECS = [180, 300] // 气跑以后多久回来
export const COLD_SECS = 600 // 回来时还没喝：抠门模式多久

/** 每一级播哪段（同一级有几段时随机挑）。drink 是跟练动画里的那段。 */
export const LEVEL_CLIPS = {
  1: ['water_offer', 'water_offer_b', 'water_offer_b2'],
  2: ['drink'],
  3: ['water_knock'],
  4: ['water_throw'],
}

export const DEFAULT_WATER = {
  water_on: true,
  water_interval: 45, // 分钟
  water_quiet: true, // 夜里不提醒
  water_mute: '', // 这天别提醒了（YYYY-MM-DD）
  water_cups: null, // 今天喝了几杯 { date, n }
}

/** 本地日期 YYYY-MM-DD */
export function dateKey(now) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** phase：
 *  - wait：等下一次。人在电脑前才计时，到点了（且不忙、不在夜里）就发 level 1
 *  - remind：正在提醒，第 1~3 级；每隔 LEVEL_GAP 秒升一级
 *  - finale：第 4 级，扔大水、气跑，演完了调 left()
 *  - away：不在，AWAY_SECS 秒后发 return；人类说喝了就马上发，不用等到点
 *  - back：返场中，演完了调 returned()
 *  cfg 是活的：菜单改了配置直接改它；喝水、今天别提醒了这些改动通过 onSave 存回去。 */
export class WaterReminder {
  constructor(cfg, onSave = () => {}, random = Math.random) {
    this.cfg = cfg
    this.onSave = onSave
    this.random = random
    this.phase = 'wait'
    this.level = 0
    this.elapsed = 0 // 上次喝水 / 上一轮提醒以来，人在电脑前过了几秒
    this.since = 0 // 这一级 / 离开以来过了几秒
    this.awayFor = 0
    this.drankAway = false // 扔完大水到回来之间喝了没有
    this.cold = 0 // 抠门模式还剩几秒
    this.idlePeak = 0 // 这次离开电脑多久了
    this.forced = false // 这一轮是菜单里预览出来的：夜里、关着也照演
  }

  // ----- 配置 -----
  get enabled() {
    return this.cfg.water_on !== false
  }

  get interval() {
    return 60 * (this.cfg.water_interval || 45)
  }

  quiet(now) {
    const [start, end] = QUIET
    const h = now.getHours()
    return this.cfg.water_quiet !== false && (h >= start || h < end)
  }

  muted(now) {
    return this.cfg.water_mute === dateKey(now)
  }

  cups(now = new Date()) {
    const c = this.cfg.water_cups
    return c && c.date === dateKey(now) ? c.n : 0
  }

  // ----- 计时 -----
  /** 往前走 dt 秒，返回这一下要演的事。idle：键鼠空闲了几秒；busy：她正忙（跟练、被别的插件占着）。 */
  update(dt, idle = 0, busy = false, now = new Date()) {
    this.cold = Math.max(0, this.cold - dt)
    if (this.phase === 'away') {
      this.since += dt
      if (this.since >= this.awayFor) {
        this.phase = 'back'
        return [{ type: 'return', drank: this.drankAway }]
      }
      return []
    }
    if (this.phase === 'finale' || this.phase === 'back') return []
    if (!this.forced && (!this.enabled || this.muted(now) || this.quiet(now))) {
      if (this.phase === 'remind') this.reset()
      return []
    }
    if (idle >= IDLE_PAUSE) {
      this.idlePeak = Math.max(this.idlePeak, idle)
      return []
    }
    const welcome = this.idlePeak >= AWAY_LONG
    this.idlePeak = 0
    if (this.phase === 'wait') {
      this.elapsed += dt
      if (welcome && this.elapsed >= this.interval / 2) this.elapsed = Math.max(this.elapsed, this.interval)
      if (this.elapsed >= this.interval && !busy) {
        this.phase = 'remind'
        this.level = 1
        this.since = 0
        return [{ type: 'level', level: 1, welcome }]
      }
    } else if (this.phase === 'remind') {
      this.since += dt
      if (this.since >= LEVEL_GAP && !busy) return [this.raise(this.level + 1)]
    }
    return []
  }

  raise(level) {
    this.level = level
    this.since = 0
    if (level >= 4) {
      this.phase = 'finale'
      this.drankAway = false
    } else {
      this.phase = 'remind'
    }
    return { type: 'level', level, welcome: false }
  }

  reset() {
    this.forced = false
    this.phase = 'wait'
    this.level = 0
    this.since = 0
    this.elapsed = 0
  }

  // ----- 人类的回应 -----
  /** 人类喝了。kind：cheers 平时 / 提醒中喝的；late 扔大水气跑的路上、不在的时候、返场路上喝的（她马上回来和好）。 */
  drink(now = new Date()) {
    const n = this.cups(now) + 1
    this.cfg.water_cups = { date: dateKey(now), n }
    this.onSave({ water_cups: this.cfg.water_cups })
    const wasCold = this.cold > 0
    this.cold = 0
    if (this.phase === 'finale' || this.phase === 'away' || this.phase === 'back') {
      this.drankAway = true
      if (this.phase === 'away') this.awayFor = this.since // 喝了就别在外面晾着了：下一拍就返场
      return { kind: 'late', n, wasCold }
    }
    this.reset()
    return { kind: 'cheers', n, wasCold }
  }

  /** 「等会儿」：这一轮作罢，SNOOZE 秒后从第 1 级重来。 */
  snooze() {
    if (this.phase !== 'remind') return false
    this.reset()
    this.elapsed = Math.max(0, this.interval - SNOOZE)
    return true
  }

  /** 菜单里的预览：直接跳到某一级。气跑、返场的路上不行。 */
  force(level) {
    if (this.phase === 'finale' || this.phase === 'away' || this.phase === 'back') return null
    this.forced = true
    return this.raise(level)
  }

  /** 气跑出屏幕了；跑的路上人类已经喝了的话，转身就回来。 */
  left() {
    this.phase = 'away'
    this.since = 0
    this.awayFor = this.drankAway ? 0 : AWAY_SECS[0] + this.random() * (AWAY_SECS[1] - AWAY_SECS[0])
  }

  /** 「叫她回来」：不在的话下一拍就返场（没喝照样别扭、进抠门模式）。 */
  callBack() {
    if (this.phase !== 'away') return false
    this.awayFor = this.since
    return true
  }

  /** 返场演完了：没喝的话进抠门模式。 */
  returned() {
    if (!this.drankAway) this.cold = COLD_SECS
    this.drankAway = false
    this.reset()
  }
}

// ---------- 台词 ----------
// 来自 desk-pet 大肥鱼角色包的 lines.water（梗：大水理论、DeepSleep / 服务器繁忙、新版本太抠门、
// B 站鱼灾「本鲸记下了」、先吃饭后干活、深度思考（用时 xx 分钟））。几级提醒就是 "1" ~ "4"。
export const WATER_LINES = {
  1: [
    '该喝水啦～💧',
    '已深度思考（用时 {m} 分钟）：你该喝水了',
    '本鲸提醒：喝口水再干活',
    '先喝水后干活，大肥鱼说的',
    '喝口水吧，一口就行～',
  ],
  welcome: ['欢迎回来！先喝口水～', '回来啦？先喝口水再干活！'],
  2: ['看，像这样，咕嘟咕嘟——', '示范一遍：拿起杯子，喝。', '你不喝我先喝了啊！'],
  3: ['咚咚咚！有人吗？该喝水了！', '严肃实践大水理论！', '成功的人桌上都有大水。', '弱者才喝饮料，强者都喝大水！'],
  4: ['不理我是吧——', '大水攻击！！', '这瓶大水你接好了！'],
  leave: ['本鲸记下了。', '我去评论区说你坏话了！', '哼，不理你了！', '我去吃饭了，喝完告诉我就行！'],
  away_drank: ['（远处传来）……哼，这还差不多。'],
  sulk: ['……喝吧。', '哼，水给你放这了。', '……省 token，不说了。'],
  makeup: ['……那、那就原谅你了', '喝了就好～本鲸大人有大量', '这才对嘛！'],
  cheers: ['干杯！今天第 {n}/{goal} 杯～', '咕嘟！今天 {n}/{goal} 杯', '好耶！今天 {n}/{goal} 杯了'],
  goal: ['{goal} 杯达成！严肃实践大水理论！', '今天 {n} 杯！你就是大水理论本论！'],
  late: ['现在才喝？哼！', '晚了！……不过喝了就好。'],
  cold: ['嗯。', '哦。', '喝水。', '省 token 中。', '……'],
  cold_end: ['……行吧，原谅你了。'],
  snooze: ['那……就 10 分钟哦', '说好的 10 分钟！本鲸记下了'],
  muted: ['好吧，今天不催你了……记得自己喝', '今天放过你。明天见！'],
  unmuted: ['喝水提醒回来啦！'],
}

/** 一类台词随机挑一句，不和这类上一句重样；{n} 这种占位符按 fmt 填。 */
export class WaterLines {
  constructor(pool = WATER_LINES, random = Math.random) {
    this.pool = pool
    this.random = random
    this.last = {}
  }

  line(kind, fmt = {}) {
    const key = String(kind)
    const pool = this.pool[key] ?? ['……']
    const choices = pool.length > 1 ? pool.filter((s) => s !== this.last[key]) : pool
    const s = choices[Math.floor(this.random() * choices.length)]
    this.last[key] = s
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in fmt ? String(fmt[k]) : m))
  }
}
