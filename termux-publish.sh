#!/data/data/com.termux/files/usr/bin/bash
# SM éducation — Termux: اختبار ثم رفع إلى GitHub (يبني الـ APK تلقائيًا عبر GitHub Actions)
# الاستخدام:  cd ~/sm-edu && bash termux-publish.sh [رسالة الإيداع]
set -e
REPO_URL="${REPO_URL:-https://github.com/smhk86/sm-edu.git}"
BRANCH=main

[ -f package.json ] && [ -d web ] && [ -d .github ] || { echo "خطأ: شغّل السكربت من مجلد المشروع (sm-edu)"; exit 1; }

echo "1/4 — الأدوات"
for t in git node; do command -v $t >/dev/null || { echo "ثبّت: pkg install git nodejs"; exit 1; }; done
MSG="${1:-Release v$(node -p "require('./package.json').version")}"

echo "2/4 — اختبارات JavaScript (يجب أن تنجح كلها)"
fail=0; for f in tests/*.js; do node "$f" >$HOME/.sm_test.log 2>&1 || { echo "فشل: $f"; tail -3 $HOME/.sm_test.log; fail=1; }; done
[ $fail -eq 0 ] || { echo "أوقفت الرفع بسبب فشل اختبارات."; exit 1; }
echo "كل الاختبارات نجحت."

echo "3/4 — Git"
[ -d .git ] || git init -q -b $BRANCH
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO_URL"
git config user.name  >/dev/null || git config user.name  "SM Education"
git config user.email >/dev/null || git config user.email "sm-education@users.noreply.github.com"
git add -A
git diff --cached --quiet && echo "لا توجد تغييرات جديدة." || git commit -q -m "$MSG"

echo "4/4 — الرفع إلى $BRANCH"
echo "عند طلب كلمة المرور استخدم Personal Access Token (صلاحية repo + workflow)، وليس كلمة مرور الحساب."
if git fetch origin $BRANCH 2>/dev/null; then
  git merge origin/$BRANCH --allow-unrelated-histories -X ours -m "Merge remote content" || { echo "تعذّر الدمج التلقائي: الصق الرسالة هنا."; exit 1; }
fi
git push -u origin $BRANCH
echo
echo "تم. تابع البناء: https://github.com/smhk86/sm-edu/actions"
echo "بعد اكتماله نزّل الملف SM_EDUCATION-debug-apk من قسم Artifacts ثم ثبّته على الهاتف."
