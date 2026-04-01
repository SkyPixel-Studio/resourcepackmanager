<p align="center">
  <img src="icon.png" width="128" height="128" alt="Resource Pack Manager">
</p>

<h1 align="center">Resource Pack Manager</h1>

<p align="center">
  Minecraft 1.12.2 客户端资源包制作管理器
</p>

---

一款专为 Minecraft 1.12.2 资源包制作者打造的桌面端管理工具，集文件管理、代码编辑、媒体预览、3D 模型查看于一体。

## 功能特性

- **资源包管理** — 自动解析资源包结构，按类型分类浏览全部资源文件
- **扁平化视图** — 不再翻目录，一目了然看到所有资源文件的位置
- **代码编辑器** — 基于 CodeMirror 6，支持 JSON / Properties / GLSL 等语法高亮
- **Unicode 工具** — 输入中文自动提示转换为 `\uXXXX`，悬停 Unicode 转义序列自动解码预览
- **OptiFine CIT 模板** — 一键生成 `.cit.properties` 等 OptiFine 模板文件
- **资源路径快速插入** — 右键复制资源路径，直接插入编辑器
- **媒体预览** — 图片渲染、音频播放器（`.ogg` / `.wav`）
- **3D 模型查看** — 基于 Three.js 渲染 Minecraft JSON 模型，支持轨道相机旋转/缩放/平移，线框模式切换
- **文件管理** — 新建、重命名、复制、剪切、粘贴、删除、拖拽移动
- **实时监听** — 外部修改资源包文件后自动刷新文件树
- **跨平台打包** — 支持构建 macOS（`.dmg`）、Windows（`.exe`）、Linux（`.AppImage`）

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Electron 33 |
| 构建工具 | electron-vite + Vite 6 |
| 语言 | TypeScript |
| 编辑器 | CodeMirror 6 |
| 3D 渲染 | Three.js |
| 文件监听 | Chokidar |
| 打包 | electron-builder |

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build

# 打包为可分发应用
npm run dist          # 当前平台
npm run dist:mac      # macOS
npm run dist:win      # Windows
npm run dist:linux    # Linux
```

## 使用方式

1. 启动应用后，点击 **打开目录** 或直接将资源包文件夹拖入窗口
2. 左侧面板浏览文件树，底部面板切换扁平化资源列表
3. 点击 `.json` / `.properties` 等文件进入代码编辑器
4. 点击图片或音频文件进入媒体预览
5. 打开 `/models/` 下的 JSON 模型文件，自动进入 3D 预览，可旋转、缩放查看模型
6. 右键文件或目录可使用文件管理操作和资源路径工具

## 项目结构

```
src/
├── main/              # Electron 主进程
│   ├── index.ts       # 窗口创建、协议注册
│   ├── ipc.ts         # IPC 通信处理
│   ├── fileOps.ts     # 文件系统操作
│   └── packParser.ts  # 资源包解析与分类
├── preload/
│   └── index.ts       # 安全地暴露 API 给渲染进程
└── renderer/
    └── src/
        ├── main.ts              # 渲染进程入口
        ├── components/
        │   ├── editor.ts        # CodeMirror 编辑器
        │   ├── fileTree.ts      # 文件树组件
        │   ├── flatView.ts      # 扁平化视图
        │   ├── imagePreview.ts  # 图片/音频侧边栏预览
        │   ├── modelViewer.ts   # Three.js 3D 模型查看器
        │   ├── templateDialog.ts
        │   ├── pathHelper.ts
        │   └── statusBar.ts
        ├── utils/
        │   ├── resourceTypes.ts
        │   ├── mcModelParser.ts # Minecraft 模型解析器
        │   └── pathResolver.ts
        └── styles/
            ├── global.css
            └── editor.css
```

## License

[GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html)
