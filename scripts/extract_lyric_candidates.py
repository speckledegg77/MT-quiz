import argparse
import csv
import io
import os
import re
import sys
import unicodedata
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Iterable, List, Optional, Tuple

STOPWORDS = {
    "a", "an", "and", "as", "at", "be", "but", "by", "for", "from", "in", "into",
    "is", "it", "its", "me", "my", "of", "on", "or", "our", "so", "that", "the",
    "their", "this", "to", "up", "we", "with", "you", "your"
}

LABEL_ONLY_RE = re.compile(
    r"^\s*[\[(]?\s*(verse|chorus|refrain|bridge|intro|outro|tag|hook|pre-chorus|post-chorus|reprise|spoken|instrumental|dance break)"
    r"(\s*\d+)?\s*[\])\-:]*\s*$",
    re.IGNORECASE,
)

BRACKETED_RE = re.compile(r"^\s*[\[(].*?[\])]\s*$")
WHITESPACE_RE = re.compile(r"\s+")
NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")
MULTI_SPACE_RE = re.compile(r"\s+")


@dataclass
class SongFile:
    source_file: str
    show_title: str
    song_title: str
    lines: List[str]


@dataclass
class Candidate:
    show_title: str
    song_title: str
    lines_count: int
    excerpt: str
    title_echo_exact: bool
    title_echo_partial: bool
    show_echo: bool
    score: int
    source_file: str


def normalise_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.replace("&", " and ")
    value = value.lower()
    value = NON_ALNUM_RE.sub(" ", value)
    value = MULTI_SPACE_RE.sub(" ", value).strip()
    return value


def significant_words(value: str) -> List[str]:
    words = normalise_text(value).split()
    return [w for w in words if len(w) >= 4 and w not in STOPWORDS]


def is_probably_label(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if LABEL_ONLY_RE.match(stripped):
        return True
    if BRACKETED_RE.match(stripped) and len(stripped) <= 40:
        return True
    if stripped.isupper() and len(stripped.split()) <= 4:
        return True
    return False


def clean_line(line: str) -> Optional[str]:
    line = line.replace("\ufeff", "").strip()
    line = line.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    line = WHITESPACE_RE.sub(" ", line).strip()
    if not line:
        return None
    if is_probably_label(line):
        return None
    return line


def parse_show_and_song_from_filename(path_in_zip: str) -> Tuple[str, str]:
    stem = PurePosixPath(path_in_zip).stem.strip()

    # Common patterns:
    # Show; Song
    # Show - Song
    # Show — Song
    # Show _ Song
    for sep in [";", " - ", " — ", " – ", " _ "]:
        if sep in stem:
            left, right = stem.split(sep, 1)
            return left.strip(), right.strip()

    # Fallback: whole stem as song, unknown show
    return "", stem


def parse_structured_first_line(text: str) -> Optional[Tuple[str, str]]:
    for raw_line in text.splitlines():
        line = raw_line.strip().strip(";")
        if not line:
            continue
        parts = [p.strip() for p in line.split(";")]
        if len(parts) >= 2 and parts[0] and parts[1]:
            return parts[0], parts[1]
        break
    return None


def dedupe_preserve_order(lines: Iterable[str]) -> List[str]:
    seen = set()
    out = []
    for line in lines:
        if line not in seen:
            seen.add(line)
            out.append(line)
    return out


def extract_song_file(zipf: zipfile.ZipFile, name: str) -> Optional[SongFile]:
    if not name.lower().endswith((".txt", ".md", ".lrc")):
        return None

    raw = zipf.read(name)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="ignore")

    first_line_meta = parse_structured_first_line(text)
    file_show, file_song = parse_show_and_song_from_filename(name)

    if first_line_meta:
        show_title, song_title = first_line_meta
        body_lines = text.splitlines()[1:]
    else:
        show_title, song_title = file_show, file_song
        body_lines = text.splitlines()

    cleaned = []
    for line in body_lines:
        cleaned_line = clean_line(line)
        if cleaned_line:
            cleaned.append(cleaned_line)

    # Keep repeats in the lyric body, but if the whole file is very messy,
    # remove exact repeated adjacent lines to reduce chorus spam.
    reduced = []
    prev = None
    for line in cleaned:
        if line != prev:
            reduced.append(line)
        prev = line

    if not song_title:
        return None

    return SongFile(
        source_file=name,
        show_title=show_title or "",
        song_title=song_title,
        lines=reduced,
    )


def title_flags(song_title: str, excerpt: str) -> Tuple[bool, bool]:
    song_norm = normalise_text(song_title)
    excerpt_norm = normalise_text(excerpt)

    exact = bool(song_norm and song_norm in excerpt_norm)

    title_words = significant_words(song_title)
    excerpt_words = set(excerpt_norm.split())

    partial_hits = [w for w in title_words if w in excerpt_words]
    partial = len(partial_hits) >= 1 if title_words else False

    return exact, partial


def show_flag(show_title: str, excerpt: str) -> bool:
    if not show_title:
        return False
    show_words = significant_words(show_title)
    excerpt_words = set(normalise_text(excerpt).split())
    return any(w in excerpt_words for w in show_words)


