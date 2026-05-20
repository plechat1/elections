
import { useState, useEffect } from "react";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const EKEY = "avote_election_v2";
const VKEY = "avote_votes_v2";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [election, setElection] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastVote, setLastVote] = useState(null);
  const [verifyResult, setVerifyResult] = useState(undefined);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try { const c = await window.storage.get(EKEY, true); if (c) setElection(JSON.parse(c.value)); } catch (e) { setElection(null); }
    try { const v = await window.storage.get(VKEY, true); if (v) setVotes(JSON.parse(v.value)); } catch (e) { setVotes([]); }
    setLoading(false);
  }

  async function createElection(candidates, adminPin) {
    const adminHash = await sha256(adminPin + "__admin__");
    const config = { candidates, adminHash, status: "open" };
    await window.storage.set(EKEY, JSON.stringify(config), true);
    await window.storage.set(VKEY, JSON.stringify([]), true);
    setElection(config); setVotes([]); setScreen("shareInfo");
  }

  async function castVote(pseudonym, secret, candidate) {
    const vid = await sha256(pseudonym.toLowerCase().trim() + "|||" + secret.trim());
    let curr = [];
    try { const r = await window.storage.get(VKEY, true); if (r) curr = JSON.parse(r.value); } catch (e) {}
    if (curr.some(v => v.vid === vid)) return { error: "Ce pseudonyme a déjà voté." };
    const updated = [...curr, { vid, candidate }];
    await window.storage.set(VKEY, JSON.stringify(updated), true);
    setVotes(updated); setLastVote({ candidate }); setScreen("voted");
    return { success: true };
  }

  async function verifyVote(pseudonym, secret) {
    const vid = await sha256(pseudonym.toLowerCase().trim() + "|||" + secret.trim());
    let curr = [];
    try { const r = await window.storage.get(VKEY, true); if (r) curr = JSON.parse(r.value); } catch (e) {}
    const found = curr.find(v => v.vid === vid);
    setVerifyResult(found ? found.candidate : null);
  }

  async function closeElection(adminPin) {
    const h = await sha256(adminPin + "__admin__");
    if (h !== election.adminHash) return false;
    const updated = { ...election, status: "closed" };
    await window.storage.set(EKEY, JSON.stringify(updated), true);
    setElection(updated); return true;
  }

  async function resetElection(adminPin) {
    const h = await sha256(adminPin + "__admin__");
    if (h !== election.adminHash) return false;
    try { await window.storage.delete(EKEY, true); } catch (e) {}
    try { await window.storage.delete(VKEY, true); } catch (e) {}
    setElection(null); setVotes([]); setScreen("home"); return true;
  }

  const ctx = { election, votes, screen, setScreen, createElection, castVote, verifyVote, closeElection, resetElection, loadData, lastVote, verifyResult, setVerifyResult };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12 }}>
      <i className="ti ti-loader" style={{ fontSize: 24, color: "var(--color-text-secondary)", animation: "spin 1s linear infinite" }}></i>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
      <Header screen={screen} setScreen={setScreen} election={election} />
      {screen === "home" && <HomeScreen {...ctx} />}
      {screen === "create" && <CreateScreen {...ctx} />}
      {screen === "shareInfo" && <ShareInfoScreen {...ctx} />}
      {screen === "vote" && <VoteScreen {...ctx} />}
      {screen === "voted" && <VotedScreen {...ctx} />}
      {screen === "verify" && <VerifyScreen {...ctx} />}
      {screen === "results" && <ResultsScreen {...ctx} />}
    </div>
  );
}

function Header({ screen, setScreen, election }) {
  const showBack = screen !== "home";
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {showBack && (
        <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 13, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: "1rem" }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} aria-hidden="true"></i> Accueil
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-ballot" style={{ fontSize: 20, color: "var(--color-text-secondary)" }} aria-hidden="true"></i>
        </div>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Vote anonyme</h1>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Pour bureaux d'association</p>
        </div>
        {election && (
          <div style={{ marginLeft: "auto" }}>
            <StatusPill status={election.status} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const open = status === "open";
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: open ? "var(--color-background-success)" : "var(--color-background-secondary)", color: open ? "var(--color-text-success)" : "var(--color-text-secondary)", border: `0.5px solid ${open ? "var(--color-border-success)" : "var(--color-border-tertiary)"}`, letterSpacing: "0.02em" }}>
      {open ? "En cours" : "Clôturé"}
    </span>
  );
}

