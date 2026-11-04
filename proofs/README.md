# proofs/ — Phase 0 proof scripts (real API calls, local only)

`a_face.py` (Soul ID consistency) · `b_video.py` (video from approved stills) · `c_voice.py` (Hindi voice + alignment)
· `d_reshoot.py` (Genjutsu template re-shoot) · `e_assemble.py` (hand-assembled 15 s ad = G0). The slug canary is `scripts/model_canary.py`.
Outputs go to `proofs/out/<date>/`: a contact sheet, the proof's `manifest.json` (asset paths, request ids, durations,
the human picks) and `requests.jsonl` (one line per provider call, internal cost estimate included). Phase 0 uses plain
files only, no containers: see the plain-files note in `PHASES/phase-0-foundations-and-proofs.md`.
Each proof ends with the `phase-summary` skill. See `PHASES/phase-0-foundations-and-proofs.md`.
