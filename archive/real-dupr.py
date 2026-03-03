import re
import sys
import math
import csv

import numpy as np

D_SCALE_DEFAULT = 1.46  # logistic scale; tweak if you want


def read_multiline_from_stdin():
    print("Paste the DUPR dashboard text now. When done, press Ctrl-D (Mac/Linux) or Ctrl-Z then Enter (Windows).")
    data = sys.stdin.read()
    return data


def split_into_match_blocks(raw_text: str):
    # Split by occurrences of ID: .... Each block ends at ID line.
    # Keep the ID line inside the block for reference.
    blocks = []
    buf = []
    for line in raw_text.splitlines():
        buf.append(line.rstrip("\n"))
        if re.search(r"\bID:\s*[A-Z0-9]+\b", line):
            block = "\n".join(buf).strip()
            if block:
                blocks.append(block)
            buf = []
    # If leftover without ID, ignore (usually incomplete copy/paste)
    return blocks


def is_float_line(s: str):
    s = s.strip()
    # Accept "3.277" etc
    return bool(re.fullmatch(r"[0-9]+\.[0-9]+", s))


def is_int_score_line(s: str):
    s = s.strip()
    # Scores are small ints; DUPR deltas like "-.019" won't match
    return bool(re.fullmatch(r"\d{1,2}", s))


def extract_match_from_block(block: str):
    lines = [ln.strip() for ln in block.splitlines()]
    lines = [ln for ln in lines if ln != ""]

    match_id = None
    for ln in lines:
        m = re.search(r"\bID:\s*([A-Z0-9]+)\b", ln)
        if m:
            match_id = m.group(1)
            break

    # Scan lines in order, identify (name, rating) pairs where next line is float.
    players = []
    scores = []

    i = 0
    while i < len(lines):
        ln = lines[i]

        if is_int_score_line(ln):
            scores.append(int(ln))
            i += 1
            continue

        # Candidate name line if next line is a float rating
        if i + 1 < len(lines) and is_float_line(lines[i + 1]):
            name = ln
            rating = float(lines[i + 1])
            players.append((name, rating))
            i += 2
            continue

        i += 1

    # We expect 4 players and 2 scores, in the typical order:
    # (A1, A2, scoreA, B1, B2, scoreB)
    # But extra name/rating pairs can appear rarely; we take the first 4 after the first appears.
    if len(players) < 4 or len(scores) < 2:
        return None

    p4 = players[:4]
    s2 = scores[:2]

    team_a_p1, team_a_p2 = p4[0], p4[1]
    team_b_p1, team_b_p2 = p4[2], p4[3]
    score_a, score_b = s2[0], s2[1]

    return {
        "id": match_id or "",
        "team_a_p1_name": team_a_p1[0],
        "team_a_p1_rating": team_a_p1[1],
        "team_a_p2_name": team_a_p2[0],
        "team_a_p2_rating": team_a_p2[1],
        "team_b_p1_name": team_b_p1[0],
        "team_b_p1_rating": team_b_p1[1],
        "team_b_p2_name": team_b_p2[0],
        "team_b_p2_rating": team_b_p2[1],
        "score_a": score_a,
        "score_b": score_b,
    }


def expected_share(team_you, team_opp, d):
    # Elo logistic (base 10)
    return 1.0 / (1.0 + 10.0 ** (-(team_you - team_opp) / d))


def build_observations(matches, user_name):
    # For each match, figure out which team the user is on and who their partner is.
    # User rating is treated as unknown x; partner/opponents use the displayed ratings.
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

        # Determine where user is
        names = [a1n, a2n, b1n, b2n]
        names_lower = [x.strip().lower() for x in names]

        if user_lower not in names_lower:
            continue

        idx = names_lower.index(user_lower)

        # Team A indices 0,1 ; Team B indices 2,3
        if idx in (0, 1):
            # user on Team A
            if idx == 0:
                partner_rating = a2r
            else:
                partner_rating = a1r
            opp_team_rating = (b1r + b2r) / 2.0
            you_points = sa
        else:
            # user on Team B
            if idx == 2:
                partner_rating = b2r
            else:
                partner_rating = b1r
            opp_team_rating = (a1r + a2r) / 2.0
            you_points = sb

        obs.append({
            "partner_rating": float(partner_rating),
            "opp_team_rating": float(opp_team_rating),
            "you_points": int(you_points),
            "total_points": int(npts),
            "match_id": m["id"],
        })

    return obs


def neg_log_likelihood(x, observations, d):
    # Binomial-style likelihood on points
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

    # Try scipy; else grid search
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
        if not res.success:
            # fallback
            raise RuntimeError("scipy minimize failed")
        return float(res.x[0])

    except Exception:
        lo, hi = bounds
        # Coarse then refine
        grid1 = np.linspace(lo, hi, 1201)  # step ~0.005 if range 6
        vals1 = np.array([neg_log_likelihood(x, observations, d) for x in grid1])
        x0 = float(grid1[int(vals1.argmin())])

        # refine around best
        lo2 = max(lo, x0 - 0.25)
        hi2 = min(hi, x0 + 0.25)
        grid2 = np.linspace(lo2, hi2, 2001)
        vals2 = np.array([neg_log_likelihood(x, observations, d) for x in grid2])
        x1 = float(grid2[int(vals2.argmin())])
        return x1


def write_csv(matches, path="dupr_parsed.csv"):
    headers = [
        "match_id",
        "team_a_p1_name", "team_a_p1_rating",
        "team_a_p2_name", "team_a_p2_rating",
        "team_b_p1_name", "team_b_p1_rating",
        "team_b_p2_name", "team_b_p2_rating",
        "score_a", "score_b",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for m in matches:
            w.writerow({
                "match_id": m["id"],
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
            })


def main():
    user_name = input("Enter your name EXACTLY as shown in DUPR (case-insensitive match is ok): ").strip()
    if not user_name:
        print("No name provided. Exiting.")
        return

    d_in = input(f"Optional: enter d scale (press Enter to use {D_SCALE_DEFAULT}): ").strip()
    d = D_SCALE_DEFAULT
    if d_in:
        try:
            d = float(d_in)
        except ValueError:
            print("Invalid d; using default.")

    raw = read_multiline_from_stdin()
    if not raw.strip():
        print("No text pasted. Exiting.")
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
        print("Parsed 0 matches. Check your pasted text format.")
        return

    write_csv(parsed, "dupr_parsed.csv")
    print(f"Parsed matches: {len(parsed)}. Skipped blocks: {skipped}. Saved: dupr_parsed.csv")

    observations = build_observations(parsed, user_name)
    if not observations:
        print("No matches contained your name (or parsing failed to capture it).")
        return

    est = fit_rating(observations, d=d, bounds=(1.0, 7.0))
    if est is None:
        print("Could not estimate rating.")
        return

    print(f"Estimated DUPR for '{user_name}' (treating your displayed rating as unknown): {est:.3f}")
    print(f"Matches used for estimate (where your name appeared): {len(observations)}")


if __name__ == "__main__":
    main()
