"""从 MkDocs 导航中的同一套 Markdown 构建完整中文离线书。"""

from __future__ import annotations

import argparse
import hashlib
import html
import os
from pathlib import Path
from typing import Iterable

import markdown
import yaml
from bs4 import BeautifulSoup, NavigableString, Tag
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont, TTFError
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from svglib.svglib import svg2rlg


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT, RIGHT, TOP, BOTTOM = 20 * mm, 18 * mm, 19 * mm, 18 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT


def font_candidates() -> list[tuple[Path, Path]]:
    system_root = Path(os.environ.get("SystemRoot", "/nonexistent-windows-root"))
    return [
        (system_root / "Fonts" / "msyh.ttc", system_root / "Fonts" / "msyhbd.ttc"),
        (
            Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
            Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
        ),
        (
            Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
            Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
        ),
        # macOS：让本地也能在推送前把 PDF 构出来核对，不必只靠 CI。
        (
            Path("/System/Library/Fonts/STHeiti Light.ttc"),
            Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        ),
    ]


def register_fonts() -> tuple[str, str, str]:
    candidates = font_candidates()
    for regular, bold in candidates:
        if regular.is_file() and bold.is_file():
            try:
                pdfmetrics.registerFont(TTFont("BookCN", str(regular), subfontIndex=0))
                pdfmetrics.registerFont(
                    TTFont("BookCN-Bold", str(bold), subfontIndex=0)
                )
                pdfmetrics.registerFont(
                    TTFont("BookMono", str(regular), subfontIndex=0)
                )
            except TTFError:
                continue
            pdfmetrics.registerFontFamily(
                "BookCN",
                normal="BookCN",
                bold="BookCN-Bold",
                italic="BookCN",
                boldItalic="BookCN-Bold",
            )
            # svglib 会按 SVG 中的字体名查找 ReportLab 字体。
            pdfmetrics.registerFont(
                TTFont("Microsoft YaHei", str(regular), subfontIndex=0)
            )
            pdfmetrics.registerFont(
                TTFont("Noto Sans CJK SC", str(regular), subfontIndex=0)
            )
            return "BookCN", "BookCN-Bold", "BookMono"
    raise RuntimeError("未找到中文字体；请安装 Microsoft YaHei 或 Noto Sans CJK")


FONT, FONT_BOLD, FONT_MONO = register_fonts()


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle(
            "BookTitle",
            parent=base["Title"],
            fontName=FONT_BOLD,
            fontSize=28,
            leading=38,
            textColor=colors.HexColor("#13213d"),
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "Subtitle": ParagraphStyle(
            "BookSubtitle",
            parent=base["Normal"],
            fontName=FONT,
            fontSize=13,
            leading=22,
            textColor=colors.HexColor("#52627d"),
            alignment=TA_CENTER,
        ),
        "Heading1": ParagraphStyle(
            "Heading1",
            parent=base["Heading1"],
            fontName=FONT_BOLD,
            fontSize=20,
            leading=29,
            textColor=colors.HexColor("#13213d"),
            spaceBefore=10,
            spaceAfter=10,
            keepWithNext=True,
        ),
        "Heading2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName=FONT_BOLD,
            fontSize=15,
            leading=23,
            textColor=colors.HexColor("#354fb3"),
            spaceBefore=12,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "Heading3": ParagraphStyle(
            "Heading3",
            parent=base["Heading3"],
            fontName=FONT_BOLD,
            fontSize=12.5,
            leading=20,
            textColor=colors.HexColor("#173f52"),
            spaceBefore=9,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.4,
            leading=16.2,
            textColor=colors.HexColor("#202b3e"),
            spaceAfter=6,
            wordWrap="CJK",
            alignment=TA_LEFT,
        ),
        "Small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=8,
            leading=13,
            textColor=colors.HexColor("#52627d"),
            wordWrap="CJK",
        ),
        "Quote": ParagraphStyle(
            "Quote",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.2,
            leading=16,
            leftIndent=12,
            rightIndent=8,
            borderColor=colors.HexColor("#35c2d6"),
            borderWidth=2,
            borderPadding=8,
            backColor=colors.HexColor("#eef9fb"),
            textColor=colors.HexColor("#294354"),
            spaceBefore=5,
            spaceAfter=8,
            wordWrap="CJK",
        ),
        "Code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName=FONT_MONO,
            fontSize=7.5,
            leading=11.5,
            leftIndent=7,
            rightIndent=7,
            borderPadding=7,
            backColor=colors.HexColor("#f2f5fa"),
            textColor=colors.HexColor("#1b2944"),
            spaceBefore=4,
            spaceAfter=8,
        ),
        "TOC1": ParagraphStyle(
            "TOC1",
            fontName=FONT_BOLD,
            fontSize=10.5,
            leading=17,
            textColor=colors.HexColor("#13213d"),
            spaceBefore=2,
        ),
        "TOC2": ParagraphStyle(
            "TOC2",
            fontName=FONT,
            fontSize=9,
            leading=15,
            leftIndent=14,
            textColor=colors.HexColor("#354fb3"),
        ),
        "TOC3": ParagraphStyle(
            "TOC3",
            fontName=FONT,
            fontSize=8.5,
            leading=14,
            leftIndent=28,
            textColor=colors.HexColor("#52627d"),
        ),
    }