def score_candidate(
    song_title: str,
    show_title: str,
    excerpt_lines: List[str],
    repeated_windows: Counter,
) -> Tuple[int, bool, bool, bool]:
    excerpt = " | ".join(excerpt_lines)
    exact, partial, show_echo = title_flags(song_title, excerpt)
    show_echo = show_echo or show_flag(show_title, excerpt)

    score = 100

    # Prefer 2 lines, then 3, then 1
    if len(excerpt_lines) == 2:
        score += 10
    elif len(excerpt_lines) == 3:
        score += 6
    else:
        score += 2

    # Penalise title echoes heavily
    if exact:
        score -= 100
    elif partial:
        score -= 25

    # Penalise show-name echoes
    if show_echo:
        score -= 20

    # Penalise very short excerpts
    joined = " ".join(excerpt_lines)
    word_count = len(joined.split())
    if word_count < 5:
        score -= 30
    elif word_count < 8:
        score -= 12

    # Penalise repetitive punctuation / obvious hooks
    if joined.count("!") >= 2:
        score -= 8
    if joined.count("?") >= 2:
        score -= 8

    # Penalise repeated windows
    repeated_key = normalise_text(excerpt)
    if repeated_windows[repeated_key] > 1:
        score -= 20

    # Slight penalty for a line ending with ellipsis or obvious truncation
    if any(line.endswith("...") for line in excerpt_lines):
        score -= 10

    return score, exact, partial, show_echo


def build_candidates(song: SongFile) -> List[Candidate]:
    candidates: List[Candidate] = []

    if not song.lines:
        return candidates

    all_windows = []
    for size in (1, 2, 3):
        for i in range(len(song.lines) - size + 1):
            excerpt_lines = song.lines[i:i + size]
            excerpt = " | ".join(excerpt_lines)
            all_windows.append(normalise_text(excerpt))
    repeated_windows = Counter(all_windows)

    for size in (1, 2, 3):
        for i in range(len(song.lines) - size + 1):
            excerpt_lines = song.lines[i:i + size]
            score, exact, partial, show_echo = score_candidate(
                song.song_title,
                song.show_title,
                excerpt_lines,
                repeated_windows,
            )
            candidates.append(
                Candidate(
                    show_title=song.show_title,
                    song_title=song.song_title,
                    lines_count=size,
                    excerpt=" | ".join(excerpt_lines),
                    title_echo_exact=exact,
                    title_echo_partial=partial,
                    show_echo=show_echo,
                    score=score,
                    source_file=song.source_file,
                )
            )

    # Highest score first, then shorter local path for stability
    candidates.sort(
        key=lambda c: (
            -c.score,
            c.title_echo_exact,
            c.title_echo_partial,
            c.show_echo,
            c.lines_count,
            c.source_file.lower(),
        )
    )
    return candidates


def write_review_csv(out_path: str, songs: List[SongFile], top_n: int) -> None:
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "show_title",
            "song_title",
            "candidate_rank",
            "lines_count",
            "lyric_excerpt",
            "title_echo_exact",
            "title_echo_partial",
            "show_echo",
            "score",
            "source_file",
        ])

        for song in songs:
            candidates = build_candidates(song)
            for rank, candidate in enumerate(candidates[:top_n], start=1):
                writer.writerow([
                    candidate.show_title,
                    candidate.song_title,
                    rank,
                    candidate.lines_count,
                    candidate.excerpt,
                    "yes" if candidate.title_echo_exact else "no",
                    "yes" if candidate.title_echo_partial else "no",
                    "yes" if candidate.show_echo else "no",
                    candidate.score,
                    candidate.source_file,
                ])


def write_best_only_csv(out_path: str, songs: List[SongFile]) -> None:
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "show_title",
            "song_title",
            "best_excerpt",
            "lines_count",
            "title_echo_exact",
            "title_echo_partial",
            "show_echo",
            "score",
            "source_file",
        ])

        for song in songs:
            candidates = build_candidates(song)
            if not candidates:
                writer.writerow([song.show_title, song.song_title, "", "", "", "", "", "", song.source_file])
                continue
            best = candidates[0]
            writer.writerow([
                best.show_title,
                best.song_title,
                best.excerpt,
                best.lines_count,
                "yes" if best.title_echo_exact else "no",
                "yes" if best.title_echo_partial else "no",
                "yes" if best.show_echo else "no",
                best.score,
                best.source_file,
            ])


def write_summary(out_path: str, songs: List[SongFile]) -> None:
    total = len(songs)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"Songs processed: {total}\n")
        f.write("\n")
        missing_show = [s for s in songs if not s.show_title]
        if missing_show:
            f.write("Files with missing show title:\n")
            for s in missing_show:
                f.write(f"- {s.source_file} -> song: {s.song_title}\n")
            f.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract candidate lyric excerpts from a zip of lyric files.")
    parser.add_argument("zip_path", help="Path to the zip file containing lyric text files")
    parser.add_argument("--top-n", type=int, default=5, help="How many candidate excerpts per song to export")
    parser.add_argument("--out-dir", default="lyric_review_output", help="Output folder")
    args = parser.parse_args()

    zip_path = args.zip_path
    out_dir = args.out_dir
    top_n = max(1, args.top_n)

    if not os.path.exists(zip_path):
        print(f"File not found: {zip_path}", file=sys.stderr)
        return 1

    os.makedirs(out_dir, exist_ok=True)

    songs: List[SongFile] = []
    with zipfile.ZipFile(zip_path, "r") as zipf:
        for name in zipf.namelist():
            if name.endswith("/"):
                continue
            song = extract_song_file(zipf, name)
            if song:
                songs.append(song)

    songs.sort(key=lambda s: (s.show_title.lower(), s.song_title.lower(), s.source_file.lower()))

    review_csv = os.path.join(out_dir, "lyric_candidates_review.csv")
    best_csv = os.path.join(out_dir, "lyric_best_candidates.csv")
    summary_txt = os.path.join(out_dir, "lyric_extraction_summary.txt")

    write_review_csv(review_csv, songs, top_n=top_n)
    write_best_only_csv(best_csv, songs)
    write_summary(summary_txt, songs)

    print("Done.")
    print(f"Review CSV: {review_csv}")
    print(f"Best-candidates CSV: {best_csv}")
    print(f"Summary: {summary_txt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())