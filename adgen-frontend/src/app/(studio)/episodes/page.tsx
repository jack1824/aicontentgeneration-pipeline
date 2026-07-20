"use client";

// Episodes — the Show Templates studio (client ask 2026-07-20: episodic ads).
//
// A SHOW is a production recipe locked ONCE — a cast (characters), rooms
// (environments) and a frozen look. An EPISODE is that show + a new script:
// paste the script, break it into beats, render. Ep2's teacher and classroom
// match Ep1's because the cast anchors and room plates are stored, not retyped.
//
// Deliberately NOT chat-shaped like the Director: this is a deterministic board
// (Shows | Beat table | Show assets), because episodes are repeatable production,
// not open exploration.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  Character,
  Episode,
  EpisodeBeat,
  Show,
  ShowLook,
  ShowStarter,
  Voice,
} from "@/lib/api";

const BEAT_TYPES: EpisodeBeat["type"][] = ["speak", "wide", "action", "broll"];
const CAMERAS: EpisodeBeat["camera"][] = ["close-up", "mid", "wide"];

const STATUS_BADGE: Record<Show["status"], string> = {
  draft: "bg-white/10 text-text-secondary",
  validated: "bg-amber-400/15 text-amber-300",
  locked: "bg-green-400/15 text-green-300",
};

// Rough episode estimate from the measured pod numbers (research 2026-07-20):
// an LTX beat is ~3.3 min effective (with QC retry); a lip-synced speak beat
// rides the slower S2V lane. Real figures land with the pod benchmark.
function estimateEpisode(beats: EpisodeBeat[], cast: Character[]) {
  const facedNames = new Set(cast.filter((c) => c.face_image).map((c) => c.name));
  let mins = 0;
  for (const b of beats) {
    const lip = b.type === "speak" && b.speaker && facedNames.has(b.speaker);
    mins += lip ? 7 : 3.5; // s2v speak beat vs LTX beat, effective minutes
  }
  const secs = beats.reduce((s, b) => s + (b.duration_s || 5), 0);
  return { mins: Math.round(mins), secs: Math.round(secs) };
}