function Divider() {
  return <div style={{ height: "0.5px", background: "var(--color-border-tertiary)", margin: "1rem 0" }} />;
}

function ActionButton({ icon, label, sublabel, onClick, variant = "default", disabled = false }) {
  const styles = {
    default: { bg: "var(--color-background-primary)", border: "var(--color-border-tertiary)", color: "var(--color-text-primary)" },
    primary: { bg: "var(--color-text-primary)", border: "transparent", color: "var(--color-background-primary)" },
    muted: { bg: "var(--color-background-secondary)", border: "var(--color-border-tertiary)", color: "var(--color-text-secondary)" },
  };
  const s = styles[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--border-radius-lg)", background: s.bg, border: `0.5px solid ${s.border}`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, textAlign: "left" }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 18, color: variant === "primary" ? "var(--color-background-primary)" : "var(--color-text-secondary)", flexShrink: 0 }} aria-hidden="true"></i>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: s.color }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: variant === "primary" ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)", marginTop: 1 }}>{sublabel}</div>}
      </div>
      <i className="ti ti-chevron-right" style={{ fontSize: 14, color: variant === "primary" ? "rgba(255,255,255,0.5)" : "var(--color-text-secondary)", marginLeft: "auto" }} aria-hidden="true"></i>
    </button>
  );
}

