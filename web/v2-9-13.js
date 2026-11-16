/* SM EDUCATION v2.9.13 — localized difficulty and precise marking rubrics. */
(function(g){
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{
  version:'2.9.13',
  focus:'localized-difficulty-and-precise-marking-rubrics',
  features:[].concat(Array.isArray(prior.features)?prior.features:Object.entries(prior.features||{}).map(function(e){return typeof e[1]==='string'?e[1]:e[0]}),[
   'difficulty-normalization-ar-fr-en',
   'difficulty-distribution-corrected',
   'marking-rubric-exact-hundredth-point-allocation'
  ])
 });
})(typeof window!=='undefined'?window:globalThis);
