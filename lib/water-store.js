// 喝水提醒的设置和今天喝了几杯，存在 ~/.dsh/plugins-data/dsh-pet-workout/water.json。
// DSH_HOME 改 dsh 的数据目录；DSH_PET_WORKOUT_HOME 直接指定本插件的数据目录（测试用）。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_WATER } from './water-core.js'

export function waterFile(env = process.env) {
  const dir = env.DSH_PET_WORKOUT_HOME || join(env.DSH_HOME || join(homedir(), '.dsh'), 'plugins-data', 'dsh-pet-workout')
  return join(dir, 'water.json')
}

export function loadWater(file) {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    return { ...DEFAULT_WATER, ...(saved && typeof saved === 'object' ? saved : {}) }
  } catch {
    return { ...DEFAULT_WATER }
  }
}

/** 整份写回（先写临时文件再改名，写一半崩了也不会留个坏文件） */
export function saveWater(file, cfg) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n')
  renameSync(tmp, file)
}
