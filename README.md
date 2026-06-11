# Experience Board

静态版的经验管理面板，适合直接部署到 GitHub Pages。

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

- 页面会优先读取浏览器本地的 `localStorage`
- 第一次打开时，会用 [`data/seed.json`](./data/seed.json) 初始化
- 左侧底部可以 `Export JSON`
- `Reset` 会重新加载仓库里的 `seed.json`

## 本地预览

```bash
python3 -m http.server 4173
```

然后访问 `http://localhost:4173/`
