// 动作表和大肥鱼的台词。动作和动画对应关系、台词都来自 desk-pet（realRoc/desk-pet）的大肥鱼角色包。

export const MOVES = {
  squat_open_close: { label: '开合深蹲', cue: '开合深蹲！宽一下窄一下～', clip: 'squat_open_close' },
  squat: { label: '深蹲', cue: '深蹲，屁股往后坐！', clip: 'squat' },
  curtsy_lunge: { label: '屈膝礼弓步', cue: '女仆屈膝礼，其实是弓步蹲哦', clip: 'curtsy_lunge' },
  lunge: { label: '弓步蹲', cue: '左右交替弓步蹲！', clip: 'lunge' },
  deadlift: { label: '硬拉', cue: '硬拉电饭煲！背要平！', clip: 'deadlift' },
  glute_bridge: { label: '臀桥', cue: '躺下，臀桥！', clip: 'bridge_loop', posture: 'bridge' },
  glute_bridge_single: { label: '单腿臀桥', cue: '单腿臀桥，一条腿抬起来！', clip: 'bridge_single_loop', posture: 'bridge' },
  wall_sit: { label: '靠墙静蹲', cue: '靠墙静蹲，坚持住！', clip: 'wall_sit_loop', posture: 'wall' },
}

/** 躺着 / 蹲着练的姿势：先播 enter 进入姿势，练完播 exit 回到站姿 */
export const POSTURES = {
  bridge: { enter: 'bridge_enter', exit: 'bridge_exit' },
  wall: { enter: 'wall_sit_enter', exit: 'wall_sit_exit' },
}

export const LINES = {
  ready: '准备好了吗？跟我一起练！',
  last: ['最后 10 秒！', '坚持住！快到了！', '腿在抖了！别停！'],
  rest: '休息 {s} 秒，下一个：{next}',
  drink: '喝口水，歇一下～',
  done: '练完啦！大肥鱼最棒！',
  paused: '先歇会儿～右键「更多 → 继续锻炼」接着练',
  grabbed: '被拎起来啦！右键「更多 → 继续锻炼」接着练',
  resumed: '继续！',
  stopped: '今天就练到这儿吧～',
  /** 偷懒：中立 → 偷懒（心声）→ 被发现（嘴硬）→ 接着练 */
  lazy: {
    lazy_rice: { thought: '先干口饭再说', caught: '吃饱了才有力气练！' },
    lazy_phone: { thought: '就看一眼消息……', caught: '我在查动作要领！' },
    lazy_think: { thought: '让我深度思考一下……', caught: '已思考 3 秒，继续练！' },
    lazy_fake: { thought: '我在练，我在练……', caught: '这次认真练！' },
  },
}

const SIDE = { left: '左', right: '右' }

export function stepLabel(step) {
  const label = step.label || MOVES[step.move].label
  return step.side ? `${label}（${SIDE[step.side]}）` : label
}
