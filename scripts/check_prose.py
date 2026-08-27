#!/usr/bin/env python3
"""中文正文节奏体检。

「AI 味」在这套教材里不是用词问题——「值得注意」「总的来说」这类套话，正文里
一处都没有。真正的病灶是节奏：句子普遍偏短、长短过于齐整、没有破折号带来的语气
起伏，读起来像规格说明书在报条目，而不像有人在讲解。

对标样本的秘诀不是句子长，而是长短交错：它最长的一句 262 字，却仍有 10% 的句子
不超过 15 字，用来把长句之间的节奏顿开。只把句子拉长而丢掉短句，读起来会更闷，
所以「短句占比」这一项和句长中位数同样重要。

下面的阈值来自实测校准，右侧注释是对标样本（bojieli/ai-agent-book）的实测值。
校准时验证过：对标样本能通过这套门禁，本仓库存量普遍通不过。对标样本
（ai-agent-book 第三章，约 10 万字符）实测六项：句长中位 35、破折号 38.2/万字、
分号 24.7/万字、冒号定义句 6.4/万字、AI 套话 0、句长标准差 24.3。

关于分号：中文的「；」就是停顿，所以它算句末。这不是细节——早期版本只按「。！？」
断句，改写方立刻发现把两个句子焊成「A；B」就能让句长中位数翻倍，而读起来一个字
没变。实测那一轮：分号密度冲到 171/万字（对标样本 21），句长中位数虚高到 30，
按真值只有 19。所以这里同时封了分号密度的上限，堵掉这条路。

用法：
    python3 scripts/check_prose.py 'docs/**/*.md'   # 指定文件
    python3 scripts/check_prose.py --changed        # 只查本次改动的文档

退出码 1 表示有文件不达标。
"""
import glob
import re
import statistics
import subprocess
import sys

GATES = {
    "句长中位":   (26, "字",   lambda v: v >= 26),        # 对标语料 35（分号计句末后的真值）
    # 只封上限，不设下限。下限试过，是个坏门禁：它规定的是一种修辞手段而不是
    # 一个结果，而本仓库另一条规则又给破折号封了上限。上下一夹，写作方就在随便
    # 什么位置塞够最小数量——实测收到「目录名称——不会被直接当成架构结论」
    # 「这些产物——必须来自同一次运行」这类插在主谓之间的病句。节奏交给句长三项去量。
    "破折号":     (55, "/万字", lambda v: v <= 55),
    "分号":       (60, "/万字", lambda v: v <= 60),        # 对标 21。不封顶就会拿「；」焊句子刷中位数
    "冒号定义句": (25, "/万字", lambda v: v <= 25),        # 抓「X：说明」堆砌的篇
    "AI套话":     (0,  "处",   lambda v: v == 0),         # 现状已是 0，守住
}

# 节奏用「标准差」或「短句占比」二选一：把句长拉开分布可以，靠短句顿挫也可以。
# 只补破折号和承接的轻量改写按定义不改句子长度，标准差纹丝不动，但读起来节奏
# 已经出来了——为一个数字去做代价高得多的全文重写不划算。
RHYTHM_STD, RHYTHM_STD_MIN = "句长标准差", 16
RHYTHM_SHORT, RHYTHM_SHORT_MIN = "短句占比", 12


def rhythm_ok(m):
    return m[RHYTHM_STD] >= RHYTHM_STD_MIN or m[RHYTHM_SHORT] >= RHYTHM_SHORT_MIN
SLOP = r"值得注意的是|总的来说|综上所述|总而言之|我们可以看到|不难发现|众所周知|起到.{0,4}的作用|具有重要意义"


