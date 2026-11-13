// dsh-pet-workout 宿主插件：在 dsh-pet 的右键菜单「更多」里加「一起锻炼」，点了就借 dsh-pet 的那只大肥鱼带你练。
//
// 它自己不画宠物，全程走 dsh-pet 的第三方接口：
//   菜单项 /menu/item + /menu/events（长轮询）→ 占用锁 /lock → 点播我们托管的动画 /anim?url= → 气泡 /broadcast
// 动画由本插件在 DSH 的同一个 Web 服务上提供（/dsh-pet-workout/clips/*.webm），网页端同源，桌面端靠 CORS 头。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createPetClient } from './pet-client.js'
import { WorkoutSession } from './session.js'

export const name = 'dsh-pet-workout'
export const inject = ['webServer']

const ROOT = join(import.meta.dirname, '..')
const CLIP_DIR = join(ROOT, 'assets/clips')
const ROUTE = '/dsh-pet-workout'
const OWNER = '一起锻炼'

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

  let session = null
  let disposed = false
  let warned = false

  const labels = () => {
    if (session?.status === 'paused') return ['继续锻炼', '结束锻炼']
    if (session) return ['暂停锻炼', '结束锻炼']
    return plans.map((p) => `一起锻炼：${p.name}`)
  }
  const refreshMenu = () => api.menuSet(OWNER, labels())

  function onClick(label, pet) {
    if (label.startsWith('一起锻炼：') && !session) {
      const plan = plans.find((p) => `一起锻炼：${p.name}` === label)
      if (!plan) return
      log(`开始「${plan.name}」（宠物 ${pet}）`)
      const s = new WorkoutSession({ api, pet, plan, clips, clipUrl, log, onStatus: () => refreshMenu() })
      session = s
      s.run().finally(() => {
        if (session === s) session = null
        log(`「${plan.name}」结束：${s.status}`)
        if (!disposed) refreshMenu()
      })
    } else if (label === '暂停锻炼') session?.pause()
    else if (label === '继续锻炼') session?.resume()
    else if (label === '结束锻炼') session?.stop()
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  async function loop() {
    let registered = false
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

  ctx.on('dispose', () => {
    disposed = true
    clearTimeout(timer)
    session?.stop()
    api.menuClear(OWNER)
  })
}