STYLES = make_styles()


def include_in_printed_toc(level: int) -> bool:
    return level == 0


def render_markdown(text: str) -> str:
    return markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "sane_lists", "attr_list", "md_in_html"],
    )


class BookDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=LEFT,
            rightMargin=RIGHT,
            topMargin=TOP,
            bottomMargin=BOTTOM,
            title="Agent Harness 源码内核",
            author="plwslpld-arch",
            subject="中文 Agent Harness 源码教材",
        )
        frame = Frame(
            LEFT,
            BOTTOM,
            CONTENT_WIDTH,
            PAGE_HEIGHT - TOP - BOTTOM,
            id="main",
        )
        self.addPageTemplates(
            PageTemplate(id="book", frames=[frame], onPage=self._page)
        )
        self._heading_index = 0

    def beforeDocument(self) -> None:
        self._heading_index = 0

    def _page(self, canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont(FONT, 7.5)
        canvas.setFillColor(colors.HexColor("#71809a"))
        if doc.page > 2:
            canvas.drawString(LEFT, PAGE_HEIGHT - 11 * mm, "Agent Harness 源码内核")
        canvas.drawRightString(PAGE_WIDTH - RIGHT, 9 * mm, str(doc.page))
        canvas.setStrokeColor(colors.HexColor("#dce3ef"))
        canvas.line(LEFT, 13 * mm, PAGE_WIDTH - RIGHT, 13 * mm)
        canvas.restoreState()

    def afterFlowable(self, flowable: Flowable) -> None:
        if not isinstance(flowable, Paragraph):
            return
        if flowable.style.name not in {"Heading1", "Heading2", "Heading3"}:
            return
        level = {"Heading1": 0, "Heading2": 1, "Heading3": 2}[
            flowable.style.name
        ]
        self._heading_index += 1
        key = f"heading-{self._heading_index}"
        text = flowable.getPlainText()
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=level > 0)
        if include_in_printed_toc(level):
            self.notify("TOCEntry", (level, text, self.page, key))


def flatten_nav(items: Iterable[object]) -> list[tuple[str, Path]]:
    result: list[tuple[str, Path]] = []
    for item in items:
        if isinstance(item, str):
            result.append((Path(item).stem, DOCS / item))
        elif isinstance(item, dict):
            for label, value in item.items():
                if isinstance(value, str):
                    result.append((str(label), DOCS / value))
                elif isinstance(value, list):
                    result.extend(flatten_nav(value))
    return result


def inline_markup(node: Tag) -> str:
    def render(child: object) -> str:
        if isinstance(child, NavigableString):
            return html.escape(str(child))
        if not isinstance(child, Tag):
            return ""
        body = "".join(render(grandchild) for grandchild in child.children)
        if child.name in {"strong", "b"}:
            return f"<b>{body}</b>"
        if child.name in {"em", "i"}:
            return f"<i>{body}</i>"
        if child.name == "code":
            return f'<font name="{FONT_MONO}" color="#263d67">{body}</font>'
        if child.name == "br":
            return "<br/>"
        if child.name == "a":
            href = child.get("href", "")
            if href.startswith(("http://", "https://")):
                return (
                    f'<link href="{html.escape(href, quote=True)}" '
                    f'color="#354fb3">{body}</link>'
                )
            return body
        return body

    return "".join(render(child) for child in node.children)


def diagram(path: Path) -> Flowable | None:
    if not path.is_file():
        return None
    if path.suffix.lower() == ".svg":
        drawing = svg2rlg(str(path))
        if drawing is None or not drawing.width or not drawing.height:
            return None
        # svglib 会把 CSS 中的中文字体族退化为 Helvetica，导致中文变成方块。
        # 在 Drawing 树上重新绑定已嵌入的中文字体，保留源码 SVG 给浏览器使用。
        stack = [drawing]
        while stack:
            node = stack.pop()
            if type(node).__name__ == "String":
                node.fontName = FONT_BOLD if node.fontSize >= 18 else FONT
            stack.extend(getattr(node, "contents", ()) or ())
        scale = min(CONTENT_WIDTH / drawing.width, 92 * mm / drawing.height, 1.0)
        drawing.width *= scale
        drawing.height *= scale
        drawing.scale(scale, scale)
        return drawing
    image = Image(str(path))
    image._restrictSize(CONTENT_WIDTH, 92 * mm)
    return image


