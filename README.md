# 潮汐 · Bitget USDT 永续扫描器

独立、零第三方运行依赖、中文 iPhone 网页。只在点击“扫描市场”时请求官方 V2 公开行情，无交易 API Key、账户连接、订单接口、定时器或付费资源。所有结果由实时响应产生；测试夹具只存在 tests，不进入网页。与 pusi-overseas-leads 无共享配置、代码、远端或部署目标。

## 本地使用

需要 Node.js 22 或更新版本，无需 npm install。

```sh
cd /workspace/bitget-perp-scanner
npm test
npm start
```

访问 http://localhost:8080。同一网络的 iPhone 可访问电脑局域网 IP 的 8080 端口（依赖本机防火墙设置）；生产推荐 HTTPS GitHub Pages。

## 免费 GitHub Pages 发布

已配置 `.github/workflows/pages.yml`：main 推送后先测试，再部署 web。建议创建新的 **公开** 仓库 `bitget-perp-scanner`，以使用 GitHub Free 的公开仓库 Pages；不启用付费服务。

在有有效 GitHub CLI 登录的机器，运行：

```sh
bash scripts/deploy-github.sh
```

脚本先检查认证、运行测试，再创建独立公开仓库、推送和启用 Pages。已有 origin 时停止，避免覆盖其他项目。脚本需要仓库创建、Actions 和 Pages 配置权限。若组织策略限制启用 Pages，可在新仓库 Settings → Pages → Source 中选 GitHub Actions。部署后 URL 通常为 `https://<用户名>.github.io/bitget-perp-scanner/`，以 Actions 返回的真实 URL 为准。

脚本尚未在当前环境执行发布：当前 CLI 凭据无效。没有声称仓库或线上地址已创建。

## 行情与策略

- `/api/v2/public/time`：服务器时间校准。
- `/api/v2/mix/market/contracts?productType=USDT-FUTURES`：筛选 `quoteCoin=USDT`、`symbolStatus=normal`、`symbolType=perpetual`。
- `/api/v2/mix/market/tickers`：按 `usdtVolume` 的 24h USDT 成交额降序取40。BTC、ETH若在前40则纳入，不以固定名单替代真实排名。
- `/api/v2/mix/market/candles`：每个合约请求1H、15m、5m，各100根。按时间升序，移除未收盘K线；要求至少60根、时间连续、数据有效且新鲜。
- `/api/v2/mix/market/ticker`：分析前刷新该合约 bid/ask，要求报价不超过60秒。多头按ask、空头按bid作为参考入场，再保守扣除费用和滑点。

1H EMA20、EMA50排列和EMA20近3根斜率决定方向；不明确即等待。15m/5m识别：

1. 放量突破：15m突破此前20根高/低，5m突破此前20根高/低，5m量≥此前20根均量1.5倍。
2. 顺势回踩：15m收盘在EMA20趋势侧，前一5m触及EMA20，最新5m收盘突破前一根高/低且回到EMA趋势侧。
3. 趋势反转：15m最近20根与此前20根出现新低/新高，再收盘突破最近区间另一侧；5m方向确认且放量，1H必须已确认新方向。反转优先标记。

止损为最近6根5m极值加0.2 ATR缓冲；目标为最近59根已收盘15m K线中前方最近高/低，至少距离0.5 ATR。参考入场偏离5m收盘超过0.5 ATR则等待。强势突破创出新高/低可能没有历史目标，此时也等待，绝不人为设置2倍止盈凑比例。

`净RR = [方向×(目标−入场) − (入场+目标)×(单边手续费+单边滑点)] / [方向×(入场−止损) + (入场+止损)×(单边手续费+单边滑点)]`

净RR小于2、条件缺失、目标缺失或数据异常一律等待。默认单边手续费0.06%、单边滑点0.05%，均可配置。实际资金费、剧烈行情、跳空和超预期滑点未包含；系统不是收益预测，未做历史盈利回测。

## 错误处理和限流

请求在全局队列间隔220ms启动（低于5次/秒），12秒超时，最多3次尝试，失败不回填模拟或旧数据。扫描期间禁用按钮和参数；每次扫描清空旧结果。单币失败显示等待并继续，其余全局故障会终止并明确报错。顺序请求约160次，耗时取决于网络，界面显示进度。没有后台监控和自动刷新。

GitHub Pages为静态托管，浏览器必须能直连Bitget且获得CORS许可。地区封锁、API限流、跨域策略变化均可能导致不可用，页面会报错。不要通过不明公共代理传输行情。若未来需要自建代理，应重新验证免费额度和部署安全；当前未创建代理资源。

## 验证

```sh
npm test
npm run verify:api
```

第二条会真实请求服务器时间、合约列表、前40排名、BTC三周期K线和报价，并检查跨域响应头；失败退出码非零，不算通过。所有自动测试均使用离线夹具，不能代替真实行情验证。验证现状见 [VALIDATION.md](VALIDATION.md)。
