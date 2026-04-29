#!/bin/bash

# LocalDrop 部署脚本
# 用法: ./deploy.sh
# SSR 模式部署，git pull + pnpm install + nuxt build + pm2 reload

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
PROJECT_DIR="/www/wwwroot/local-drop"
APP_NAME="local-drop"
APP_PORT=3010

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查目录是否存在
check_directory() {
    if [ ! -d "$1" ]; then
        log_error "目录不存在: $1"
        exit 1
    fi
}

# 切换到项目目录并更新代码
update_code() {
    log_info "正在进入项目目录: $PROJECT_DIR"
    cd "$PROJECT_DIR" || exit 1

    # 检查是否有未提交的更改
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        log_warn "检测到未提交的更改，正在执行 git stash..."
        git stash push -m "deploy-stash-$(date +%Y%m%d-%H%M%S)"
        log_info "更改已暂存，部署完成后可以恢复"
    fi

    log_info "正在拉取最新代码..."
    if git pull; then
        log_info "代码更新成功"
    else
        log_error "git pull 失败"
        exit 1
    fi
}

# 安装依赖和构建
build_project() {
    cd "$PROJECT_DIR" || exit 1

    log_info "正在安装依赖..."
    if pnpm install; then
        log_info "依赖安装成功"
    else
        log_error "pnpm install 失败"
        exit 1
    fi

    log_info "正在构建项目 (SSR)..."
    if pnpm build; then
        log_info "构建成功"
    else
        log_error "构建失败"
        exit 1
    fi
}

# 使用 PM2 重启服务
reload_service() {
    log_info "正在重启 PM2 服务: $APP_NAME"
    cd "$PROJECT_DIR" || exit 1

    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 reload "$APP_NAME"
        log_info "PM2 服务已重启"
    else
        PORT=$APP_PORT pm2 start .output/server/index.mjs --name "$APP_NAME"
        log_info "PM2 服务已启动（首次部署，端口 $APP_PORT）"
        log_warn "建议执行 pm2 save && pm2 startup 以设置开机自启"
    fi
}

# 主函数
main() {
    log_info "========================================"
    log_info "开始部署 LocalDrop (SSR)"
    log_info "========================================"

    check_directory "$PROJECT_DIR"

    update_code
    build_project
    reload_service

    log_info "========================================"
    log_info "部署完成！"
    log_info "访问地址: https://local-drop.fluttercn.com/"
    log_info "========================================"

    # 提示是否恢复 stash 的更改
    cd "$PROJECT_DIR" || exit 1
    if git stash list | grep -q "deploy-stash"; then
        log_warn "注意：你之前有暂存的更改，如需恢复请执行："
        echo "  cd $PROJECT_DIR"
        echo "  git stash list"
        echo "  git stash pop stash@{n}"
    fi
}

# 执行主函数
main