def table_flow(tag: Tag) -> Table:
    rows: list[list[Paragraph]] = []
    for tr in tag.find_all("tr"):
        cells = tr.find_all(["th", "td"], recursive=False)
        rows.append([Paragraph(inline_markup(cell), STYLES["Small"]) for cell in cells])
    columns = max((len(row) for row in rows), default=1)
    result = Table(
        rows,
        colWidths=[CONTENT_WIDTH / columns] * columns,
        repeatRows=1,
        hAlign="LEFT",
        splitByRow=True,
    )
    result.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eefb")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bcc8dc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return result


def markdown_story(path: Path) -> list[Flowable]:
    rendered = render_markdown(path.read_text(encoding="utf-8"))
    soup = BeautifulSoup(rendered, "html.parser")
    story: list[Flowable] = []
    for node in soup.children:
        if isinstance(node, NavigableString) or not isinstance(node, Tag):
            continue
        if node.name in {"h1", "h2", "h3"}:
            story.append(
                Paragraph(inline_markup(node), STYLES[f"Heading{node.name[1]}"])
            )
        elif node.name == "p":
            image_tag = node.find("img", recursive=False)
            if image_tag:
                raw = image_tag.get("src", "").split("#", 1)[0]
                if not raw.startswith(("http://", "https://")):
                    item = diagram((path.parent / raw).resolve())
                    if item:
                        story.extend([Spacer(1, 4), item, Spacer(1, 8)])
                continue
            text = inline_markup(node).strip()
            if text:
                story.append(Paragraph(text, STYLES["Body"]))
        elif node.name == "pre":
            code = node.get_text("\n").strip("\n")
            story.append(Preformatted(code, STYLES["Code"], maxLineLength=94))
        elif node.name in {"ul", "ol"}:
            items = [
                ListItem(
                    Paragraph(inline_markup(li), STYLES["Body"]), leftIndent=12
                )
                for li in node.find_all("li", recursive=False)
            ]
            story.append(
                ListFlowable(
                    items,
                    bulletType="1" if node.name == "ol" else "bullet",
                    **({"start": "1"} if node.name == "ol" else {}),
                    leftIndent=18,
                    bulletFontName=FONT,
                    bulletFontSize=8,
                    spaceAfter=6,
                )
            )
        elif node.name == "table":
            story.extend([Spacer(1, 4), table_flow(node), Spacer(1, 8)])
        elif node.name == "blockquote":
            story.append(Paragraph(inline_markup(node), STYLES["Quote"]))
        elif node.name == "hr":
            story.append(Spacer(1, 8))
    return story


def build(output: Path) -> None:
    config = yaml.safe_load((ROOT / "mkdocs.yml").read_text(encoding="utf-8"))
    chapters = flatten_nav(config["nav"])
    missing = [str(path.relative_to(ROOT)) for _, path in chapters if not path.is_file()]
    if missing:
        raise ValueError(f"MkDocs 导航存在缺失文档：{missing}")

    # 封面标识用仓库自带的矢量 logo，不再另存一份位图。
    mark = diagram(DOCS / "assets" / "brand" / "logo-mark.svg")
    if mark is not None:
        mark.hAlign = "CENTER"
    story: list[Flowable] = [
        Spacer(1, 32 * mm),
        *([mark] if mark is not None else []),
        Spacer(1, 12 * mm),
        Paragraph("Agent Harness 源码内核", STYLES["Title"]),
        Paragraph(
            "从一次工具调用开始，读懂六套编程智能体的运行系统",
            STYLES["Subtitle"],
        ),
        Spacer(1, 14 * mm),
        Paragraph(
            "完整中文离线版 · 六条源码课程、横向对比、机制样本与实验",
            STYLES["Subtitle"],
        ),
        Spacer(1, 58 * mm),
        Paragraph("原创文档：CC BY 4.0　原创代码：MIT", STYLES["Subtitle"]),
        PageBreak(),
        Paragraph("目录", STYLES["Heading1"]),
    ]
    toc = TableOfContents()
    toc.levelStyles = [STYLES["TOC1"]]
    story.extend([toc, PageBreak()])

    for index, (_, path) in enumerate(chapters):
        if index:
            story.append(PageBreak())
        story.extend(markdown_story(path))

    output.parent.mkdir(parents=True, exist_ok=True)
    BookDocTemplate(str(output)).multiBuild(story)
    print(f"已生成：{output}")
    print(f"SHA-256：{hashlib.sha256(output.read_bytes()).hexdigest()}")


def default_output() -> Path:
    return ROOT / "output" / "pdf" / "agent-harness-internals-cn.pdf"


def main() -> int:
    parser = argparse.ArgumentParser(description="构建完整中文离线 PDF")
    parser.add_argument(
        "--output",
        type=Path,
        default=default_output(),
    )
    args = parser.parse_args()
    build(args.output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
