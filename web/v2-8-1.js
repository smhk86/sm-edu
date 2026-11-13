/* SM EDUCATION v2.8.1 — multimodal visual understanding for maths and STEM diagrams. */
(function(){
 'use strict';
 const VERSION='2.8.1';
 window.SM_EDUCATION_RELEASE={version:VERSION,features:['multimodal-image-understanding','pdf-page-visual-analysis','geometry-diagram-reading','graph-axis-and-unit-reading','confidence-labelled-visual-facts','step-by-step-math-review','private-image-processing','online-vision-ai']};
 window.smEducationVisionCapabilities=()=>({imageVision:true,pdfPageVision:true,maxPdfPages:3,maxImagesPerReview:3,visionRequiresOnline:true,visionModel:window.SM_AI?.visionModel?.()||'qwen/qwen3.8-27b',offlineFallback:'text-only-review',humanVerificationRequired:true});
})();
