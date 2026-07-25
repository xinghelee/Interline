# Interline(行间)

个人用双语对照浏览器翻译扩展:译文长在字里行间。支持 Claude / OpenAI / Grok / DeepSeek / Gemini,自带 API Key,无订阅无遥测。设计与路线图见 [PLAN.md](./PLAN.md)。

## 开发

```sh
npm install
npm run build     # 产物在 dist/
npm run watch     # 监听改动重新打包(改完在 chrome://extensions 点刷新)
npm run typecheck
```

## 安装到 Chrome

1. 打开 `chrome://extensions`,开启右上角「开发者模式」
2. 点「加载已解压的扩展程序」,选择本项目的 `dist/` 目录
3. 点扩展图标 → 「设置」,选择翻译服务并填入对应 API Key,可点「测试连接」验证
4. 打开任意英文页面,点扩展图标 → 「翻译此页」(或按 Alt+T)

## 当前进度

- [x] M1:整页双语对照 + Claude API(结构化输出批量翻译)+ popup + 设置页 + 当日用量统计
- [x] M1.5:div 叶子块扫描(Twitter/X 等非语义标签站点)+ popup 快捷翻译(自动中英互译)
- [x] M2:懒翻译(IntersectionObserver 进视口才翻)+ MutationObserver 增量扫描 + IndexedDB 译文缓存(5 万条 LRU)
- [x] M3:站点自动翻译开关 + 划词翻译 + 快捷键(Alt+T 翻译/显隐,Alt+S 划词开关)+ 样式打磨
- [x] 原文显示开关:popup 一键切换双语对照 / 仅译文模式(偏好持久化)
- [x] popup 视觉重设计(双语 wordmark、紧凑操作行、拨动开关、进度行)
- [x] 广告屏蔽:declarativeNetRequest 内置常见广告域名规则 + 版位遮蔽 + X 推广推文/Reddit 推广帖清理,设置页可关
- [x] M4:Twitter/X 与 Reddit 适配(通用 div 叶子块方案实测覆盖)+ 输入框翻译(Alt+E 原地替换,写英文邮件/推文)
- [x] 多引擎:Claude 原生 + OpenAI 兼容通道(OpenAI / Grok / DeepSeek / Gemini),按服务商记忆 Key 和模型
- [ ] M4(可选):Twitter/Reddit 虚拟列表适配、输入框翻译
