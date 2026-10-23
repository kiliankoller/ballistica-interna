// Page the main process prints to PDF: it receives the finished report HTML.
(window as unknown as { renderReport: (html: string) => void }).renderReport = (html) => {
  document.body.innerHTML = html;
};
