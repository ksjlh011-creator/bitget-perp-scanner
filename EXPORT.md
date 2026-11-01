# 本次扫描完整JSON导出

网站不变：https://ksjlh011-creator.github.io/bitget-perp-scanner/

## iPhone Safari下载

1. 打开网页，点击“扫描市场”，等待本次扫描结束。
2. 点击绿色边框的“导出完整数据 ↓ JSON”。按钮在扫描中禁用，重新扫描会立即清除上一次待导出的快照。
3. 若Safari询问，选择“下载”。点Safari下载箭头打开文件，或打开系统“文件”App，在“下载项”查找 `bitget-scan-complete-时间.json`。下载目录可能在iCloud Drive或“我的iPhone”，取决于Safari设置。
4. 如果Safari直接打开JSON预览，点“分享”→“存储到文件”。

按钮在点击事件中创建JSON Blob并触发download，60秒后才回收Blob URL，给Safari足够时间处理。此操作仅导出内存中的本次快照，不重新请求行情，也不从localStorage、Service Worker或上次扫描缓存补数据。过期信号标记expiredAtExport及statusAtExport，不能当作导出时的实时入场建议。

## 成功导出

- schemaVersion、source、productType、status=completed、complete=true。
- serverTimeStart/serverTimeEnd：Bitget公开时间接口返回的实际毫秒时间，另有本机开始/结束时间。导出时间另列，不冒充服务器实际时间。
- selection.rankedContracts：40个正常USDT永续，按24h usdtVolume降序，包含排名、币种、筛选成交额、筛选报价时间。只保留真实排名内合约，不强行加入BTC/ETH/AAVE或其他币。
- contracts：40条，rank、筛选时成交额、serverTime、quote、frames、result、errors。
- quote：最新买一bid、卖一ask、timestamp、最新24h USDT成交额、校验用服务器时间。只读公开接口，不涉及交易密钥。
- frames：4H/1H/15m/5m/1m各100根，合计20,000根，按开盘时间升序。每根包含time、closeTime、open/high/low/close、volume，API提供时附quoteVolume。价格和量以十进制字符串保存，避免导出时截断精度。time为UTC Unix毫秒，closeTime为下一根开始时刻。
- 每帧serverTime是该次K线响应的Bitget requestTime。只选closeTime≤该时间的K线，不能用稍后的服务器时间把取数时未收盘的数据当成完整K线。实际请求101根，移除未收盘后取最近100；不足100、重复、缺口、过期或畸形均报错。若顺序取数跨过K线收盘边界，只对受影响周期重新获取一次，并刷新报价及服务器时间；refreshEvents保留记录，仍不满足就标记数据错误。
- result：本次分析状态、全部失败原因、逐项过滤布尔值（null=未评估）、入场确认、区间/止损/T1/T2（仅确认信号）、netRR/netRR2、分析服务器时间。观察候选只供分析，不显示可执行入场指令。可计算但不合格的净RR也保留为诊断数值；无法计算为null，不能误读为0。
- entryCandidates：导出时尚未过期的已确认信号。observationCandidates：普通/重点观察候选及过期信号；focusedCandidates仅重点观察；closestCandidates最多5个，按通过项数排序。过滤总计在filters，状态统计在summary。

核心仅顺势回踩，不以单独突破/反转触发入场。重点观察不等于可入场。策略仍要求4H/1H同向、15m和5m量比≥1.5、后续1m触发及最差入场价T1净RR≥2；未改变这些门槛。策略和回放统一使用最近100根窗口，便于用导出的同一输入复核。

## 失败与不完整导出

本次出现单币数据或报价错误时：contracts[].status=error，result.status=数据错误，errors记录scope/code/message，其他可用周期继续保留；未完成周期status=error、count=0，不制造100根数据。扫描继续处理其余币。

全局取数失败status=failed，单币异常或结束时间失败status=partial，complete=false、export.incomplete=true。文件名含INCOMPLETE，界面同时警告“不完整诊断JSON”。错误记录不属于正常等待，不计为合格观察信号。失败时也不会导出上一次扫描结果。

## 验证

`npm test`覆盖准确根数、十进制字段、取数时间边界、畸形/不足/重复/过期数据、40币聚合、报价错误、全局失败、导出不可变快照、过期降级、Blob下载与URL回收。

`npm run verify:api`通过与网页相同的scanMarket获取真实40币，实际序列化并解析JSON，验证200帧各100根、全部已收盘、总计20,000根。真实文件写入reports/live-scan.json，和原始历史回测报告一起保存在Actions artifact。任何真实验证失败会阻止发布。

iPhone Safari实机下载验收不由Node的Blob/锚点测试代替；在实际手机网络可达Bitget的条件下仍需完成实机验收。

## 结构风险字段升级

JSON保留原有行情字段，并新增riskSettings（ATR参数、手填权益、1%预算）、各合约公开contractRules、result.stopDetails（6/10/15窗口、结构与ATR缓冲依据）和result.positionRisk（基础币数量、费用后预计损失及权益占比）。权益留空为null，不假定真实余额；不能计算的数量也是null。过滤条件增为16项。详见RISK.md。
