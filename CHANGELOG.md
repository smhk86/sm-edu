## [2.9.16] - 2026-11-10

- تطوير محرك التصحيح الموجود: تحليل معايير وخطوات الحل، وتحديد أول خطأ وتصنيفه.
- عرض دليل الإجابة وتعليل النقاط الممنوحة لكل معيار، مع تطبيع مجموع المعايير إلى نقاط السؤال.
- الإبقاء على التصحيح التكويني ومراجعة الأستاذ، دون إضافة أداة تصحيح مكررة أو تغيير واجهات الخادم.

## [2.9.15] - 2026-11-10
### Improved
- Integrated Claude original educational draft generation into the existing smart-generator page; removed the separate Claude panel from the test-bank page.
- Reused the generator's grade, subject, term, difficulty, count, duration and score settings for AI drafts.
- Required explicit solution steps for each generated question and added rubric-total validation against the requested score.
- Displayed integrative context, model solutions and suggested rubric in the same generator preview; local paper saving remains separate from the exercise bank.
- Preserved admin-token protection, server-side Anthropic key handling, no-auto-publication policy and existing server routes.
### Validation
- Added backend draft-validation and frontend generator-integration regression tests.

## [2.9.14] - 2026-11-10
- Validate AI-generated educational drafts before display; reject missing questions or model answers.
- Add structured teacher preview and explicit non-publication / curriculum-verification guardrails.

## [2.9.13] - 2026-11-10

- Normalize exercise difficulty labels across Arabic, French and English.
- Apply requested difficulty filters to localized bank records and report accurate difficulty distributions.
- Build teacher marking rubrics from solution steps with exact hundredth-point allocation.
- Preserve API compatibility and teacher-review/curriculum-verification safeguards.

## v2.9.10
- إضافة ثلاثة أوضاع لتحليل الملفات والصور: استخراج الأسئلة والمعطيات دون اشتراط إجابة التلميذ، حل التمرين خطوة بخطوة، وتصحيح إجابة التلميذ مع شرح الأخطاء.
- دعم إبقاء مسار PDF النصي وPDF المصوّر والصور وDOCX ومصادر PDF من مكتبات DzExams وRaji3DZ كما هو، مع استخدام التحليل البصري عند توفر الصور.
- منع تخمين الرموز والقياسات غير الواضحة، وإظهار حدود OCR/الرؤية ضمن توجيهات التحليل.
- تحديث الإصدار وذاكرة Service Worker وإضافة اختبارات انحدار للميزة.

## v2.9.1
- Dedicated multi-grade generator with term, subject, difficulty, duration, marks, solutions and marking scheme.
- Removed progress and textbook navigation entries.
- Arabic PDF text-layer typography improvements.

## v2.8.9
- إصلاح رابط المستودع: `publicContentBase` في `web/config.js` وقيمة `--public-base` الافتراضية في `tools/sync_dzexams_repository.py` كانا يشيران إلى الحساب القديم `hakou44/sm-edu`؛ أصبحا `https://smhk86.github.io/sm-education`.
- سير عمل `sync-approved-exams.yml`: تمرير `--public-base` محسوباً من المستودع الجاري (`github.repository_owner` + اسم المستودع) حتى لا تُكتب في الفهرس روابط لحساب آخر، وعدّ صفوف CSV بـ `grep -c` بدل `wc -l` (الصف الوحيد بلا سطر جديد في النهاية كان يُعدّ «لا صفوف» ويُتخطى بصمت).
- إضافة المضيف `dzexams.pro` (الذي تُخدَم منه ملفات PDF) إلى `dzexamsHosts` وإلى قائمة النطاقات المسموحة في أداة المزامنة، بناءً على إفادة المستخدم بحصوله على إذن صاحب الموقع؛ تبقى بقية الضوابط (HTTPS، robots.txt، 40MiB، فحص التوقيع).
- Service Worker: فهرسا المستودع (`*-repository-index.json`) صارا شبكة-أولاً مثل `ai-course-updates.json` (كانا cache-first فلا تظهر الملفات الجديدة)، وإضافة فهرس Raji3DZ إلى الذاكرة المسبقة، وعدم تخزين ملفات `/repository/` الكبيرة في ذاكرة العامل.
- إضافة `web/v2-8-9.js` (بيانات الإصدار) وتحديث رقم الإصدار والاختبارات، واختبار جديد `tests/v2_8_9_review_fixes_test.js`.

