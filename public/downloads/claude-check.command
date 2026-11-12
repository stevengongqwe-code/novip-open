#!/bin/bash
# =============================================================================
# Claude 桌面应用 · 只读体检脚本（macOS）
# -----------------------------------------------------------------------------
# 用途：给站主的 Mac 上的 Claude 桌面应用（/Applications/Claude.app）做一次体检，
#       把结果写成桌面上的 claude-check.json，再拖到 https://novip.site/verify 看结论。
#
# 安全承诺（脚本本身就是证据，可全文阅读）：
#   1. 只读：不修改、不移动、不删除 Claude.app 及其任何文件
#   2. 不 patch、不改签名、不改 Info.plist
#   3. 不读聊天内容、不读 Cookies、不读登录凭据
#   4. 不联网上传任何东西；结果只写到本机桌面
#   5. 不需要管理员密码、不安装任何东西
#
# 唯一会发生的「副作用」：
#   - 在 ~/Desktop 写一个 claude-check.json
#   - 在 ~/Library/Logs/Claude 下临时复制日志做关键字统计（读完即删）
#
# 用法：双击运行即可；或在终端执行  bash claude-check.command
# =============================================================================
set -u
set -o pipefail

APP_PATH="${CLAUDE_APP_PATH:-/Applications/Claude.app}"
OUT_FILE="${CLAUDE_CHECK_OUT:-$HOME/Desktop/claude-check.json}"
SCHEMA="novip-claude-check/v1"
BUNDLE_ID="com.anthropic.claudefordesktop"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/claude-check.XXXXXX")"

ITEMS_FILE="$TMP_DIR/items.ndjson"
: > "$ITEMS_FILE"
cleanup() { rm -rf "$TMP_DIR" 2>/dev/null; }
trap cleanup EXIT

# ---- 小工具 -----------------------------------------------------------------
json_escape() {
  # 用 python3 做严格转义（macOS 自带 python3；没有则退化为简单转义）
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys;print(json.dumps(sys.stdin.read(),ensure_ascii=False))'
  else
    sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\000-\037' | awk '{printf "\"%s\"", $0}'
  fi
}
json_str() { printf '%s' "${1-}" | json_escape; }

# add_item <id> <title> <status> <detail> [suggestion]
add_item() {
  local id="$1" title="$2" status="$3" detail="$4" sugg="${5-}"
  {
    printf '{"id":%s,"title":%s,"status":%s,"detail":%s' \
      "$(json_str "$id")" "$(json_str "$title")" "$(json_str "$status")" "$(json_str "$detail")"
    if [ -n "$sugg" ]; then
      printf ',"suggestion":%s' "$(json_str "$sugg")"
    fi
    printf '}\n'
  } >> "$ITEMS_FILE"
  printf '  [%s] %s\n' "$status" "$title"
}

have() { command -v "$1" >/dev/null 2>&1 && echo 1 || echo 0; }

echo "== Claude 桌面应用 只读体检 =="
echo "开始时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo

# ---- 1. 安装与版本 ----------------------------------------------------------
APP_FOUND=0
VER=""; BID=""; ELECTRON=""; ARCHS=""; APP_SIZE=""
if [ -d "$APP_PATH" ]; then
  APP_FOUND=1
  PLIST="$APP_PATH/Contents/Info.plist"
  if [ -f "$PLIST" ]; then
    VER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST" 2>/dev/null)"
    BID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" 2>/dev/null)"
  fi
  EF_DIR="$APP_PATH/Contents/Frameworks/Electron Framework.framework"
  for cand in "$EF_DIR/Versions/A/Resources/Info.plist" "$EF_DIR/Resources/Info.plist"; do
    if [ -f "$cand" ]; then
      # Electron Framework 的 plist 没有 CFBundleShortVersionString，版本在 CFBundleVersion
      ELECTRON="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$cand" 2>/dev/null)"
      [ -z "$ELECTRON" ] && ELECTRON="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$cand" 2>/dev/null)"
      [ -n "$ELECTRON" ] && break
    fi
  done
  ARCHS="$(lipo -archs "$APP_PATH/Contents/MacOS/Claude" 2>/dev/null || echo '')"
  APP_SIZE="$(du -sh "$APP_PATH" 2>/dev/null | awk '{print $1}')"
fi

