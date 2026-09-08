# 手工导入区

把小红书创作者后台官方导出的 CSV 或 Excel 文件放在这里，然后在项目根目录运行：

```bash
python3 scripts/import_xhs_export.py ./imports
```

支持中文或英文字段名。文件名或工作表名最好包含“账号 / account”或“笔记 / notes”。

- 账号数据参考 `account.example.csv`
- 账号文件请注明“指标口径”：`单日`、`区间合计`或`累计`。区间合计还需提供“周期开始 / 周期结束”，避免滚动 7 日数据被重复相加。
- 笔记数据参考 `notes.example.csv`
- `*.example.csv` 仅作字段示例，目录导入时会自动跳过。
- 实际导出文件默认被 `.gitignore` 忽略，不会提交到公开 GitHub。
- CSV 可直接运行；Excel 先执行 `python3 -m pip install -r requirements.txt`。
