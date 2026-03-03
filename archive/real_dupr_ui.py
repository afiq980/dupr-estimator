import csv
import math
import re
import tkinter as tk
from datetime import date, datetime
from tkinter import messagebox, scrolledtext

import numpy as np

D_SCALE_DEFAULT = 1.46


def split_into_match_blocks(raw_text: str):
    blocks = []
    buf = []
    for line in raw_text.splitlines():
        buf.append(line.rstrip("\n"))
        if re.search(r"\bID:\s*[A-Z0-9]+\b", line):
            block = "\n".join(buf).strip()
            if block:
                blocks.append(block)
            buf = []
    return blocks


def is_float_line(s: str):
    return bool(re.fullmatch(r"[0-9]+\.[0-9]+", s.strip()))


def is_int_score_line(s: str):
    return bool(re.fullmatch(r"\d{1,2}", s.strip()))


def parse_date_token(token: str):
    token = token.strip().replace(".", "")
    fmts = [
        "%m/%d/%Y",
        "%m/%d/%y",
        "%m-%d-%Y",
        "%m-%d-%y",
        "%Y-%m-%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%b %d %Y",
        "%B %d %Y",
    ]
    for fmt in fmts:
        try:
            return datetime.strptime(token, fmt).date()
        except ValueError:
            continue
    return None


def extract_match_date(lines):
    joined = " ".join(lines)
    patterns = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{4}-\d{1,2}-\d{1,2}\b",
        r"\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|"
        r"January|February|March|April|May|June|July|August|September|October|November|December)-\d{4}\b",
        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|"
        r"January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b",
    ]
    for pat in patterns:
        for token in re.findall(pat, joined, flags=re.IGNORECASE):
            normalized = re.sub(r"\bSept\b", "Sep", token, flags=re.IGNORECASE)
            parsed = parse_date_token(normalized)
            if parsed is not None:
                return parsed
    return None


def extract_event_name(lines):
    month_pat = (
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|"
        r"January|February|March|April|May|June|July|August|September|October|November|December)"
    )
    date_pats = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{4}-\d{1,2}-\d{1,2}\b",
        r"\b" + month_pat + r"\s+\d{1,2}(?:,\s*\d{4})?\b",
        r"\b\d{1,2}\s+" + month_pat + r"(?:\s+\d{4})?\b",
    ]
    relative_terms = ("yesterday", "today", "ago")

    def looks_like_date_line(text):
        t = text.strip()
        if not t:
            return False
        low = t.lower()
        if any(term in low for term in relative_terms):
            return True
        for pat in date_pats:
            if re.search(pat, t, flags=re.IGNORECASE):
                return True
        return False

    for i, ln in enumerate(lines):
        if not looks_like_date_line(ln):
            continue
        j = i - 1
        while j >= 0:
            prev = lines[j].strip()
            if prev:
                if not is_int_score_line(prev) and not is_float_line(prev):
                    return prev
                break
            j -= 1
    return ""


def subtract_months(base_date: date, months: int):
    year = base_date.year
    month = base_date.month - months
    while month <= 0:
        month += 12
        year -= 1

    month_lengths = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    day = min(base_date.day, month_lengths[month - 1])
    return date(year, month, day)


