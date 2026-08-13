# 知识覆盖报告

> 由 `npm run catalogs:generate` 从固定提交生成。不要手工编辑。覆盖状态描述 Atlas 产物，不代表上游测试覆盖率或人工审核完成度。

## Harness 基线

- 固定 Commit：`47f943859bef60e4160492346772ded9b24f765a`
- 跟踪文件：7412
- 自动文件卡片：7412（L0/L1 启发式）
- 可静态定位的仓库内依赖边：3135
- 源码/受 vendored 源码文件：1575
- 有直接静态测试映射的源码：595
- 人工核心源码研究：见 [../../13-source-studies/README.md](../../13-source-studies/README.md)

## 文件分类

| 分类 | 文件数 |
| --- | ---: |
| asset/binary | 7 |
| config/data | 906 |
| decision | 2057 |
| documentation | 959 |
| fixture/snapshot | 781 |
| meta/other | 134 |
| source | 1531 |
| test | 993 |
| vendored-source | 44 |

## 解释边界

自动卡片保证“每个文件可定位且有基础语义”，不声称每个文件已经人工逐行审阅。L2/L3 只授予包含 happy/error/edge path、测试和运行证据的人工研究；上游变化后由更新报告标记待复核。
