import json
import os
import random
import sys
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

RSS_URL = "https://note.com/letonism/rss"
LINE_URL = "https://api.line.me/v2/bot/message/broadcast"
STATE_FILE = "data/sent_articles.json"

JST = timezone(timedelta(hours=9))

TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")

if not TOKEN:
    print("ERROR: LINE_CHANNEL_ACCESS_TOKEN is not set.")
    sys.exit(1)


def load_state():
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)

    if not os.path.exists(STATE_FILE):
        return {
            "notified": [],
            "introduced": []
        }

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(
            state,
            f,
            ensure_ascii=False,
            indent=2
        )


def get_text(element, tag):
    child = element.find(tag)

    if child is None:
        return ""

    return child.text or ""


def fetch_articles():
    request = urllib.request.Request(
        RSS_URL,
        headers={
            "User-Agent": "Letonism-Note-RSS-Bot/1.0"
        }
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()

    root = ET.fromstring(data)

    articles = []

    for item in root.findall(".//item"):
        title = get_text(item, "title")
        link = get_text(item, "link")
        guid = get_text(item, "guid")
        pub_date = get_text(item, "pubDate")

        article_id = guid or link

        if not article_id or not title or not link:
            continue

        articles.append({
            "id": article_id,
            "title": title.strip(),
            "link": link.strip(),
            "pub_date": pub_date.strip()
        })

    return articles


def send_line(message):
    payload = {
        "messages": [
            {
                "type": "text",
                "text": message
            }
        ]
    }

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(
        LINE_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}"
        }
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()

        print("LINE message sent successfully.")

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")

        print(
            f"LINE API error: HTTP {e.code}\n{body}"
        )

        raise


def notify_new_articles(articles, state):
    notified = set(state.get("notified", []))

    new_articles = [
        article
        for article in articles
        if article["id"] not in notified
    ]

    # 古い記事から順番に通知
    new_articles.sort(
        key=lambda article: article.get("pub_date", "")
    )

    for article in new_articles:
        message = (
            "📖 レトン教 新記事のお知らせ\n\n"
            f"「{article['title']}」\n\n"
            "レトン教公式noteに新しい記事が投稿されました。\n\n"
            f"🔗 {article['link']}"
        )

        send_line(message)

        notified.add(article["id"])

    state["notified"] = list(notified)


def weekly_introduction(articles, state):
    introduced = set(state.get("introduced", []))

    # まだ紹介していない記事を優先
    candidates = [
        article
        for article in articles
        if article["id"] not in introduced
    ]

    # 全記事を一周したら履歴をリセット
    if not candidates:
        introduced.clear()
        candidates = articles

    if not candidates:
        print("No articles available.")
        return

    article = random.choice(candidates)

    message = (
        "📚 今週のレトン教記事\n\n"
        "今週はこちらの記事をご紹介します。\n\n"
        f"「{article['title']}」\n\n"
        f"🔗 {article['link']}"
    )

    send_line(message)

    introduced.add(article["id"])

    state["introduced"] = list(introduced)


def main():
    state = load_state()
    articles = fetch_articles()

    if not articles:
        print("No articles found.")
        return

    mode = os.environ.get("MODE", "auto")

    if mode == "weekly":
        weekly_introduction(articles, state)

    elif mode == "check":
        notify_new_articles(articles, state)

    else:
        # schedule実行時は曜日で判定
        now = datetime.now(JST)

        notify_new_articles(articles, state)

        # 日曜日18時台なら週1紹介
        if now.weekday() == 6 and now.hour == 18:
            weekly_introduction(articles, state)

    save_state(state)


if __name__ == "__main__":
    main()