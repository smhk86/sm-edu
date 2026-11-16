#!/data/data/com.termux/files/usr/bin/bash
# يُنشأ مرة واحدة فقط: مفتاح توقيع ثابت يجعل كل APK جديد يُثبَّت فوق القديم دون حذفه.
# الاستخدام:  bash termux-make-keystore.sh
set -e
command -v keytool >/dev/null || { echo "ثبّت أولًا: pkg install openjdk-17"; exit 1; }
[ -f smedu.keystore ] && { echo "smedu.keystore موجود مسبقًا. لا تُنشئ مفتاحًا جديدًا وإلا لن يتحدّث التطبيق."; exit 1; }
ALIAS=smedu
read -rsp "اختر كلمة سر للمفتاح (6 أحرف على الأقل): " PW; echo
keytool -genkeypair -storetype PKCS12 -keystore smedu.keystore -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass "$PW" -keypass "$PW" \
  -dname "CN=SM education, O=SM, C=DZ"
base64 -w0 smedu.keystore > smedu.keystore.b64
echo
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh secret set KEYSTORE_B64 --repo smhk86/sm-edu < smedu.keystore.b64
  printf '%s' "$PW" | gh secret set KEYSTORE_PASSWORD --repo smhk86/sm-edu
  printf '%s' "$ALIAS" | gh secret set KEY_ALIAS --repo smhk86/sm-edu
  echo "تم ضبط الأسرار الثلاثة في GitHub تلقائيًا."
else
  echo "أضف يدويًا في GitHub: Settings > Secrets and variables > Actions > New repository secret"
  echo "  KEYSTORE_B64      = محتوى الملف smedu.keystore.b64"
  echo "  KEYSTORE_PASSWORD = كلمة السر التي كتبتها"
  echo "  KEY_ALIAS         = $ALIAS"
fi
echo
echo "احتفظ بنسخة احتياطية من smedu.keystore وكلمة السر خارج الهاتف. ضياعهما يعني عدم القدرة على تحديث التطبيق مستقبلًا."
