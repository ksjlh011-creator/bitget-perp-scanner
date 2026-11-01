# 部署与真实验证记录

网页：https://ksjlh011-creator.github.io/bitget-perp-scanner/

## 已完成

- 通过GitHub连接器推送现有代码，未修改pusi-overseas-leads，未创建付费资源。
- GitHub Pages发布成功，deploy和verify-live两个任务均成功。部署提交：79e9cbb49bf5d1f6b894a6cc3175210b9349a18a。
- GitHub Actions上13项离线测试全部通过。
- 真实验证时间：2026-11-01T14:39:31.293Z。
- 163次真实Bitget V2公开API请求全部HTTP 200；全部响应Access-Control-Allow-Origin为*，请求Origin为https://ksjlh011-creator.github.io。
- 前40合约包含BTC、ETH，全部完成1H、15m、5m及最新报价请求和分析，无数据错误。本次结果0个确认信号、40个等待；没有用模拟数据代替行情。
- 逐币结果和HTTP/CORS日志：https://github.com/ksjlh011-creator/bitget-perp-scanner/actions/runs/41317158106 ，展开verify-live任务。机器可读摘要见verification.json。
- 验证仅在推送或手动运行工作流时执行，无定时监控；网页只在点击扫描时更新。

## 未完成及验证范围

- iPhone Safari实机点击、视觉及实际浏览器fetch尚未验证；CORS响应头检查通过不等于所有设备、地区网络均能连接Bitget。
- 本机环境代理仍不可用，无法直接访问线上页面；发布成功由GitHub Pages确认，真实API验证在GitHub托管runner完成。
- 没有历史收益回测；本次没有确认信号，未验证真实信号的成交可行性。验证结果只属于上述时刻。
