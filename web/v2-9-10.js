/* SM EDUCATION v2.9.10 — document extraction and stepwise tutor modes. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.10',
  focus:'multimodal-document-extraction-and-stepwise-tutor',
  features:[].concat(Array.isArray(prior.features)?prior.features:Object.entries(prior.features||{}).map(function(e){return typeof e[1]==='string'?e[1]:e[0]}),[
   'document-question-and-givens-extraction',
   'document-stepwise-solving',
   'document-answer-review-optional-student-answer',
   'image-pdf-docx-analysis-preserved'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
