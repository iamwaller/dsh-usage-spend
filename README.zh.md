# 用量与花费（dsh-usage-spend）

在 DSH 的输入框下方显示本次会话的 token 用量与**估算花费**，并把金额补到内置的每轮用量按钮上。币种和汇率在 **插件** 页配置。

一个包同时是 bundle（声明 `usage-cost` 这一行）和功能本体，装上即出现插件页卡片。

## 功能

- **底部用量 pill**：`85.3M tok · ≈¥3.09 · 缓存命中 99.4%`，替换内置的 `usage` 行。
- **点击卡片**：标题行显示精确 token 数与金额，下面是缓存命中、未缓存输入、缓存读取、缓存写入、输出的分桶。
- **每轮按钮**：把内置的 `用量 85.3M tok` 改成 `85.3M tok · ≈¥3.09`。
- **插件页配置**：`币种`（人民币 / 美元 / 同时显示）、`汇率（1 USD = ? CNY）`、是否显示左侧栏余额，并在表单下方以只读表格展示当前单价表。
- **左侧栏余额**：在侧栏底部显示 `余额 ¥12.34`，每 60 秒或点击时刷新；赠金放在 tooltip 里；折叠栏显示紧凑金额。可关闭。

## 安装

```sh
dsh plugin --profile <profile> add dsh-usage-spend
```

或者在 DSH 桌面端 / Web 的 **插件 → 添加插件** 里输入包名 `dsh-usage-spend`，装完点 **立即启用**。之后重启或刷新页面。

启用后打开 **插件** 页，能看到 **用量与花费** 卡片，展开确认 `usage-cost` 行是开启的。

## 配置

点该行的 **配置** 修改，保存后立即生效。配置写入 profile 的 `cordis.patch.yml`：

```yaml
- id: usage-cost
  name: 'dsh-usage-spend'
  config:
    currency: CNY      # CNY | USD | BOTH
    usdToCny: 7.2
    showBalance: true
```

关闭该行会移除底部 pill、每轮金额与侧栏余额；重新打开即恢复。

## 估算口径

价格表是 models.dev 的 DeepSeek 快照（USD / 1M token）：

| 模型 | 输入 | 缓存读 | 缓存写 | 输出 |
|---|---:|---:|---:|---:|
| `deepseek-flash` / `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` | 0.15 | 0.003 | 0.15 | 0.60 |
| `deepseek-v4-pro` | 0.66 | 0.022 | 0.66 | 1.98 |
| `deepseek-chat` / `deepseek-reasoner` | 0.28 | 0.028 | 0.28 | 0.42 |

- 费用 = 未缓存输入 × 输入价 + 缓存读取 × 缓存读价 + 缓存写入 × 缓存写价 + 输出 × 输出价。
- 人民币金额按配置的汇率换算，默认 `7.2`。
- **不包含**峰谷倍率、折扣、赠送额度或平台实际账单，只用于估算。
- 每轮金额优先使用会话里的精确用量；精确用量不可得时按该轮 assistant 消息求和并显示 `≈`。

## 自定义价格

在浏览器控制台写入 `localStorage["dsh.cost.prices"]`，格式为「模型名 → USD / 1M token」：

```json
{
  "deepseek-flash": { "input": 0.15, "cacheRead": 0.003, "cacheWrite": 0.15, "output": 0.6 }
}
```

键可以是完整模型名、`provider/model` 或裸模型名；刷新页面生效。

## 兼容性与限制

- 面向 DSH `0.2.2-rc.1` 的客户端 slot / projection API。
- 每轮按钮的文字通过 DOM 观察器改写内置按钮；DSH 改版后结构变化可能让它退化为原来的 `用量 N tok`，不影响会话。
- 会话内切换模型时，整段会话按当前模型单价估算。
- 左侧栏余额调用 `account.getBalance`（DeepSeek 账号），未登录或读取失败时显示 `--`；余额来自平台，不是本地估算。
- 币种与汇率优先读 Host 配置；设置服务不可用时退回 `localStorage`（`dsh.cost.currency` / `dsh.cost.usdToCny`）。

## 许可

MIT