## v2.8.8
- ربط المستودع بالتطبيق: سير عمل `sync-approved-exams.yml` (تشغيل يدوي) ينفّذ سكربتي التحميل لـ DzExams وRaji3DZ من ملفي CSV المعتمدين، يخزّن الملفات في `web/repository/` ويحدّث الفهرسين ويعمل commit ثم يعيد نشر Pages في التشغيل نفسه. يتطلب تأكيد الإذن (`permission_confirmed`) وإلا يفشل؛ يستعمل `GITHUB_TOKEN` المدمج داخل Actions فقط، ولا رمز في التطبيق.
- مزامنة تلقائية صامتة للفهرسين داخل التطبيق (`web/v2-8-8.js`) عند الفتح كل 12 ساعة كحد أدنى وعند توفر الاتصال، قراءة فقط؛ الزر اليدوي ما زال متاحاً.
- `syncRepositoryIndex(quiet)` في مكتبتي DzExams وRaji3DZ.

## v2.8.7
- إضافة «التصحيح الآلي بالإجابة النموذجية» (`web/auto-grader.js`) داخل صفحة المعلم الذكي: قراءة ورقة التلميذ من صورة أو PDF (طبقة النص أولاً ثم صور الصفحات للمصوّر/المكتوب بخط اليد) أو من نص مكتوب، ومقارنتها بإجابة نموذجية (نص أو ملف أو حل PDF من مكتبة DZExams / Raji3DZ) سؤالاً بسؤال.
- العلامة تُحسب برمجياً من نقاط الأسئلة (تقريب إلى 0.25، منع تجاوز النقاط القصوى، توحيد الحكم مع النقاط، تحويل المجموع إلى العلامة القصوى المطلوبة) ولا يُعتمد رقم المجموع الذي يعطيه النموذج. الأجزاء غير المقروءة لا تُمنح نقاطاً وتجعل العلامة مؤقتة. إذا لم يُرجع النموذج JSON منظماً فلا تُحسب علامة.
- موافقة صريحة قبل إرسال النص والصور إلى Groq؛ لا تُحفظ الصور؛ لا يُرسل اسم التلميذ.
- مكتبة Raji3DZ: فهرس GitHub خاص بها (`web/data/raji3dz-repository-index.json`، مجلد `web/repository/raji3dz/`، مفاتيح `raji3dzRepositoryIndex/raji3dzRepositoryPath`) بدل مشاركة مفتاح فهرس DzExams؛ قراءة الفهرس للقراءة فقط دون أي رمز ودون الاتصال بالموقع الأصلي.
- أداة `tools/sync_dzexams_repository.py` تدعم الآن `--source dzexams|raji3dz` (نطاقات وفهرس ومجلد منفصلة لكل مصدر) مع القالب `templates/raji3dz-approved-files.csv`؛ السلوك الافتراضي (DzExams) لم يتغير.
- منتقي ملفات المكتبة في المعلم الذكي يعرض الآن ملفات DzExams وRaji3DZ معاً.
- GitHub Actions: إعادة نشر Pages عند تغيّر الفهارس أو `web/repository/**`، واستبعاد `web/repository` من حزمة APK حتى لا تتضخم.
- اختبار جديد يمسح `web/` للتأكد من خلوّه من رموز GitHub ومفاتيح Groq وترويسات Authorization المضمنة ومن أي استدعاء لواجهة GitHub API.

## v2.8.6
- إضافة مكتبة مستقلة للتحميل المباشر من Raji3DZ داخل بنك الاختبارات، مع بوابة تفعيل محلية قابلة للإلغاء، وقائمة نطاقات HTTPS محددة، وفحص robots.txt، وتنزيل PDF/Word إلى تخزين الجهاز والتحقق من توقيع الملف.
- فصل إعدادات Raji3DZ ومفاتيح التخزين وقاعدة IndexedDB ومعرّفات الواجهة عن تكامل DzExams لمنع التداخل.
- ربط البطاقة الجديدة بواجهة بنك الاختبارات وإضافة ملفها إلى Service Worker واختبار تكامل مستقل.
- لا يتجاوز التطبيق تسجيل الدخول أو الحماية، ولا يعيد نشر الملفات؛ النطاق الافتراضي raji3dz.com فقط، ولا تُضاف نطاقات CDN إلا بموافقة صريحة من صاحب الموقع.

## v2.8.0 — تصحيح خطوات الحل والمسائل الهندسية
## v2.8.0 — تصحيح خطوات الحل وفهم المسائل الهندسية

