/* SM EDUCATION v2.9.17 — diagram-aware visual grading. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.17',
  focus:'diagram-aware-image-grading',
  features:[].concat(Array.isArray(prior.features)?prior.features:Object.entries(prior.features||{}).map(function(e){return typeof e[1]==='string'?e[1]:e[0]}),[
   'auto-grader-visual-observations-with-confidence',
   'geometry-chart-axis-and-unit-reading-guidance',
   'visual-uncertainty-escalates-teacher-review',
   'higher-resolution-image-preparation'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
