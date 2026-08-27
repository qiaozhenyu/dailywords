#!/usr/bin/env python3
"""通过 GitHub Git Data API 把项目上传到远程仓库（单次提交）

用途：本机网络对 github.com 大流量限速、git push 不可用时，用 API 通道部署。
（api.github.com 正常）用法：python3 scripts/deploy-to-github.py "提交信息"
"""
import base64, json, os, subprocess, sys

REPO = "qiaozhenyu/dailywords"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".cache"}
COMMIT_MSG = sys.argv[1] if len(sys.argv) > 1 else "DailyWords 每日单词 - 更新"

def gh(method, path, payload=None):
    cmd = ["gh", "api", "--method", method, path]
    if payload is not None:
        cmd += ["--input", "-"]
    r = subprocess.run(cmd, input=json.dumps(payload) if payload is not None else None,
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("gh api 失败:", r.stderr.strip(), file=sys.stderr)
        sys.exit(1)
    return json.loads(r.stdout)

def main():
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            files.append(os.path.relpath(os.path.join(dirpath, fn), ROOT))
    files.sort()
    print(f"共 {len(files)} 个文件")
    tree = []
    for rel in files:
        with open(os.path.join(ROOT, rel), "rb") as f:
            content = base64.b64encode(f.read()).decode()
        blob = gh("POST", f"repos/{REPO}/git/blobs", {"content": content, "encoding": "base64"})
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    t = gh("POST", f"repos/{REPO}/git/trees", {"tree": tree})
    c = gh("POST", f"repos/{REPO}/git/commits", {"message": COMMIT_MSG, "tree": t["sha"]})
    try:
        gh("POST", f"repos/{REPO}/git/refs", {"ref": "refs/heads/main", "sha": c["sha"]})
    except SystemExit:
        gh("PATCH", f"repos/{REPO}/git/refs/heads/main", {"sha": c["sha"], "force": True})
    print("commit:", c["sha"][:8], "✅ 已推送到", f"https://github.com/{REPO}")

if __name__ == "__main__":
    main()
