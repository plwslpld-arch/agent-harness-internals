#!/usr/bin/env python3
"""中文正文节奏体检。

「AI 味」在这套教材里不是用词问题——「值得注意」「总的来说」这类套话，正文里
一处都没有。真正的病灶是节奏：句子普遍偏短、长短过于齐整、没有破折号带来的语气
起伏，读起来像规格说明书在报条目，而不像有人在讲解。

下面的阈值来自实测校准，右侧注释是本仓库现状与对标样本（bojieli/ai-agent-book）
的差距。校准时验证过：对标样本能通过这套门禁，本仓库存量普遍通不过。

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
    "句长中位":   (28, "字",   lambda v: v >= 28),   # 现状 24   → 对标 38
    "句长标准差": (20, "",     lambda v: v >= 20),   # 现状 13.9 → 对标 29.4  ← 主战场
    "破折号":     (8,  "/万字", lambda v: v >= 8),    # 现状 0    → 对标 37.9
    "冒号定义句": (25, "/万字", lambda v: v <= 25),   # 抓「X：说明」堆砌的篇
    "AI套话":     (0,  "处",   lambda v: v == 0),     # 现状已是 0，守住
}
SLOP = r"值得注意的是|总的来说|综上所述|总而言之|我们可以看到|不难发现|众所周知|起到.{0,4}的作用|具有重要意义"


def strip_noise(text):
    """剥掉代码块、表格和纯导航行——它们不是正文，会把句长统计带偏。"""
    text = re.sub(r"^```.*?^```", "", text, flags=re.S | re.M)
    text = re.sub(r"^\|.*$", "", text, flags=re.M)
    text = re.sub(r"^\[.*\]\(.*\)[ ·]*$", "", text, flags=re.M)
    return re.sub(r"`[^`]*`", "", text)


def measure(text):
    body = strip_noise(text)
    cn = len(re.findall(r"[一-鿿]", body)) or 1
    sentences = [s for s in re.split(r"[。！？]", body)
                 if len(re.findall(r"[一-鿿]", s)) > 3]
    lengths = [len(re.findall(r"[一-鿿]", s)) for s in sentences] or [0]
    return {
        "句长中位":   statistics.median(lengths),
        "句长标准差": statistics.pstdev(lengths),
        "破折号":     len(re.findall("——", body)) / cn * 10000,
        "冒号定义句": len(re.findall("：$", body, re.M)) / cn * 10000,
        "AI套话":     len(re.findall(SLOP, body)),
    }, cn


def changed_docs():
    """本次改动的文档。PR 里对比 base，本地对比上一次提交。"""
    base = subprocess.run(["git", "rev-parse", "HEAD~1"], capture_output=True,
                          text=True).stdout.strip() or "HEAD"
    out = subprocess.run(["git", "diff", "--name-only", base, "HEAD"],
                         capture_output=True, text=True).stdout
    return [p for p in out.split("\n") if p.endswith(".md") and p.startswith("docs/")]


def main(paths):
    failed = 0
    checked = 0
    for path in paths:
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            continue
        metrics, cn = measure(text)
        if cn < 200:      # 目录页、品牌页这类短页不体检
            continue
        checked += 1
        bad = [name for name, (_, _, ok) in GATES.items() if not ok(metrics[name])]
        failed += bool(bad)
        print(("FAIL " if bad else "ok   ") + path + "  " + "  ".join(
            f"{n}={metrics[n]:.1f}{GATES[n][1]}" + ("!" if n in bad else "")
            for n in GATES))
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
