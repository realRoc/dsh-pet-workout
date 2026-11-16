// dsh-pet-workout 宿主插件：在 dsh-pet 的右键菜单「更多」里加「一起锻炼」，点了就借 dsh-pet 的那只大肥鱼带你练；
// 另外到点了让她催你喝水（喝水提醒，见 water.js）。
//
// 它自己不画宠物，全程走 dsh-pet 的第三方接口：
//   菜单项 /menu/item + /menu/events（长轮询）→ 占用锁 /lock → 点播我们托管的动画 /anim?url= → 气泡 /broadcast
// 动画由本插件在 DSH 的同一个 Web 服务上提供（/dsh-pet-workout/clips/*.webm），网页端同源，桌面端靠 CORS 头。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createPetClient } from './pet-client.js'
import { WorkoutSession } from './session.js'
import { cachedIdle } from './idle.js'
import { WaterScene } from './water.js'
import { loadWater, saveWater, waterFile } from './water-store.js'

export const name = 'dsh-pet-workout'
export const inject = ['webServer']

const ROOT = join(import.meta.dirname, '..')
const CLIP_DIR = join(ROOT, 'assets/clips')
const ROUTE = '/dsh-pet-workout'
const OWNER = '一起锻炼'
const WATER_TICK = 10 // 秒

function loadPlans() {
  const dir = join(ROOT, 'plans')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
}

function serveClips(clips) {
  const files = new Set(Object.values(clips).map((c) => c.file))
  return (req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(`${ROUTE}/clips/`.length))
    const head = { 'access-control-allow-origin': '*' }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...head, 'access-control-allow-methods': 'GET, HEAD' })
      return res.end()
    }
    if (!files.has(file) || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404, head)
      return res.end()
    }
    const body = readFileSync(join(CLIP_DIR, file))
    res.writeHead(200, {
      ...head,
      'content-type': 'video/webm',
      'content-length': body.length,
      'cache-control': 'public, max-age=3600',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  }
}

export function apply(ctx) {
  const logger = (typeof ctx.logger === 'function' ? ctx.logger('dsh-pet-workout') : ctx.logger) ?? console
  const log = (line) => logger.info(`[一起锻炼] ${line}`)
  const warn = (line) => (logger.warn ?? logger.info).call(logger, `[一起锻炼] ${line}`)

  const { clips } = JSON.parse(readFileSync(join(CLIP_DIR, 'clips.json'), 'utf8'))
  const plans = loadPlans()
  const webServer = ctx.webServer ?? ctx.get('webServer')
  ctx.effect(() => webServer.register({ kind: 'prefix', path: ROUTE, handler: serveClips(clips) }))

  const getOrigin = () => webServer.getOrigin()
  const api = createPetClient(getOrigin)
  const clipUrl = (name) => new URL(`${ROUTE}/clips/${encodeURIComponent(clips[name].file)}`, getOrigin()).href

  const file = waterFile()
  const cfg = loadWater(file)
  const water = new WaterScene({
    api,
    clips,
    clipUrl,
    cfg,
    save: () => {
      try {
        saveWater(file, cfg)
      } catch (err) {
        warn(`喝水记录存不下来：${err.message}`)
      }
    },
    idle: cachedIdle(),
    log: (line) => log(`喝水：${line}`),
    speed: Number(process.env.DSH_PET_WATER_SPEED) || 1, // 开发时调快：20 = 45 分钟变 2 分多钟
  })

  let session = null
  let starting = false
  let disposed = false
  let warned = false
  let registered = false
  let lastMenu = ''

  const labels = () => {
    const workout = session?.status === 'paused'
      ? ['继续锻炼', '结束锻炼']
      : session ? ['暂停锻炼', '结束锻炼'] : plans.map((p) => `一起锻炼：${p.name}`)
    return [...workout, ...water.labels()]
  }
  const refreshMenu = async () => {
    const list = labels()
    const r = await api.menuSet(OWNER, list)
    if (r.ok) lastMenu = JSON.stringify(list)
    return r
  }
  water.onChange = () => {
    if (registered && !disposed) refreshMenu()
  }

  async function startWorkout(plan, pet) {
    starting = true
    try {
      await water.standDown() // 喝水提醒手上要是拿着锁，先还回来
    } finally {
      starting = false
    }
    if (session || disposed) return
    log(`开始「${plan.name}」（宠物 ${pet}）`)
    const s = new WorkoutSession({ api, pet, plan, clips, clipUrl, log, onStatus: () => refreshMenu() })
    session = s
    s.run().finally(() => {
      if (session === s) session = null
      log(`「${plan.name}」结束：${s.status}`)
      if (!disposed) refreshMenu()
    })
  }

  function onClick(label, pet) {
    if (water.onMenu(label, pet)) return
    if (label.startsWith('一起锻炼：') && !session && !starting) {
      const plan = plans.find((p) => `一起锻炼：${p.name}` === label)
      if (plan) startWorkout(plan, pet)
    } else if (label === '暂停锻炼') session?.pause()
    else if (label === '继续锻炼') session?.resume()
    else if (label === '结束锻炼') session?.stop()
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  async function loop() {
    while (!disposed) {
      if (!registered) {
        const r = await refreshMenu()
        if (!r.ok) {
          if (!warned) warn(`找不到 dsh-pet（${r.reason}），先装 dsh-pet：dsh plugin --profile web add dsh-pet`)
          warned = true
          await sleep(5000)
          continue
        }
        registered = true
        log('已加到 dsh-pet 右键菜单「更多」里')
      }
      const r = await api.menuEvents(OWNER, 10_000)
      if (disposed) break
      if (!r.ok) {
        registered = false // dsh-pet 重载过，菜单项没了，重新注册
        continue
      }
      for (const [label, pet] of Object.entries(r.events ?? {})) if (pet) onClick(label, pet)
    }
  }
  // 等 Web 服务真的开始监听，getOrigin() 才拿得到端口
  const timer = setTimeout(() => loop().catch((err) => warn(`菜单轮询挂了：${err.message}`)), 1000)

  // 喝水提醒的钟：dsh-pet 不在时不走（没人可催）；菜单文案变了（过了零点、杯数变了）就重新注册
  let ticking = false
  const waterTimer = setInterval(async () => {
    if (ticking || !registered || disposed) return
    ticking = true
    try {
      await water.tick(WATER_TICK, !!session || starting)
      if (JSON.stringify(labels()) !== lastMenu) await refreshMenu()
    } catch (err) {
      warn(`喝水提醒出错：${err.message}`)
    } finally {
      ticking = false
    }
  }, WATER_TICK * 1000)

  ctx.on('dispose', () => {
    disposed = true
    clearTimeout(timer)
    clearInterval(waterTimer)
    session?.stop()
    water.dispose()
    api.menuClear(OWNER)
  })
}
