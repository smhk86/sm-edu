/* SM EDUCATION v2.6.0 — document intelligence and offline/online readiness checks. */
(function(){
  'use strict';
  const VERSION='2.6.0';
  window.SM_EDUCATION_RELEASE={version:VERSION,features:['private-pdf-ocr-bridge','configurable-mock-exam','online-offline-content']};
  window.smEducationConnectionMode=()=>typeof navigator!=='undefined'&&navigator.onLine?'online':'offline';
  window.smEducationDocumentCapabilities=()=>({pdfText:!!window.pdfjsLib,privateServerOcr:!!(window.SM_SCHOOL_CONFIG&&window.SM_SCHOOL_CONFIG.apiBase),offlineShell:!!('serviceWorker' in navigator)});
})();
