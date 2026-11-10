/* SM EDUCATION v2.9.16 — stepwise formative grading. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.16',
  focus:'stepwise-formative-grading',
  features:(prior.features||[]).concat([
   'auto-grader-step-criteria-rubric',
   'auto-grader-evidence-and-feedback-per-criterion',
   'auto-grader-first-error-localization-and-type',
   'auto-grader-criterion-points-normalization',
   'teacher-review-required-for-low-confidence'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
