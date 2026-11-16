# dsh-pet-workout · 一起锻炼 + 喝水提醒

让 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 里的大肥鱼管管你的身体：

- **一起锻炼**：右键她 →「更多」→「一起锻炼」，她会报动作、做示范、气泡倒计时、休息时喝水，偶尔偷个懒被你抓包，练完欢呼。
- **喝水提醒**：到点了递水壶催你喝水，不理她就一级级加码——示范喝水、走到屏幕中间敲屏幕、最后抡起 1.5L 大水朝你扔过来，
  气鼓鼓躲到屏幕边上，过几分钟别别扭扭地回来。点她一下就算喝了。

<table>
  <tr>
    <td align="center"><img src="docs/gifs/squat_open_close.gif" width="150" alt="开合深蹲"><br>开合深蹲</td>
    <td align="center"><img src="docs/gifs/curtsy_lunge.gif" width="150" alt="屈膝礼弓步"><br>屈膝礼弓步</td>
    <td align="center"><img src="docs/gifs/lunge.gif" width="150" alt="弓步蹲"><br>弓步蹲</td>
    <td align="center"><img src="docs/gifs/wall_sit_loop.gif" width="150" alt="靠墙静蹲"><br>靠墙静蹲</td>
    <td align="center"><img src="docs/gifs/bridge_loop.gif" width="150" alt="臀桥"><br>臀桥</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/gifs/drink.gif" width="150" alt="休息：喝口水"><br>休息：喝口水</td>
    <td align="center"><img src="docs/gifs/lazy_phone.gif" width="150" alt="偷懒：看一眼消息"><br>偷懒：看一眼消息</td>
    <td align="center"><img src="docs/gifs/lazy_rice.gif" width="150" alt="偷懒：先干口饭"><br>偷懒：先干口饭</td>
    <td align="center"><img src="docs/gifs/lazy_think.gif" width="150" alt="偷懒：深度思考"><br>偷懒：深度思考</td>
    <td align="center"><img src="docs/gifs/cheer.gif" width="150" alt="练完欢呼"><br>练完欢呼</td>
  </tr>
</table>

<table>
  <tr>
    <td align="center"><img src="docs/gifs/water_offer.gif" width="150" alt="到点：递水壶"><br>到点：递水壶</td>
    <td align="center"><img src="docs/gifs/water_knock.gif" width="150" alt="+10 分钟：敲屏幕"><br>+10 分钟：敲屏幕</td>
    <td align="center"><img src="docs/gifs/water_throw.gif" width="150" alt="+15 分钟：大水攻击"><br>+15 分钟：大水攻击</td>
    <td align="center"><img src="docs/gifs/water_return_sulk.gif" width="150" alt="回来时还没喝：闹别扭"><br>回来时还没喝：闹别扭</td>
    <td align="center"><img src="docs/gifs/water_cheers.gif" width="150" alt="喝了：干杯"><br>喝了：干杯</td>
  </tr>
</table>

这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件，**本身不画宠物**，
全程通过 dsh-pet 开放的第三方接口指挥 dsh-pet 里的那一只，所以必须先装 dsh-pet。

## 安装

```bash
dsh plugin --profile web add dsh-pet                              # 先装 dsh-pet（≥ 0.4.8）
dsh plugin --profile web add dsh-pet-workout                      # 再装本插件（npm）
```

桌面应用把 `web` 换成 `desktop`。装完重启 dsh。想跟 GitHub 上的最新代码，把第二行换成
`dsh plugin --profile web add github:realRoc/dsh-pet-workout`。

## 一起锻炼

右键大肥鱼 →「更多」：

| 菜单项 | 作用 |
| --- | --- |
| 一起锻炼：腿部6分钟力量训练 | 开合深蹲、屈膝礼弓步、弓步蹲、硬拉、臀桥、靠墙静蹲，动作之间休息 15 秒 |
| 一起锻炼：试一下（1 分钟） | 三个动作的短版，先看看效果 |
| 暂停锻炼 / 继续锻炼 | 练的过程中出现 |
| 结束锻炼 | 随时收工 |

练的时候**拖一下或点一下她就是暂停**（dsh-pet 规定用户动手时第三方要让出控制权），
再从「更多 → 继续锻炼」接着练，剩下的时间接着算。

训练计划在 [`plans/`](plans/)，格式：

```jsonc
{
  "name": "菜单里显示的名字",
  "rest": 15,          // 每个动作后休息几秒；单步可以用 "rest" 覆盖，0 = 紧接着下一个
  "round_rest": 45,    // 多轮时轮与轮之间休息几秒
  "rounds": 1,
  "steps": [
    {"move": "squat_open_close", "secs": 45},
    {"move": "curtsy_lunge", "secs": 22, "side": "left"}
  ]
}
```

`move` 可选：`squat_open_close` 开合深蹲、`squat` 深蹲、`curtsy_lunge` 屈膝礼弓步、`lunge` 弓步蹲、`deadlift` 硬拉、
`glute_bridge` 臀桥、`glute_bridge_single` 单腿臀桥、`wall_sit` 靠墙静蹲。`side: "left"` 的画面是镜像的（臀桥除外）。

## 喝水提醒

装上就开着，默认每 45 分钟一次。人在电脑前才计时（键鼠空闲 5 分钟以上算你不在），22 点到 9 点不提醒，跟练的时候也不打扰。

