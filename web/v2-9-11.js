/* SM EDUCATION v2.9.11 — OCR + vision fallback for scanned PDFs. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.11',
  focus:'scanned-pdf-ocr-and-vision-resilience',
  features:(prior.features||[]).concat([
   'scanned-pdf-ocr-runs-alongside-vision',
   'vision-fallback-when-ocr-unavailable',
   'document-source-status-accuracy'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
