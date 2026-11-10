/* SM EDUCATION v2.9.10 — document extraction and stepwise tutor modes. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.10',
  focus:'multimodal-document-extraction-and-stepwise-tutor',
  features:(prior.features||[]).concat([
   'document-question-and-givens-extraction',
   'document-stepwise-solving',
   'document-answer-review-optional-student-answer',
   'image-pdf-docx-analysis-preserved'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
