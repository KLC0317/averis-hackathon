# Benchmark notes

The attached public bundle and the organizer Docker package use slightly
different operational conventions. The product follows one content-based
policy and records the differences here rather than adding email-ID-specific
compatibility rules.

- A comparison request with a missing SI or BL remains `NEEDS_REVIEW` with an
  actionable reason. The application never infers a successful comparison from
  the email subject or attachment count.
- Some organizer README examples describe main-set requests without attachments
  as `OK`; that convention is not evidence that seven fields were compared.
- Image-only PDFs are attempted through OCR when available. A successful,
  evidence-backed OCR read may therefore differ from a blanket “image PDF means
  review” shortcut.
- A supposed BL whose content is clearly an invoice is `wrong_doc_type`, even if
  the filename ends in `_BL`.
- Reliability counters in the supplied scorer are diagnostic and do not fully
  validate evidence quality or review usefulness. Local strict validation still
  applies.

Reported scores must include the exact export hash, policy version, evaluator
version/hash, and timestamp. A score from one export must never be displayed as
the score of a later run.

