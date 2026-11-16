/* v2.8.5 — evidence-aware Algerian curriculum teacher workflows. */
(function(g){'use strict';
 const clean=v=>String(v==null?'':v).trim();
 const sources=[
  {name:'وزارة التربية الوطنية الجزائرية',url:'https://www.education.gov.dz/',role:'المرجع الرسمي للبرامج والترتيبات البيداغوجية',priority:1,rights:'official-public-information; verify each document and reuse terms'},
  {name:'DzExams',url:'https://www.dzexams.com/',role:'نماذج فروض واختبارات ومواضيع وحلول حسب الطور والمستوى',priority:2,rights:'third-party; require permission or applicable licence before copying or downloading'},
  {name:'Ency-Education',url:'https://www.ency-education.net/exams',role:'بنك نماذج للفروض والاختبارات لجميع الأطوار',priority:3,rights:'third-party; permission reported by user for local direct downloads only; no republication'},
  {name:'DzMadrassa',url:'https://dzmadrassa.com/',role:'موارد تعليمية وفروض واختبارات مع حلول',priority:4,rights:'third-party; permission reported by user for local direct downloads only; no republication'},
  {name:'DzSujets',url:'https://dzsujets.com/',role:'وثائق وفروض وامتحانات ودروس مصححة',priority:5,rights:'third-party; permission reported by user for local direct downloads only; no republication'},
  {name:'Raji3DZ',url:'https://raji3dz.com/',role:'بنك دروس وفروض واختبارات حسب الأطوار',priority:6,rights:'third-party; permission reported by user for local direct downloads only; no republication'}
 ];
 g.smEducationTeacherSources=()=>sources.map(x=>({...x}));
 g.smTeacherBuildExamPrompt=function(p){
  p=p||{};const grade=clean(p.grade)||'غير محدد',subject=clean(p.subject)||'غير محددة',term=clean(p.term)||'غير محدد',topics=clean(p.topics)||'لم يحدد الأستاذ الدروس المنجزة',branch=clean(p.branch)||'غير محددة';
  return `أنشئ ${clean(p.kind)||'فرض'} تدريبياً أصلياً وفق منهج التعليم الجزائري للموسم 2026-2027، وليس موضوعاً رسمياً.\nالمستوى: ${grade}. الشعبة: ${branch}. المادة: ${subject}. الفصل: ${term}. المدة: ${Number(p.duration)||60} دقيقة. عدد التمارين: ${Number(p.count)||4}. الصعوبة: ${clean(p.difficulty)||'متدرجة'}.\nالدروس/الوحدات التي أكد الأستاذ تدريسها: ${topics}. لا تختبر محتوى خارج هذه القائمة إلا إذا صرّح الأستاذ بذلك. إذا كانت القائمة فارغة أو لا تتوفر وثيقة تقدم سنوي موثقة للمستوى والمادة والفصل، اطلب توضيحاً أو ضع تنبيهاً صريحاً بأن المطابقة الفصلية غير مؤكدة؛ لا تخترع ترتيباً وزارياً.\nمتطلبات الموضوع: كفاءات وأهداف قابلة للقياس، تعليمات واضحة، تمارين متدرجة ومتنوعة (استرجاع، فهم، تطبيق، استدلال، وإدماج عند ملاءمته للطور والمادة)، مع تجنب الغموض وتكرار نفس المهارة. اجعل مجموع النقاط 20 ووزعها على البنود الفرعية.\nأخرج نسختين منفصلتين: (أ) ورقة التلميذ دون حلول، (ب) التصحيح النموذجي المفصل مع خطوات الحل، بدائل الإجابات المقبولة، سلم التنقيط الجزئي لكل خطوة، والأخطاء الشائعة. راجع حساب مجموع النقاط والمدة وتغطية الدروس قبل الإخراج. لا تنقل نصوصاً من مواقع أو مواضيع منشورة؛ استلهم شكل التنظيم فقط. إذا استُخدم مرجع خارجي، اذكر عنوانه ورابطه ولا تدّعِ امتلاك إذن إعادة نشره.\nسياق نقاط الضعف المسجلة للتلميذ (للتكييف فقط، لا لإقصاء محتوى المنهاج): ${clean(p.weaknesses)||'لا توجد بيانات كافية'}.`;
 };
 g.smTeacherBuildReviewContext=function(p){
  p=p||{};return `المستوى: ${clean(p.grade)||'غير محدد'}؛ المادة: ${clean(p.subject)||'عامة'}؛ السنة المرجعية: 2026-2027.\nافصل بين النص المستخرج آلياً وما قرأته بصرياً وما استنتجته. ضع درجة ثقة لكل جزء غير واضح، ولا تكمل كلمة أو رقماً بالتخمين. قارن كل بند بمعيار الإجابة، وامنح النقاط الجزئية فقط على خطوات ظاهرة ومثبتة. لا تعرض علامة رسمية أو نهائية؛ أي علامة دون سلم أصلي تسمى تقديرية. اشرح الخطأ بلغة تناسب المستوى، ثم أنشئ ثلاثة تمارين علاجية متدرجة تعالج المهارة التي ظهر فيها الخلل، مع حلول منفصلة ومعيار نجاح لكل تمرين. إذا لم تتوفر إجابة نموذجية موثوقة، صرّح بأن المقارنة تقريبية واطلب مراجعة الأستاذ.`;
 };
 g.SM_EDUCATION_RELEASE={version:'2.8.5',focus:'evidence-aware-smart-teacher-and-algerian-exam-generation'};
})(window);
