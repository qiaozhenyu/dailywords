# -*- coding: utf-8 -*-
"""extract_examples.py — 为词库提取「示例短句」

优先数据源：WordNet 3.0 词义 gloss 中的例句（NLTK 打包，.cache/wordnet-nltk/）。
回退数据源：Tatoeba 英文句（.cache/eng_sentences.tsv，若存在）。

输入：words.json（含 word 字段）
输出：标准输出 JSON 映射 { word: sentence }

WordNet gloss 格式："definition; example1; example2"
只接受「例句中包含目标词作为独立单词」的例句，每个词取最短者。
用法：python3 scripts/extract_examples.py <words.json>
"""
import json
import re
import sys

def main():
    words = json.load(open(sys.argv[1], encoding="utf-8"))["words"]
    targets = [w["word"].lower() for w in words]
    target_set = set(targets)

    best = {}  # word -> (length, sentence)
    token_re = re.compile(r"[a-z']+")
    word_re = re.compile(r"\b[a-z']+\b")

    def consider(word, sent):
        n = len(token_re.findall(sent.lower()))
        if n < 3 or n > 9:
            return
        # 完整句优先（大写开头+句点结尾），否则接受用法片段兜底
        proper = bool(sent and sent[0].isupper() and sent[-1] in ".!?")
        rank = (0 if proper else 1, n)
        cur = best.get(word)
        if cur is None or rank < cur[0]:
            best[word] = (rank, sent)

    # ---- 优先：WordNet 3.0 gloss 例句 ----
    wn_dir = sys.argv[2] if len(sys.argv) > 2 else ".cache/wordnet-nltk/wordnet"
    found_any = False
    for pos_file in ["data.noun", "data.verb", "data.adj", "data.adv"]:
        try:
            with open(f"{wn_dir}/{pos_file}", encoding="utf-8") as f:
                for line in f:
                    if not line or not line[0].isdigit():
                        continue
                    parts = line.rstrip("\n").split(" ")
                    if len(parts) < 5:
                        continue
                    try:
                        wcnt = int(parts[3])
                    except ValueError:
                        continue  # 畸形行跳过
                    lemmas = []
                    idx = 4
                    for _ in range(wcnt):
                        if idx + 1 < len(parts):
                            lemmas.append(parts[idx].lower().replace("_", " "))
                        idx += 2
                    # gloss：'| ' 之后
                    gloss_part = line.split("| ", 1)[1] if "| " in line else ""
                    gloss = gloss_part.strip().strip('"')
                    gloss_parts = [p.strip() for p in gloss.split(";")]
                    examples = gloss_parts[1:]
                    for ex in examples:
                        # 清洗："e.g., " 前缀、引号、尾标点
                        ex = ex.strip().strip('"').strip()
                        ex = re.sub(r"^e\.?g\.?,?\s*", "", ex)
                        if not ex or len(ex) < 12:
                            continue
                        for lemma in lemmas:
                            if lemma in target_set and re.search(rf"\b{re.escape(lemma)}\b", ex.lower()):
                                consider(lemma, ex)
                                found_any = True
        except FileNotFoundError:
            continue

    if found_any:
        print(json.dumps({w: s for w, (_, s) in best.items()}, ensure_ascii=False))
        return

    # ---- 回退：Tatoeba（若缓存存在）----
    tsv_path = sys.argv[3] if len(sys.argv) > 3 else ".cache/eng_sentences.tsv"
    try:
        with open(tsv_path, encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 3:
                    continue
                sent = parts[2]
                if not (sent and sent[0].isupper() and sent[-1] in ".!?"):
                    continue
                toks = token_re.findall(sent.lower())
                if len(toks) < 2 or len(toks) > 9:
                    continue
                hit = next((t for t in set(toks) if t in target_set), None)
                if hit:
                    consider(hit, sent)
    except FileNotFoundError:
        pass

    print(json.dumps({w: s for w, (_, s) in best.items()}, ensure_ascii=False))

if __name__ == "__main__":
    main()