| 到点以后 | 她干什么 |
| --- | --- |
| 到点 | 递水壶，气泡 + 语音提醒 |
| +5 分钟 | 示范喝水：「你不喝我先喝了啊！」 |
| +10 分钟 | 走到屏幕中间，敲屏幕，搬出 1.5L 大水 |
| +15 分钟 | 大水朝你扔过来，气鼓鼓躲到屏幕左边，3~5 分钟后回来；回来时你还没喝，她会冷淡一阵子 |

每一级演完，她会原地等你 45 秒：**这时点她一下就是「我喝了」**，她跟你干杯，记一杯。
等完她就回去过她自己的日子（照常显示 agent 的工作状态），下一级再来。躲在屏幕边上的时候把她拎回来，等于叫她回来。

右键「更多」里的喝水菜单：

| 菜单项 | 作用 |
| --- | --- |
| 我喝水了（今天 3/8） | 随时报喝水；一天 8 杯的进度也在这儿 |
| 等会儿再喝 | 提醒中出现：这一轮作罢，10 分钟后再来 |
| 叫她回来 | 她气跑了的时候出现 |
| 今天别催我喝水 / 恢复喝水提醒 | 今天先不提醒，明天自动恢复 |
| 喝水提醒：每 45 分钟 | 点一下换间隔：30 → 45 → 60 → 90 → 关 |

设置和今天喝了几杯存在 `~/.dsh/plugins-data/dsh-pet-workout/water.json`。

## 它是怎么接上 dsh-pet 的

只用 dsh-pet 公开的 HTTP 接口（[openapi.yaml](https://github.com/PC2005-cloud/dsh-pet/blob/main/openapi.yaml)）：

1. `POST /dsh-pet-7340/menu/item` 在右键「更多」里注册菜单项，`GET /menu/events` 长轮询等用户点；
2. 开练时 `POST /lock` 拿占用锁——锁住期间她不再随机走动、碎碎念，只听我们的；每个动作前续一次锁；
3. `POST /anim` 带 `url` 点播本插件托管的动画（插件在 dsh 同一个 Web 服务上提供 `/dsh-pet-workout/clips/*.webm`），
   `GET /playback/{id}` 等它播完再播下一遍；
4. `POST /broadcast` 弹气泡：报动作、倒计时、休息；
5. 锁被用户收走（`lock-lost` + `cause: preempted`）就当暂停；练完 `POST /lock/release` 还给她。

喝水提醒用的是同一套，另外：

- `POST /position` 让她走到屏幕中间、走到屏幕边上躲着、再走回来；桌面端先 `GET /pose` 读她原来在哪，回来时走回原处；
- 每一级演完拿着锁等 45 秒，这期间锁被收走（`preempted`）= 你点了她 = 喝了；
- 躲着的那几分钟一直拿着锁，让她在屏幕边上待着不乱跑。

跟练动画用 [`scripts/normalize-clips.mjs`](scripts/normalize-clips.mjs) 套进 dsh-pet 的画幅（640×360，VP9 + alpha），
人物站立身高、脚底、中线和 dsh-pet 自己的动画对齐，插播时不会忽大忽小。

## 已知限制

- 倒计时只能用气泡显示：dsh-pet 没有屏幕叠加层的接口。同样的原因，桌宠 desk-pet 里「大水砸碎屏幕」那一下这里做不了，只播扔水的动画。
- 网页端读不到她原来站在哪：喝水提醒把她挪走以后，回来时停在右下角。
- 提醒时拖她、把她藏起来，也会被当成「点了她」（dsh-pet 不区分这几种），算喝了一杯。
- 「人在不在电脑前」：macOS 和 Windows 自带；Linux 要装 `xprintidle`，没装就当你一直在。
- 换成别的 pet pack 时，锻炼和喝水动画还是大肥鱼的。
- 在 Safari（macOS WebKit）里打开 dsh web 时，webm 的透明通道不生效（dsh-pet 自己用 `.mov` 解决，本插件还没做）。
- 语音播报只在宠物只显示在一端（`web` 或 `desktop`）时有效，且要在 dsh-pet 设置里打开语音。

## 开发

```bash
npm test                                                          # 跟练、喝水提醒的单元测试（假 dsh-pet + 假时钟）
dsh plugin --profile <你的测试 profile> add link:$PWD             # 链接本地目录，改完重启 dsh 就生效
DSH_PET_WATER_SPEED=30 dsh --profile <你的测试 profile>           # 喝水提醒的钟走快 30 倍：45 分钟变 90 秒
node scripts/normalize-clips.mjs <desk-pet>/characters/dafeiyu/workout/clips <desk-pet>/characters/dafeiyu/water/clips   # 重新生成动画
```

## 许可

- **代码**：[MIT](LICENSE)
- **动画素材**（`assets/clips/`，以及 README 里的 GIF `docs/gifs/`）：**CC BY-NC-SA 4.0，不可商用**，见 [`LICENSE-ASSETS.md`](LICENSE-ASSETS.md)

形象「大肥鱼」是社区二创的 DeepSeek 形象，**非 DeepSeek 官方形象**；原型「溟月」出自 B 站 [@上善无形](https://space.bilibili.com/4456176)，
DeepSeek 版（女仆鲸鱼娘）设计出自 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)。

本插件是 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（作者 PC2005-cloud）的配套插件。
