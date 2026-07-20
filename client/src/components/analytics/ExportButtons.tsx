"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";

type Props = {
  pdfFilename: string;
  pdfTargetId: string;
  csvHref?: string;
  csvFilename?: string;
};

export function ExportButtons({ pdfFilename, pdfTargetId, csvHref }: Props) {
  const [busy, setBusy] = useState<null | "pdf" | "csv">(null);

  async function exportPdf() {
    setBusy("pdf");
    try {
      const [html2canvas, jspdf] = await Promise.all([
        import("html2canvas").then((m) => m.default),
        import("jspdf").then((m) => m.default),
      ]);
      const target = document.getElementById(pdfTargetId);
      if (!target) return;
      const canvas = await html2canvas(target, { backgroundColor: "#ffffff", scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jspdf({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const ratio = pageWidth / canvas.width;
      const imgHeight = canvas.height * ratio;
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight, undefined, "FAST");
      pdf.save(`${pdfFilename}.pdf`);
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    if (!csvHref) return;
    setBusy("csv");
    window.location.href = csvHref;
    setTimeout(() => setBusy(null), 500);
  }

  return (
    <div className="flex items-center gap-2">
      {csvHref ? (
        <button
          type="button"
          onClick={exportCsv}
          disabled={busy === "csv"}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      ) : null}
      <button
        type="button"
        onClick={exportPdf}
        disabled={busy === "pdf"}
        className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
      >
        <FileText className="h-3.5 w-3.5" /> {busy === "pdf" ? "Exporting…" : "Export PDF"}
      </button>
    </div>
  );
}
