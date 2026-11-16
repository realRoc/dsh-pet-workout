// 键鼠空闲了几秒：喝水提醒只在人坐在电脑前时计时。
//
// - macOS：ioreg 读 IOHIDSystem 的 HIDIdleTime（纳秒）
// - Windows：PowerShell 调 GetLastInputInfo（起一次 PowerShell 要几百毫秒，所以外面 30 秒才问一次）
// - Linux：有 xprintidle 就用（毫秒），没有就当人一直在
// 读不出来一律回 0（= 人在），宁可多提醒，也不要因为读不到而永远不提醒。
import { execFile } from 'node:child_process'

const run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout)))
  })

const WIN_PS = `
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Idle {
  [StructLayout(LayoutKind.Sequential)] struct L { public uint cb; public uint t; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref L l);
  public static uint Ms() { var l = new L(); l.cb = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l); return (uint)Environment.TickCount - l.t; }
}
'@
[Idle]::Ms()`

export async function systemIdleSecs(platform = process.platform) {
  if (platform === 'darwin') {
    const out = await run('ioreg', ['-c', 'IOHIDSystem', '-d', '4', '-S'])
    const m = out.match(/"HIDIdleTime"\s*=\s*(\d+)/)
    return m ? Number(m[1]) / 1e9 : 0
  }
  if (platform === 'win32') {
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_PS])
    const ms = Number.parseInt(out.trim(), 10)
    return Number.isFinite(ms) ? ms / 1000 : 0
  }
  const out = await run('xprintidle', [])
  const ms = Number.parseInt(out.trim(), 10)
  return Number.isFinite(ms) ? ms / 1000 : 0
}

/** 包一层缓存：minGap 秒内重复问直接回上次的值，加上这段时间（键鼠没动的话空闲只会越来越长）。 */
export function cachedIdle(read = systemIdleSecs, minGap = process.platform === 'win32' ? 30 : 0, now = Date.now) {
  let at = -Infinity
  let value = 0
  return async () => {
    const t = now()
    if (t - at < minGap * 1000) return value + (t - at) / 1000
    value = await read()
    at = now()
    return value
  }
}
