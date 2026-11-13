# dsh-pet-workout · 一起锻炼

让 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 里的大肥鱼带你锻炼：右键她 →「更多」→「一起锻炼」，
她会报动作、做示范、气泡倒计时、休息时喝水，偶尔偷个懒被你抓包，练完欢呼。

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

这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件，**本身不画宠物**，
全程通过 dsh-pet 开放的第三方接口指挥 dsh-pet 里的那一只，所以必须先装 dsh-pet。

## 安装

```bash
dsh plugin --profile web add dsh-pet                              # 先装 dsh-pet（≥ 0.4.8）
dsh plugin --profile web add github:realRoc/dsh-pet-workout       # 再装本插件
```

桌面应用把 `web` 换成 `desktop`。装完重启 dsh。

## 怎么用

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

## 它是怎么接上 dsh-pet 的

只用 dsh-pet 公开的 HTTP 接口（[openapi.yaml](https://github.com/PC2005-cloud/dsh-pet/blob/main/openapi.yaml)）：

1. `POST /dsh-pet-7340/menu/item` 在右键「更多」里注册菜单项，`GET /menu/events` 长轮询等用户点；
2. 开练时 `POST /lock` 拿占用锁——锁住期间她不再随机走动、碎碎念，只听我们的；每个动作前续一次锁；
3. `POST /anim` 带 `url` 点播本插件托管的动画（插件在 dsh 同一个 Web 服务上提供 `/dsh-pet-workout/clips/*.webm`），
   `GET /playback/{id}` 等它播完再播下一遍；
4. `POST /broadcast` 弹气泡：报动作、倒计时、休息；
5. 锁被用户收走（`lock-lost` + `cause: preempted`）就当暂停；练完 `POST /lock/release` 还给她。

跟练动画用 [`scripts/normalize-clips.mjs`](scripts/normalize-clips.mjs) 套进 dsh-pet 的画幅（640×360，VP9 + alpha），
人物站立身高、脚底、中线和 dsh-pet 自己的动画对齐，插播时不会忽大忽小。

## 已知限制

- 倒计时只能用气泡显示：dsh-pet 没有屏幕叠加层的接口。
- 换成别的 pet pack 时，锻炼动画还是大肥鱼的。
- 在 Safari（macOS WebKit）里打开 dsh web 时，webm 的透明通道不生效（dsh-pet 自己用 `.mov` 解决，本插件还没做）。
- 语音播报只在宠物只显示在一端（`web` 或 `desktop`）时有效，且要在 dsh-pet 设置里打开语音。

## 开发

```bash
npm test                                                          # 跟练流程的单元测试（假 dsh-pet + 假时钟）
dsh plugin --profile <你的测试 profile> add link:$PWD             # 链接本地目录，改完重启 dsh 就生效
node scripts/normalize-clips.mjs <desk-pet>/characters/dafeiyu/workout/clips   # 重新生成动画
```

## 许可

- **代码**：[MIT](LICENSE)
- **动画素材**（`assets/clips/`，以及 README 里的 GIF `docs/gifs/`）：**CC BY-NC-SA 4.0，不可商用**，见 [`LICENSE-ASSETS.md`](LICENSE-ASSETS.md)

形象「大肥鱼」是社区二创的 DeepSeek 形象，**非 DeepSeek 官方形象**；原型「溟月」出自 B 站 [@上善无形](https://space.bilibili.com/4456176)，
DeepSeek 版（女仆鲸鱼娘）设计出自 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)。

本插件是 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（作者 PC2005-cloud）的配套插件。
