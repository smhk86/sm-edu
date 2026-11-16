# مسار DZExams ← GitHub Repository ← SM EDUCATION

## البنية

1. **DZExams**: المصدر الأصلي. لا يُفحص أو يُحمّل أي ملف إلا بعد الحصول على إذن أصحاب الحقوق، واحترام `robots.txt` وروابط الملفات المباشرة.
2. **GitHub Repository**: المستودع المركزي للملفات التي صُرّح صراحةً بإعادة نشرها فقط. تُخزّن الملفات في `web/repository/exams/` ويُحدّث الفهرس `web/data/dzexams-repository-index.json`.
3. **SM EDUCATION**: زر «مزامنة مستودع GitHub» يقرأ الفهرس المنشور، ثم يعرض ملفات المستوى المختار ويتيح تنزيلها على الجهاز عند الطلب.

## إدخال ملفات جديدة إلى المستودع

- احصل على موافقة مكتوبة تشمل تخزين الملف وإعادة نشره في مستودع GitHub Pages؛ موافقة التحميل الشخصي وحدها لا تعني بالضرورة السماح بإعادة النشر.
- أضف الروابط المباشرة المصرح بها وبيانات المستوى والمادة إلى `templates/dzexams-approved-files.csv`.
- شغّل من بيئة متصلة بالإنترنت:

```bash
python tools/sync_dzexams_repository.py --csv templates/dzexams-approved-files.csv --permission-confirmed
```

- راجع الملفات والفهرس الناتجين، ثم ادفع التغييرات إلى الفرع المنشور. لا يرفع السكريبت إلى GitHub بنفسه ولا يحتاج إلى رمز وصول GitHub.
- بعد اكتمال نشر GitHub Pages، افتح بنك الاختبارات في التطبيق واضغط «مزامنة مستودع GitHub».

## ضوابط السكريبت

- يقبل HTTPS فقط من `dzexams.com` ونطاقاته الفرعية، ويرفض التحويل إلى نطاق آخر.
- يفشل بأمان إذا تعذر قراءة `robots.txt` أو منع الموقع الرابط.
- لا يتجاوز تسجيل الدخول أو الحماية، ولا يجري زحفاً تلقائياً للصفحات.
- يحمّل الملفات المباشرة فقط، ويقبل PDF وDOC وDOCX، بحد أقصى 40 MiB وفاصل لا يقل عن ثانيتين.
- يحسب SHA-256، ويمنع تكرار رابط المصدر في الفهرس.

## ملاحظات

الفهرس المرفق يبدأ فارغاً عمداً؛ لذلك مزامنة GitHub لن تُظهر ملفات حتى تضاف ملفات مصرح بها وتُنشر. يظل التحميل المباشر من بطاقة DZExams داخل التطبيق متاحاً وفق بوابة الموافقة الحالية. لا تُرفع ملفات المستخدم الشخصية إلى GitHub.


## Raji3DZ (الإصدار 2.8.7)

المسار نفسه ومعه عزل كامل عن DZExams:

| | DZExams | Raji3DZ |
|---|---|---|
| النطاق المسموح | `dzexams.com` | `raji3dz.com` |
| الفهرس | `web/data/dzexams-repository-index.json` | `web/data/raji3dz-repository-index.json` |
| المجلد | `web/repository/exams/` | `web/repository/raji3dz/` |
| قالب CSV | `templates/dzexams-approved-files.csv` | `templates/raji3dz-approved-files.csv` |

```bash
python tools/sync_dzexams_repository.py --source raji3dz --csv templates/raji3dz-approved-files.csv --permission-confirmed
```

- نفس الضوابط: HTTPS فقط، رفض التحويل إلى نطاق آخر، فحص `robots.txt` (فشل آمن)، حد 40 MiB، فاصل ≥ ثانيتين، PDF/DOC/DOCX فقط، SHA-256، منع تكرار الرابط. رابط من موقع آخر يُرفض قبل أي اتصال.
- `--permission-confirmed` يعني أن لديك موافقة مكتوبة تشمل **إعادة النشر** في GitHub Pages، لا التحميل الشخصي فقط.
- لا يوجد أي رمز GitHub في التطبيق. السكربت لا يرفع شيئاً؛ تدفع الملفات والفهرس بنفسك (Git أو واجهة GitHub) فيُعاد نشر Pages تلقائياً (المسارات مضافة إلى `publish-learning-content.yml`).
- في التطبيق: بطاقة Raji3DZ ← «مزامنة مستودع GitHub» تقرأ الفهرس المنشور فقط (طلب GET عام، بلا ترويسة Authorization، وبلا اتصال بـ raji3dz.com). تُقبل الروابط التي تقع داخل أصل GitHub Pages ومجلد `/repository/raji3dz/` فقط.
- ملفات `web/repository/**` تُستبعد من حزمة APK وتُنزَّل عند الطلب من Pages.
- الفهرسان يبدآن فارغين عمداً.


## التشغيل الآلي (الإصدار 2.8.8)

1. ضعي الروابط المباشرة المصرح بها في `templates/dzexams-approved-files.csv` و/أو `templates/raji3dz-approved-files.csv` (الأعمدة: url,grade,subject,title,year,term,solution) وادفعيها إلى GitHub.
2. GitHub ← Actions ← **Sync approved exam files** ← Run workflow، واختاري المصدر (both/dzexams/raji3dz)، وفعّلي `permission_confirmed` (الإقرار بوجود موافقة مكتوبة على التخزين وإعادة النشر).
3. يحمّل السكربت الملفات بضوابطه (HTTPS، النطاق، robots.txt، 40MiB، فاصل ≥2s)، ويحفظها في `web/repository/exams/` أو `web/repository/raji3dz/`، ويحدّث الفهرسين، ويعمل commit، ثم ينشر Pages.
4. التطبيق يزامن الفهرسين تلقائياً بصمت (كل 12 ساعة على الأقل عند الاتصال)، أو يدوياً من «مزامنة مستودع GitHub»، ثم يُنزَّل الملف عند الطلب من Pages.

الرمز المستعمل هو `GITHUB_TOKEN` المدمج داخل Actions فقط. إن فشل `git push` فاضبطي Settings ← Actions ← General ← Workflow permissions على Read and write.