- إضافة حقل مستقل لخطوات الحل حتى يراجع المعلم العمليات والتحويلات والتعويضات والوحدات والإشارات، لا النتيجة النهائية فقط.
- إضافة وصف اختياري للشكل الهندسي/الرسم، مع توجيه المصحح لاستخدام العلاقات والمعطيات المذكورة فقط وعدم افتراض خصائص غير مثبتة.
- توجيه التصحيح لتحديد أول خطأ جبري، وتفسيره، وتوزيع النقاط على الخطوات الظاهرة، مع الحفاظ على التمارين العلاجية الثلاثة.
- تحديث الإصدار في الواجهة وواجهة API وذاكرة Service Worker والاختبارات.
- لا يدّعي هذا الإصدار فهماً بصرياً آلياً كاملاً للرسوم؛ الصور تحتاج وصفاً نصياً واضحاً، والرموز غير المقروءة تتطلب صورة أوضح.

# Changelog

## 2.7.0 — 2026-11-07
- إضافة استخراج نص DOCX من الفقرات والجداول عبر نقطة API محمية، دون تخزين الملف.
- إضافة OCR للصور مع التحقق من النوع والحجم والأبعاد واللغة؛ المعالجة في الذاكرة فقط.
- تطوير التصحيح إلى مستوى كل سؤال ومعيار، مع نقاط تقديرية وتمارين علاجية وحلول.

## 2.6.0 — 2026-11-07
- Added protected server-side OCR for scanned PDFs using the existing private review queue and Tesseract integration.
- Added Arabic/French/English OCR language selection and explicit setup/permission errors.
- Added mock-exam exercise count and difficulty controls.
- Updated API/PWA release metadata and added regression coverage.
- OCR requires a configured API server, admin token and installed Tesseract language packs; no document is auto-published.


## 2.5.1 — 2026-11-07
- Route DZExams robots, page scanning, GitHub index sync and binary document downloads through native CapacitorHttp on Android; keep fetch as the regular-browser fallback.
- Normalize native binary responses and retain file-signature and size checks before local storage.
- Add the requested DZExams → GitHub Repository → SM EDUCATION visual flow.
- Add a native-path integration test proving that Android does not rely on WebView fetch/CORS.


## 2.5.0 — 2026-11-07
- Added a curated GitHub repository index for rights-cleared DZExams documents, with app-side sync and strict repository-path validation.
- Added PDF text extraction for downloaded and locally selected PDFs, followed by formative AI correction of the student's answer.
- Added configurable mock-exam generation (term, assessment type, duration) with model correction and a 20-point marking rubric request.
- Added repository index to the service-worker shell cache and advanced the app/cache version.
- Limitations: scanned/image-only PDFs require OCR; DOC/DOCX extraction is not yet supported; live AI requires a user-configured Groq key.

# سجل التغييرات — SM éducation

## v2.4.0 — محادثة للمساعد الذكي وبنك تمارين أذكى وتنقل أبسط
- **المساعد الذكي بواجهة محادثة** (`web/ux-v2-4-0.js`): منطقة القراءة تملأ الشاشة وشريط الكتابة ثابت أسفلها فلا يغطي الإجابات؛ فقاعات رسائل مع الوقت، مؤشر «يكتب…»، تنسيق آمن للقوائم والخط العريض والشيفرة (يُهرَّب النص أولاً)، أزرار نسخ وإعادة المحاولة، أزرار اقتراح عند بدء محادثة جديدة، وأزرار لاختيار نوع المساعدة (شرح/تمارين/تصحيح) مع حقل الإجابة يظهر عند التصحيح فقط. Enter للإرسال على الحاسوب وSend على الهاتف. إعدادات الذكاء الاصطناعي والخادم داخل قسم قابل للطي.
- **بنك التمارين**: بطاقة «تدريب سريع» (10 أسئلة مختلطة موزعة على مواد السنة)، شارة نسبة الإتقان على بطاقة كل مادة (من الإجابات المسجلة) وعدد الأسئلة المحفوظة للمراجعة، وشريط تقدم ثابت أثناء التدريب (المُجاب/الصحيح).
- **التنقل**: زر «المزيد» في الشريط السفلي يفتح القائمة الكاملة بنقرة واحدة، وشريط تبديل «بنك التمارين | بنك الاختبارات» أعلى الصفحتين (حلّ محل زر الاختبارات في الشريط السفلي؛ الوصول إليه بقي بنقرة واحدة).
- اختبار جديد `tests/v2_4_0_chat_nav_exercises_test.js`، وفحص يدوي بمتصفح حقيقي (Chromium) لعرض الهاتف والحاسوب.
- رفع الإصدار إلى 2.4.0.

