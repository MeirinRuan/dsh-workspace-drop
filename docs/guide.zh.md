# 工作区拖放指南

[English](guide.md) · [README](../README.zh.md) · [许可证](../LICENSE)

## 安装

本插件包仅支持 DSH `0.2.2-rc.1`。开发需要 Node.js `^22.19.0 || >=24.0.0` 和 pnpm `11.28.5`。

在 DSH 插件管理器中安装发布压缩包 `https://github.com/MeirinRuan/dsh-workspace-drop/releases/latest/download/dsh-workspace-drop.tgz`，然后启用 `dsh-workspace-drop`。也可以先构建，再安装本地检出的目录。插件包补丁添加 workspace-drop 加载项，客户端在 `shell.overlay` 插槽中追加提示层。

启用公开包前，先禁用旧的 `@local/dsh-workspace-drop` 插件包。两者共用提示层、事件监听器和语言命名空间，不能同时启用。

在插件管理器中禁用或卸载本包后，监听器、语言字典、样式和提示层会移除。卸载会等待已经开始的注册完成，并停止尚未开始的队列；已经添加的工作区仍然保留。

## 使用行为

从文件管理器将一个或多个本地文件夹拖到左侧工作区列表或新对话页面的工作区选择器上。松开后，插件通过 DSH 的 `workspaces.create` 服务注册原有路径。工作区列表立即更新，选择该工作区即可开始对话；已经添加的目录复用已有工作区，文件保留在原位置。

插件在拖放事件期间，通过桌面 `__DSH_HOST_PATHS__.pathFor` 接口同步取得目录路径。同次拖放中的重复路径会去重，多个目录按顺序注册；单个目录失败后仍会继续处理后面的目录。

添加成功时，顶部居中的成功提示显示工作区名称，停留六秒后淡出。部分失败时，提示同时列出成功的工作区和具体错误，点击“关闭”收起详情。普通文件会被拒绝并提示仅支持文件夹。注册过程中再次拖入目标区域的内容会被拦截，但不会启动第二次操作。

聊天输入框的附件拖放和列表内部的会话移动保持原有行为。插件不增加模型工具、提示或会话事件。新对话的工作目录继续由所选工作区决定。

## 开发

克隆[仓库](https://github.com/MeirinRuan/dsh-workspace-drop)，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm pack --out /path/outside/checkout/dsh-workspace-drop.tgz
```

[构建脚本](https://github.com/MeirinRuan/dsh-workspace-drop/blob/main/scripts/build.mjs)使用本包固定版本的 esbuild，无需 DSH 源码仓库。包管理器配置允许 esbuild 执行构建步骤。React 和 DSH UI primitives 由 DSH 模块加载器提供，因此不打入客户端产物。`prepack` 会在打包前重新构建客户端。

[行为测试](https://github.com/MeirinRuan/dsh-workspace-drop/blob/main/tests/drop.test.mjs)覆盖目录识别、去重、路径不可用、区域拦截、部分失败、并发拖放及卸载清理，使用 Node 内置测试运行器与模拟 DOM 事件；临时文件数据创建于操作系统临时目录。额外验证产物应放在工程外。

[市场条目](https://github.com/MeirinRuan/dsh-workspace-drop/blob/main/market/MeirinRuan__dsh-workspace-drop.yml)为投稿草稿，须等 GitHub 仓库创建满一天后再投稿。

## 限制

注册文件夹需要桌面窗口提供本地路径桥。普通浏览器无法读取拖入文件夹的原始绝对路径，插件会显示限制说明，不会猜测路径或上传文件副本。浏览器与 DSH 主机不在同一台机器时同样适用。

拖放目标依赖 DSH 的 `sidebar.workspaces` 和 `conversation.hero.workspace` DOM 插槽锚点，未声明兼容其他 DSH 版本。Node 行为测试使用模拟拖放事件，不能验证从文件管理器到桌面应用的真实拖放，也不连接真实后端注册工作区。
