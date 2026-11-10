/* SM EDUCATION v2.9.17 — diagram-aware visual grading. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.17',
  focus:'diagram-aware-image-grading',
  features:(prior.features||[]).concat([
   'auto-grader-visual-observations-with-confidence',
   'geometry-chart-axis-and-unit-reading-guidance',
   'visual-uncertainty-escalates-teacher-review',
   'higher-resolution-image-preparation'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
