import datetime as dt
from database import get_connection


def _dict_rows(rows):
    return [dict(r) for r in rows]


def get_summary():
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) as c FROM sessions").fetchone()["c"]
    completed = conn.execute(
        "SELECT COUNT(*) as c FROM sessions WHERE status = 'completed'"
    ).fetchone()["c"]
    cancelled = conn.execute(
        "SELECT COUNT(*) as c FROM sessions WHERE status = 'cancelled'"
    ).fetchone()["c"]
    avg_satisfaction = conn.execute(
        "SELECT AVG(satisfaction_rating) as avg FROM sessions WHERE status = 'completed'"
    ).fetchone()["avg"]
    avg_progress = conn.execute(
        "SELECT AVG(progress_percent) as avg FROM sessions WHERE status = 'completed'"
    ).fetchone()["avg"]
    total_minutes = conn.execute(
        "SELECT SUM(rolled_minutes) as s FROM sessions WHERE status = 'completed'"
    ).fetchone()["s"]
    conn.close()
    return {
        "total": total or 0,
        "completed": completed or 0,
        "cancelled": cancelled or 0,
        "avg_satisfaction": round(avg_satisfaction, 2) if avg_satisfaction else 0,
        "avg_progress": round(avg_progress, 1) if avg_progress else 0,
        "total_minutes": total_minutes or 0,
    }


def get_weekly():
    conn = get_connection()
    rows = conn.execute("""
        SELECT date(created_at) as day,
               COUNT(*) as total,
               SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled,
               AVG(CASE WHEN status='completed' THEN progress_percent END) as avg_progress,
               AVG(CASE WHEN status='completed' THEN satisfaction_rating END) as avg_satisfaction
        FROM sessions
        WHERE created_at >= date('now', '-7 days')
        GROUP BY day
        ORDER BY day
    """).fetchall()
    conn.close()
    return _dict_rows(rows)


def get_monthly():
    conn = get_connection()
    rows = conn.execute("""
        SELECT strftime('%Y-%m', created_at) as month,
               COUNT(*) as total,
               SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled,
               AVG(CASE WHEN status='completed' THEN progress_percent END) as avg_progress,
               AVG(CASE WHEN status='completed' THEN satisfaction_rating END) as avg_satisfaction
        FROM sessions
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
    """).fetchall()
    rows.reverse()
    conn.close()
    return _dict_rows(rows)


def get_satisfaction_heatmap():
    conn = get_connection()
    rows = conn.execute("""
        SELECT CAST(strftime('%w', created_at) AS INTEGER) as weekday,
               CAST(strftime('%H', created_at) AS INTEGER) as hour,
               AVG(satisfaction_rating) as avg_satisfaction,
               COUNT(*) as count
        FROM sessions
        WHERE status = 'completed'
        GROUP BY weekday, hour
        ORDER BY weekday, hour
    """).fetchall()
    conn.close()
    return _dict_rows(rows)


def get_progress_by_duration():
    conn = get_connection()
    rows = conn.execute("""
        SELECT rolled_minutes,
               AVG(progress_percent) as avg_progress,
               COUNT(*) as count
        FROM sessions
        WHERE status = 'completed'
        GROUP BY rolled_minutes
        ORDER BY rolled_minutes
    """).fetchall()
    conn.close()
    return _dict_rows(rows)


def get_progress_by_weekday():
    conn = get_connection()
    rows = conn.execute("""
        SELECT CAST(strftime('%w', created_at) AS INTEGER) as weekday,
               AVG(progress_percent) as avg_progress,
               AVG(satisfaction_rating) as avg_satisfaction,
               COUNT(*) as count
        FROM sessions
        WHERE status = 'completed'
        GROUP BY weekday
        ORDER BY weekday
    """).fetchall()
    conn.close()
    return _dict_rows(rows)


def get_daily_streaks():
    conn = get_connection()
    rows = conn.execute("""
        SELECT DISTINCT date(created_at) as day
        FROM sessions
        ORDER BY day DESC
    """).fetchall()
    conn.close()
    days = [r["day"] for r in rows]
    if not days:
        return {"current_streak": 0, "longest_streak": 0}
    current = 1
    longest = 1
    streak = 1
    for i in range(1, len(days)):
        d1 = dt.datetime.strptime(days[i], "%Y-%m-%d").date()
        d2 = dt.datetime.strptime(days[i - 1], "%Y-%m-%d").date()
        if (d2 - d1).days == 1:
            streak += 1
            longest = max(longest, streak)
        else:
            streak = 1
    today = dt.date.today()
    if days:
        last = dt.datetime.strptime(days[0], "%Y-%m-%d").date()
        if (today - last).days > 1:
            current = 0
        else:
            current = 1
            for i in range(1, len(days)):
                d1 = dt.datetime.strptime(days[i], "%Y-%m-%d").date()
                d2 = dt.datetime.strptime(days[i - 1], "%Y-%m-%d").date()
                if (d2 - d1).days == 1:
                    current += 1
                else:
                    break
    return {"current_streak": current, "longest_streak": longest}


def get_keyword_clusters():
    conn = get_connection()
    rows = conn.execute(
        "SELECT task FROM sessions WHERE status = 'completed' AND task IS NOT NULL AND task != ''"
    ).fetchall()
    conn.close()
    stopwords = {
        "the", "a", "an", "is", "in", "it", "of", "to", "and", "for", "on", "with",
        "this", "that", "i", "my", "me", "be", "was", "will", "do", "at", "by",
    }
    word_counts = {}
    for row in rows:
        task = row["task"].lower()
        words = task.replace(",", " ").replace(".", " ").replace(":", " ").replace(";", " ").split()
        for w in words:
            w = w.strip("!@#$%^&*()-_=+[]{}|\\'\"<>/?`~")
            if len(w) > 2 and w not in stopwords:
                word_counts[w] = word_counts.get(w, 0) + 1
    sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:30]
    return [{"word": w, "count": c} for w, c in sorted_words]
