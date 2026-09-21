"use client";

import React, { useState } from "react";
import { GitBranch, LoaderCircle, Quote, ShieldQuestion, TriangleAlert } from "lucide-react";
import type { Arbitration } from "../types";
import { Button } from "./UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

/**
 * The gateway's internal score is a heuristic combining signal strength and
 * margin over the runner-up (or, for a model answer, hedging/evidence
 * penalties) - it has not been calibrated against measured outcomes, so it
 * is not a probability. Showing it as "73%" would claim a precision it does
 * not have. Three qualitative bands, always paired with the explanatory
 * caption below, avoid that false precision while still conveying strength.
 */
function confidenceBand(confidence: number | null): string | null {
  if (confidence == null) return null;
  if (confidence >= 0.7) return "strong internal signal";
  if (confidence >= 0.4) return "moderate internal signal";
  return "weak internal signal";
}

/**
 * A routing question the automated tiers could not settle, presented as a
 * decision rather than a flag: what is being asked, what each tier concluded
 * and on what evidence, and what follows from each answer.
 */
export function ArbitrationPanel({
  arbitration,
  onResolve,
  resolving = false,
  error = null
}: {
  arbitration: Arbitration;
  onResolve: (category: string) => void | Promise<void>;
  resolving?: boolean;
  error?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className="arbitration" aria-labelledby="arbitration-question">
      <div className="arbitration-head">
        <span className="arbitration-icon">
          <ShieldQuestion size={18} />
        </span>
        <div>
          <span className="eyebrow">ARBITRATION · AWAITING YOUR DECISION</span>
          <h2 id="arbitration-question">{arbitration.question}</h2>
          <p className="arbitration-why">
            <GitBranch size={13} /> {arbitration.whyEscalated}
          </p>
        </div>
      </div>

      {error && (
        <p className="arbitration-error" role="alert">
          <TriangleAlert size={13} /> {error}
        </p>
      )}

      <div className="arbitration-options">
        {arbitration.options.map((option) => (
          <button
            key={option.category}
            type="button"
            disabled={resolving}
            className={cx("arbitration-option", selected === option.category && "selected")}
            aria-pressed={selected === option.category}
            onClick={() => setSelected(option.category)}
          >
            <div className="arbitration-option-head">
              <strong>{option.category.replace(/_/g, " ")}</strong>
              <span className="arbitration-proposer">
                {option.proposedBy}
                {confidenceBand(option.confidence) && ` · ${confidenceBand(option.confidence)}`}
              </span>
            </div>
            <p className="arbitration-meaning">{option.meaning}</p>
            {option.evidence.slice(0, 2).map((item, index) => (
              <p className="arbitration-evidence" key={`${option.category}-${index}`}>
                <Quote size={11} />
                <span>
                  &ldquo;{item.quote}&rdquo; <em>({item.source.replace(/_/g, " ")})</em>
                </span>
              </p>
            ))}
            <p className="arbitration-consequence">
              <span>If chosen</span>
              {option.consequence}
            </p>
          </button>
        ))}
      </div>

      <div className="arbitration-actions">
        <Button
          icon={resolving ? <LoaderCircle size={15} className="spin" /> : <ShieldQuestion size={15} />}
          disabled={!selected || resolving}
          onClick={() => selected && onResolve(selected)}
        >
          {resolving ? "Confirming…" : selected ? `Confirm ${selected.replace(/_/g, " ")}` : "Select an answer"}
        </Button>
        <span className="arbitration-policy">Routed by {arbitration.policyVersion}</span>
      </div>
      <p className="arbitration-caption">
        Signal strength is each tier&apos;s own internal score (evidence quality, agreement margin) - not a
        calibrated probability of being correct. Read it as a hint, not a percentage.
      </p>
    </section>
  );
}
