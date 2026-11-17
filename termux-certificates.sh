#!/data/data/com.termux/files/usr/bin/bash
# Usage: bash termux-certificates.sh   (needs urls.txt and GEMINI_API_KEY)
cd ~/sm-edu || exit 1
[ -f urls.txt ] || { echo "Create urls.txt first (TRACK|subject|URL per line)"; exit 1; }
[ -n "$GEMINI_API_KEYS$GEMINI_API_KEY" ] || [ -f ~/.sm_gemini_keys ] || { echo "export GEMINI_API_KEYS=\"k1 k2 k3\" or put the keys in ~/.sm_gemini_keys"; exit 1; }
python tools/fetch_certificate_papers.py urls.txt --rights-cleared --push
