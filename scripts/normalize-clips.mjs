// 把 desk-pet 的跟练动画套进 dsh-pet 的画幅：640×360、VP9 + alpha，人物站立身高、脚底、中线和 dsh-pet 自己的动画对齐，
// 这样插播时大肥鱼不会忽大忽小、跳位置。
//
//   node scripts/normalize-clips.mjs <desk-pet 角色包的 workout/clips 目录>
//
// 源目录的 clips.json 记录了每段动画裁剪后放在参考画布上的位置（ref.h = 站立身高，ref.foot = 脚底，ref.cx = 中线）。
// dsh-pet 那边的数字是量出来的：assets/webm/东张西望.webm 第一帧（站立）不透明区域高 265、脚底 y=329、中线 x=325。
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DSH = { w: 640, h: 360, height: 265, foot: 329, cx: 325 }

const src = process.argv[2]
if (!src) {
  console.error('用法：node scripts/normalize-clips.mjs <workout/clips 目录>')
  process.exit(1)
}
const out = resolve(import.meta.dirname, '../assets/clips')
mkdirSync(out, { recursive: true })

const meta = JSON.parse(readFileSync(join(src, 'clips.json'), 'utf8'))
const { ref } = meta
const s = DSH.height / ref.h
const index = {}

for (const [name, clip] of Object.entries(meta.clips)) {
  const [, , cw, ch] = clip.crop
  const [ox, oy] = clip.offset
  const w = Math.round(cw * s)
  const h = Math.round(ch * s)
  const x = Math.round(DSH.cx + (ox - ref.cx) * s)
  const y = Math.round(DSH.foot + (oy - ref.foot) * s)
  const file = `${name}.webm`
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-c:v', 'libvpx-vp9', '-i', join(src, clip.file), // 用 libvpx 解码才保得住 alpha
    '-filter_complex',
    `color=c=black@0:s=${DSH.w}x${DSH.h}:r=${clip.fps},format=yuva420p[bg];` +
      `[0:v]scale=${w}:${h},format=yuva420p[fg];[bg][fg]overlay=${x}:${y}:shortest=1:format=auto`,
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '34', '-row-mt', '1',
    '-auto-alt-ref', '0', '-an',
    join(out, file),
  ])
  index[name] = { file, secs: +(clip.frames / clip.fps).toFixed(2) }
  console.log(`${name}: ${w}×${h} @ (${x}, ${y})`)
}

writeFileSync(join(out, 'clips.json'), JSON.stringify({ frame: DSH, clips: index }, null, 2) + '\n')