function SolidBtn({ children, onClick, disabled, variant = "primary" }) {
  const v = {
    primary: { bg: "var(--color-text-primary)", c: "var(--color-background-primary)", b: "transparent" },
    secondary: { bg: "transparent", c: "var(--color-text-primary)", b: "var(--color-border-secondary)" },
    danger: { bg: "var(--color-background-danger)", c: "var(--color-text-danger)", b: "var(--color-border-danger)" },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "10px 16px", borderRadius: "var(--border-radius-md)", fontWeight: 500, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, border: `0.5px solid ${v.b}`, background: v.bg, color: v.c }}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", hint }) {
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      {label && <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", boxSizing: "border-box" }} />
      {hint && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

function Banner({ icon, text, variant = "info" }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--border-radius-md)", background: `var(--color-background-${variant})`, border: `0.5px solid var(--color-border-${variant})`, marginBottom: "0.875rem" }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 15, color: `var(--color-text-${variant})`, flexShrink: 0, marginTop: 1 }} aria-hidden="true"></i>
      <p style={{ fontSize: 13, color: `var(--color-text-${variant})`, margin: 0, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

function Section({ children, style = {} }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", marginBottom: "0.75rem", ...style }}>
      {children}
    </div>
  );
}

function SectionRow({ icon, label, value, last = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: last ? "none" : "0.5px solid var(--color-border-tertiary)" }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 15, color: "var(--color-text-secondary)", flexShrink: 0 }} aria-hidden="true"></i>
      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

function HomeScreen({ election, votes, setScreen, loadData }) {
  return (
    <>
      {election && (
        <Section style={{ marginBottom: "1rem" }}>
          <SectionRow icon="users" label="Candidats" value={election.candidates.join(", ")} />
          <SectionRow icon="chart-bar" label="Votes enregistrés" value={votes.length} last />
        </Section>
      )}

      {!election && (
        <Banner icon="info-circle" text="Aucune élection active. L'organisateur crée une élection puis partage ce lien avec les membres." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!election && (
          <ActionButton icon="plus" label="Créer une élection" sublabel="Définir les candidats et ouvrir le vote" onClick={() => setScreen("create")} variant="primary" />
        )}
        {election?.status === "open" && (
          <ActionButton icon="mail-forward" label="Voter" sublabel="Choisir mon candidat de façon anonyme" onClick={() => setScreen("vote")} variant="primary" />
        )}
        {election && (
          <ActionButton icon="chart-bar" label="Voir les résultats" sublabel={election.status === "open" ? "Résultats masqués jusqu'à la clôture" : "Résultats finaux disponibles"} onClick={() => { loadData(); setScreen("results"); }} />
        )}
        {election && (
          <ActionButton icon="shield-check" label="Vérifier mon vote" sublabel="Confirmer que mon vote est bien enregistré" onClick={() => setScreen("verify")} />
        )}
        {election && (
          <ActionButton icon="refresh" label="Nouvelle élection" sublabel="Remplacer l'élection actuelle" onClick={() => setScreen("create")} />
        )}
        {!election && (
          <>
            <Divider />
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 12px" }}>Comment ça fonctionne</p>
              {[
                ["lock", "L'organisateur crée l'élection et partage ce lien"],
                ["user-secret", "Chaque membre vote avec un pseudonyme connu de lui seul"],
                ["eye-off", "Personne ne peut voir le vote des autres"],
                ["circle-check", "Chacun peut vérifier que son vote est enregistré"],
              ].map(([icon, txt]) => (
                <div key={icon} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                  <i className={`ti ti-${icon}`} style={{ fontSize: 15, color: "var(--color-text-secondary)", flexShrink: 0, marginTop: 1 }} aria-hidden="true"></i>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{txt}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function CreateScreen({ setScreen, createElection }) {
  const [candidates, setCandidates] = useState(["", ""]);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cleaned = candidates.map(c => c.trim()).filter(Boolean);
    if (cleaned.length < 2) return setError("Entrez au moins 2 candidats.");
    if (pin.length < 4) return setError("Le code admin doit avoir au moins 4 caractères.");
    if (pin !== confirm) return setError("Les codes ne correspondent pas.");
    setError(""); setBusy(true);
    await createElection(cleaned, pin);
    setBusy(false);
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>Configurez les candidats et protégez l'élection avec un code admin.</p>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Candidats</label>
      <Section style={{ marginBottom: "1rem" }}>
        {candidates.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: i < candidates.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "0 10px", fontWeight: 500, flexShrink: 0, minWidth: 24 }}>{i + 1}</span>
            <input type="text" value={c} onChange={e => { const u = [...candidates]; u[i] = e.target.value; setCandidates(u); }} placeholder={`Candidat ${i + 1}`}
              style={{ flex: 1, border: "none", borderRadius: 0, padding: "10px 8px", fontSize: 14, background: "transparent" }} />
            {candidates.length > 2 && (
              <button onClick={() => setCandidates(candidates.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 16, padding: "0 12px", flexShrink: 0 }}>
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setCandidates([...candidates, ""])}
          style={{ width: "100%", background: "none", border: "none", borderTop: "0.5px solid var(--color-border-tertiary)", cursor: "pointer", padding: "10px 14px", fontSize: 13, color: "var(--color-text-secondary)", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-plus" style={{ fontSize: 14 }} aria-hidden="true"></i> Ajouter un candidat
        </button>
      </Section>

      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <Field label="Code admin" value={pin} onChange={setPin} type="password" placeholder="Minimum 4 caractères" hint="Requis pour clôturer ou supprimer l'élection." />
        <Field label="Confirmer le code" value={confirm} onChange={setConfirm} type="password" placeholder="Même code" />
      </Section>

      {error && <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: "0 0 12px" }}>{error}</p>}
      <SolidBtn onClick={submit} disabled={busy}>{busy ? "Création en cours…" : "Créer l'élection"}</SolidBtn>
    </>
  );
}

function ShareInfoScreen({ election, setScreen }) {
  const [copied, setCopied] = useState(false);
  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <>
      <div style={{ textAlign: "center", padding: "1.5rem 0 1rem" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <i className="ti ti-circle-check" style={{ fontSize: 28, color: "var(--color-text-success)" }} aria-hidden="true"></i>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 4px" }}>Élection créée</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Le vote est maintenant ouvert</p>
      </div>

      <Section style={{ marginBottom: "1rem" }}>
        {election?.candidates.map((c, i) => (
          <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < election.candidates.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
            <i className="ti ti-user" style={{ fontSize: 15, color: "var(--color-text-secondary)" }} aria-hidden="true"></i>
            <span style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{c}</span>
          </div>
        ))}
      </Section>

      <Banner icon="share" text="Partagez l'URL de cette page avec tous les membres via WhatsApp, SMS ou email." variant="info" />
      <Banner icon="eye-off" text="Vous ne verrez jamais pour qui chacun a voté — seulement le total final." variant="success" />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "0.5rem" }}>
        <SolidBtn variant="secondary" onClick={copyLink}>
          <i className={`ti ti-${copied ? "check" : "copy"}`} aria-hidden="true"></i> {copied ? "Lien copié !" : "Copier le lien"}
        </SolidBtn>
        <SolidBtn onClick={() => setScreen("home")}>Accéder à l'accueil</SolidBtn>
      </div>
    </>
  );
}

function VoteScreen({ election, setScreen, castVote }) {
  const [pseudo, setPseudo] = useState("");
  const [secret, setSecret] = useState("");
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!election || election.status !== "open") return (
    <>
      <Banner icon="lock" text={!election ? "Aucune élection active." : "Cette élection est clôturée."} variant="warning" />
      <SolidBtn variant="secondary" onClick={() => setScreen("home")}>Retour</SolidBtn>
    </>
  );

  async function submit() {
    if (!pseudo.trim()) return setError("Choisissez un pseudonyme.");
    if (!secret.trim()) return setError("Entrez un mot secret.");
    if (!candidate) return setError("Sélectionnez un candidat.");
    setError(""); setBusy(true);
    const res = await castVote(pseudo, secret, candidate);
    if (res.error) { setError(res.error); setBusy(false); }
  }

  return (
    <>
      <Banner icon="user-secret" text='Choisissez un pseudonyme que vous seul connaissez (ex: "Aigle77"). Il vous permettra de vérifier votre vote sans révéler votre identité.' variant="info" />

      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <Field label="Pseudonyme" value={pseudo} onChange={setPseudo} placeholder="Ex : Aigle77, MonPrénom123…" />
        <Field label="Mot secret" value={secret} onChange={setSecret} type="password" placeholder="Un mot mémorable" hint="Mémorisez-le — il ne peut pas être récupéré." />
      </Section>

      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Votre candidat</label>
      <Section style={{ marginBottom: "1rem" }}>
        {election.candidates.map((c, i) => (
          <button key={c} onClick={() => setCandidate(c)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: candidate === c ? "var(--color-background-secondary)" : "transparent", border: "none", borderBottom: i < election.candidates.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", cursor: "pointer", textAlign: "left" }}>
            <i className={`ti ti-${candidate === c ? "circle-check" : "circle"}`} style={{ fontSize: 18, color: candidate === c ? "var(--color-text-primary)" : "var(--color-text-secondary)", flexShrink: 0 }} aria-hidden="true"></i>
            <span style={{ fontSize: 14, fontWeight: candidate === c ? 500 : 400, color: "var(--color-text-primary)" }}>{c}</span>
          </button>
        ))}
      </Section>

      {error && <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: "0 0 10px" }}>{error}</p>}
      <SolidBtn onClick={submit} disabled={busy}>{busy ? "Envoi en cours…" : "Confirmer mon vote"}</SolidBtn>
    </>
  );
}

function VotedScreen({ lastVote, setScreen }) {
  return (
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <i className="ti ti-circle-check" style={{ fontSize: 32, color: "var(--color-text-success)" }} aria-hidden="true"></i>
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 6px" }}>Vote enregistré</h2>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Votre vote pour</p>
      <p style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.5rem" }}>{lastVote?.candidate}</p>
      <Banner icon="alert-triangle" text="Mémorisez votre pseudonyme et mot secret pour pouvoir vérifier votre vote." variant="warning" />
      <SolidBtn variant="secondary" onClick={() => setScreen("home")}>Retour à l'accueil</SolidBtn>
    </div>
  );
}

function VerifyScreen({ setScreen, verifyVote, verifyResult, setVerifyResult }) {
  const [pseudo, setPseudo] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await verifyVote(pseudo, secret);
    setBusy(false);
  }

  if (verifyResult !== undefined) return (
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      {verifyResult ? (
        <>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <i className="ti ti-circle-check" style={{ fontSize: 28, color: "var(--color-text-success)" }} aria-hidden="true"></i>
          </div>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Vote enregistré pour</p>
          <p style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.5rem" }}>{verifyResult}</p>
        </>
      ) : (
        <>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--color-background-danger)", border: "0.5px solid var(--color-border-danger)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <i className="ti ti-circle-x" style={{ fontSize: 28, color: "var(--color-text-danger)" }} aria-hidden="true"></i>
          </div>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>Aucun vote trouvé pour ce pseudonyme et mot secret.</p>
        </>
      )}
      <SolidBtn variant="secondary" onClick={() => setVerifyResult(undefined)}>Réessayer</SolidBtn>
    </div>
  );

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>Entrez votre pseudonyme et mot secret pour confirmer que votre vote est bien enregistré.</p>
      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <Field label="Votre pseudonyme" value={pseudo} onChange={setPseudo} />
        <Field label="Votre mot secret" value={secret} onChange={setSecret} type="password" />
      </Section>
      <SolidBtn onClick={submit} disabled={busy}>{busy ? "Vérification…" : "Vérifier"}</SolidBtn>
    </>
  );
}

function ResultsScreen({ election, votes, setScreen, loadData, closeElection, resetElection }) {
  const [pin, setPin] = useState("");
  const [action, setAction] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!election) return (
    <>
      <Banner icon="info-circle" text="Aucune élection active." variant="info" />
      <SolidBtn variant="secondary" onClick={() => setScreen("home")}>Retour</SolidBtn>
    </>
  );

  const isOpen = election.status === "open";
  const tally = Object.fromEntries(election.candidates.map(c => [c, 0]));
  votes.forEach(v => { if (tally[v.candidate] !== undefined) tally[v.candidate]++; });
  const total = votes.length;
  const maxV = Math.max(...Object.values(tally), 0);

  async function doAction() {
    if (!pin) return setError("Entrez le code admin.");
    setBusy(true); setError("");
    let ok = action === "close" ? await closeElection(pin) : await resetElection(pin);
    if (!ok) { setError("Code admin incorrect."); setBusy(false); }
    else { setAction(null); setPin(""); setBusy(false); }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
        {[["chart-bar", "Votes reçus", total], ["users", "Candidats", election.candidates.length]].map(([icon, label, val]) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <i className={`ti ti-${icon}`} style={{ fontSize: 14, color: "var(--color-text-secondary)" }} aria-hidden="true"></i>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)" }}>{val}</span>
          </div>
        ))}
      </div>

      {isOpen ? (
        <Banner icon="lock" text="Les résultats seront visibles une fois le vote clôturé par l'organisateur." variant="warning" />
      ) : (
        <Section style={{ marginBottom: "1rem" }}>
          {election.candidates.map((c, i) => {
            const n = tally[c];
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            const winner = n === maxV && n > 0;
            return (
              <div key={c} style={{ padding: "12px 14px", borderBottom: i < election.candidates.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {winner && <i className="ti ti-trophy" style={{ fontSize: 13, color: "var(--color-text-warning)" }} aria-hidden="true"></i>}
                    <span style={{ fontSize: 14, fontWeight: winner ? 500 : 400, color: "var(--color-text-primary)" }}>{c}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{n} <span style={{ fontSize: 12 }}>({pct}%)</span></span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--color-background-secondary)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: winner ? "var(--color-text-primary)" : "var(--color-border-secondary)", transition: "width 0.5s ease" }} />
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {!isOpen && (
        <button onClick={() => loadData()} style={{ background: "none", border: "none", fontSize: 13, color: "var(--color-text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: "0 0 12px" }}>
          <i className="ti ti-refresh" style={{ fontSize: 14 }} aria-hidden="true"></i> Actualiser
        </button>
      )}

      <Divider />
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Administration</p>

      {!action ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isOpen && <SolidBtn variant="secondary" onClick={() => setAction("close")}><i className="ti ti-lock" aria-hidden="true"></i> Clôturer le vote</SolidBtn>}
          <SolidBtn variant="danger" onClick={() => setAction("reset")}><i className="ti ti-trash" aria-hidden="true"></i> Supprimer l'élection</SolidBtn>
        </div>
      ) : (
        <Section style={{ padding: "1rem 1.25rem" }}>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
            {action === "close" ? "Confirmer la clôture" : "Confirmer la suppression"} — entrez le code admin :
          </p>
          <Field value={pin} onChange={setPin} type="password" placeholder="Code admin" />
          {error && <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: "0 0 10px" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <SolidBtn variant={action === "reset" ? "danger" : "primary"} onClick={doAction} disabled={busy}>{busy ? "…" : "Confirmer"}</SolidBtn>
            <SolidBtn variant="secondary" onClick={() => { setAction(null); setError(""); }}>Annuler</SolidBtn>
          </div>
        </Section>
      )}
    </>
  );
}