def extract_match_from_block(block: str):
    lines = [ln.strip() for ln in block.splitlines()]
    lines = [ln for ln in lines if ln != ""]

    match_id = ""
    for ln in lines:
        m = re.search(r"\bID:\s*([A-Z0-9]+)\b", ln)
        if m:
            match_id = m.group(1)
            break

    match_date = extract_match_date(lines)
    event_name = extract_event_name(lines)

    players = []
    scores = []
    i = 0
    while i < len(lines):
        ln = lines[i]

        if is_int_score_line(ln):
            scores.append(int(ln))
            i += 1
            continue

        if i + 1 < len(lines) and is_float_line(lines[i + 1]):
            players.append((ln, float(lines[i + 1])))
            i += 2
            continue

        i += 1

    if len(players) < 4 or len(scores) < 2:
        return None

    p4 = players[:4]
    s2 = scores[:2]

    return {
        "id": match_id,
        "match_date": match_date,
        "event_name": event_name,
        "team_a_p1_name": p4[0][0],
        "team_a_p1_rating": p4[0][1],
        "team_a_p2_name": p4[1][0],
        "team_a_p2_rating": p4[1][1],
        "team_b_p1_name": p4[2][0],
        "team_b_p1_rating": p4[2][1],
        "team_b_p2_name": p4[3][0],
        "team_b_p2_rating": p4[3][1],
        "score_a": s2[0],
        "score_b": s2[1],
    }


def expected_share(team_you, team_opp, d):
    return 1.0 / (1.0 + 10.0 ** (-(team_you - team_opp) / d))


def build_observations(matches, user_name):
    obs = []
    user_lower = user_name.strip().lower()

    for m in matches:
        a1n = m["team_a_p1_name"]
        a1r = m["team_a_p1_rating"]
        a2n = m["team_a_p2_name"]
        a2r = m["team_a_p2_rating"]
        b1n = m["team_b_p1_name"]
        b1r = m["team_b_p1_rating"]
        b2n = m["team_b_p2_name"]
        b2r = m["team_b_p2_rating"]
        sa = m["score_a"]
        sb = m["score_b"]

        npts = sa + sb
        if npts <= 0:
            continue

        names = [a1n, a2n, b1n, b2n]
        names_lower = [x.strip().lower() for x in names]
        if user_lower not in names_lower:
            continue

        idx = names_lower.index(user_lower)
        if idx in (0, 1):
            partner_rating = a2r if idx == 0 else a1r
            opp_team_rating = (b1r + b2r) / 2.0
            you_points = sa
        else:
            partner_rating = b2r if idx == 2 else b1r
            opp_team_rating = (a1r + a2r) / 2.0
            you_points = sb

        obs.append(
            {
                "partner_rating": float(partner_rating),
                "opp_team_rating": float(opp_team_rating),
                "you_points": int(you_points),
                "total_points": int(npts),
                "match_id": m["id"],
                "match_date": m.get("match_date"),
                "event_name": m.get("event_name", ""),
            }
        )
    return obs


def neg_log_likelihood(x, observations, d):
    x = float(x)
    total = 0.0
    for ob in observations:
        team_you = (x + ob["partner_rating"]) / 2.0
        team_opp = ob["opp_team_rating"]
        p = expected_share(team_you, team_opp, d)
        p = min(max(p, 1e-9), 1 - 1e-9)
        a = ob["you_points"]
        n = ob["total_points"]
        total -= a * math.log(p) + (n - a) * math.log(1 - p)
    return total


def fit_rating(observations, d, bounds=(1.0, 7.0)):
    if not observations:
        return None

    try:
        from scipy.optimize import minimize

        def f(z):
            return neg_log_likelihood(z[0], observations, d)

        res = minimize(
            f,
            x0=[3.5],
            bounds=[bounds],
            method="L-BFGS-B",
        )
        if res.success:
            return float(res.x[0])
    except Exception:
        pass

    lo, hi = bounds
    grid1 = np.linspace(lo, hi, 1201)
    vals1 = np.array([neg_log_likelihood(x, observations, d) for x in grid1])
    x0 = float(grid1[int(vals1.argmin())])

    lo2 = max(lo, x0 - 0.25)
    hi2 = min(hi, x0 + 0.25)
    grid2 = np.linspace(lo2, hi2, 2001)
    vals2 = np.array([neg_log_likelihood(x, observations, d) for x in grid2])
    return float(grid2[int(vals2.argmin())])


def filter_by_partner_gap(observations, reference_rating, max_gap):
    return [
        ob
        for ob in observations
        if abs(ob["partner_rating"] - reference_rating) <= max_gap
    ]


