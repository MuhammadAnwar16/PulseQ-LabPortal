"""PDF report generation for verified lab results.

Reports are written to settings.REPORTS_DIR with a stable filename derived from
the order id, so other portals can fetch/display them via report_pdf_path
without going through the lab UI.
"""
from __future__ import annotations

import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.config import settings

# Palette mirrors the frontend design tokens.
BLUE = colors.HexColor("#2563eb")
BLUE_DARK = colors.HexColor("#1d4ed8")
SLATE = colors.HexColor("#374151")
SLATE_LIGHT = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#e5e7eb")


def _ensure_dir() -> str:
    path = settings.REPORTS_DIR
    os.makedirs(path, exist_ok=True)
    return path


def report_path(order_id: str) -> str:
    return os.path.join(_ensure_dir(), f"lab_report_{order_id}.pdf")


def generate_result_report(order: dict, results: list[dict], catalog: dict) -> str:
    """Render a verified result report PDF. Returns the absolute file path."""
    out = report_path(order["id"])
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Lab Report {order['id'][:8]}",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], textColor=BLUE_DARK, fontSize=20)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"], textColor=SLATE_LIGHT, fontSize=9)
    h_style = ParagraphStyle("h", parent=styles["Heading3"], textColor=BLUE, fontSize=12, spaceBefore=10)
    label_style = ParagraphStyle("label", parent=styles["Normal"], textColor=SLATE, fontSize=9)
    val_style = ParagraphStyle("val", parent=styles["Normal"], textColor=SLATE, fontSize=10)
    abnormal_style = ParagraphStyle(
        "abn", parent=styles["Normal"], textColor=colors.HexColor("#dc2626"), fontSize=10
    )

    story = []
    story.append(Paragraph("PulseQ Diagnostic Laboratory", title_style))
    story.append(Paragraph("Laboratory Test Report", sub_style))
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", color=BORDER))
    story.append(Spacer(1, 8))

    # Patient / order block
    meta = [
        ["Patient", order.get("patient_name", ""), "Order ID", order["id"][:8]],
        ["Age / Gender", f"{order.get('patient_age') or '-'} / {order.get('patient_gender') or '-'}", "Priority", order.get("priority", "")],
        ["Doctor", order.get("ordering_doctor_name") or "Walk-in", "Barcode", order.get("sample_barcode") or "-"],
        ["Collected", str(order.get("collected_at") or "-"), "Source", order.get("source", "")],
    ]
    meta_tbl = Table(meta, colWidths=[28 * mm, 62 * mm, 28 * mm, 56 * mm])
    meta_tbl.setStyle(
        TableStyle(
            [
                ("TEXTCOLOR", (0, 0), (-1, -1), SLATE),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), SLATE_LIGHT),
                ("TEXTCOLOR", (2, 0), (2, -1), SLATE_LIGHT),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER),
            ]
        )
    )
    story.append(meta_tbl)
    story.append(Spacer(1, 8))

    # Results per test
    for r in results:
        test = catalog.get(r["test_id"], {})
        story.append(Paragraph(f"{test.get('name', 'Test')} ({test.get('code', '')})", h_style))
        if test.get("category"):
            story.append(Paragraph(f"Category: {test['category']} &nbsp;|&nbsp; Sample: {test.get('sample_type','-')}", sub_style))
        story.append(Spacer(1, 4))
        rows = [["Parameter", "Value", "Unit", "Reference", "Flag"]]
        for v in r.get("result_values", []):
            rows.append(
                [
                    v.get("param", ""),
                    Paragraph(str(v.get("value", "")) or "-", abnormal_style if v.get("abnormal") else val_style),
                    v.get("unit") or "-",
                    _ref_text(v),
                    "ABN" if v.get("abnormal") else "",
                ]
            )
        t = Table(rows, colWidths=[46 * mm, 40 * mm, 26 * mm, 40 * mm, 22 * mm])
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(t)
        story.append(Spacer(1, 6))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", color=BORDER))
    story.append(
        Paragraph(
            f"Entered by: {order.get('entered_by') or '-'} &nbsp;|&nbsp; "
            f"Verified by: {results[0].get('verified_by') if results else '-'}",
            sub_style,
        )
    )
    story.append(Paragraph("This report was electronically verified and is valid without signature.", sub_style))

    doc.build(story)
    return out


def _ref_text(v: dict) -> str:
    low = v.get("low")
    high = v.get("high")
    if low is not None and high is not None:
        return f"{low}–{high}"
    return "-"