def strip_noise(text):
    """剥掉不该按散文节奏衡量的部分，否则句长统计会被带偏。

    「- **调用者**：…」这类结构化条目要单独剥掉。它们是事实登记，短促才对；
    如果放进句长统计，写作方为了达标就会往条目里注水凑字数——实测出现过。

    普通项目符号里没有句号的行同样是枚举片段（「- 取消令牌」「- 当前运行配置」），
    不是散文句子。不剥掉的话，一篇文档越用列表，句长中位数就越低——等于在惩罚
    正常的技术写作。带句号的列表项是完整句子，仍然计入。
    """
    text = re.sub(r"^```.*?^```", "", text, flags=re.S | re.M)
    text = re.sub(r"^\|.*$", "", text, flags=re.M)
    text = re.sub(r"^\[.*\]\(.*\)[ ·]*$", "", text, flags=re.M)
    text = re.sub(r"^\s*[-*]\s*\*\*[^*]+\*\*[：:].*$", "", text, flags=re.M)
    # 没有句号的列表项是枚举片段，不是散文句子。带句号的是完整句子，保留。
    text = re.sub(r"^\s*(?:[-*]|\d+\.)\s+(?![^\n]*。)[^\n]*$", "", text, flags=re.M)
    return re.sub(r"`[^`]*`", "", text)


def measure(text):
    body = strip_noise(text)
    cn = len(re.findall(r"[一-鿿]", body)) or 1
    # 分号在中文里就是停顿。不把它算句末，写作方会用「；」把两个句子焊成一个，
    # 句长中位数凭空翻倍而读起来一点没变——实测出现过，加「；」之前 67 字，之后 24 字。
    sentences = [s for s in re.split(r"[。！？；]", body)
                 if len(re.findall(r"[一-鿿]", s)) > 3]
    lengths = [len(re.findall(r"[一-鿿]", s)) for s in sentences] or [0]
    return {
        "句长中位":   statistics.median(lengths),
        "句长标准差": statistics.pstdev(lengths),
        "短句占比":   sum(1 for n in lengths if n <= 15) / len(lengths) * 100,
        "破折号":     len(re.findall("——", body)) / cn * 10000,
        # 只数行内分号。行尾的「；」是中文列举的正常收尾（「- 甲怎样做；」），
        # 换行本来就把两句分开了；焊句子只会发生在行内的「A；B」。
        "分号":       len(re.findall(r"；(?!\s*$)", body, re.M)) / cn * 10000,
        # 只算「X：说明」这类定义式短行。「会产生三个问题：」后面跟列表，
        # 那是正常的引导句，不是词典条目，不该算进来。
        "冒号定义句": len(re.findall(r"：\n(?!\s*(?:[-*]|\d+\.))", body)) / cn * 10000,
        "AI套话":     len(re.findall(SLOP, body)),
    }, cn


def changed_docs():
    """本次改动的文档。PR 里对比 base，本地对比上一次提交。"""
    base = subprocess.run(["git", "rev-parse", "HEAD~1"], capture_output=True,
                          text=True).stdout.strip() or "HEAD"
    out = subprocess.run(["git", "diff", "--name-only", base, "HEAD"],
                         capture_output=True, text=True).stdout
    return [p for p in out.split("\n") if p.endswith(".md") and p.startswith("docs/")
            and not any(d in p for d in SKIP_DIRS)]


# 资产目录里的 README 是 SVG 清单，不是给人读的正文，别按散文节奏体检。
SKIP_DIRS = ("docs/assets/",)


def main(paths):
    failed = 0
    checked = 0
    for path in paths:
        if any(d in path.replace("\\", "/") for d in SKIP_DIRS):
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            continue
        metrics, cn = measure(text)
        if cn < 200:      # 目录页、品牌页这类短页不体检
            continue
        checked += 1
        bad = [name for name, (_, _, ok) in GATES.items() if not ok(metrics[name])]
        if not rhythm_ok(metrics):
            bad.append("节奏")
        failed += bool(bad)
        units = {n: GATES[n][1] for n in GATES}
        units[RHYTHM_STD], units[RHYTHM_SHORT] = "", "%"
        rhythm_bad = "节奏" in bad
        parts = []
        for n in list(GATES) + [RHYTHM_STD, RHYTHM_SHORT]:
            flag = "!" if n in bad or (rhythm_bad and n in (RHYTHM_STD, RHYTHM_SHORT)) else ""
            parts.append(f"{n}={metrics[n]:.1f}{units[n]}{flag}")
        print(("FAIL " if bad else "ok   ") + path + "  " + "  ".join(parts))
    print(f"\n不达标 {failed} / {checked} 篇")
    return 1 if failed else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--changed"]:
        files = changed_docs()
        if not files:
            print("本次没有改动文档，跳过")
            sys.exit(0)
    else:
        files = [f for a in args for f in glob.glob(a, recursive=True)] or args
    sys.exit(main(files))