if [ "$APP_FOUND" = 1 ]; then
  add_item "app_present" "应用已安装" "pass" \
    "路径 ${APP_PATH}，版本 ${VER:-未知}，标识 ${BID:-未知}，Electron ${ELECTRON:-未知}，架构 ${ARCHS:-未知}，占用 ${APP_SIZE:-未知}"
else
  add_item "app_present" "应用已安装" "fail" \
    "$APP_PATH 不存在" \
    "从 https://claude.ai/download 重新下载安装到「应用程序」文件夹，再重新运行本体检脚本。"
fi

# ---- 2. 代码签名 / 公证 / 隔离属性 -----------------------------------------
if [ "$APP_FOUND" = 1 ]; then
  CODESIGN_OUT="$(codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1)"
  if [ $? -eq 0 ]; then
    add_item "signature_valid" "代码签名完整" "pass" "codesign 深校验通过（应用内文件未被第三方改动）"
  else
    add_item "signature_valid" "代码签名完整" "fail" \
      "codesign 校验失败：$(printf '%s' "$CODESIGN_OUT" | tail -3 | tr '\n' ' ')" \
      "应用文件可能被改动或被下载工具破坏。重新从官网下载安装；如果你自己改过应用内容，请恢复原版。"
  fi

  AUTHORITY="$(codesign -dvv "$APP_PATH" 2>&1 | sed -n 's/^Authority=//p' | head -1)"
  HARDENED="$(codesign -dvv "$APP_PATH" 2>&1 | grep -c 'flags=.*runtime')"
  if [ -n "$AUTHORITY" ]; then
    add_item "signature_authority" "签名来源" "pass" \
      "签名者：$AUTHORITY$([ "$HARDENED" -gt 0 ] && echo '；已开启 Hardened Runtime')"
  else
    add_item "signature_authority" "签名来源" "warn" "读不到签名者信息" "如果应用能正常打开可以忽略；否则重新安装官方版本。"
  fi

  SPCTL_OUT="$(spctl -a -vvv "$APP_PATH" 2>&1)"
  if printf '%s' "$SPCTL_OUT" | grep -q 'accepted'; then
    SRC="$(printf '%s' "$SPCTL_OUT" | sed -n 's/^source=//p' | head -1)"
    add_item "gatekeeper" "Gatekeeper 放行" "pass" "系统安全策略接受该应用${SRC:+（来源：${SRC}）}"
  else
    add_item "gatekeeper" "Gatekeeper 放行" "fail" \
      "系统安全策略拒绝：$(printf '%s' "$SPCTL_OUT" | head -2 | tr '\n' ' ')" \
      "「系统设置 → 隐私与安全性」拉到最下面点「仍要打开」，或重新从官网下载安装。"
  fi

  STAPLE_OUT="$(xcrun stapler validate "$APP_PATH" 2>&1)"
  if printf '%s' "$STAPLE_OUT" | grep -qi 'worked'; then
    add_item "notarization_stapled" "公证票据已内嵌" "pass" "可以不联网就通过苹果公证校验（离线启动更稳）"
  else
    add_item "notarization_stapled" "公证票据已内嵌" "warn" \
      "公证票据没有内嵌到应用里，首次启动需要联网向 Apple 校验" \
      "网络慢或 DNS 被代理接管时可能「打不开」。联网状态下重新运行一次本脚本，或在终端执行 xcrun stapler staple 后重试（需要联网）。"
  fi

  QUARANTINE="$(xattr -l "$APP_PATH" 2>/dev/null | grep -c 'com.apple.quarantine')"
  if [ "$QUARANTINE" -eq 0 ]; then
    add_item "quarantine" "无「下载隔离」标记" "pass" "应用上没有 com.apple.quarantine，启动不会被系统重复拦截"
  else
    add_item "quarantine" "无「下载隔离」标记" "warn" \
      "应用带有下载隔离标记，每次启动都要走一次 Gatekeeper 检查" \
      "正常可从 Finder 右键 →「打开」放行一次；如反复卡启动，可执行 xattr -dr com.apple.quarantine \"$APP_PATH\"（不改签名）。"
  fi
fi

