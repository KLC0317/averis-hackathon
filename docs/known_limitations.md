# Known limitations

- The source bundle has no dependable arrival timestamps, staffing records,
  thread IDs, or handling-time history. Any import timestamp is labeled as a
  local event, not email arrival time.
- A real human-effort study has not been run by the repository setup. The UI
  may instrument active review time, but it must report savings as pending until
  observed participants complete matched tasks.
- OCR quality depends on a locally installed Tesseract executable and language
  data. When unavailable or inconclusive, the source remains visible and the
  case stays in review.
- Fuzzy entity matching is review assistance only. It cannot automatically
  convert different party names into a match.
- Local SQLite and one worker target reproducible single-host judging. This is
  not a distributed or multi-tenant production deployment.
- Draft correction and information-request text is editable for copying or
  downloading; the application does not send email or approve a legal shipping
  document.
- Organizer scoring is optional and externally owned. The application cannot
  claim a score, quality level, or business savings until the corresponding
  export or human trial has actually run. Local check artifacts are hashes,
  counts, and validation evidence only; they are not organizer scores,
  screenshots, OCR-success rates, or human-study results.

