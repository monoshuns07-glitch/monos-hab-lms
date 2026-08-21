#!/bin/sh
# Хувилбарын дугаарыг НЭГ дор нэмнэ: index.html ба version.json ХОЁУЛАА.
# Хэрэглээ:  sh bump.sh 269
set -e
[ -n "$1" ] || { echo "хэрэглээ: sh bump.sh <дугаар>"; exit 1; }
sed -i "s#script\.js?v=[0-9]*#script.js?v=$1#" kpi/index.html
sed -i "s#style\.css?v=[0-9]*#style.css?v=$1#" kpi/index.html
printf '{ "v": %s }\n' "$1" > kpi/version.json
grep -o 'script.js?v=[0-9]*\|style.css?v=[0-9]*' kpi/index.html
cat kpi/version.json