# ---- 3. 进程与启动状态 ------------------------------------------------------
RUNNING_PID="$(pgrep -f "$APP_PATH/Contents/MacOS/Claude" 2>/dev/null | head -1)"
if [ -n "$RUNNING_PID" ]; then
  START_TIME="$(ps -o lstart= -p "$RUNNING_PID" 2>/dev/null | sed 's/^ *//')"
  RSS="$(ps -o rss= -p "$RUNNING_PID" 2>/dev/null | awk '{printf "%.0f", $1/1024}')"
  PROC_COUNT="$(pgrep -f "$APP_PATH" 2>/dev/null | wc -l | tr -d ' ')"
  add_item "process_running" "应用正在运行" "pass" \
    "主进程 PID ${RUNNING_PID}，启动于 ${START_TIME:-未知}，主进程内存 ${RSS:-?} MB，相关子进程 $PROC_COUNT 个"
else
  add_item "process_running" "应用正在运行" "warn" \
    "当前没有检测到 Claude 进程（可能没打开，或刚退出）" \
    "如果应用能正常打开，可以忽略这项；如果打不开，请把本报告发给我。"
fi

# 主进程整体内存占用（Electron 多进程合计）
TOTAL_RSS="$(ps -axo rss=,command= 2>/dev/null | grep "$APP_PATH/Contents/MacOS/Claude" | grep -v grep | awk '{s+=$1} END {printf "%.0f", s/1024}')"
TOTAL_RSS="${TOTAL_RSS:-0}"
if [ "$TOTAL_RSS" -gt 1800 ] 2>/dev/null; then
  add_item "memory" "内存占用" "warn" "Claude 相关进程合计约 ${TOTAL_RSS} MB，偏高" \
    "8GB 内存的机器容易卡顿。关掉不用的窗口/标签，或重启一次 Claude。"
elif [ "$TOTAL_RSS" -gt 0 ] 2>/dev/null; then
  add_item "memory" "内存占用" "pass" "Claude 相关进程合计约 ${TOTAL_RSS} MB"
fi

# ---- 4. 崩溃报告 ------------------------------------------------------------
APPLE_CRASHES="$(ls "$HOME/Library/Logs/DiagnosticReports" 2>/dev/null | grep -ci '^claude')"
APPLE_CRASHES="${APPLE_CRASHES:-0}"
CRASHPAD_DIR="$HOME/Library/Application Support/Claude/Crashpad/completed"
CRASHPAD_COUNT="$(ls "$CRASHPAD_DIR" 2>/dev/null | wc -l | tr -d ' ')"
if [ "$APPLE_CRASHES" -eq 0 ] && [ "${CRASHPAD_COUNT:-0}" -eq 0 ]; then
  add_item "crashes" "没有崩溃记录" "pass" "系统崩溃报告与 Claude 自带崩溃目录都没有新记录"
else
  add_item "crashes" "没有崩溃记录" "warn" \
    "发现崩溃记录：系统 $APPLE_CRASHES 份，Claude 自带崩溃目录 $CRASHPAD_COUNT 份" \
    "偶发崩溃通常是内存不足（8GB 机器常见）。把报告发给我，并说明崩溃时你在做什么。"
fi

# ---- 5. 账号与登录 ----------------------------------------------------------
# 注意：只统计日志关键字，绝不读取任何令牌、Cookie 或聊天内容。
WEB_LOG="$HOME/Library/Logs/Claude/claude.ai-web.log"
MAIN_LOG="$HOME/Library/Logs/Claude/main.log"
VERIFY_PORTAL_HIT=""
VERIFY_PORTAL_URL=""
VERIFY_PORTAL_COUNT=0
if [ -f "$WEB_LOG" ]; then
  VERIFY_PORTAL_COUNT="$(grep -c 'portal\.anthropic\.com/verify' "$WEB_LOG" 2>/dev/null || true)"
  VERIFY_PORTAL_COUNT="${VERIFY_PORTAL_COUNT:-0}"
  VERIFY_PORTAL_URL="$(grep -o 'https://portal\.anthropic\.com/verify?org=[0-9a-f-]*' "$WEB_LOG" 2>/dev/null | tail -1)"
  VERIFY_PORTAL_HIT="$(grep -o 'Your account can.t receive replies from Claude right now' "$WEB_LOG" 2>/dev/null | tail -1)"
fi

