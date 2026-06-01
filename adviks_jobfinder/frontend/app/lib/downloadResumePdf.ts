"use client";

/** Download the on-screen preview as a one-page letter PDF (WYSIWYG). */
export async function downloadResumePdf(elementId: string, filename = "resume.pdf") {
  const el = document.getElementById(elementId);
  if (!el) throw new Error("Resume preview not found");

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const html2canvas = (await import("html2canvas")).default;
  // @ts-ignore
  const { jsPDF } = await import("jspdf/dist/jspdf.es.min.js");

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: el.offsetWidth,
    height: el.offsetHeight,
  });

  const pdf = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 8.5, 11);
  pdf.save(filename);
}
