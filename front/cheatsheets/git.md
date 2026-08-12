# Git 速查

## 基础
```bash
git init                     # 初始化
git clone <url>              # 克隆
git status                   # 状态
git log                      # 历史
git log --oneline --graph    # 图形化
git diff                     # 差异
git add .                    # 暂存所有
git commit -m "msg"          # 提交
git commit --amend           # 改上次提交
```

## 分支
```bash
git branch                   # 列出本地
git branch -a                # 包括远程
git branch <name>            # 创建
git branch -d <name>         # 删除(已合并)
git branch -D <name>         # 强制删除
git checkout <name>          # 切换
git checkout -b <name>       # 创建并切换
git switch <name>            # 新语法
git switch -c <name>         # 新建并切换

# 合并
git merge <branch>
git rebase <branch>          # 变基(线性历史)
git rebase -i HEAD~3         # 交互式变基
```

## 远程
```bash
git remote -v                          # 远程列表
git remote add origin <url>
git push origin main
git pull origin main                   # = fetch + merge
git pull --rebase origin main          # = fetch + rebase
git fetch origin                       # 仅下载
git push --set-upstream origin <br>    # 首次推送
```

## 撤销
```bash
git restore <file>             # 撤销工作区修改
git restore --staged <file>    # 撤销暂存(回到工作区)
git reset HEAD~1                # 撤销上次提交(保留修改)
git reset --hard HEAD~1         # 撤销上次提交(丢弃修改)
git revert HEAD                 # 创建反向提交
```

## 暂存
```bash
git stash                       # 暂存当前修改
git stash pop                   # 恢复
git stash list                  # 列表
git stash apply stash@{0}       # 应用指定
git stash drop stash@{0}        # 删除
```

## 标签
```bash
git tag                        # 列出
git tag v1.0.0                 # 创建
git tag -a v1.0.0 -m "msg"     # 注释标签
git push origin v1.0.0         # 推送
git tag -d v1.0.0              # 删除
```

## 常用场景

### 撤销已推送的提交
```bash
git revert HEAD
git push
```

### 修改最近一次提交
```bash
git add .
git commit --amend
git push --force-with-lease  # 比 --force 安全
```

### 同步 fork
```bash
git remote add upstream <original-url>
git fetch upstream
git merge upstream/main
```

### 合并多个提交
```bash
git rebase -i HEAD~3
# pick → squash
```

### 子模块
```bash
git submodule add <url> <path>
git submodule update --init
git submodule foreach git pull
```

## 高级
```bash
git bisect start
git bisect bad HEAD
git bisect good <commit>
# 自动二分找 bug 引入点

git cherry-pick <commit>       # 应用指定提交
git reflog                     # 操作日志(救命)
git blame <file>               # 每行最后修改者
git worktree add <path> <br>   # 多 worktree
git submodule update --remote --merge
```

## .gitignore
```
node_modules/
dist/
.env
.env.local
.DS_Store
*.log
.vscode/
coverage/
```

## 别名配置
```bash
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.lg "log --oneline --graph"
git config --global alias.unstage "restore --staged"
```

## 黄金法则

```
1. 提交前 git status 看一眼
2. commit message 写清楚(feat: / fix: / docs:)
3. main 分支不要直接提交
4. push 前 git pull --rebase
5. 危险操作前先备份(reflog 救命)
```