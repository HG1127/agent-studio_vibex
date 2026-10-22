#!/usr/bin/env bash
# BaoTa/Ubuntu read-only Native API LAN HTTPS environment audit.
# Does not read or print Nginx config bodies, certificate/private keys,
# database credentials, application .env or employee data.
set -euo pipefail

echo "NATIVE_LAN_TLS_AUDIT_START"
echo "TARGET_IP=192.168.1.133"
echo "PANEL_PORT=82 (must remain unchanged)"
echo "NATIVE_API_UPSTREAM=127.0.0.1:7403 (not yet started)"
echo "CANDIDATE_TLS_PORT=7443 (not reserved without checking)"

if ! command -v ss >/dev/null 2>&1; then
  echo "SS_COMMAND=MISSING"
  exit 1
fi

if command -v ip >/dev/null 2>&1; then
  if ip -4 -o addr show | grep -Eq '(^|[[:space:]])192[.]168[.]1[.]133/'; then
    echo "LAN_IP_ASSIGNED=YES"
  else
    echo "LAN_IP_ASSIGNED=NO"
  fi
else
  echo "IP_COMMAND=MISSING"
fi

if [ -x /www/server/nginx/sbin/nginx ]; then
  NGINX=/www/server/nginx/sbin/nginx
elif command -v nginx >/dev/null 2>&1; then
  NGINX=$(command -v nginx)
else
  NGINX=''
fi
if [ -z "$NGINX" ]; then
  echo "NGINX_INSTALLED=NO"
else
  echo "NGINX_INSTALLED=YES"
  "$NGINX" -v 2>&1 | sed -E 's@^.*(nginx/[0-9.]+).*$@NGINX_VERSION=\1@'
fi

for port in 82 80 443 7403 7443; do
  if ss -H -ltn | awk -v port="$port" '
    {
      n=split($4, address, ":")
      if (address[n]==port) found=1
    }
    END {exit(found?0:1)}
  '; then
    echo "LISTEN_"$port"=IN_USE"
  else
    echo "LISTEN_"$port"=FREE"
  fi
done


# systemd must support private LoadCredential and DynamicUser before
# a future non-root service unit can be reviewed.
if command -v systemctl >/dev/null 2>&1; then
  systemctl --version | awk 'NR==1 {print "SYSTEMD_VERSION="$2}'
else
  echo "SYSTEMD=MISSING"
fi

if command -v openssl >/dev/null 2>&1; then
  openssl version | awk '{print "OPENSSL_VERSION="$2}'
else
  echo "OPENSSL=MISSING"
fi

if [ -d /www/server/panel/vhost/nginx ]; then
  count=$(find /www/server/panel/vhost/nginx -maxdepth 1 -type f -name '*.conf' | wc -l)
  echo "BAOTA_NGINX_VHOST_CONF_FILES=$count"
else
  echo "BAOTA_NGINX_VHOST_DIR=MISSING"
fi

if [ -r /www/server/nginx/conf/nginx.conf ]; then
  echo "BAOTA_NGINX_BASE_CONFIG=READABLE"
else
  echo "BAOTA_NGINX_BASE_CONFIG=NOT_READABLE_OR_DIFFERENT_PATH"
fi

if [ -e /opt/agentstudio-pg18-api-preflight-v1/ops/baota-pg18-native-api-preflight.sh ]; then
  echo "NATIVE_API_SOURCE=FOUND"
else
  echo "NATIVE_API_SOURCE=NOT_FOUND"
fi

echo "READ_ONLY=TRUE"
echo "NO_PORT_OPENED=TRUE"
echo "NO_SERVICE_RESTARTED=TRUE"
echo "NATIVE_LAN_TLS_AUDIT_END"