## v2.3.1 — إصلاحات وموثوقية البناء
- تصحيح 16 موضعاً في نصوص الواجهة الفرنسية لمكتبة dzexams (اختفاء الفاصلة العليا: «dabord» ← «d’abord»، «laccord» ← «l’accord»، «lappareil» ← «l’appareil»…).
- تخزين مكتبة PDF.js مسبقاً في Service Worker (موارد اختيارية) ليعمل عارض PDF الداخلي دون اتصال بعد أول تحميل.
- سير GitHub Actions: مهمة `test` تشغّل `npm test` كاملاً (Node وPython) قبل بناء APK، وخطوة التوقيع تتخطى نفسها بوضوح عند غياب سر `KEYSTORE_B64` بدل أن تفشل.
- `.gitignore`: استبعاد `__pycache__/` و`*.pyc` و`.DS_Store`، وحذف ملفات pycache من الحزمة.
- إمكانية الوصول: إضافة `aria-label` وtype لزر الإشعارات في الشريط العلوي.
- رفع الإصدار إلى 2.3.1.

## v2.3.0 — dzexams وتحسينات بنك التمارين
- حُذف سكريبت الجلب من تسنيم وكل ما يتعلق به: `tools/fetch_tasnim.py`، `web/tasnim-links.js`، `web/tasnim-library.js`، فهرس تسنيم وحالة الاستئناف وتقرير الإخفاقات، وأدوات دفعات ملفاته، واختباراتها، وخطوة الجلب الأسبوعية في سير GitHub Actions مع مفتاح تشغيله من التطبيق.
- إضافة `web/dzexams-library.js`: بطاقة «امتحانات وفروض — dzexams» في بنك الاختبارات. يلصق المستخدم رابط صفحة من dzexams.com، فيفحصها التطبيق ويعرض روابط PDF وWord المباشرة، ثم يحمّلها إلى الجهاز ويفتح PDF داخل التطبيق.
- لا يبدأ أي فحص أو تحميل قبل إقرار المستخدم داخل التطبيق بموافقة أصحاب الموقع (مع حقل مرجع اختياري وإمكانية الإلغاء). التطبيق لا يستطيع التحقق من الموافقة نفسها.
- قيود الاستخدام: نطاقات `dzexamsHosts` فقط عبر HTTPS، قراءة `robots.txt` أولاً (فشل مغلق)، طلبات متسلسلة بفواصل زمنية، توقف بعد 3 رفض (403/429) أو عند رفض الصفحة الأولى، حد 40 MB للملف، تحقق من توقيع الملف، لا تجاوز لتسجيل الدخول.
- حفظ آخر رابط لكل مستوى، واستنتاج المادة من عنوان الملف/الصفحة مع فلتر مادة وترتيب حسبها.
- تفعيل `CapacitorHttp` في إعدادات Capacitor لتجاوز قيد CORS داخل WebView.
- بنك التمارين (`web/ux-v2-3-0.js`): «تابع من حيث توقفت» و«تحدّي اليوم».
- اختبارات جديدة: `tests/dzexams_library_test.js` (ويتحقق أيضاً من خلو `web/` من أي أثر لتسنيم) و`tests/v2_3_0_exercise_resume_test.js`.

## v2.2.2 — تطوير بنك التمارين والاختبارات
- إضافة بحث فوري داخل مواد بنك التمارين ومرشحات بحسب مستوى الصعوبة المتاح فعلياً.
- إضافة لوحة إحصاءات في بنك الاختبارات تعرض عدد الأسئلة حسب الفصل للمادة والسنة المختارتين.
- تحسين واجهة البحث والبطاقات والاختيارات والتجاوب مع الهاتف وتقليل الحركة.
- تحديث الإصدار في الواجهة وواجهة API وذاكرة Service Worker والاختبارات.
- الحفاظ على المحتوى التدريبي الحالي (1,581 تمريناً) وعدم الادعاء بأن المحتوى مواضيع وزارية رسمية.

## v2.2.1 — فضاءات الاستخدام وتحسين التنقل
- إضافة اختصارات رئيسية لفضاء التلميذ والأستاذ والولي، توجّه إلى الصفحات القائمة دون الادعاء بوجود نظام صلاحيات أو حسابات جديد.
- الإبقاء على لوحة البداية ومؤشرات التقدم الحالية وإضافة قسم الفضاءات إليها.
- تحسين إغلاق قائمة الهاتف عبر Escape والنقر خارج القائمة، مع تحديث تسميات AR/FR/EN وسمات الوصول.
- إضافة اختبار آلي جديد وإدراج الملف في تخزين Service Worker المسبق.


