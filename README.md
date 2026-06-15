# Experience Board

静态版的经验管理面板，适合直接部署到 GitHub Pages。
https://lkblkq.github.io/My-Try/

## 现在这版有什么

- 四个状态：`Ongoing / Prepare / Pending / Failed`
- 左侧状态计数
- 顶部项目切换与新增
- `Why / Risk / Priority` 编辑
- 卡片的新增、编辑、删除
- `Pending -> Prepare -> Ongoing` 流转
- 任意非 `Failed` 项目可转入 `Failed`
- `Failed` 可恢复到失败前的原状态

## 数据保存方式

- 页面会先比较 GitHub 里的远端数据和本机浏览器里的本地数据，优先加载较新的那份
- 第一次打开时，会用 [`data/board-data.json`](./data/board-data.json) 初始化
- 所有编辑仍会先保存到当前浏览器
- 如果配置了 GitHub token，页面会自动把修改推回仓库里的 `data/board-data.json`
- 左侧底部可以手动 `Pull GitHub` / `Push GitHub`
- `Reset` 会重新加载仓库里的默认数据

## 跨电脑同步

1. 在每台电脑打开页面后，先点左下角 `Sync Token`
2. 输入你自己的 GitHub Personal Access Token
3. Token 至少需要仓库 `Contents: write` 权限
4. 之后编辑会自动推送到仓库
5. 另一台电脑打开页面时，会自动优先读取较新的 GitHub 数据

说明：

- Token 只保存在当前电脑浏览器里，不会写进仓库
- 如果你想立刻强制同步，可以手动点 `Push GitHub`

## 本地预览

```bash
python3 -m http.server 4173
```

然后访问 `http://localhost:4173/`
