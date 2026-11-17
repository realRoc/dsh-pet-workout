// 跟练动画的 HTTP 路由（/dsh-pet-workout/clips/*.webm）。
//
// 谁来取：网页版宠物（DSH 同源，带登录 Cookie）和桌面宠物（Electron 的 file:// 窗口，拿不到 DSH 的 Cookie）。
// 所以准入有两条，满足一条就放行：
//   1. DSH 自己的 Host / Origin + 登录检查：ctx.connection.requestRejection(req) 返回 undefined；
//   2. 本次启动随机生成的钥匙：我们交给 dsh-pet 的地址都带 ?k=<钥匙>，别的网页猜不到。
// 两条都不满足就回 403，不带 CORS 头，也不说文件在不在。
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const newClipKey = () => randomBytes(24).toString('base64url')

function keyMatches(given, key) {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(key)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * @param opts.clips   clips.json 里的 clips 表
 * @param opts.dir     动画文件所在目录
 * @param opts.route   路由前缀，如 /dsh-pet-workout
 * @param opts.key     本次启动的钥匙
 * @param opts.rejection  (req) => 拒绝码或 undefined；DSH 没有 connection 服务时传 undefined，只认钥匙
 */
export function serveClips({ clips, dir, route, key, rejection }) {
  const files = new Set(Object.values(clips).map((c) => c.file))
  const prefix = `${route}/clips/`
  return (req, res) => {
    const url = new URL(req.url, 'http://x')
    const allowed = keyMatches(url.searchParams.get('k'), key) || (rejection !== undefined && rejection(req) === undefined)
    if (!allowed) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('forbidden')
    }
    const head = { 'access-control-allow-origin': '*' }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...head, 'access-control-allow-methods': 'GET, HEAD' })
      return res.end()
    }
    const file = url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : ''
    if (!files.has(file) || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404, head)
      return res.end()
    }
    const body = readFileSync(join(dir, file))
    res.writeHead(200, {
      ...head,
      'content-type': 'video/webm',
      'content-length': body.length,
      'cache-control': 'private, max-age=3600',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  }
}

/** 交给 dsh-pet 的动画地址：带上钥匙 */
export function clipHref(origin, route, file, key) {
  const u = new URL(`${route}/clips/${encodeURIComponent(file)}`, origin)
  u.searchParams.set('k', key)
  return u.href
}
