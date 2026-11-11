/* Public runtime configuration only. Never place API keys or secrets in this file. */
window.SM_SCHOOL_CONFIG = Object.freeze({
  publicContentBase: 'https://smhk86.github.io/sm-edu', // Deployed HTTPS Pages base: https://OWNER.github.io/REPOSITORY (no trailing slash).
  dzexamsHosts: ['dzexams.com', 'dzexams.pro'], // DzExams page host + the host that serves its PDF files (added on the owner's stated authorization).
  raji3dzHosts: ['raji3dz.com'], // Raji3DZ source host and its subdomains; add a file CDN only if the site owner explicitly authorizes it.
  apiBase: '', // Set to the deployed FastAPI origin for Android builds, e.g. https://api.example.dz (or use the in-app tutor server setting)
  aiCourseFeed: '', // Optional override; otherwise publicContentBase + /data/ai-course-updates.json is used.
  examRepositoryIndex: '', // Optional override; otherwise publicContentBase + /data/dzexams-repository-index.json.
  examRepositoryPath: '/repository/exams/', // Curated DzExams files approved for redistribution in GitHub Pages.
  raji3dzRepositoryIndex: '', // Optional override; otherwise publicContentBase + /data/raji3dz-repository-index.json.
  raji3dzRepositoryPath: '/repository/raji3dz/', // Curated Raji3DZ files approved for redistribution in GitHub Pages.
  textbookHosts: [], // HTTPS hosts the Smart Teacher may download textbooks from, one book at a time (empty = disabled). Add a host only if its owner allows it.
  textbookCatalogueIndex: '' // Optional override; otherwise publicContentBase + /data/textbook-repository-index.json is used.
});
/* v1.12.0: shared JSON loader (each big data file is downloaded and parsed once). */
(function(){
  const cache={};
  window.smFetchJSON=function(url){
    if(!cache[url])cache[url]=fetch(url).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status+' '+url);return r.json()}).catch(e=>{delete cache[url];throw e});
    return cache[url];
  };
  /* v1.12.0: attach the optional admin token to the protected review routes only. */
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if(/\/api\/v1\/(archive\/(pdf-review|pdf-question-candidates|curriculum-evidence-candidates)|ai\/claude-content)/.test(url)){
        const token=localStorage.getItem('smSchoolAdminToken');
        if(token){init=Object.assign({},init);init.headers=Object.assign({},init.headers||{},{'X-Admin-Token':token})}
      }
    }catch(e){}
    return nativeFetch(input,init);
  };
})();
