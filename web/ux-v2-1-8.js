/* SM éducation v2.1.8 — accessible mobile navigation and shell polish. */
(function(){
 'use strict';
 const sidebar=document.getElementById('sidebar');
 const menu=document.getElementById('menuBtn');
 if(!sidebar||!menu)return;
 const isOpen=()=>sidebar.classList.contains('open');
 const sync=()=>{
  menu.setAttribute('aria-expanded',String(isOpen()));
  menu.setAttribute('aria-controls','sidebar');
  menu.setAttribute('aria-label',isOpen()?'إغلاق القائمة':'فتح القائمة');
 };
 const close=()=>{sidebar.classList.remove('open');sync()};
 menu.addEventListener('click',sync);
 document.querySelectorAll('#sidebar .nav-item').forEach(item=>item.addEventListener('click',close));
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&isOpen()){
   close();menu.focus();
  }
 });
 document.addEventListener('pointerdown',event=>{
  if(!isOpen())return;
  if(!sidebar.contains(event.target)&&!menu.contains(event.target))close();
 });
 sidebar.addEventListener('click',event=>{
  if(event.target.closest('a[href]'))close();
 });
 sync();
})();