if [ "${VERIFY_PORTAL_COUNT:-0}" -gt 0 ]; then
  add_item "account_verify_required" "账号需要完成验证" "fail" \
    "客户端已 $VERIFY_PORTAL_COUNT 次收到「你当前无法收到 Claude 回复」的提示，并指向 Anthropic 验证门户${VERIFY_PORTAL_URL:+：$VERIFY_PORTAL_URL}" \
    "这不是应用坏了，是账号状态问题：用你自己的账号在浏览器打开上面的验证链接完成验证。这一步必须你本人做（涉及账号与身份），我不代做、也不绕过。"
else
  add_item "account_verify_required" "账号需要完成验证" "pass" "日志里没有出现「需要验证」的账号限制提示"
fi

if [ -f "$MAIN_LOG" ]; then
  LOGGED_OUT="$(grep -c 'User is logged out' "$MAIN_LOG" 2>/dev/null || true)"
  BOOT_403="$(grep -c 'Bootstrap API returned 403' "$MAIN_LOG" 2>/dev/null || true)"
  add_item "login_state" "登录状态线索" "pass" \
    "主日志中「已登出」记录 ${LOGGED_OUT:-0} 条、「账号信息接口 403」记录 ${BOOT_403:-0} 条（历史累计，含启动早期未登录阶段）"
fi

# ---- 6. 更新通道 ------------------------------------------------------------
UPD_TIMEOUT=0; UPD_BADJSON=0
if [ -f "$MAIN_LOG" ]; then
  UPD_TIMEOUT="$(grep -c 'Auto-update error: \[Error: 请求超时' "$MAIN_LOG" 2>/dev/null || true)"
  UPD_BADJSON="$(grep -c 'The server sent an invalid JSON' "$MAIN_LOG" 2>/dev/null || true)"
fi
UPD_TIMEOUT="${UPD_TIMEOUT:-0}"; UPD_BADJSON="${UPD_BADJSON:-0}"
if [ "$UPD_TIMEOUT" -eq 0 ] && [ "$UPD_BADJSON" -eq 0 ]; then
  add_item "updater" "自动更新通道" "pass" "日志里没有自动更新失败记录"
else
  add_item "updater" "自动更新通道" "warn" \
    "自动更新检查失败：超时 $UPD_TIMEOUT 次、响应不是合法 JSON $UPD_BADJSON 次" \
    "通常是网络出口不稳定或被中间设备改写。可从官网手动下载最新版覆盖安装；不影响当前使用。"
fi

# ---- 7. 网络连通性（只做 TCP 握手，不发任何数据） ---------------------------
NET_OK=0; NET_DETAIL=""
for host in api.anthropic.com claude.ai; do
  if nc -z -G 5 -w 5 "$host" 443 >/dev/null 2>&1; then
    NET_OK=$((NET_OK + 1))
    NET_DETAIL="$NET_DETAIL $host:443 可连接;"
  else
    NET_DETAIL="$NET_DETAIL $host:443 连不上;"
  fi
done
if [ "$NET_OK" -eq 2 ]; then
  add_item "network" "网络可达性" "pass" "TCP 443 握手成功（只握手，不发数据）：$NET_DETAIL"
elif [ "$NET_OK" -eq 1 ]; then
  add_item "network" "网络可达性" "warn" "部分域名连不上：$NET_DETAIL" \
    "检查代理/VPN 是否把 anthropic 相关域名走了错误的线路；换一条线路再试。"
else
  add_item "network" "网络可达性" "fail" "两个域名都连不上：$NET_DETAIL" \
    "当前网络无法访问 Anthropic 服务。先确认网络，或切到可用的代理线路，再重新运行本脚本。"
fi

# 当前 DNS 解析结果（帮助判断是否被代理 Fake-IP 接管）
DNS_DETAIL=""
if [ "$(have dig)" = 1 ]; then
  for host in api.anthropic.com claude.ai; do
    IP="$(dig +short +time=2 +tries=1 "$host" A 2>/dev/null | tail -1)"
    DNS_DETAIL="$DNS_DETAIL ${host}→${IP:-无解析};"
  done
else
  for host in api.anthropic.com claude.ai; do
    IP="$(dscacheutil -q host -a name "$host" 2>/dev/null | sed -n 's/^ip_address: //p' | tail -1)"
    DNS_DETAIL="$DNS_DETAIL ${host}→${IP:-无解析};"
  done