def estimate_with_partner_gap(observations, d, max_gap):
    baseline = fit_rating(observations, d=d, bounds=(1.0, 7.0)) if observations else None
    if baseline is None:
        return None, 0
    filtered = filter_by_partner_gap(observations, baseline, max_gap)
    est_filtered = fit_rating(filtered, d=d, bounds=(1.0, 7.0)) if filtered else None
    return est_filtered, len(filtered)


def filter_by_partner_relation(observations, reference_rating, relation):
    if relation == "lower":
        return [ob for ob in observations if ob["partner_rating"] < reference_rating]
    if relation == "higher":
        return [ob for ob in observations if ob["partner_rating"] > reference_rating]
    return []


def estimate_with_partner_relation(observations, d, relation):
    baseline = fit_rating(observations, d=d, bounds=(1.0, 7.0)) if observations else None
    if baseline is None:
        return None, 0
    filtered = filter_by_partner_relation(observations, baseline, relation)
    est_filtered = fit_rating(filtered, d=d, bounds=(1.0, 7.0)) if filtered else None
    return est_filtered, len(filtered)


def set_result_text(text: str):
    result_output.config(state=tk.NORMAL)
    result_output.delete("1.0", tk.END)
    result_output.insert(tk.END, text)
    result_output.config(state=tk.DISABLED)


def trend_word(lhs, rhs):
    if lhs is None or rhs is None:
        return "about the same"
    if lhs > rhs + 1e-6:
        return "better"
    if lhs < rhs - 1e-6:
        return "worse"
    return "about the same"


def detect_most_frequent_player_name(matches):
    counts = {}
    first_seen_index = {}
    idx = 0
    for m in matches:
        for key in (
            "team_a_p1_name",
            "team_a_p2_name",
            "team_b_p1_name",
            "team_b_p2_name",
        ):
            name = str(m.get(key, "")).strip()
            if not name:
                continue
            if name not in counts:
                counts[name] = 0
                first_seen_index[name] = idx
            counts[name] += 1
            idx += 1
    if not counts:
        return None
    return max(counts.keys(), key=lambda n: (counts[n], -first_seen_index[n]))


