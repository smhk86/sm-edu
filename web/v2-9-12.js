/* SM EDUCATION v2.9.12 — balanced exam generation and quality gate. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.12',
  focus:'balanced-exam-generation-quality-gate',
  features:(prior.features||[]).concat([
   'exam-selection-balanced-by-topic-and-cognitive-process',
   'exam-selection-rejects-duplicate-ids',
   'exam-selection-rejects-unanswerable-items',
   'exam-quality-check-metadata'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
