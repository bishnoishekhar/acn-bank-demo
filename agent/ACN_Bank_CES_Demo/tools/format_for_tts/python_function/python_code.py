import re
from typing import Any

MONTH_NAMES_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"]
MONTH_NAMES_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]

def format_for_tts(text: str, language: str = "en-CA") -> dict[str, Any]:
    """Expands currency, dates, numbers for natural TTS speech.
Internal text-formatting utility — called silently. Do NOT speak any pacing phrase; the tool output IS what the agent speaks.
"""
    if not text:
        return {"status": "validation_error", "code": "MISSING_TEXT", "data": {"formattedText": ""}}

    formatted = text

    # V-1: Currency amounts — $1,234.56 → "one thousand two hundred thirty-four dollars and fifty-six cents"
    def _format_currency(match: re.Match) -> str:
        raw = match.group(0).replace("$", "").replace(",", "")
        try:
            amount = float(raw)
            dollars = int(amount)
            cents = round((amount - dollars) * 100)
            if language.startswith("fr"):
                dollar_word = "dollar" if dollars == 1 else "dollars"
                cent_word = "cent" if cents == 1 else "cents"
                parts = [_number_to_words_fr(dollars) + f" {dollar_word}"]
                if cents > 0:
                    parts.append(_number_to_words_fr(cents) + f" {cent_word}")
            else:
                dollar_word = "dollar" if dollars == 1 else "dollars"
                cent_word = "cent" if cents == 1 else "cents"
                parts = [_number_to_words(dollars) + f" {dollar_word}"]
                if cents > 0:
                    parts.append(_number_to_words(cents) + f" {cent_word}")
            return " and ".join(parts) if not language.startswith("fr") else " et ".join(parts)
        except Exception:
            return match.group(0)

    formatted = re.sub(r'\$[\d,]+(?:\.\d{2})?', _format_currency, formatted)

    # V-2: Dates YYYY-MM-DD → "September 30th, 2026"
    def _format_date(match: re.Match) -> str:
        try:
            y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
            month_list = MONTH_NAMES_FR if language.startswith("fr") else MONTH_NAMES_EN
            month_name = month_list[m - 1]
            suffix = _ordinal_suffix(d)
            if language.startswith("fr"):
                return f"le {d} {month_name} {y}"
            return f"{month_name} {d}{suffix}, {y}"
        except Exception:
            return match.group(0)

    formatted = re.sub(r'(\d{4})-(\d{2})-(\d{2})', _format_date, formatted)

    # V-3: Strip markdown
    formatted = re.sub(r'[*_`#\[\]{}|]', '', formatted)
    formatted = re.sub(r'\n+', ' ', formatted)

    # V-4: Account/card numbers last-4 only (already masked)
    # V-5: Percentages — 4.99% → "four point nine nine percent"
    def _format_percent(match: re.Match) -> str:
        try:
            val = float(match.group(1))
            if language.startswith("fr"):
                return f"{_number_to_words_fr(val)} pour cent"
            return f"{_number_to_words_float(val)} percent"
        except Exception:
            return match.group(0)

    formatted = re.sub(r'([\d.]+)%', _format_percent, formatted)

    return {
        "status": "success",
        "data": {
            "originalText": text,
            "formattedText": formatted.strip(),
            "language": language
        }
    }


def _ordinal_suffix(n: int) -> str:
    if 11 <= (n % 100) <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def _number_to_words(n: float) -> str:
    """Simple English number-to-words for amounts up to 999,999."""
    n = int(n)
    ones = ["", "one","two","three","four","five","six","seven","eight","nine",
            "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen",
            "seventeen","eighteen","nineteen"]
    tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"]
    if n == 0:
        return "zero"
    if n < 20:
        return ones[n]
    if n < 100:
        return tens[n // 10] + ("-" + ones[n % 10] if n % 10 else "")
    if n < 1000:
        return ones[n // 100] + " hundred" + (" " + _number_to_words(n % 100) if n % 100 else "")
    if n < 1_000_000:
        return _number_to_words(n // 1000) + " thousand" + (" " + _number_to_words(n % 1000) if n % 1000 else "")
    return str(n)


def _number_to_words_float(n: float) -> str:
    parts = str(n).split(".")
    result = _number_to_words(int(parts[0]))
    if len(parts) > 1 and parts[1] != "0":
        result += " point " + " ".join(_number_to_words(int(d)) for d in parts[1])
    return result


def _number_to_words_fr(n: float) -> str:
    """Simplified French number-to-words stub."""
    return str(int(n))

# agent_action: "An unexpected error occurred — please inform the customer and try again."