def write_csv(matches, path="dupr_parsed.csv"):
    headers = [
        "match_id",
        "match_date",
        "event_name",
        "team_a_p1_name",
        "team_a_p1_rating",
        "team_a_p2_name",
        "team_a_p2_rating",
        "team_b_p1_name",
        "team_b_p1_rating",
        "team_b_p2_name",
        "team_b_p2_rating",
        "score_a",
        "score_b",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for m in matches:
            w.writerow(
                {
                    "match_id": m["id"],
                    "match_date": m["match_date"].isoformat() if m.get("match_date") else "",
                    "event_name": m.get("event_name", ""),
                    "team_a_p1_name": m["team_a_p1_name"],
                    "team_a_p1_rating": m["team_a_p1_rating"],
                    "team_a_p2_name": m["team_a_p2_name"],
                    "team_a_p2_rating": m["team_a_p2_rating"],
                    "team_b_p1_name": m["team_b_p1_name"],
                    "team_b_p1_rating": m["team_b_p1_rating"],
                    "team_b_p2_name": m["team_b_p2_name"],
                    "team_b_p2_rating": m["team_b_p2_rating"],
                    "score_a": m["score_a"],
                    "score_b": m["score_b"],
                }
            )


def run_estimation():
    user_name = name_var.get().strip()

    d_text = d_var.get().strip()
    if d_text:
        try:
            d = float(d_text)
        except ValueError:
            messagebox.showerror("Invalid d scale", "d scale must be a number.")
            return
    else:
        d = D_SCALE_DEFAULT

    y_text = y_var.get().strip()
    if y_text:
        try:
            partner_gap = float(y_text)
            if partner_gap < 0:
                raise ValueError
        except ValueError:
            messagebox.showerror(
                "Invalid partner gap",
                "Partner gap Y must be a non-negative number.",
            )
            return
    else:
        partner_gap = 0.5

    raw = text_input.get("1.0", tk.END).strip()
    if not raw:
        messagebox.showerror("Missing Text", "Please paste your DUPR dashboard text.")
        return

    blocks = split_into_match_blocks(raw)
    parsed = []
    skipped = 0
    for b in blocks:
        m = extract_match_from_block(b)
        if m is None:
            skipped += 1
            continue
        parsed.append(m)

    if not parsed:
        messagebox.showerror("No Matches Parsed", "Could not parse any matches from your pasted text.")
        return

    auto_detected_name = False
    if not user_name:
        detected = detect_most_frequent_player_name(parsed)
        if not detected:
            messagebox.showerror(
                "Name Detection Failed",
                "Could not detect a player name from parsed matches. Please enter your DUPR name manually.",
            )
            return
        user_name = detected
        name_var.set(user_name)
        auto_detected_name = True

    write_csv(parsed, "dupr_parsed.csv")
    observations = build_observations(parsed, user_name)
    if not observations:
        messagebox.showerror(
            "Name Not Found",
            "No parsed matches contained your name. Check spelling exactly as in DUPR.",
        )
        return

    est = fit_rating(observations, d=d, bounds=(1.0, 7.0))
    if est is None:
        messagebox.showerror("Estimate Failed", "Could not estimate your rating.")
        return

    today = date.today()
    dated_obs_count = sum(1 for ob in observations if ob.get("match_date") is not None)
    month_only_estimates = {}
    for months in range(1, 7):
        window_start = subtract_months(today, months)
        window_end = today if months == 1 else subtract_months(today, months - 1)
        scoped_exact_month = [
            ob
            for ob in observations
            if (
                ob.get("match_date") is not None
                and ob["match_date"] >= window_start
                and ob["match_date"] < window_end
            )
        ]
        month_only_estimates[months] = (
            fit_rating(scoped_exact_month, d=d, bounds=(1.0, 7.0))
            if scoped_exact_month
            else None
        )

    available_month_points = sorted(
        [months for months, value in month_only_estimates.items() if value is not None]
    )
    latest_month = available_month_points[0] if available_month_points else None
    earliest_month = available_month_points[-1] if available_month_points else None
    latest_est = (
        month_only_estimates[latest_month] if latest_month is not None else None
    )
    earliest_est = (
        month_only_estimates[earliest_month] if earliest_month is not None else None
    )

    est_partner_all, cnt_partner_all = estimate_with_partner_gap(observations, d, partner_gap)
    est_lower_all, cnt_lower_all = estimate_with_partner_relation(
        observations, d, "lower"
    )
    est_higher_all, cnt_higher_all = estimate_with_partner_relation(
        observations, d, "higher"
    )

    lower_vs_higher_word = trend_word(est_lower_all, est_higher_all)
    close_vs_all_word = trend_word(est_partner_all, est)
    if earliest_est is None or latest_est is None:
        dupr_change_line = (
            f"You have changed your DUPR from not enough data to {est:.3f} since recent month(s) ago."
        )
    else:
        dupr_change_line = (
            f"You have changed your DUPR from {earliest_est:.3f} to {latest_est:.3f} "
            f"from {earliest_month} month(s) ago to {latest_month} month(s) ago."
        )

    two_month_cutoff = subtract_months(today, 2)
    observations_last_2m = [
        ob
        for ob in observations
        if ob.get("match_date") is not None and ob["match_date"] >= two_month_cutoff
    ]
    event_names_last_2m = []
    seen_events_2m = set()
    for ob in observations_last_2m:
        event_name = ob.get("event_name", "").strip()
        if not event_name or event_name in seen_events_2m:
            continue
        seen_events_2m.add(event_name)
        event_names_last_2m.append(event_name)

    event_estimates_last_2m = []
    for event_name in event_names_last_2m:
        event_obs = [
            ob
            for ob in observations_last_2m
            if ob.get("event_name", "").strip() == event_name
        ]
        event_est = fit_rating(event_obs, d=d, bounds=(1.0, 7.0)) if event_obs else None
        if event_est is not None:
            event_estimates_last_2m.append(event_est)

    if event_estimates_last_2m:
        min_event_est = min(event_estimates_last_2m)
        max_event_est = max(event_estimates_last_2m)
        last_2m_event_range_line = (
            f"You play with a DUPR rating of between {min_event_est:.3f} and {max_event_est:.3f} "
            "for the last 2 months."
        )
    else:
        last_2m_event_range_line = (
            "You play with a DUPR rating of between not enough data and not enough data "
            "for the last 2 months."
        )

    output_lines = [
        f"Using DUPR name: {user_name}{' (auto-detected)' if auto_detected_name else ''}",
        "",
        dupr_change_line,
        (
            f"You play {lower_vs_higher_word} when playing with teammates lower than you "
            "than with teammates higher than you."
        ),
        (
            f"You play {close_vs_all_word} when playing with teammates close to your rating."
        ),
        last_2m_event_range_line,
        "",
        f"DUPR estimates for '{user_name}':",
        f"All parsed matches: {est:.3f} (matches used: {len(observations)})",
        "",
    ]

    for months in range(1, 7):
        cutoff = subtract_months(today, months)
        scoped = [
            ob
            for ob in observations
            if ob.get("match_date") is not None and ob["match_date"] >= cutoff
        ]
        est_scoped = fit_rating(scoped, d=d, bounds=(1.0, 7.0)) if scoped else None
        if est_scoped is None:
            output_lines.append(
                f"If considering only last {months} months: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only last {months} months: {est_scoped:.3f} (matches used: {len(scoped)})"
            )

    output_lines.append("")
    output_lines.append("Specific month-only estimates (not cumulative):")
    for months in range(1, 7):
        window_start = subtract_months(today, months)
        window_end = today if months == 1 else subtract_months(today, months - 1)
        scoped_exact_month = [
            ob
            for ob in observations
            if (
                ob.get("match_date") is not None
                and ob["match_date"] >= window_start
                and ob["match_date"] < window_end
            )
        ]
        est_exact = (
            fit_rating(scoped_exact_month, d=d, bounds=(1.0, 7.0))
            if scoped_exact_month
            else None
        )
        if est_exact is None:
            output_lines.append(
                f"If considering only month {months} ago: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only month {months} ago: {est_exact:.3f} (matches used: {len(scoped_exact_month)})"
            )

    output_lines.append("")
    output_lines.append(
        f"Partner-close estimates (only matches with |partner - you| <= {partner_gap:g}):"
    )

    if est_partner_all is None:
        output_lines.append("All parsed matches with partner filter: not enough matches")
    else:
        output_lines.append(
            f"All parsed matches with partner filter: {est_partner_all:.3f} (matches used: {cnt_partner_all})"
        )

    for months in range(1, 7):
        cutoff = subtract_months(today, months)
        scoped = [
            ob
            for ob in observations
            if ob.get("match_date") is not None and ob["match_date"] >= cutoff
        ]
        est_partner_scoped, cnt_partner_scoped = estimate_with_partner_gap(
            scoped, d, partner_gap
        )
        if est_partner_scoped is None:
            output_lines.append(
                f"If considering only last {months} months with partner filter: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only last {months} months with partner filter: {est_partner_scoped:.3f} (matches used: {cnt_partner_scoped})"
            )

    output_lines.append("")
    output_lines.append(
        "Specific month-only partner-close estimates (not cumulative):"
    )
    for months in range(1, 7):
        window_start = subtract_months(today, months)
        window_end = today if months == 1 else subtract_months(today, months - 1)
        scoped_exact_month = [
            ob
            for ob in observations
            if (
                ob.get("match_date") is not None
                and ob["match_date"] >= window_start
                and ob["match_date"] < window_end
            )
        ]
        est_partner_exact, cnt_partner_exact = estimate_with_partner_gap(
            scoped_exact_month, d, partner_gap
        )
        if est_partner_exact is None:
            output_lines.append(
                f"If considering only month {months} ago with partner filter: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only month {months} ago with partner filter: {est_partner_exact:.3f} (matches used: {cnt_partner_exact})"
            )

    output_lines.append("")
    output_lines.append(
        "Teammate-lower-only estimates (only matches where partner DUPR is lower than you):"
    )
    if est_lower_all is None:
        output_lines.append("All parsed matches with lower-partner filter: not enough matches")
    else:
        output_lines.append(
            f"All parsed matches with lower-partner filter: {est_lower_all:.3f} (matches used: {cnt_lower_all})"
        )

    for months in range(1, 7):
        cutoff = subtract_months(today, months)
        scoped = [
            ob
            for ob in observations
            if ob.get("match_date") is not None and ob["match_date"] >= cutoff
        ]
        est_lower_scoped, cnt_lower_scoped = estimate_with_partner_relation(
            scoped, d, "lower"
        )
        if est_lower_scoped is None:
            output_lines.append(
                f"If considering only last {months} months with lower-partner filter: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only last {months} months with lower-partner filter: {est_lower_scoped:.3f} (matches used: {cnt_lower_scoped})"
            )

    output_lines.append("")
    output_lines.append(
        "Specific month-only teammate-lower estimates (not cumulative):"
    )
    for months in range(1, 7):
        window_start = subtract_months(today, months)
        window_end = today if months == 1 else subtract_months(today, months - 1)
        scoped_exact_month = [
            ob
            for ob in observations
            if (
                ob.get("match_date") is not None
                and ob["match_date"] >= window_start
                and ob["match_date"] < window_end
            )
        ]
        est_lower_exact, cnt_lower_exact = estimate_with_partner_relation(
            scoped_exact_month, d, "lower"
        )
        if est_lower_exact is None:
            output_lines.append(
                f"If considering only month {months} ago with lower-partner filter: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only month {months} ago with lower-partner filter: {est_lower_exact:.3f} (matches used: {cnt_lower_exact})"
            )

    output_lines.append("")
    output_lines.append(
        "Teammate-higher-only estimates (only matches where partner DUPR is higher than you):"
    )
    if est_higher_all is None:
        output_lines.append("All parsed matches with higher-partner filter: not enough matches")
    else:
        output_lines.append(
            f"All parsed matches with higher-partner filter: {est_higher_all:.3f} (matches used: {cnt_higher_all})"
        )

    for months in range(1, 7):
        cutoff = subtract_months(today, months)
        scoped = [
            ob
            for ob in observations
            if ob.get("match_date") is not None and ob["match_date"] >= cutoff
        ]
        est_higher_scoped, cnt_higher_scoped = estimate_with_partner_relation(
            scoped, d, "higher"
        )
        if est_higher_scoped is None:
            output_lines.append(
                f"If considering only last {months} months with higher-partner filter: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only last {months} months with higher-partner filter: {est_higher_scoped:.3f} (matches used: {cnt_higher_scoped})"
            )

    output_lines.append("")
    output_lines.append(
        "Specific month-only teammate-higher estimates (not cumulative):"
    )
    for months in range(1, 7):
        window_start = subtract_months(today, months)
        window_end = today if months == 1 else subtract_months(today, months - 1)
        scoped_exact_month = [
            ob
            for ob in observations
            if (
                ob.get("match_date") is not None
                and ob["match_date"] >= window_start
                and ob["match_date"] < window_end
            )
        ]
        est_higher_exact, cnt_higher_exact = estimate_with_partner_relation(
            scoped_exact_month, d, "higher"
        )
        if est_higher_exact is None:
            output_lines.append(
                f"If considering only month {months} ago with higher-partner filter: not enough dated matches"
            )
        else:
            output_lines.append(
                f"If considering only month {months} ago with higher-partner filter: {est_higher_exact:.3f} (matches used: {cnt_higher_exact})"
            )

    output_lines.extend(
        [
            "",
            "DUPR estimates by event name:",
        ]
    )
    event_names = []
    seen_events = set()
    for ob in observations:
        event_name = ob.get("event_name", "").strip()
        if not event_name or event_name in seen_events:
            continue
        seen_events.add(event_name)
        event_names.append(event_name)
    if not event_names:
        output_lines.append("No event names detected in parsed matches.")
    else:
        for event_name in event_names:
            event_obs = [
                ob for ob in observations if ob.get("event_name", "").strip() == event_name
            ]
            event_est = fit_rating(event_obs, d=d, bounds=(1.0, 7.0)) if event_obs else None
            if event_est is not None:
                output_lines.append(
                    f"{event_name}: {event_est:.3f} (matches used: {len(event_obs)})"
                )

    output_lines.extend(
        [
            "",
            f"Matches parsed: {len(parsed)} (skipped blocks: {skipped})",
            f"Matches with date detected: {dated_obs_count}",
            "Saved parsed rows to dupr_parsed.csv",
        ]
    )
    output = "\n".join(output_lines)
    set_result_text(output)


root = tk.Tk()
root.title("DUPR Estimator UI")
root.geometry("860x700")

name_var = tk.StringVar()
d_var = tk.StringVar(value=str(D_SCALE_DEFAULT))
y_var = tk.StringVar(value="0.2")

top_frame = tk.Frame(root, padx=12, pady=12)
top_frame.pack(fill=tk.X)

tk.Label(top_frame, text="Your DUPR Name:").grid(row=0, column=0, sticky="w")
name_entry = tk.Entry(top_frame, textvariable=name_var, width=40)
name_entry.grid(row=0, column=1, padx=8, sticky="w")

tk.Label(top_frame, text="d scale:").grid(row=0, column=2, sticky="w", padx=(16, 0))
d_entry = tk.Entry(top_frame, textvariable=d_var, width=12)
d_entry.grid(row=0, column=3, padx=8, sticky="w")

tk.Label(top_frame, text="Partner gap Y:").grid(row=0, column=4, sticky="w", padx=(16, 0))
y_entry = tk.Entry(top_frame, textvariable=y_var, width=12)
y_entry.grid(row=0, column=5, padx=8, sticky="w")

instructions = (
    "Paste your DUPR dashboard text below. "
    "Then click 'Estimate DUPR'. The app computes last 1-6 month estimates and partner-gap filtered estimates."
)
tk.Label(root, text=instructions, anchor="w", padx=12).pack(fill=tk.X)

text_input = scrolledtext.ScrolledText(root, wrap=tk.WORD, height=26, padx=10, pady=10)
text_input.pack(fill=tk.BOTH, expand=True, padx=12, pady=8)

button_row = tk.Frame(root, padx=12, pady=6)
button_row.pack(fill=tk.X)

estimate_btn = tk.Button(button_row, text="Estimate DUPR", command=run_estimation)
estimate_btn.pack(side=tk.LEFT)

clear_btn = tk.Button(button_row, text="Clear Text", command=lambda: text_input.delete("1.0", tk.END))
clear_btn.pack(side=tk.LEFT, padx=8)

result_output = scrolledtext.ScrolledText(root, wrap=tk.WORD, height=12, padx=10, pady=10)
result_output.pack(fill=tk.BOTH, expand=False, padx=12, pady=(0, 12))
result_output.insert(tk.END, "Paste dashboard text, then click Estimate DUPR.")
result_output.config(state=tk.DISABLED)

name_entry.focus_set()
root.mainloop()
