/* SM EDUCATION v2.7.0 — document reading and question-level formative assessment. */
(function(){
 'use strict';
 const VERSION='2.7.0';
 window.SM_EDUCATION_RELEASE={version:VERSION,features:['private-pdf-ocr','docx-text-extraction','private-image-ocr','question-level-rubric','targeted-remedial-exercises','online-offline-content']};
 window.smEducationDocumentCapabilities=()=>({pdfText:!!window.pdfjsLib,docxText:!!(window.SM_SCHOOL_CONFIG&&window.SM_SCHOOL_CONFIG.apiBase),imageOcr:!!(window.SM_SCHOOL_CONFIG&&window.SM_SCHOOL_CONFIG.apiBase),offlineShell:typeof navigator!=='undefined'&&'serviceWorker' in navigator});
})();
