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
import VoicePicker from "@/components/VoicePicker";

// Resolve a stored voice_id to its display name (for the cast panel).
function voiceName(voices: Voice[], id: string | null | undefined): string {
  if (!id) return "no voice";
  return voices.find((v) => v.voice_id === id)?.name.split(" - ")[0] ?? "custom voice";
}

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
          className="bg-accent hover:bg-accent/90 shrink-0 rounded-btn px-4 py-2.5 text-sm font-semibold text-white"
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
          onDeleteEp={async (ep) => {
            if (!window.confirm(`Delete Ep${ep.number} “${ep.title || "untitled"}”? This can't be undone.`)) return;
            try {
              await api.deleteEpisode(ep.id);
              if (selectedEpId === ep.id) setSelectedEpId(null);
              await refreshEpisodes();
            } catch (e) {
              setError(String(e));
            }
          }}
        />

        {/* ---- CENTER: episode board ---- */}
        <div className="border border-white/[0.14] bg-[#141414] min-h-0 overflow-y-auto rounded-card p-5">
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
          episode={selectedEp}
          voices={voices}
          onError={setError}
          onAssetsChanged={() => {
            loadShows();
            loadLibrary();
          }}
          onShowDeleted={() => {
            setSelectedShowId(null);
            setSelectedEpId(null);
            loadShows();
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
  onDeleteEp,
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
  onDeleteEp: (ep: Episode) => void;
}) {
  return (
    <div className="border border-white/[0.14] bg-[#141414] flex min-h-0 flex-col gap-1 overflow-y-auto rounded-card p-3">
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
                  <div
                    key={e.id}
                    className={`group/ep flex items-center gap-1 rounded-btn pr-1 transition-colors ${
                      e.id === selectedEpId ? "bg-surface-2" : "hover:bg-surface-2"
                    }`}
                  >
                    <button
                      onClick={() => onSelectEp(e.id)}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs ${
                        e.id === selectedEpId ? "text-text-primary" : "text-text-secondary"
                      }`}
                    >
                      <span className="text-text-muted">Ep{e.number}</span>
                      <span className="min-w-0 flex-1 truncate">{e.title || "untitled"}</span>
                      <EpStatusDot status={e.status} />
                    </button>
                    <button
                      onClick={() => onDeleteEp(e)}
                      title="Delete this episode"
                      className="shrink-0 rounded px-1 text-[11px] text-text-muted opacity-0 transition hover:text-accent group-hover/ep:opacity-100"
                    >
                      🗑
                    </button>
                  </div>
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
  // Prompt-only: default new episodes to "write with AI"; ones that already have a
  // script/beats open on the script view.
  const [inputMode, setInputMode] = useState<"idea" | "script">(
    episode.beats.length || episode.script.trim() ? "script" : "idea",
  );
  const [idea, setIdea] = useState("");
  const [writing, setWriting] = useState(false);
  const [fixing, setFixing] = useState(false);
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

  // PROMPT-ONLY: the brain authors the whole episode (dialogue + beats) from one
  // line, then we drop the user into the storyboard to review/edit and CONFIRM by
  // hitting render — no pre-written script required.
  const write = async () => {
    if (idea.trim().length < 4) {
      onError("Describe the episode in a line first.");
      return;
    }
    setWriting(true);
    onError("");
    try {
      const { beats: got, script: wrote } = await api.writeEpisode(episode.id, idea.trim());
      setBeats(got);
      setScript(wrote);
      setInputMode("script"); // reveal the written script + storyboard for review
      await onChange();
    } catch (e) {
      onError(String(e));
    } finally {
      setWriting(false);
    }
  };

  // Inline "Fix timing": trim the dead tail off the finished episode (the working
  // /fit action, which used to live only on the Library page) and swap the trimmed
  // cut in as the episode's final.
  const fixTiming = async () => {
    const final = episode.outputs?.final;
    if (!final || fixing) return;
    setFixing(true);
    onError("");
    try {
      const { job_id } = await api.fit({ video_path: final, mode: "auto" });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const j = await api.job(job_id);
        if (j.status === "done") {
          if (j.video_path && j.video_path !== final) {
            const prev = episode.outputs ?? {};
            await api.updateEpisode(episode.id, {
              // Zero the tail we just trimmed so the "runs past the last word" warning
              // and its Fix-timing button clear instead of lingering on the fixed cut.
              outputs: { ...prev, final: j.video_path, report: { ...(prev.report ?? {}), tail: 0 } },
            });
            await onChange();
          }
          break;
        }
        if (["error", "cancelled"].includes(j.status)) {
          onError(j.error ?? "fix timing failed");
          break;
        }
      }
    } catch (e) {
      onError(String(e));
    } finally {
      setFixing(false);
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
          ? "Renders are paused — the render service is offline. Try again shortly."
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

      {/* Episode input — write from a one-line idea, or paste a script */}
      <div className="flex flex-col gap-2.5">
        <span className="label-cap">How do you want to start this episode?</span>
        <div className="grid grid-cols-2 gap-2.5">
          {([
            { k: "idea", icon: "✨", title: "Write with AI", sub: "One line → we write it" },
            { k: "script", icon: "📝", title: "Paste a script", sub: "You supply the words" },
          ] as const).map((o) => {
            const on = inputMode === o.k;
            return (
              <button
                key={o.k}
                type="button"
                aria-pressed={on}
                onClick={() => setInputMode(o.k)}
                className={`flex items-center gap-2.5 rounded-[10px] border p-3 text-left transition-colors ${
                  on
                    ? "border-accent/60 bg-accent/[0.10]"
                    : "border-white/[0.10] bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-white/[0.05] text-base leading-none">{o.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-[13px] font-semibold ${on ? "text-text-primary" : "text-text-secondary"}`}>{o.title}</span>
                  <span className="block truncate text-[11px] text-text-muted">{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {inputMode === "idea" ? (
          <>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              placeholder="One line: what happens this episode? e.g. Motu's old mouse keeps hanging, Patlu shows him the new wireless one — then they tell everyone to order it."
              className="input-well resize-y rounded-btn px-3 py-2 text-sm leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={write}
                disabled={writing || idea.trim().length < 4}
                className="bg-accent hover:bg-accent/90 rounded-btn px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {writing ? "writing the episode…" : "✦ Write the episode"}
              </button>
              <span className="text-[10px] text-text-muted">
                the brain writes the dialogue + storyboard from your locked cast &amp; rooms — you review &amp; edit before rendering
              </span>
            </div>
          </>
        ) : (
          <>
            <span className="text-[10px] text-text-muted">
              pasted verbatim — the planner splits your words into beats, never rewrites
            </span>
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
                className="bg-accent hover:bg-accent/90 rounded-btn px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {planning ? "breaking into beats…" : beats.length ? "↻ Re-plan beats" : "▸ Break into beats"}
              </button>
              {beats.length > 0 && (
                <span className="text-xs text-text-muted">
                  {beats.length} beats · ~{est.secs}s · est. ~{est.mins} min to render
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Beat table */}
      {beats.length > 0 && (
        <>
          <BeatTable
            beats={beats}
            castNames={castNames}
            roomNames={roomNames}
            onChange={saveBeats}
          />
          <p className="text-[10px] text-text-muted">
            🔊 Each speaking beat is voiced by its character&apos;s voice — set or preview it in the
            cast panel on the right.
          </p>
        </>
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
          {episode.status === "done" && (episode.outputs?.final || renderJob) && (
            <video
              // Prefer the durable file (survives a backend restart); fall back to
              // the in-memory job URL for a render still fresh in this session.
              src={
                episode.outputs?.final
                  ? api.fileVideoUrl(episode.outputs.final)
                  : api.jobVideoUrl(renderJob!)
              }
              controls
              className="mt-1 w-full max-w-md rounded-card ring-1 ring-white/10"
            />
          )}
          {episode.status === "done" && (
            <WarningsPanel
              report={episode.outputs?.report}
              warnings={episode.outputs?.warnings}
              onFixTiming={fixTiming}
              fixing={fixing}
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
  // The ⚙ shot-options disclosure lives HERE, not inside BeatCard, so it travels
  // with the beat through delete/reorder (index-keyed local state would show the
  // open panel on the wrong beat). Kept length-aligned to beats.
  const [openFlags, setOpenFlags] = useState<boolean[]>([]);
  const flags = openFlags.length === beats.length ? openFlags : beats.map((_, i) => openFlags[i] ?? false);
  const toggleOpen = (i: number) =>
    setOpenFlags(() => { const n = beats.map((_, j) => flags[j] ?? false); n[i] = !n[i]; return n; });

  const patch = (i: number, p: Partial<EpisodeBeat>) =>
    onChange(beats.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const remove = (i: number) => {
    setOpenFlags(flags.filter((_, j) => j !== i));
    onChange(beats.filter((_, j) => j !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= beats.length) return;
    const next = [...beats];
    [next[i], next[j]] = [next[j], next[i]];
    const nf = [...flags];
    [nf[i], nf[j]] = [nf[j] ?? false, nf[i] ?? false];
    setOpenFlags(nf);
    onChange(next);
  };
  const add = () => {
    setOpenFlags([...flags, false]);
    onChange([...beats, { type: "action", speaker: null, room: roomNames[0] ?? null, line: "", action: "", camera: "mid", duration_s: 5 }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label-cap">Storyboard · {beats.length} beats</span>
        <span className="text-[10px] text-text-muted">line first · ⚙ for shot options</span>
      </div>
      <div className="flex flex-col gap-2">
        {beats.map((b, i) => (
          <BeatCard
            key={i}
            beat={b}
            index={i}
            count={beats.length}
            castNames={castNames}
            roomNames={roomNames}
            open={flags[i] ?? false}
            onToggleOpen={() => toggleOpen(i)}
            onPatch={(p) => patch(i, p)}
            onMove={(d) => move(i, d)}
            onRemove={() => remove(i)}
          />
        ))}
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

const TYPE_ICON: Record<EpisodeBeat["type"], string> = {
  speak: "🗣", wide: "🏞", action: "🎬", broll: "🎞",
};

// One beat as a readable storyboard card: the LINE leads, the shot knobs (Type /
// Who / Room / Camera) hide behind ⚙ so a first-timer sees a script, not a cockpit.
// (No "Sec" field — clip length is fixed by the engine; the old number did nothing.)
function BeatCard({
  beat, index, count, castNames, roomNames, open, onToggleOpen, onPatch, onMove, onRemove,
}: {
  beat: EpisodeBeat;
  index: number;
  count: number;
  castNames: string[];
  roomNames: string[];
  open: boolean;
  onToggleOpen: () => void;
  onPatch: (p: Partial<EpisodeBeat>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const speak = beat.type === "speak";
  return (
    <div className="rounded-[10px] border border-white/[0.09] bg-white/[0.025] p-2.5">
      <div className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] text-text-muted">{index + 1}</span>
        <span className="shrink-0 text-sm" title={beat.type}>{TYPE_ICON[beat.type]}</span>
        {speak ? (
          <span className={`min-w-0 truncate text-xs font-medium ${beat.speaker ? "text-text-secondary" : "text-amber-300/80"}`}>
            {beat.speaker || "pick who speaks →⚙"}
          </span>
        ) : (
          <span className="min-w-0 truncate text-xs capitalize text-text-muted">
            {beat.type}{beat.room ? ` · ${beat.room}` : ""}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <button onClick={onToggleOpen} title="Shot options" className={`rounded px-1 hover:text-text-primary ${open ? "text-text-primary" : "text-text-muted"}`}>⚙</button>
          <button onClick={() => onMove(-1)} disabled={index === 0} className="rounded px-1 text-text-muted hover:text-text-primary disabled:opacity-30" title="move up">↑</button>
          <button onClick={() => onMove(1)} disabled={index === count - 1} className="rounded px-1 text-text-muted hover:text-text-primary disabled:opacity-30" title="move down">↓</button>
          <button onClick={onRemove} className="rounded px-1 text-text-muted hover:text-accent" title="delete beat">✕</button>
        </span>
      </div>

      {speak && (
        <input
          value={beat.line}
          onChange={(e) => onPatch({ line: e.target.value })}
          placeholder="what they say…"
          className="input-well mt-2 w-full rounded-btn px-2.5 py-1.5 text-sm"
        />
      )}
      <input
        value={beat.action}
        onChange={(e) => onPatch({ action: e.target.value })}
        placeholder={speak ? "what we see (blocking, gaze, camera move)" : "what happens on screen"}
        className="input-well mt-1.5 w-full rounded-btn px-2.5 py-1.5 text-xs text-text-secondary"
      />

      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/5 pt-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[10px] uppercase text-text-muted">
            Type
            <select value={beat.type} onChange={(e) => onPatch({ type: e.target.value as EpisodeBeat["type"] })} className="input-well rounded-btn px-1.5 py-1 text-xs normal-case text-text-primary">
              {BEAT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase text-text-muted">
            Who
            <select value={beat.speaker ?? ""} onChange={(e) => onPatch({ speaker: e.target.value || null })} className="input-well rounded-btn px-1.5 py-1 text-xs normal-case text-text-primary">
              <option value="">—</option>
              {castNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase text-text-muted">
            Room
            <select value={beat.room ?? ""} onChange={(e) => onPatch({ room: e.target.value || null })} className="input-well rounded-btn px-1.5 py-1 text-xs normal-case text-text-primary">
              <option value="">—</option>
              {roomNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase text-text-muted">
            Camera
            <select value={beat.camera} onChange={(e) => onPatch({ camera: e.target.value as EpisodeBeat["camera"] })} className="input-well rounded-btn px-1.5 py-1 text-xs normal-case text-text-primary">
              {CAMERAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RIGHT — show assets (cast, rooms) + lifecycle actions
// ---------------------------------------------------------------------------
function AssetsPane({
  show,
  episode,
  voices,
  onError,
  onAssetsChanged,
  onShowDeleted,
}: {
  show: Show | null;
  episode: Episode | null;
  voices: Voice[];
  onError: (e: string) => void;
  onAssetsChanged: () => void;
  onShowDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<string | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const [voiceEditId, setVoiceEditId] = useState<string | null>(null);
  // Confirm gate: a voice picked in the panel is PENDING until "Use this voice" —
  // so a voice is never welded on the first click (the Patlu-stuck-on-Eric trap).
  const [pendingVoice, setPendingVoice] = useState<Record<string, string>>({});
  // Separate pollers: a room-plate job and the batch "generate all" job can run at
  // once, so they must NOT share one ref (a shared ref cross-clears/orphans them).
  const platePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (platePollRef.current) clearInterval(platePollRef.current);
    if (batchPollRef.current) clearInterval(batchPollRef.current);
  }, []);

  // Commit a cast member's voice — it flows to every one of their speaking beats
  // automatically (the episode compiler reads speaker.voice_id).
  const setVoice = async (charId: string, voiceId: string) => {
    try {
      await api.updateCharacter(charId, { voice_id: voiceId });
      setPendingVoice((p) => { const n = { ...p }; delete n[charId]; return n; });
      onAssetsChanged();
    } catch (e) {
      onError(String(e));
    }
  };

  // First spoken line for a character in the current episode — auditioned by the
  // voice picker so you hear the ACTUAL delivery, not a canned sample.
  const sampleFor = (name: string): string | undefined =>
    (episode?.beats ?? []).find((b) => b.speaker === name && (b.line || "").trim())?.line;

  // Upload-first: a real photo the user chose beats a generated face — it's faster
  // and it's THEIR person, which reads as trust. Generation stays as the fallback.
  const uploadFace = async (charId: string, file: File) => {
    setBusy(true);
    onError("");
    try {
      const { path } = await api.uploadAsset(file);
      await api.updateCharacter(charId, { face_image: path });
      onAssetsChanged();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };
  // Upload a real photo of the room as its plate — the background the lipsync
  // keyframe composites the cast INTO, so the set is exactly the user's shop.
  const uploadPlate = async (envId: string, file: File) => {
    setBusy(true);
    onError("");
    try {
      const { path } = await api.uploadAsset(file);
      await api.updateEnvironment(envId, { plate_wide: path });
      onAssetsChanged();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!show) {
    return (
      <div className="border border-white/[0.14] bg-[#141414] flex min-h-0 flex-col gap-2 overflow-y-auto rounded-card p-4">
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
      platePollRef.current = setInterval(async () => {
        try {
          const j = await api.job(job_id);
          if (["done", "error", "cancelled"].includes(j.status)) {
            if (platePollRef.current) clearInterval(platePollRef.current);
            setGen(null);
            if (j.status !== "done") {
              onError(j.error?.includes("pod") || j.error?.includes("COMFY")
                ? "The image service is offline right now — try again shortly."
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
      batchPollRef.current = setInterval(async () => {
        try {
          const j = await api.job(job_id);
          setBatch(`${j.progress}% · ${j.detail}`.slice(0, 40));
          if (["done", "error", "cancelled"].includes(j.status)) {
            if (batchPollRef.current) clearInterval(batchPollRef.current);
            setBatch(null);
            if (j.status !== "done") {
              onError(j.error?.includes("pod") || j.error?.includes("COMFY") || j.error?.includes("system_stats")
                ? "Asset generation is offline right now — try again shortly."
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
    <div className="border border-white/[0.14] bg-[#141414] flex min-h-0 flex-col gap-3 overflow-y-auto rounded-card p-4">
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

      {/* Cast — each member's voice is choosable + previewable here */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase text-text-muted">Cast</span>
        {(show.cast ?? []).length === 0 && <p className="text-xs text-text-muted">no cast</p>}
        {(show.cast ?? []).map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 rounded-btn bg-surface-2 p-1.5">
            <div className="flex items-center gap-2">
              {c.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={api.assetUrl(c.image_url)} alt={c.name} className="size-8 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
              ) : (
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] text-text-muted">?</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{c.name}</p>
                <p className="truncate text-[10px] text-text-muted">
                  {c.face_image ? "face ✓" : "no face"} · 🔊 {voiceName(voices, c.voice_id)}
                </p>
              </div>
              <label
                className="shrink-0 cursor-pointer rounded px-1.5 py-1 text-[10px] text-text-muted hover:text-text-primary"
                title={c.face_image ? "Replace this character's photo" : "Upload a photo for this character"}
              >
                {c.face_image ? "📤" : "📤 photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFace(c.id, f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => setVoiceEditId((id) => (id === c.id ? null : c.id))}
                className="shrink-0 rounded px-1.5 py-1 text-[10px] text-text-muted hover:text-text-primary"
                title="Choose this character's voice"
              >
                {voiceEditId === c.id ? "✕" : "🔊 voice"}
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`Remove ${c.name} from this show?`)) return;
                  act(() => api.updateShow(show.id, { character_ids: cast.filter((x) => x.id !== c.id).map((x) => x.id) }));
                }}
                title="Remove this character from the show"
                className="shrink-0 rounded px-1 text-[11px] text-text-muted hover:text-accent"
              >
                🗑
              </button>
            </div>
            {voiceEditId === c.id && (() => {
              const pending = pendingVoice[c.id];
              const shown = pending ?? c.voice_id ?? "";
              const changed = pending !== undefined && pending !== (c.voice_id ?? "");
              return (
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-1.5">
                  <VoicePicker
                    voices={voices}
                    value={shown}
                    language={show.grammar.language ?? "hi"}
                    sampleText={sampleFor(c.name)}
                    onChange={(id) => setPendingVoice((p) => ({ ...p, [c.id]: id }))}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted">
                      {sampleFor(c.name) ? "▶ auditions this character’s real line" : "▶ preview before you lock it"}
                    </span>
                    <button
                      onClick={() => setVoice(c.id, shown)}
                      disabled={!changed}
                      className="ml-auto rounded-btn bg-green-500/15 px-2.5 py-1 text-[11px] text-green-300 hover:bg-green-500/25 disabled:opacity-40"
                    >
                      ✓ Use this voice
                    </button>
                  </div>
                </div>
              );
            })()}
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
            <label
              className="shrink-0 cursor-pointer rounded px-1.5 py-1 text-[10px] text-text-muted hover:text-text-primary"
              title={r.primary_plate ? "Replace this room's photo" : "Upload a photo of this room"}
            >
              {r.primary_plate ? "📤" : "📤 photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPlate(r.id, f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {!r.primary_plate && (
              <button
                onClick={() => genPlate(r.id)}
                disabled={!!gen}
                className="shrink-0 rounded px-1.5 py-1 text-[10px] text-text-muted hover:text-text-primary disabled:opacity-50"
                title="Generate room plate (needs pod) — upload is faster"
              >
                {gen === r.id ? "…" : "✨"}
              </button>
            )}
            <button
              onClick={() => {
                if (!window.confirm(`Remove ${r.name} from this show?`)) return;
                act(() => api.updateShow(show.id, { environment_ids: rooms.filter((x) => x.id !== r.id).map((x) => x.id) }));
              }}
              title="Remove this room from the show"
              className="shrink-0 rounded px-1 text-[11px] text-text-muted hover:text-accent"
            >
              🗑
            </button>
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
        <button
          onClick={async () => {
            if (!window.confirm(`Delete the show “${show.name}” and all its episodes? This can't be undone.`)) return;
            setBusy(true);
            onError("");
            try {
              await api.deleteShow(show.id);
              onShowDeleted();
            } catch (e) {
              onError(String(e));
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded-btn px-3 py-2 text-xs text-text-muted hover:bg-accent/10 hover:text-accent disabled:opacity-50"
        >
          🗑 Delete show
        </button>
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
      <div onClick={(e) => e.stopPropagation()} className="border border-white/[0.14] bg-[#141414] my-6 flex w-full max-w-3xl flex-col gap-5 rounded-card p-6">
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
                  className="bg-accent hover:bg-accent/90 rounded-btn px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="label-cap">Style</span>
                <div className="flex flex-wrap gap-2">
                  {([
                    { k: "realistic", l: "🎥 Realistic", style: "realistic documentary-style advertisement, natural handheld camera, candid moment", neg: "stiff posing, plastic skin, over-saturation, cartoonish, distorted hands, extra fingers, watermark, text overlay" },
                    { k: "animated", l: "🎨 Animated", style: "2D animated cartoon-illustration, clean line art, bright cel shading, expressive characters", neg: "photorealistic, realistic skin pores, 3D render, distorted hands, extra fingers, watermark, text overlay" },
                    { k: "cartoon_real", l: "🎭 Cartoon-on-real", style: "cartoon characters acting in a real photographic location — a real-photo background with lively cartoon characters composited in", neg: "photorealistic people, realistic human skin on characters, cartoon background, flattened illustrated backdrop, distorted hands, extra fingers, watermark, text overlay" },
                  ] as const).map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setLook({ ...look, art_style: o.k, style: o.style, negative: o.neg })}
                      className={`flex-1 rounded-btn px-3 py-2 text-sm font-medium ${
                        look.art_style === o.k ? "bg-accent text-white" : "bg-surface-2 text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="label-cap">Art direction</span>
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
                className="bg-accent hover:bg-accent/90 rounded-btn px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
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
// Sync warnings, made presentable: driven by the STRUCTURED report (not raw
// strings), bucketed by severity, with a real one-click Fix-timing inline instead
// of the old "Library → Fix timing" breadcrumb that led nowhere.
function WarningsPanel({
  report,
  warnings,
  onFixTiming,
  fixing,
}: {
  report?: Episode["outputs"]["report"];
  warnings?: string[];
  onFixTiming: () => void;
  fixing: boolean;
}) {
  const r = report ?? {};
  const items: { sev: "blocker" | "fix" | "heads"; text: string; fix?: boolean }[] = [];
  if (r.silent) items.push({ sev: "blocker", text: "This ad has no audible sound — re-render it." });
  if ((r.tail ?? 0) > 1.0)
    items.push({ sev: "fix", text: `The video runs ~${(r.tail ?? 0).toFixed(1)}s past the last spoken word.`, fix: true });
  if ((r.lead_in ?? 0) > 2.5)
    items.push({ sev: "heads", text: `Silent for the first ~${(r.lead_in ?? 0).toFixed(1)}s before anyone speaks.` });
  if (r.gaps?.length)
    items.push({ sev: "heads", text: `${r.gaps.length} quiet gap${r.gaps.length > 1 ? "s" : ""} mid-video where no one speaks.` });
  const underfill = (warnings ?? []).filter((w) => /fills only/.test(w)).length;
  if (underfill)
    items.push({ sev: "heads", text: `${underfill} beat${underfill > 1 ? "s" : ""} had a short line — we trimmed the silent tail to fit.` });

  // Anything not already represented above = informational receipts, collapsed.
  const covered = ["fills only", "past the last sound", "silent gap", "no audible", "silent open"];
  const info = (warnings ?? []).filter((w) => !covered.some((k) => w.includes(k)));

  if (!items.length && !info.length) return null;
  const styles: Record<string, string> = {
    blocker: "border-red-500/30 bg-red-500/10 text-red-300",
    fix: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    heads: "border-white/10 bg-amber-400/5 text-amber-300/90",
  };
  return (
    <div className="mt-1 flex flex-col gap-1">
      {items.map((it, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-btn border px-2.5 py-1.5 text-[11px] ${styles[it.sev]}`}>
          <span>{it.sev === "blocker" ? "⛔" : it.sev === "fix" ? "✂" : "•"}</span>
          <span className="min-w-0 flex-1">{it.text}</span>
          {it.fix && (
            <button
              onClick={onFixTiming}
              disabled={fixing}
              className="shrink-0 rounded-btn bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-400/30 disabled:opacity-50"
            >
              {fixing ? "trimming…" : "✂ Fix timing"}
            </button>
          )}
        </div>
      ))}
      {info.length > 0 && (
        <details className="rounded-btn border border-white/5 bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-muted">
          <summary className="cursor-pointer select-none">We tidied a few timing details ({info.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {info.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        </details>
      )}
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
        <button onClick={cta.onClick} className="bg-accent hover:bg-accent/90 mt-1 rounded-btn px-4 py-2 text-sm font-semibold text-white">
          {cta.label}
        </button>
      )}
    </div>
  );
}
