/* SM EDUCATION v2.8.0 — stepwise STEM reasoning and geometry-aware formative review. */
(function(){
 'use strict';
 const VERSION='2.8.0';
 window.SM_EDUCATION_RELEASE={version:VERSION,features:['private-pdf-ocr','docx-text-extraction','private-image-ocr','question-level-rubric','step-by-step-math-review','equation-error-localization','geometry-description-review','targeted-remedial-exercises','online-offline-content']};
 window.smEducationReasoningCapabilities=()=>({stepwiseReview:true,geometryDescription:true,equationChecks:true,automaticVisualUnderstanding:false,offlineShell:typeof navigator!=='undefined'&&'serviceWorker' in navigator});
})();
