/* SM EDUCATION v2.9.16 — stepwise formative grading. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.16',
  focus:'stepwise-formative-grading',
  features:[].concat(Array.isArray(prior.features)?prior.features:Object.entries(prior.features||{}).map(function(e){return typeof e[1]==='string'?e[1]:e[0]}),[
   'auto-grader-step-criteria-rubric',
   'auto-grader-evidence-and-feedback-per-criterion',
   'auto-grader-first-error-localization-and-type',
   'auto-grader-criterion-points-normalization',
   'teacher-review-required-for-low-confidence'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