## v2.2.0 — تحسين موثوقية التحديث والعمل دون اتصال
- تحويل تحميل صفحات HTML وملفات JavaScript وCSS إلى استراتيجية الشبكة أولاً مع الرجوع إلى النسخة المخزنة عند انقطاع الاتصال.
- جعل تخزين موارد التطبيق الأساسية إلزامياً، مع تنزيل الموارد الإضافية والملفات الثقيلة بصورة متسامحة حتى لا تفشل عملية تثبيت Service Worker بسبب ملف اختياري واحد.
- تفعيل Service Worker الجديد فوراً والسيطرة على الصفحات المفتوحة بعد التنشيط، وحذف ذاكرات الإصدارات القديمة.
- إضافة اختبار تحقق من مسارات التخزين المسبق الـ47 ومن استراتيجية العمل دون اتصال.
- تحديث رقم الإصدار في الواجهة وواجهة API والاختبارات.

## v2.1.9 وما قبله
راجع تقارير الإصدارات السابقة المرفقة في الحزمة.

## 2.8.1
- Added direct multimodal vision analysis for exercise images and up to three rendered PDF pages.
- Added confidence-labelled geometry/graph extraction instructions and configurable Groq vision model.


## 2.8.3
- Added exam generator controls for term, difficulty, duration, and total marks.
- Added non-repeating selection using local recent-question history while preserving exact curriculum matching.
- Added model answer and detailed marking-rubric output in teacher copy.
- Added release tests for exam builder configuration and version wiring.

## 2.8.3
- Added exam-generation quality rubric, structural evaluator and reference-source register.

## [2.8.4] - 2026-11-08
- Added a structured, rights-aware reference manifest for five BEM 2026 subject areas; source documents remain marked not downloaded and unverified.
- Added a teacher-review JSON template and a validator for reviewer metadata, six weighted scoring dimensions, evidence references, and review decisions.
- Added automated tests for valid, missing-reviewer, and out-of-range-score cases.
- Preserved the existing exam generator and v2.8.3 structural quality gate.


## [2.8.5] - 2026-11-08
- Expanded document-based smart correction with explicit confidence handling, partial-credit safeguards, grade-adapted explanations, and three targeted remedial exercises.
- Added taught-lessons input to exam generation and evidence-aware Algerian 2026-2027 exam prompts with separate student and teacher copies.
- Added a rights-aware register of the Ministry and five Algerian educational resource sites; third-party content is discovery-only unless permission/licensing is documented.
- Updated application, API, service-worker cache, and release metadata to v2.8.5.

## v2.9.7
- إضافة حفظ مواضيع المولّد محلياً مع العرض والحذف الفردي.
- إبقاء بنك التمارين ومراجع المكتبة الأصلية دون تعديل عند حذف موضوع مولّد.
- توثيق نطاق السنوات والمواد المتاحة والتنبيه إلى خرائط الشعب غير الموثقة رسمياً.

## v2.9.11
- إصلاح مسار PDF المصوّر: تشغيل OCR حتى عند تجهيز الصفحات للتحليل البصري.
- الجمع بين النص المستخرج والصور المرئية، مع استمرار التحليل البصري عند تعذر OCR.
- توضيح مصدر المحتوى في نتائج المعلم الذكي وإضافة اختبار انحدار.

## [2.9.12] - 2026-11-10
### Improved
- Balanced exam question selection across topics and cognitive-process tags.
- Added filtering for duplicate, blank, and unanswerable exam-bank records.
- Added server-side quality metadata and a visible quality-gate result in the exam generator.
- Synchronized frontend/backend release metadata and PWA cache version.
### Validation
- Full `npm test` suite passed; one unsafe-host repository test case was intentionally skipped.

## [2.9.17] - 2026-11-10
### Added
- Diagram-aware visual grading guidance for geometry, graphs, scientific drawings, axes, labels, units and relations.
- Structured visual observations with evidence and per-observation confidence.
- Visual uncertainty now triggers teacher review; image/PDF page preparation uses a higher resolution.
### Safety
- The model is instructed not to infer measurements from drawing proportions or guess unreadable symbols. Grades remain formative and require teacher review.

## 2.9.18
- PDF visual hints now classify likely tables, charts, geometry and scientific diagrams using conservative text/layout heuristics.
- Added review reasons, confidence state and explicit no-scale-measurement policy.


## 2.9.19
- Structured visual/text conflict reporting in image-based grading.
- Conflicts with separate text and diagram evidence are shown to teachers and force manual review.
