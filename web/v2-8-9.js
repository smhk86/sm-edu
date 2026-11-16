/* v2.8.9 — review fixes: new GitHub repository base, DzExams file host, safer repository sync and service worker. */
(function(g){'use strict';
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{version:'2.8.9',focus:'review-fixes-repository-link',features:[].concat(Array.isArray(prior.features)?prior.features:Object.entries(prior.features||{}).map(function(e){return typeof e[1]==='string'?e[1]:e[0]}),['repository-base-smhk86','dzexams-file-host','repository-index-network-first'])});
})(window);
