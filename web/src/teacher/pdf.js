// pdf.js is only loaded when a professor actually imports a PDF, so the
// main bundle stays small. The worker is bundled as a same-origin asset.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjs = null;
export async function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

export const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});
