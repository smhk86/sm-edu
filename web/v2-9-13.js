/* SM EDUCATION v2.9.13 — localized difficulty and precise marking rubrics. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.13',
  focus:'localized-difficulty-and-precise-marking-rubrics',
  features:(prior.features||[]).concat([
   'difficulty-normalization-ar-fr-en',
   'difficulty-distribution-corrected',
   'marking-rubric-exact-hundredth-point-allocation'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
