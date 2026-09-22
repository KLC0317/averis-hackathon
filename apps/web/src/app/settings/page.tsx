"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Server,
  Upload,
  UserRound,
} from "lucide-react";
import { useToast } from "../../components/Toast";
import { Button, PageHeader } from "../../components/UI";
import { apiClient, type ReadinessStatus } from "../../api/client";

const PROFILE_KEY = "cleardraft-profile";

type Profile = {
  name: string;
  role: string;
  photo: string;
};

const defaultProfile: Profile = {
  name: "Kian Lok",
  role: "Lead Operator",
  photo: "",
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OP";
}

export default function SettingsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile({ ...defaultProfile, ...JSON.parse(saved) });
    } catch {
      // Keep the default profile when local preferences are unavailable.
    }
  }, []);

  const checkReadiness = async () => {
    setChecking(true);
    try {
      const status = await apiClient.getReadiness();
      setReadiness(status);
      setLastChecked(status.checkedAt);
      toast(status.ready ? "Backend is ready" : "Backend responded but is not ready", status.ready ? "success" : "warning");
    } catch {
      const status: ReadinessStatus = {
        ready: false,
        database: false,
        error: "unreachable",
        checkedAt: new Date().toISOString(),
      };
      setReadiness(status);
      setLastChecked(status.checkedAt);
      toast("Backend check failed", "warning");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkReadiness();
  }, []);

  const saveProfile = () => {
    const trimmedName = profile.name.trim();
    if (!trimmedName) {
      toast("Enter a name before saving", "warning");
      return;
    }
    setSaving(true);
    const nextProfile = { ...profile, name: trimmedName };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    window.dispatchEvent(new CustomEvent("cleardraft-profile-updated"));
    setProfile(nextProfile);
    window.setTimeout(() => setSaving(false), 250);
    toast("Profile saved", "success");
  };

  const handlePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Choose an image file", "warning");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast("Photo must be under 2 MB", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...current, photo: String(reader.result || "") }));
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const resetWorkspace = () => {
    const confirmed = window.confirm(
      "Reset ClearDraft? This will clear saved profile settings, cached cases, and local preferences, then restart the app."
    );
    if (!confirmed) return;
    localStorage.clear();
    toast("Local data cleared. Restarting...", "info");
    window.setTimeout(() => window.location.reload(), 350);
  };

  const backendLabel = checking ? "Checking" : readiness?.ready ? "Ready" : "Unavailable";
  const backendTone = checking ? "info" : readiness?.ready ? "success" : "danger";

  return (
    <div className="content-wrap settings-page">
      <PageHeader
        eyebrow="Workspace"
        title={<span>Settings</span>}
        description="Manage your operator profile and keep the local workspace ready for testing."
        actions={
          <Button variant="primary" icon={<Check size={15} />} onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </Button>
        }
      />

      <div className="settings-layout">
        <section className="card settings-profile-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow" style={{ fontSize: "10px" }}>PROFILE</span>
              <h3>Operator profile</h3>
            </div>
            <UserRound size={18} style={{ color: "var(--ink-faint)" }} aria-hidden="true" />
          </div>

          <div className="settings-profile-content">
            <div className="settings-avatar-column">
              <div className="settings-avatar" aria-label={profile.photo ? "Uploaded profile photo" : "Profile initials"}>
                {profile.photo ? <img src={profile.photo} alt="" /> : <span>{initials(profile.name)}</span>}
                <span className="settings-avatar-camera" aria-hidden="true"><Camera size={13} /></span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhoto} hidden />
              <button className="text-btn settings-upload-btn" type="button" onClick={() => fileInputRef.current?.click()}>
                <Upload size={13} /> Upload photo
              </button>
              <span className="settings-helper">JPG, PNG or WEBP - 2 MB max</span>
            </div>

            <div className="settings-form-grid">
              <label className="settings-field">
                <span>Display name</span>
                <input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" autoComplete="name" />
              </label>
              <label className="settings-field">
                <span>Role</span>
                <input value={profile.role} onChange={(event) => setProfile((current) => ({ ...current, role: event.target.value }))} placeholder="Your role" autoComplete="organization-title" />
              </label>
            </div>
          </div>
        </section>

        <section className="card settings-backend-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow" style={{ fontSize: "10px" }}>CONNECTION</span>
              <h3>Backend status</h3>
            </div>
            <span className={`status-badge ${backendTone}`}>
              {checking ? <RefreshCw size={12} className="spin" /> : readiness?.ready ? <CheckCircle2 size={12} /> : <Server size={12} />}
              {backendLabel}
            </span>
          </div>

          <div className="settings-status-row">
            <div className="settings-status-icon"><Server size={18} /></div>
            <div>
              <strong>ClearDraft API</strong>
              <p>{readiness ? (readiness.ready ? "Readiness endpoint confirmed." : `Unavailable${readiness.error ? ` - ${readiness.error}` : ""}.`) : "No check run yet."}</p>
            </div>
          </div>

          <div className="settings-status-footer">
            <span>{lastChecked ? `Last checked ${new Date(lastChecked).toLocaleTimeString()}` : "No check run yet"}</span>
            <Button variant="secondary" icon={<RefreshCw size={13} className={checking ? "spin" : undefined} />} onClick={() => void checkReadiness()} disabled={checking}>
              {checking ? "Testing..." : "Test backend"}
            </Button>
          </div>
        </section>

        <section className="card settings-reset-card">
          <div className="settings-reset-copy">
            <div className="settings-warning-icon"><AlertTriangle size={18} /></div>
            <div>
              <span className="eyebrow" style={{ fontSize: "10px", color: "var(--danger-text)" }}>DANGER ZONE</span>
              <h3>Reset workspace</h3>
              <p>This clears all local data and restarts the app.</p>
            </div>
          </div>
          <Button variant="danger" icon={<RotateCcw size={14} />} onClick={resetWorkspace}>Reset workspace</Button>
        </section>
      </div>
    </div>
  );
}
