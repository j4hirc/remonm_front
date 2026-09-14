declare module 'html2pdf.js' {
  export interface Html2PdfOptions {
    margin: number | number[];
    filename: string;
    image: { type: 'jpeg'; quality: number };
    html2canvas: { scale: number; useCORS: boolean; logging: boolean; backgroundColor: string; scrollX: number; scrollY: number };
    jsPDF: { unit: 'mm'; format: 'a4'; orientation: 'portrait' };
    pagebreak: { mode: string[]; avoid: string[] };
  }
  export interface Html2PdfWorker {
    set(options: Html2PdfOptions): Html2PdfWorker;
    from(element: HTMLElement): Html2PdfWorker;
    outputPdf(type: 'blob'): Promise<Blob>;
  }
  export default function html2pdf(): Html2PdfWorker;
}