export default function EpisodesPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpId, setSelectedEpId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadShows = useCallback(
    () =>
      api
        .shows()
        .then((d) => setShows(d.shows))
        .catch((e) => setError(String(e)))
        .finally(() => setLoaded(true)),
    [],
  );
  const loadLibrary = useCallback(() => {
    api.voices().then((d) => setVoices(d.voices)).catch(() => {});
  }, []);

  useEffect(() => {
    loadShows();
    loadLibrary();
  }, [loadShows, loadLibrary]);

  // Load a show's episodes when it's selected; default-select the newest.
  useEffect(() => {
    if (!selectedShowId) {
      setEpisodes([]);
      return;
    }
    api
      .episodes(selectedShowId)
      .then((d) => {
        setEpisodes(d.episodes);
        setSelectedEpId((cur) => cur ?? d.episodes[d.episodes.length - 1]?.id ?? null);
      })
      .catch((e) => setError(String(e)));
  }, [selectedShowId]);

  const selectedShow = shows.find((s) => s.id === selectedShowId) ?? null;
  const selectedEp = episodes.find((e) => e.id === selectedEpId) ?? null;

  const refreshEpisodes = useCallback(async () => {
    if (!selectedShowId) return;
    const d = await api.episodes(selectedShowId);
    setEpisodes(d.episodes);
  }, [selectedShowId]);

  return (
    <div className="mx-auto flex h-screen w-full max-w-[100rem] flex-col gap-3 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold">Episodes</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Lock a show once — cast, rooms, look. Then feed a new script per episode and
            get the same people in the same places, every time.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="hero-glow shrink-0 rounded-btn px-4 py-2.5 text-sm font-semibold text-white"
        >
          ✦ New show
        </button>
      </header>

      {error && (
        <p className="rounded-btn bg-accent/10 px-3 py-2 text-xs text-accent">
          {error}{" "}
          <button onClick={() => setError(null)} className="ml-2 underline">
            dismiss
          </button>
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[15rem_1fr_16rem]">
        {/* ---- LEFT: shows + episodes ---- */}
        <ShowsRail
          shows={shows}
          loaded={loaded}
          episodes={episodes}
          selectedShowId={selectedShowId}
          selectedEpId={selectedEpId}
          onSelectShow={(id) => {
            setSelectedShowId(id);
            setSelectedEpId(null);
          }}
          onSelectEp={setSelectedEpId}
          onNewShow={() => setWizardOpen(true)}
          onNewEpisode={async () => {
            if (!selectedShowId) return;
            try {
              const ep = await api.createEpisode({ show_id: selectedShowId, language: selectedShow?.grammar.language ?? "hi" });
              await refreshEpisodes();
              setSelectedEpId(ep.id);
            } catch (e) {
              setError(String(e));
            }
          }}
        />

        {/* ---- CENTER: episode board ---- */}
        <div className="card-raised min-h-0 overflow-y-auto rounded-card p-5">
          {selectedShow ? (
            selectedEp ? (
              <EpisodeBoard
                key={selectedEp.id}
                show={selectedShow}
                episode={selectedEp}
                onChange={refreshEpisodes}
                onError={setError}
              />
            ) : (
              <EmptyBoard
                title="No episode selected"
                hint="Pick an episode on the left, or add one to this show."
              />
            )
          ) : (
            <EmptyBoard
              title={shows.length ? "Pick a show" : "Create your first show"}
              hint={
                shows.length
                  ? "Choose a show on the left to write its episodes."
                  : "A show locks your cast, rooms and look. Then every episode is just a new script."
              }
              cta={shows.length ? undefined : { label: "✦ New show", onClick: () => setWizardOpen(true) }}
            />
          )}
        </div>

        {/* ---- RIGHT: show assets ---- */}
        <AssetsPane
          show={selectedShow}
          onError={setError}
          onAssetsChanged={() => {
            loadShows();
            loadLibrary();
          }}
        />
      </div>

      {wizardOpen && (
        <ShowWizard
          voices={voices}
          onClose={() => setWizardOpen(false)}
          onCreated={async (show) => {
            setWizardOpen(false);
            await loadShows();
            loadLibrary();
            setSelectedShowId(show.id);
            setSelectedEpId(null);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LEFT RAIL — shows and their episodes
// ---------------------------------------------------------------------------
function ShowsRail({
  shows,
  loaded,
  episodes,
  selectedShowId,
  selectedEpId,
  onSelectShow,
  onSelectEp,
  onNewShow,
  onNewEpisode,
}: {
  shows: Show[];
  loaded: boolean;
  episodes: Episode[];
  selectedShowId: string | null;
  selectedEpId: string | null;
  onSelectShow: (id: string) => void;
  onSelectEp: (id: string) => void;
  onNewShow: () => void;
  onNewEpisode: () => void;
}) {
  return (
    <div className="card-raised flex min-h-0 flex-col gap-1 overflow-y-auto rounded-card p-3">
      <span className="label-cap px-2 pb-1">Shows</span>
      {loaded && shows.length === 0 && (
        <p className="px-2 py-3 text-xs text-text-muted">No shows yet.</p>
      )}
      {shows.map((s) => {
        const active = s.id === selectedShowId;
        return (
          <div key={s.id}>
            <button
              onClick={() => onSelectShow(s.id)}
              className={`group flex w-full items-center gap-2 rounded-btn px-2 py-2 text-left text-sm transition-colors ${
                active ? "nav-active" : "hover:bg-surface-2"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.version > 1 && <span className="text-[10px] text-text-muted">v{s.version}</span>}
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] uppercase ${STATUS_BADGE[s.status]}`}>
                {s.status === "locked" ? "🔒" : s.status[0]}
              </span>
            </button>
            {active && (
              <div className="mb-1 ml-2 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                {episodes.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelectEp(e.id)}
                    className={`flex items-center gap-1.5 rounded-btn px-2 py-1 text-left text-xs transition-colors ${
                      e.id === selectedEpId ? "bg-surface-2 text-text-primary" : "text-text-secondary hover:bg-surface-2"
                    }`}
                  >
                    <span className="text-text-muted">Ep{e.number}</span>
                    <span className="min-w-0 flex-1 truncate">{e.title || "untitled"}</span>
                    <EpStatusDot status={e.status} />
                  </button>
                ))}
                <button
                  onClick={onNewEpisode}
                  className="rounded-btn px-2 py-1 text-left text-xs text-text-muted hover:bg-surface-2 hover:text-text-primary"
                >
                  ＋ episode
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onNewShow}
        className="mt-1 rounded-btn border border-dashed border-white/15 px-2 py-2 text-xs text-text-muted hover:border-accent/40 hover:text-text-primary"
      >
        ＋ New show
      </button>
    </div>
  );
}

function EpStatusDot({ status }: { status: Episode["status"] }) {
  const c =
    status === "done"
      ? "bg-green-400"
      : status === "rendering"
        ? "bg-amber-400 animate-pulse"
        : status === "error"
          ? "bg-accent"
          : status === "planned"
            ? "bg-sky-400"
            : "bg-text-muted";
  return <span className={`size-1.5 shrink-0 rounded-full ${c}`} title={status} />;
}

// ---------------------------------------------------------------------------
// CENTER — the episode board (script -> beats -> render)
// ---------------------------------------------------------------------------
function EpisodeBoard({
  show,
  episode,
  onChange,
  onError,
}: {
  show: Show;
  episode: Episode;
  onChange: () => Promise<void> | void;
  onError: (e: string) => void;
}) {
  const [title, setTitle] = useState(episode.title);
  const [script, setScript] = useState(episode.script);
  const [beats, setBeats] = useState<EpisodeBeat[]>(episode.beats);
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderJob, setRenderJob] = useState<string | null>(episode.outputs?.job_id ?? null);
  const [renderMsg, setRenderMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const locked = show.status === "locked";
  const castNames = (show.cast ?? []).map((c) => c.name);
  const roomNames = (show.rooms ?? []).map((r) => r.name);
  const est = estimateEpisode(beats, show.cast ?? []);
  const dirty = title !== episode.title || script !== episode.script;

  const saveMeta = async () => {
    setSaving(true);
    try {
      await api.updateEpisode(episode.id, { title, script });
      await onChange();
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const plan = async () => {
    if (!script.trim()) {
      onError("Write the episode script first.");
      return;
    }
    setPlanning(true);
    onError("");
    try {
      // Persist the latest script/title, then split into beats (pod-free).
      await api.updateEpisode(episode.id, { title, script });
      const { beats: got } = await api.planEpisode(episode.id, script);
      setBeats(got);
      await onChange();
    } catch (e) {
      onError(String(e));
    } finally {
      setPlanning(false);
    }
  };

  const saveBeats = async (next: EpisodeBeat[]) => {
    setBeats(next);
    try {
      await api.updateEpisode(episode.id, { beats: next });
    } catch (e) {
      onError(String(e));
    }
  };

  const render = async () => {
    if (!beats.length) return;
    setRendering(true);
    setRenderMsg(null);
    onError("");
    try {
      await api.updateEpisode(episode.id, { beats }); // ship the edited beats
      const { job_id, segments } = await api.renderEpisode(episode.id);
      setRenderJob(job_id);
      setRenderMsg(`rendering ${segments} beats…`);
      await onChange();
      pollRef.current = setInterval(async () => {
        try {
          const j = await api.job(job_id);
          setRenderMsg(`${j.status} · ${j.progress}% · ${j.detail}`.slice(0, 90));
          if (["done", "error", "cancelled"].includes(j.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            setRendering(false);
            if (j.status === "done") {
              await api.updateEpisode(episode.id, { status: "done" });
            } else {
              await api.updateEpisode(episode.id, { status: "error" });
              onError(j.error ?? "render failed");
            }
            await onChange();
          }
        } catch {
          /* keep polling; a transient proxy hiccup shouldn't kill the watch */
        }
      }, 5000);
    } catch (e) {
      setRendering(false);
      // The pod may be down — say so plainly rather than a raw stack.
      const msg = String(e);
      onError(
        msg.includes("system_stats") || msg.includes("pod") || msg.includes("Connection")
          ? "Render needs the pod — start it and paste the -8188 URL, then try again."
          : msg,
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">Ep{episode.number}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Episode title (e.g. First Day of School)"
          className="input-well min-w-0 flex-1 rounded-btn px-3 py-1.5 text-sm"
        />
        {dirty && (
          <button onClick={saveMeta} disabled={saving} className="rounded-btn bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-surface-3 disabled:opacity-50">
            {saving ? "saving…" : "save"}
          </button>
        )}
      </div>

      {!locked && (
        <p className="rounded-btn bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          This show is <b>{show.status}</b>. Lock it (right panel) so its cast and rooms are frozen —
          episodes render most consistently from a locked show.
        </p>
      )}

      {/* Script */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="label-cap">Script</span>
          <span className="text-[10px] text-text-muted">
            pasted verbatim — the planner splits, never rewrites
          </span>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={5}
          placeholder="Paste this episode's script. Mark who speaks if you like — the planner keeps your words exactly and cuts them into shots."
          className="input-well resize-y rounded-btn px-3 py-2 text-sm leading-relaxed"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={plan}
            disabled={planning || !script.trim()}
            className="hero-glow rounded-btn px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {planning ? "breaking into beats…" : beats.length ? "↻ Re-plan beats" : "▸ Break into beats"}
          </button>
          {beats.length > 0 && (
            <span className="text-xs text-text-muted">
              {beats.length} beats · ~{est.secs}s · est. ~{est.mins} min to render
            </span>
          )}
        </div>
      </div>

      {/* Beat table */}
      {beats.length > 0 && (
        <BeatTable
          beats={beats}
          castNames={castNames}
          roomNames={roomNames}
          onChange={saveBeats}
        />
      )}

      {/* Render */}
      {beats.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={render}
              disabled={rendering}
              className="rounded-btn bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {rendering ? "rendering…" : "▶ Start episode"}
            </button>
            {renderMsg && <span className="text-xs text-text-secondary">{renderMsg}</span>}
          </div>
          {renderJob && episode.status === "done" && (
            <video
              src={api.jobVideoUrl(renderJob)}
              controls
              className="mt-1 w-full max-w-md rounded-card ring-1 ring-white/10"
            />
          )}
          <p className="text-[10px] text-text-muted">
            Compiles beats to a sequence render on the pod (LTX b-roll + native audio; a cast
            member with a saved face speaks their lines). The identity-keyframe pass is the
            next upgrade.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editable beat table — the heart of the board
// ---------------------------------------------------------------------------
function BeatTable({
  beats,
  castNames,
  roomNames,
  onChange,
}: {
  beats: EpisodeBeat[];
  castNames: string[];
  roomNames: string[];
  onChange: (next: EpisodeBeat[]) => void;
}) {
  const patch = (i: number, p: Partial<EpisodeBeat>) =>
    onChange(beats.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const remove = (i: number) => onChange(beats.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= beats.length) return;
    const next = [...beats];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([...beats, { type: "action", speaker: null, room: roomNames[0] ?? null, line: "", action: "", camera: "mid", duration_s: 5 }]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-cap">Beats · shot list</span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-2xl border-separate border-spacing-y-1 text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text-muted">
              <th className="w-8 px-1">#</th>
              <th className="px-1">Type</th>
              <th className="px-1">Who</th>
              <th className="px-1">Room</th>
              <th className="px-1">Camera</th>
              <th className="w-14 px-1">Sec</th>
              <th className="px-1">Line / action</th>
              <th className="w-14 px-1"></th>
            </tr>
          </thead>
          <tbody>
            {beats.map((b, i) => (
              <tr key={i} className="align-top">
                <td className="px-1 pt-2 text-text-muted">{i + 1}</td>
                <td className="px-1">
                  <select
                    value={b.type}
                    onChange={(e) => patch(i, { type: e.target.value as EpisodeBeat["type"] })}
                    className="input-well rounded-btn px-1.5 py-1"
                  >
                    {BEAT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1">
                  <select
                    value={b.speaker ?? ""}
                    onChange={(e) => patch(i, { speaker: e.target.value || null })}
                    className="input-well rounded-btn px-1.5 py-1"
                  >
                    <option value="">—</option>
                    {castNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1">
                  <select
                    value={b.room ?? ""}
                    onChange={(e) => patch(i, { room: e.target.value || null })}
                    className="input-well rounded-btn px-1.5 py-1"
                  >
                    <option value="">—</option>
                    {roomNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1">
                  <select
                    value={b.camera}
                    onChange={(e) => patch(i, { camera: e.target.value as EpisodeBeat["camera"] })}
                    className="input-well rounded-btn px-1.5 py-1"
                  >
                    {CAMERAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1">
                  <input
                    type="number"
                    min={3}
                    max={6}
                    step={0.5}
                    value={b.duration_s}
                    onChange={(e) => patch(i, { duration_s: Number(e.target.value) })}
                    className="input-well w-12 rounded-btn px-1.5 py-1"
                  />
                </td>
                <td className="px-1">
                  <input
                    value={b.line}
                    onChange={(e) => patch(i, { line: e.target.value })}
                    placeholder="spoken words"
                    className="input-well mb-1 w-full rounded-btn px-1.5 py-1"
                  />
                  <input
                    value={b.action}
                    onChange={(e) => patch(i, { action: e.target.value })}
                    placeholder="what we see (blocking, gaze, camera move)"
                    className="input-well w-full rounded-btn px-1.5 py-1 text-text-secondary"
                  />
                </td>
                <td className="px-1 pt-1">
                  <div className="flex gap-0.5">
                    <button onClick={() => move(i, -1)} className="rounded px-1 text-text-muted hover:text-text-primary" title="up">↑</button>
                    <button onClick={() => move(i, 1)} className="rounded px-1 text-text-muted hover:text-text-primary" title="down">↓</button>
                    <button onClick={() => remove(i)} className="rounded px-1 text-text-muted hover:text-accent" title="delete">✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={add}
        className="self-start rounded-btn border border-dashed border-white/15 px-2.5 py-1 text-xs text-text-muted hover:border-accent/40 hover:text-text-primary"
      >
        ＋ beat
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RIGHT — show assets (cast, rooms) + lifecycle actions
// ---------------------------------------------------------------------------
function AssetsPane({
  show,
  onError,
  onAssetsChanged,
}: {
  show: Show | null;
  onError: (e: string) => void;
  onAssetsChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<string | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (!show) {
    return (
      <div className="card-raised flex min-h-0 flex-col gap-2 overflow-y-auto rounded-card p-4">
        <span className="label-cap">Show assets</span>
        <p className="text-xs text-text-muted">Select a show to see its cast and rooms.</p>
      </div>
    );
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    onError("");
    try {
      await fn();
      onAssetsChanged();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Generate a room plate on the pod (async job) — the room's consistency anchor.
  const genPlate = async (envId: string) => {
    if (gen) return;
    setGen(envId);
    onError("");
    try {
      const { job_id } = await api.generateEnvironmentPlate(envId, "wide");
      pollRef.current = setInterval(async () => {
        try {
          const j = await api.job(job_id);
          if (["done", "error", "cancelled"].includes(j.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            setGen(null);
            if (j.status !== "done") {
              onError(j.error?.includes("pod") || j.error?.includes("COMFY")
                ? "Plate needs the pod — start it, then try again."
                : j.error ?? "plate failed");
            }
            onAssetsChanged();
          }
        } catch {
          /* transient */
        }
      }, 5000);
    } catch (e) {
      setGen(null);
      onError(String(e));
    }
  };

  // One click: render every MISSING face + plate for the whole show (needs pod).
  const genAll = async () => {
    if (batch) return;
    setBatch("starting…");
    onError("");
    try {
      const { job_id } = await api.generateShowAssets(show.id);
      pollRef.current = setInterval(async () => {
        try {
          const j = await api.job(job_id);
          setBatch(`${j.progress}% · ${j.detail}`.slice(0, 40));
          if (["done", "error", "cancelled"].includes(j.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            setBatch(null);
            if (j.status !== "done") {
              onError(j.error?.includes("pod") || j.error?.includes("COMFY") || j.error?.includes("system_stats")
                ? "Assets need the pod — start it, then try again."
                : j.error ?? "asset generation failed");
            }
            onAssetsChanged();
          }
        } catch {
          /* transient */
        }
      }, 5000);
    } catch (e) {
      setBatch(null);
      const msg = String(e);
      onError(msg.includes("already exists") ? "All assets already generated." : msg);
    }
  };

  const cast = show.cast ?? [];
  const rooms = show.rooms ?? [];
  const missing = cast.filter((c) => !c.face_image).length + rooms.filter((r) => !r.primary_plate).length;

  return (
    <div className="card-raised flex min-h-0 flex-col gap-3 overflow-y-auto rounded-card p-4">
      <div className="flex items-center justify-between">
        <span className="label-cap">Show assets</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase ${STATUS_BADGE[show.status]}`}>
          {show.status} {show.version > 1 && `v${show.version}`}
        </span>
      </div>

      {/* One-click batch: render every missing face + plate */}
      {(missing > 0 || batch) && (
        <button
          onClick={genAll}
          disabled={!!batch}
          className="rounded-btn bg-accent/15 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-60"
          title="Render all missing faces and room plates on the pod"
        >
          {batch ? `generating… ${batch}` : `✨ Generate all assets (${missing} missing)`}
        </button>
      )}

      {/* Cast */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase text-text-muted">Cast</span>
        {(show.cast ?? []).length === 0 && <p className="text-xs text-text-muted">no cast</p>}
        {(show.cast ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-btn bg-surface-2 p-1.5">
            {c.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={api.assetUrl(c.image_url)} alt={c.name} className="size-8 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
            ) : (
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] text-text-muted">?</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{c.name}</p>
              <p className="truncate text-[10px] text-text-muted">
                {c.face_image ? "face ✓" : "no face"} · {c.voice_id ? "voice ✓" : "no voice"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Rooms */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase text-text-muted">Rooms</span>
        {(show.rooms ?? []).length === 0 && <p className="text-xs text-text-muted">no rooms</p>}
        {(show.rooms ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-btn bg-surface-2 p-1.5">
            {r.plate_wide_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={api.assetUrl(r.plate_wide_url)} alt={r.name} className="size-8 shrink-0 rounded object-cover ring-1 ring-white/10" />
            ) : (
              <div className="grid size-8 shrink-0 place-items-center rounded bg-surface-3 text-[10px] text-text-muted">🏠</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{r.name}</p>
              <p className="truncate text-[10px] text-text-muted">{r.primary_plate ? "plate ✓" : "no plate"}</p>
            </div>
            {!r.primary_plate && (
              <button
                onClick={() => genPlate(r.id)}
                disabled={!!gen}
                className="shrink-0 rounded px-1.5 py-1 text-[10px] text-text-muted hover:text-text-primary disabled:opacity-50"
                title="Generate room plate (needs pod)"
              >
                {gen === r.id ? "…" : "✨"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Look summary */}
      {(show.look.style || show.look.grade) && (
        <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
          <span className="text-[10px] uppercase text-text-muted">Look</span>
          {show.look.style && <p className="text-[11px] text-text-secondary">{show.look.style}</p>}
          {show.look.grade && <p className="text-[11px] text-text-muted">{show.look.grade}</p>}
        </div>
      )}

      {/* Lifecycle */}
      <div className="mt-auto flex flex-col gap-1.5 border-t border-white/5 pt-3">
        {show.status === "draft" && (
          <button onClick={() => act(() => api.validateShow(show.id))} disabled={busy} className="rounded-btn bg-surface-2 px-3 py-2 text-xs hover:bg-surface-3 disabled:opacity-50">
            ✓ Mark validated
          </button>
        )}
        {show.status !== "locked" ? (
          <button onClick={() => act(() => api.lockShow(show.id))} disabled={busy} className="rounded-btn bg-green-500/15 px-3 py-2 text-xs text-green-300 hover:bg-green-500/25 disabled:opacity-50">
            🔒 Lock show
          </button>
        ) : (
          <button onClick={() => act(() => api.forkShow(show.id))} disabled={busy} className="rounded-btn bg-surface-2 px-3 py-2 text-xs hover:bg-surface-3 disabled:opacity-50">
            ⑂ Fork to new version
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SHOW WIZARD — describe-first. The brain drafts the whole template; the user
// only edits and approves. Three ways in: brain-draft, a starter scaffold, or
// from scratch. All produce the same editable cards -> one instantiate call.
// ---------------------------------------------------------------------------
type DraftCast = { name: string; anchor: string; voice_id?: string };
type DraftRoom = { name: string; anchor: string };

function ShowWizard({
  voices,
  onClose,
  onCreated,
  onError,
}: {
  voices: Voice[];
  onClose: () => void;
  onCreated: (show: Show) => void;
  onError: (e: string) => void;
}) {
  const [step, setStep] = useState<"choose" | "review">("choose");
  const [brief, setBrief] = useState("");
  const [language, setLanguage] = useState("hi");
  const [drafting, setDrafting] = useState(false);
  const [starters, setStarters] = useState<ShowStarter[]>([]);
  const [busy, setBusy] = useState(false);

  // the editable template being assembled
  const [name, setName] = useState("");
  const [cast, setCast] = useState<DraftCast[]>([]);
  const [rooms, setRooms] = useState<DraftRoom[]>([]);
  const [look, setLook] = useState<ShowLook>({ negative: "blurry, deformed, extra fingers, warped face, low quality" });
  const [ideas, setIdeas] = useState<string[]>([]);

  useEffect(() => {
    api.showStarters().then((d) => setStarters(d.starters)).catch(() => {});
  }, []);

  const loadTemplate = (t: { name: string; cast: DraftCast[]; rooms: DraftRoom[]; look: ShowLook; episode_ideas?: string[] }) => {
    setName(t.name);
    setCast(t.cast.map((c) => ({ ...c })));
    setRooms(t.rooms.map((r) => ({ ...r })));
    setLook({ negative: "blurry, deformed, extra fingers, warped face, low quality", ...t.look });
    setIdeas(t.episode_ideas ?? []);
    setStep("review");
  };

  const runDraft = async () => {
    if (brief.trim().length < 4) return;
    setDrafting(true);
    onError("");
    try {
      const d = await api.draftShow(brief.trim(), language);
      loadTemplate(d);
    } catch (e) {
      onError(String(e));
    } finally {
      setDrafting(false);
    }
  };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    onError("");
    try {
      const show = await api.instantiateShow({
        name: name.trim(),
        cast: cast.filter((c) => c.name.trim() && c.anchor.trim().length >= 10),
        rooms: rooms.filter((r) => r.name.trim() && r.anchor.trim().length >= 10),
        look,
        grammar: { language, quality: "quality", engine: "ltx" },
      });
      onCreated(show);
    } catch (e) {
      onError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card-raised my-6 flex w-full max-w-3xl flex-col gap-5 rounded-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">New show</h2>
            <p className="text-xs text-text-secondary">
              {step === "choose"
                ? "Describe your show once — the brain drafts the cast, rooms and look. You just approve."
                : "Review the draft. Edit anything, then create — assets render in the next step."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-btn px-2.5 py-1.5 text-sm text-text-muted hover:bg-surface-2">✕</button>
        </div>

        {step === "choose" ? (
          <div className="flex flex-col gap-5">
            {/* Brain draft */}
            <div className="flex flex-col gap-2">
              <span className="label-cap">Describe your show</span>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="e.g. a friendly chai stall owner and a regular customer chatting at his roadside tea stall, warm documentary look, Hindi"
                className="input-well resize-y rounded-btn px-3 py-2 text-sm leading-relaxed"
              />
              <div className="flex items-center gap-2">
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input-well rounded-btn px-2 py-2 text-sm">
                  <option value="hi">Hindi</option>
                  <option value="en">English</option>
                </select>
                <button
                  onClick={runDraft}
                  disabled={drafting || brief.trim().length < 4}
                  className="hero-glow rounded-btn px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {drafting ? "drafting…" : "✦ Draft with AI"}
                </button>
                <span className="text-[10px] text-text-muted">the brain writes the cast, rooms &amp; look — you edit next</span>
              </div>
            </div>

            {/* Starters */}
            <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
              <span className="label-cap">…or start from a template</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {starters.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => loadTemplate({ name: s.title, cast: s.cast, rooms: s.rooms, look: s.look })}
                    className="flex flex-col gap-1 rounded-card border border-white/8 bg-surface-2 p-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-3"
                  >
                    <span className="text-sm font-semibold">{s.title}</span>
                    <span className="text-[11px] text-text-muted">{s.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { loadTemplate({ name: "", cast: [], rooms: [], look: {} }); }}
              className="self-start text-xs text-text-muted underline hover:text-text-primary"
            >
              or build from scratch
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="label-cap">Show name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                placeholder="Name your show" className="input-well rounded-btn px-3 py-2 text-sm" />
            </div>

            {ideas.length > 0 && (
              <div className="rounded-btn bg-surface-2/50 p-3">
                <span className="label-cap">Episodes you could make</span>
                <ul className="mt-1 list-disc pl-4 text-xs text-text-secondary">
                  {ideas.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            )}

            {/* Cast cards */}
            <div className="flex flex-col gap-2">
              <span className="label-cap">Cast — the recurring characters</span>
              {cast.map((c, i) => (
                <div key={i} className="grid gap-1.5 rounded-btn bg-surface-2/50 p-2 sm:grid-cols-[9rem_1fr_auto]">
                  <input value={c.name} onChange={(e) => setCast(cast.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="name" className="input-well rounded-btn px-2 py-1.5 text-xs" />
                  <textarea value={c.anchor} onChange={(e) => setCast(cast.map((x, j) => j === i ? { ...x, anchor: e.target.value } : x))}
                    rows={2} placeholder="verbatim look — age, face, hair, exact clothing"
                    className="input-well resize-y rounded-btn px-2 py-1.5 text-xs" />
                  <div className="flex flex-col gap-1">
                    {voices.length > 0 && (
                      <select value={c.voice_id ?? ""} onChange={(e) => setCast(cast.map((x, j) => j === i ? { ...x, voice_id: e.target.value || undefined } : x))}
                        className="input-well rounded-btn px-1.5 py-1 text-[10px]">
                        <option value="">voice…</option>
                        {voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                      </select>
                    )}
                    <button onClick={() => setCast(cast.filter((_, j) => j !== i))} className="rounded px-1.5 py-1 text-[10px] text-text-muted hover:text-accent">remove</button>
                  </div>
                </div>
              ))}
              <button onClick={() => setCast([...cast, { name: "", anchor: "" }])}
                className="self-start rounded-btn border border-dashed border-white/15 px-2.5 py-1 text-xs text-text-muted hover:border-accent/40 hover:text-text-primary">＋ character</button>
            </div>

            {/* Room cards */}
            <div className="flex flex-col gap-2">
              <span className="label-cap">Rooms — the recurring places</span>
              {rooms.map((r, i) => (
                <div key={i} className="grid gap-1.5 rounded-btn bg-surface-2/50 p-2 sm:grid-cols-[9rem_1fr_auto]">
                  <input value={r.name} onChange={(e) => setRooms(rooms.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="name" className="input-well rounded-btn px-2 py-1.5 text-xs" />
                  <textarea value={r.anchor} onChange={(e) => setRooms(rooms.map((x, j) => j === i ? { ...x, anchor: e.target.value } : x))}
                    rows={2} placeholder="verbatim setting — the space, its light, its palette"
                    className="input-well resize-y rounded-btn px-2 py-1.5 text-xs" />
                  <button onClick={() => setRooms(rooms.filter((_, j) => j !== i))} className="self-start rounded px-1.5 py-1 text-[10px] text-text-muted hover:text-accent">remove</button>
                </div>
              ))}
              <button onClick={() => setRooms([...rooms, { name: "", anchor: "" }])}
                className="self-start rounded-btn border border-dashed border-white/15 px-2.5 py-1 text-xs text-text-muted hover:border-accent/40 hover:text-text-primary">＋ room</button>
            </div>

            {/* Look */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="label-cap">Art style</span>
                <input value={look.style ?? ""} onChange={(e) => setLook({ ...look, style: e.target.value })}
                  placeholder="warm 2D storybook cartoon / photoreal" className="input-well rounded-btn px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="label-cap">Color grade</span>
                <input value={look.grade ?? ""} onChange={(e) => setLook({ ...look, grade: e.target.value })}
                  placeholder="bright, optimistic" className="input-well rounded-btn px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="label-cap">Negative (frozen)</span>
                <input value={look.negative ?? ""} onChange={(e) => setLook({ ...look, negative: e.target.value })}
                  className="input-well rounded-btn px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-4">
          {step === "review" ? (
            <button onClick={() => setStep("choose")} className="rounded-btn px-3 py-2 text-sm text-text-secondary hover:bg-surface-2">← back</button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-btn px-4 py-2 text-sm text-text-secondary hover:bg-surface-2">Cancel</button>
            {step === "review" && (
              <button onClick={create} disabled={!name.trim() || busy}
                className="hero-glow rounded-btn px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "creating…" : "Create show"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function EmptyBoard({ title, hint, cta }: { title: string; hint: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
      <p className="font-display text-lg font-semibold text-text-secondary">{title}</p>
      <p className="max-w-sm text-sm text-text-muted">{hint}</p>
      {cta && (
        <button onClick={cta.onClick} className="hero-glow mt-1 rounded-btn px-4 py-2 text-sm font-semibold text-white">
          {cta.label}
        </button>
      )}
    </div>
  );
}
