# Roleplay Hub

**简体中文** | [English](./README.en.md)

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![DaisyUI](https://img.shields.io/badge/DaisyUI-5A0EF8?logo=daisyui&logoColor=white)](https://daisyui.com/)

> **一款以浏览器本地存储为主的角色扮演（Roleplay）对话和角色卡生成工具。**

**【免责与授权声明】**  
本项目基于 **[CC BY-NC 4.0（知识共享-署名-非商业性使用 4.0 国际许可协议）](./LICENSE)** 开源。**明确禁止任何形式的商业化使用（包括但不限于：作为收费服务提供、打包在付费产品中售卖、在产品内植入广告盈利等）。** 任何使用者必须遵守该协议，尊重原作者的署名权。对于违反协议的商业行为，保留追究法律责任的权利。

---

## 快速开始 (Quick Start)

### 1. 下载与运行

下载并解压后，直接双击 `index.html` 打开即可。

### 2. 初始化设置

1. 从导航打开**设置**，选择服务商，或使用唯一的“自定义”连接。
2. 填写 API 地址和密钥，选择对话模型。接口需要兼容 Chat Completions；地址可填写服务根地址或以 `/v1` 结尾，不要直接填写 `/chat/completions`。
3. 到**角色卡管理**导入 JSON / PNG，或新建角色卡。角色卡工坊也可生成、修改、导出并一键导入游玩。
4. 按需配置总结模型、向量模型、生图密钥和 Tavily Key。未使用的功能无需配置。

接口必须允许浏览器所在网页发起请求（CORS）。网页能打开、密钥有效，并不代表接口一定允许浏览器直连。

## 记忆、工具与兼容模式

### 记忆系统

- **基础模式**：总结模型为每轮对话生成记忆。超过“保留最近楼层”后，发送上下文时以对应总结替代较早的 AI 正文，不删除原聊天。
- **增强模式**：与基础模式共用这些总结，再将“用户原输入 + 对应总结”生成向量坐标。按最新输入召回相似度不低于 **48%** 的记忆，最多 **10 条**，按原时间顺序附在最新用户消息后，仅用于本次请求。
- **二次压缩**：最近 **25 轮**保留逐轮总结，更早的历史按每 **5 个轮次**分组压缩。确认没有正文的空轮可以跳过；有正文但总结失败的轮次需要补齐。压缩后的记忆仍保存原始逐轮总结，增强召回使用的是逐轮总结，而不是整组压缩结果。
- **补录**：弹窗按需显示逐轮总结、向量坐标、二次压缩的进度与预计时间。增强模式补录需要选好向量模型；更换向量模型后应重新补录坐标。后台补录会等待当前回复结束再继续处理。

“楼层”和“轮次”不是一个单位：普通的一次用户输入加一次 AI 回复通常是两层、一轮。旧版向量模式设置会迁移为增强模式，但旧正文分片不会直接变成新版向量记忆；它们会被空间管理统计为无用残留，由用户确认后清理。

### 工具

- **关键词检索**：查当前对话历史中的原文片段，不是联网搜索。
- **联网搜索**：调用 Tavily 搜索或读取网页，需要单独填写 Tavily API Key。
- **随机生成**：模型给出上下限，程序生成包含两端的随机整数；也可提供物品、位置等候选名称，由程序等概率抽取一项。用户指定的范围或选项会沿用，重复名称只计一次。

调用方式有“自适应”和“强制”，模型与 API 均需支持 `tools` / `tool_choice`。检索条数设置不改变增强记忆固定最多 10 条的召回规则。

### Gemini 抗截断

主对话中的 Gemini 抗截断通过 `output_reply` 工具提交正文，不是无限续写或扩大模型输出上限。没有工具正文但有普通正文时，会显示普通正文；只有完全没有正文、思考和工具调用的空响应才自动重试，最多共 **3 次请求**。不支持工具的接口仍可能失败。

角色卡工坊的“兼容模式重试”也使用工具提交内容，而不是切换成非流式请求。

---

## 目录结构 (Directory Structure)

```text
RP-Hub/
├── index.html                     # 主界面与脚本加载入口
├── character/                     # 角色卡生成工具
│   └── index.html
├── novel/                         # 小说生成与编辑
│   └── index.html
├── assets/
│   ├── css/
│   │   ├── styles.css             # 主页面样式
│   │   └── theme.css              # 三个页面共用的设计变量（配色、阴影、动效，含暗色）
│   └── js/
│       ├── built-in-content.js    # 默认预设、模式提示词、画师串与更新公告
│       ├── core-utils.js          # 通用工具、角色卡处理与基础配置
│       ├── api-utils.js           # HTTP、流式解析、工具调用与空回重试
│       ├── data-services.js       # 存储、记忆、上下文、分支与 UI 状态
│       ├── runtime-services.js    # 消息渲染、用量统计与空间管理
│       ├── tailwind-theme.js      # 三个页面共用的 Tailwind 配置，颜色读取 theme.css 变量
│       ├── theme.js               # 主题保存与内嵌页面同步
│       ├── update-check.js        # 可选的远程版本检查
│       ├── ui-components.js       # 导航、选择器、弹窗与页面组件
│       └── app.js                 # 主业务入口与页面状态
├── presence-server/              # 可选更新检测服务，不是聊天后端
│   └── README.md                  # 部署方式、环境变量和接口
├── LICENSE
├── README.en.md                   # 英文说明
└── README.md                      # 中文说明（默认）
```

### 可选的更新检测服务

`index.html` 中的 `rphub-update-api` 配置服务地址；内容留空可关闭远程版本检查。主页面可见时约每 20 秒查询一次，失败不影响聊天。该服务不保存聊天、角色卡或密钥，也不再统计在线人数。

服务部署需要 Node.js 20 或更高版本，详见 [`presence-server/README.md`](presence-server/README.md)。仅使用主网页不需要部署它。自行维护分支时，还需调整服务读取的版本文件地址，避免收到上游项目的更新提醒。

---

## 协议与许可 (License)

本项目严格遵守以下开源协议：

**[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans)**

* **您可以**：自由地共享（在任何媒介以任何形式复制、发行本作品）与演绎（修改、转换或以本作品为基础进行创作）。
* **您必须**：
  * **署名 (Attribution)**：给出适当的署名，提供指向本许可协议的链接，同时标明是否对原始作品作了修改。
  * **非商业性使用 (NonCommercial)**：**您不得将本作品或演绎作品用于任何商业目的。** 禁止任何形式的售卖、付费订阅集成或利用本项目进行广告牟利。
* 若要获取本项目的商业授权，请直接联系项目原作者。

详细许可条款请参见根目录下的 [`LICENSE`](./LICENSE) 文件。
