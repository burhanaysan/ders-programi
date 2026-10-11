/* PDF'ten metin parçalarını (metin + konum) çıkarır. pdf.js uygulamayla birlikte gelir (internet gerekmez). */
(function (genel) {
  "use strict";

  var pdfjs = null;

  async function yukle() {
    if (!pdfjs) {
      pdfjs = await import(new URL("pdfjs/pdf.min.mjs", document.baseURI).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs/pdf.worker.min.mjs", document.baseURI).href;
    }
    return pdfjs;
  }

  /** @param {ArrayBuffer} tampon  @returns {Promise<{s,x,y,w}[]>} ilk sayfanın metin parçaları (y yukarıdan aşağı) */
  async function parcalar(tampon) {
    var lib = await yukle();
    var pdf = await lib.getDocument({ data: new Uint8Array(tampon) }).promise;
    try {
      var sayfa = await pdf.getPage(1);
      var yukseklik = sayfa.getViewport({ scale: 1 }).height;
      var tc = await sayfa.getTextContent();
      return tc.items.filter(function (i) { return i.str && i.str.trim(); }).map(function (i) {
        return { s: i.str, x: i.transform[4], y: yukseklik - i.transform[5], w: i.width };
      });
    } finally {
      pdf.destroy();
    }
  }

  genel.PdfOku = { parcalar: parcalar };
})(window);
