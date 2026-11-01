# 验证记录（2026-11-01）

已完成：独立目录、扫描引擎、中文响应式网页、手动扫描、费用设置、等待状态、请求超时/重试/限流、GitHub Pages工作流、独立公开仓库部署脚本及离线自动化测试。

离线测试实际运行13项，全部通过。`npm test`在本环境默认隔离模式按2个测试文件汇总，均通过；`node --test --test-isolation=none`展开13项。

测试覆盖：已收盘K线排序过滤、缺口/过期/畸形数据拒绝、前40成交额排名、停牌剔除、做多和做空回踩、真实结构止盈、净费用公式、低RR等待、无目标等待、追价等待、报价过期、模糊趋势、非法费用、API成功及有限重试失败。正向信号仅为测试夹具，不代表市场存在信号。

当前限制及未完成事项：

1. **Bitget真实连通性未验证通过**：curl实测请求ticker列表失败，错误为 `Failed to connect to proxy port 8080`。Node验证脚本同样无法取得行情。当前失败来自环境网络，不能据此判断Bitget接口服务状态。
2. **浏览器CORS与iPhone Safari实机未验证**：本地预览服务监听0.0.0.0:8080返回EPERM，环境不允许开启监听端口。响应式布局已实现，但没有宣称完成真实手机验收。网络恢复后执行verify:api，并在Safari打开部署URL点击扫描验证。
3. **GitHub仓库未创建、线上未部署**：gh auth status报告GH_TOKEN无效；连接器可以读取账号，但没有创建仓库工具。未触碰任何已有仓库，尤其未修改pusi-overseas-leads。需要有效CLI认证后运行deploy-github.sh，检查Actions成功及真实URL。
4. **完整40币种实时扫描未验证**：依赖真实API恢复；离线测试不等于线上可用或盈利回测。需对字段、当前产品状态和真实数据响应再做验收。

无付费资源创建；无交易权限或交易密钥请求。

## 继续部署检查

已按用户要求将目标仓库统一为 `ksjlh011-creator/bitget-perp-scanner`，应用代码没有重写。

- GitHub连接器成功识别账号ksjlh011-creator；查询目标仓库返回404（尚不存在或连接器不可见）。
- 当前工具列表没有创建仓库或配置Pages的能力；CLI认证检查仍报告GH_TOKEN无效，检查一次后停止，没有循环重试。没有推送代码，也没有创建线上站点。
- Bitget服务器时间端点实际请求再次失败：无法连接环境proxy:8080。因此真实API、CORS、完整40合约扫描均未验证通过。
- iPhone最少手动操作：登录指定账号，新建公开bitget-perp-scanner并勾选Add a README file；进入Settings → Pages，将Source设为GitHub Actions。然后通知助手继续上传现有代码。若连接器未获新仓库权限，需要在GitHub App仓库访问范围中加入该仓库。
- 预期Pages路径为https://ksjlh011-creator.github.io/bitget-perp-scanner/，目前仅为预期地址，不能视为已部署。