fi
if printf '%s' "$DNS_DETAIL" | grep -q '198\.18\.'; then
  add_item "dns" "DNS 解析" "warn" "解析被代理软件接管（Fake-IP）：$DNS_DETAIL" \
    "如果代理规则把 anthropic 域名走了错误线路，会出现「能上网但 Claude 用不了」。把 *.anthropic.com 与 claude.ai 加到直连或正确分组。"
else
  add_item "dns" "DNS 解析" "pass" "正常解析：$DNS_DETAIL"
fi

# ---- 8. 系统环境 ------------------------------------------------------------
OS_VER="$(sw_vers -productVersion 2>/dev/null)"
OS_BUILD="$(sw_vers -buildVersion 2>/dev/null)"
HW_ARCH="$(uname -m)"
MEM_GB="$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f", $1/1024/1024/1024}')"
DISK_FREE="$(df -h / 2>/dev/null | awk 'NR==2{print $4}')"
add_item "environment" "系统环境" "pass" \
  "macOS ${OS_VER:-?}（${OS_BUILD:-?}），架构 ${HW_ARCH}，内存 ${MEM_GB:-?} GB，根盘可用 ${DISK_FREE:-?}"

if [ "${MEM_GB:-0}" -le 8 ] 2>/dev/null; then
  add_item "low_memory" "内存偏小" "warn" "本机 ${MEM_GB} GB 内存，Electron 应用容易触发内存压力" \
    "关闭其他占用大的应用；Claude 卡顿时点「重启」而不是强杀。"
fi

# ---- 9. 权限类（只读查询，不会触发授权弹窗） --------------------------------
MIC="$(tccutil 2>/dev/null >/dev/null; sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" 'select count(*) from access where client like "%claudefordesktop%"' 2>/dev/null)"
if [ -z "${MIC:-}" ]; then
  add_item "permissions" "系统权限" "skip" "系统权限数据库受 SIP 保护，普通脚本读不到；这项跳过（不影响结论）"
fi

# ---- 写报告 ----------------------------------------------------------------
ITEMS_JSON="$(python3 - "$ITEMS_FILE" 2>/dev/null <<'PY'
import json,sys
items=[]
with open(sys.argv[1],encoding='utf-8') as f:
    for line in f:
        line=line.strip()
        if line:
            items.append(json.loads(line))
print(json.dumps(items,ensure_ascii=False))
PY
)"
if [ -z "$ITEMS_JSON" ]; then
  # 没有 python3 时的退化：手工拼装（items 已逐行是合法 JSON 对象）
  ITEMS_JSON="[$(paste -sd, "$ITEMS_FILE")]"
fi

NOW="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
cat > "$OUT_FILE" <<EOF
{
  "schema": "$SCHEMA",
  "generatedAt": "$NOW",
  "app": {
    "path": "$APP_PATH",
    "bundleId": "${BID:-$BUNDLE_ID}",
    "version": "${VER:-未知}",
    "electron": "${ELECTRON:-未知}",
    "arch": "${ARCHS:-$HW_ARCH}"
  },
  "signature": {
    "valid": $([ "$APP_FOUND" = 1 ] && codesign --verify --deep --strict "$APP_PATH" >/dev/null 2>&1 && echo true || echo false),
    "authority": "$(printf '%s' "${AUTHORITY:-}" | sed 's/"/\\"/g')",
    "notarized": $([ "$APP_FOUND" = 1 ] && xcrun stapler validate "$APP_PATH" >/dev/null 2>&1 && echo true || echo false),
    "hardenedRuntime": $([ "${HARDENED:-0}" -gt 0 ] 2>/dev/null && echo true || echo false)
  },
  "system": {
    "os": "${OS_VER:-}",
    "osBuild": "${OS_BUILD:-}",
    "arch": "$HW_ARCH",
    "memoryGB": ${MEM_GB:-0},
    "diskFree": "${DISK_FREE:-}"
  },
  "items": $ITEMS_JSON
}
EOF

echo
echo "=============================================="
echo "体检完成，报告已保存到："
echo "  $OUT_FILE"
echo
echo "下一步（不需要开终端）："
echo "  1. 把这个 claude-check.json 拖到 https://novip.site/verify"
echo "  2. 点「复制报告」，把内容发给我"
echo "=============================================="

# Finder 里高亮该文件，方便拖拽
if [ -t 0 ] && [ -z "${CLAUDE_CHECK_NO_REVEAL:-}" ]; then
  open -R "$OUT_FILE" 2>/dev/null || true
fi
exit 0
