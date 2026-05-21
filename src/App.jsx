import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, addDoc, getDocs, query, where } from "firebase/firestore";

// config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCG6XgepDZ5HQzWgzuGK8Emgje8PqiOMAE",
  authDomain: "elections-9cfcb.firebaseapp.com",
  projectId: "elections-9cfcb",
  storageBucket: "elections-9cfcb.firebasestorage.app",
  messagingSenderId: "136724694270",
  appId: "1:136724694270:web:fe5d1c0c2402af857351af",
  measurementId: "G-1SWR1D8F09"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Références Firestore
const electionRef = doc(db, "election", "current");
const votesCol = collection(db, "votes");

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

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
    try {
      const snap = await getDoc(electionRef);
      setElection(snap.exists() ? snap.data() : null);
    } catch (e) { setElection(null); }
    try {
      const snap = await getDocs(votesCol);
      setVotes(snap.docs.map(d => d.data()));
    } catch (e) { setVotes([]); }
    setLoading(false);
  }

  async function createElection(candidates, adminPin) {
    const adminHash = await sha256(adminPin + "__admin__");
    const config = { candidates, adminHash, status: "open" };
    await setDoc(electionRef, config);
    // Supprimer les anciens votes
    const snap = await getDocs(votesCol);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    setElection(config); setVotes([]); setScreen("shareInfo");
  }

  async function castVote(pseudonym, secret, candidate) {
    const vid = await sha256(pseudonym.toLowerCase().trim() + "|||" + secret.trim());
    const existing = await getDocs(query(votesCol, where("vid", "==", vid)));
    if (!existing.empty) return { error: "Ce pseudonyme a déjà voté." };
    await addDoc(votesCol, { vid, candidate });
    const snap = await getDocs(votesCol);
    setVotes(snap.docs.map(d => d.data()));
    setLastVote({ candidate }); setScreen("voted");
    return { success: true };
  }

  async function verifyVote(pseudonym, secret) {
    const vid = await sha256(pseudonym.toLowerCase().trim() + "|||" + secret.trim());
    const snap = await getDocs(query(votesCol, where("vid", "==", vid)));
    setVerifyResult(!snap.empty ? snap.docs[0].data().candidate : null);
  }

  async function closeElection(adminPin) {
    const h = await sha256(adminPin + "__admin__");
    if (h !== election.adminHash) return false;
    const updated = { ...election, status: "closed" };
    await setDoc(electionRef, updated);
    setElection(updated); return true;
  }

  async function resetElection(adminPin) {
    const h = await sha256(adminPin + "__admin__");
    if (h !== election.adminHash) return false;
    await deleteDoc(electionRef);
    const snap = await getDocs(votesCol);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    setElection(null); setVotes([]); setScreen("home"); return true;
  }

  const ctx = { election, votes, screen, setScreen, createElection, castVote, verifyVote, closeElection, resetElection, loadData, lastVote, verifyResult, setVerifyResult };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12 }}>
      <span style={{ fontSize: 15, color: "#888" }}>Chargement…</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "1.5rem 1rem 3rem", fontFamily: "system-ui, sans-serif" }}>
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

// ─── Composants UI ───────────────────────────────────────────────────────────

const C = {
  bg: "#fff", bgSecondary: "#f5f5f4", border: "#e5e5e3",
  text: "#1a1a1a", textMuted: "#737370",
  success: "#166534", successBg: "#f0fdf4", successBorder: "#bbf7d0",
  danger: "#991b1b", dangerBg: "#fef2f2", dangerBorder: "#fecaca",
  warning: "#92400e", warningBg: "#fffbeb", warningBorder: "#fde68a",
  info: "#1e40af", infoBg: "#eff6ff", infoBorder: "#bfdbfe",
};

function Header({ screen, setScreen, election }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {screen !== "home" && (
        <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: "1rem" }}>
          ← Accueil
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: C.bgSecondary, border: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🗳️</div>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Vote anonyme</h1>
          <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Pour bureaux d'association</p>
        </div>
        {election && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: election.status === "open" ? C.successBg : C.bgSecondary, color: election.status === "open" ? C.success : C.textMuted, border: `0.5px solid ${election.status === "open" ? C.successBorder : C.border}` }}>
            {election.status === "open" ? "En cours" : "Clôturé"}
          </span>
        )}
      </div>
    </div>
  );
}

function Section({ children, style = {} }) {
  return <div style={{ background: C.bg, border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: "0.75rem", ...style }}>{children}</div>;
}

function Banner({ icon, text, variant = "info" }) {
  const v = { info: [C.infoBg, C.infoBorder, C.info], success: [C.successBg, C.successBorder, C.success], warning: [C.warningBg, C.warningBorder, C.warning], danger: [C.dangerBg, C.dangerBorder, C.danger] }[variant];
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8, background: v[0], border: `0.5px solid ${v[1]}`, marginBottom: "0.875rem" }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <p style={{ fontSize: 13, color: v[2], margin: 0, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary" }) {
  const v = {
    primary: { bg: "#1a1a1a", color: "#fff", border: "transparent" },
    secondary: { bg: "transparent", color: "#1a1a1a", border: C.border },
    danger: { bg: C.dangerBg, color: C.danger, border: C.dangerBorder },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, fontWeight: 500, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, border: `0.5px solid ${v.border}`, background: v.bg, color: v.color }}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", hint }) {
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      {label && <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 14, background: C.bg, color: C.text, outline: "none" }} />
      {hint && <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

function ActionButton({ icon, label, sublabel, onClick, variant = "default" }) {
  const isPrimary = variant === "primary";
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: isPrimary ? "#1a1a1a" : C.bg, border: `0.5px solid ${isPrimary ? "transparent" : C.border}`, cursor: "pointer", textAlign: "left" }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: isPrimary ? "#fff" : C.text }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: isPrimary ? "rgba(255,255,255,0.6)" : C.textMuted, marginTop: 1 }}>{sublabel}</div>}
      </div>
      <span style={{ fontSize: 14, color: isPrimary ? "rgba(255,255,255,0.4)" : C.textMuted }}>›</span>
    </button>
  );
}

function Divider() {
  return <div style={{ height: "0.5px", background: C.border, margin: "1rem 0" }} />;
}

// ─── Écrans ───────────────────────────────────────────────────────────────────

function HomeScreen({ election, votes, setScreen, loadData }) {
  return (
    <>
      {election && (
        <Section style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `0.5px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>Candidats</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{election.candidates.join(", ")}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>Votes enregistrés</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{votes.length}</span>
          </div>
        </Section>
      )}
      {!election && <Banner icon="ℹ️" text="Aucune élection active. L'organisateur crée une élection puis partage ce lien avec les membres." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!election && <ActionButton icon="➕" label="Créer une élection" sublabel="Définir les candidats et ouvrir le vote" onClick={() => setScreen("create")} variant="primary" />}
        {election?.status === "open" && <ActionButton icon="📨" label="Voter" sublabel="Choisir mon candidat de façon anonyme" onClick={() => setScreen("vote")} variant="primary" />}
        {election && <ActionButton icon="📊" label="Voir les résultats" sublabel={election.status === "open" ? "Résultats masqués jusqu'à la clôture" : "Résultats finaux disponibles"} onClick={() => { loadData(); setScreen("results"); }} />}
        {election && <ActionButton icon="🔍" label="Vérifier mon vote" sublabel="Confirmer que mon vote est bien enregistré" onClick={() => setScreen("verify")} />}
        {election && <ActionButton icon="🔄" label="Nouvelle élection" sublabel="Remplacer l'élection actuelle" onClick={() => setScreen("create")} />}
      </div>
      {!election && (
        <>
          <Divider />
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: "1rem 1.25rem" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 12px" }}>Comment ça fonctionne</p>
            {[["🔒", "L'organisateur crée l'élection et partage ce lien"], ["🕵️", "Chaque membre vote avec un pseudonyme connu de lui seul"], ["🙈", "Personne ne peut voir le vote des autres"], ["✅", "Chacun peut vérifier que son vote est enregistré"]].map(([icon, txt]) => (
              <div key={txt} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <span style={{ flexShrink: 0 }}>{icon}</span>
                <span style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>{txt}</span>
              </div>
            ))}
          </div>
        </>
      )}
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
      <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 1rem" }}>Configurez les candidats et protégez l'élection avec un code admin.</p>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Candidats</label>
      <Section style={{ marginBottom: "1rem" }}>
        {candidates.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", borderBottom: i < candidates.length - 1 ? `0.5px solid ${C.border}` : "none" }}>
            <span style={{ fontSize: 12, color: C.textMuted, padding: "0 10px", minWidth: 24, fontWeight: 500 }}>{i + 1}</span>
            <input type="text" value={c} onChange={e => { const u = [...candidates]; u[i] = e.target.value; setCandidates(u); }} placeholder={`Candidat ${i + 1}`}
              style={{ flex: 1, border: "none", outline: "none", padding: "10px 8px", fontSize: 14, background: "transparent" }} />
            {candidates.length > 2 && (
              <button onClick={() => setCandidates(candidates.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 16, padding: "0 12px" }}>✕</button>
            )}
          </div>
        ))}
        <button onClick={() => setCandidates([...candidates, ""])} style={{ width: "100%", background: "none", border: "none", borderTop: `0.5px solid ${C.border}`, cursor: "pointer", padding: "10px 14px", fontSize: 13, color: C.textMuted, textAlign: "left" }}>
          + Ajouter un candidat
        </button>
      </Section>
      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <Field label="Code admin" value={pin} onChange={setPin} type="password" placeholder="Minimum 4 caractères" hint="Requis pour clôturer ou supprimer l'élection." />
        <Field label="Confirmer le code" value={confirm} onChange={setConfirm} type="password" placeholder="Même code" />
      </Section>
      {error && <p style={{ fontSize: 13, color: C.danger, margin: "0 0 12px" }}>{error}</p>}
      <Btn onClick={submit} disabled={busy}>{busy ? "Création en cours…" : "Créer l'élection"}</Btn>
    </>
  );
}

function ShareInfoScreen({ election, setScreen }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div style={{ textAlign: "center", padding: "1.5rem 0 1rem" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.successBg, border: `0.5px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 28 }}>✅</div>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 4px" }}>Élection créée</h2>
        <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>Le vote est maintenant ouvert</p>
      </div>
      <Section style={{ marginBottom: "1rem" }}>
        {election?.candidates.map((c, i) => (
          <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < election.candidates.length - 1 ? `0.5px solid ${C.border}` : "none" }}>
            <span>👤</span><span style={{ fontSize: 14 }}>{c}</span>
          </div>
        ))}
      </Section>
      <Banner icon="📤" text="Partagez l'URL de cette page avec tous les membres via WhatsApp, SMS ou email." variant="info" />
      <Banner icon="🙈" text="Vous ne verrez jamais pour qui chacun a voté — seulement le total final." variant="success" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn variant="secondary" onClick={() => { navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>
          {copied ? "✓ Lien copié !" : "Copier le lien"}
        </Btn>
        <Btn onClick={() => setScreen("home")}>Accéder à l'accueil</Btn>
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
      <Banner icon="🔒" text={!election ? "Aucune élection active." : "Cette élection est clôturée."} variant="warning" />
      <Btn variant="secondary" onClick={() => setScreen("home")}>Retour</Btn>
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
      <Banner icon="🕵️" text='Choisissez un pseudonyme que vous seul connaissez (ex: "Aigle77"). Il vous permettra de vérifier votre vote sans révéler votre identité.' variant="info" />
      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <Field label="Pseudonyme" value={pseudo} onChange={setPseudo} placeholder="Ex : Aigle77, MonPrénom123…" />
        <Field label="Mot secret" value={secret} onChange={setSecret} type="password" placeholder="Un mot mémorable" hint="Mémorisez-le — il ne peut pas être récupéré." />
      </Section>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Votre candidat</label>
      <Section style={{ marginBottom: "1rem" }}>
        {election.candidates.map((c, i) => (
          <button key={c} onClick={() => setCandidate(c)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: candidate === c ? C.bgSecondary : "transparent", border: "none", borderBottom: i < election.candidates.length - 1 ? `0.5px solid ${C.border}` : "none", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 16 }}>{candidate === c ? "⦿" : "○"}</span>
            <span style={{ fontSize: 14, fontWeight: candidate === c ? 500 : 400 }}>{c}</span>
          </button>
        ))}
      </Section>
      {error && <p style={{ fontSize: 13, color: C.danger, margin: "0 0 10px" }}>{error}</p>}
      <Btn onClick={submit} disabled={busy}>{busy ? "Envoi en cours…" : "Confirmer mon vote"}</Btn>
    </>
  );
}

function VotedScreen({ lastVote, setScreen }) {
  return (
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.successBg, border: `0.5px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>✅</div>
      <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 6px" }}>Vote enregistré</h2>
      <p style={{ fontSize: 14, color: C.textMuted, margin: "0 0 4px" }}>Votre vote pour</p>
      <p style={{ fontSize: 22, fontWeight: 500, margin: "0 0 1.5rem" }}>{lastVote?.candidate}</p>
      <Banner icon="⚠️" text="Mémorisez votre pseudonyme et mot secret pour pouvoir vérifier votre vote." variant="warning" />
      <Btn variant="secondary" onClick={() => setScreen("home")}>Retour à l'accueil</Btn>
    </div>
  );
}

function VerifyScreen({ verifyVote, verifyResult, setVerifyResult }) {
  const [pseudo, setPseudo] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  if (verifyResult !== undefined) return (
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: verifyResult ? C.successBg : C.dangerBg, border: `0.5px solid ${verifyResult ? C.successBorder : C.dangerBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 28 }}>
        {verifyResult ? "✅" : "❌"}
      </div>
      {verifyResult ? (
        <>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 4px" }}>Vote enregistré pour</p>
          <p style={{ fontSize: 22, fontWeight: 500, margin: "0 0 1.5rem" }}>{verifyResult}</p>
        </>
      ) : (
        <p style={{ fontSize: 14, color: C.textMuted, margin: "0 0 1.5rem" }}>Aucun vote trouvé pour ce pseudonyme et mot secret.</p>
      )}
      <Btn variant="secondary" onClick={() => setVerifyResult(undefined)}>Réessayer</Btn>
    </div>
  );

  return (
    <>
      <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 1rem" }}>Entrez votre pseudonyme et mot secret pour confirmer que votre vote est bien enregistré.</p>
      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <Field label="Votre pseudonyme" value={pseudo} onChange={setPseudo} />
        <Field label="Votre mot secret" value={secret} onChange={setSecret} type="password" />
      </Section>
      <Btn onClick={async () => { setBusy(true); await verifyVote(pseudo, secret); setBusy(false); }} disabled={busy}>
        {busy ? "Vérification…" : "Vérifier"}
      </Btn>
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
      <Banner icon="ℹ️" text="Aucune élection active." variant="info" />
      <Btn variant="secondary" onClick={() => setScreen("home")}>Retour</Btn>
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
    const ok = action === "close" ? await closeElection(pin) : await resetElection(pin);
    if (!ok) { setError("Code admin incorrect."); setBusy(false); }
    else { setAction(null); setPin(""); setBusy(false); }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
        {[["📊", "Votes reçus", total], ["👥", "Candidats", election.candidates.length]].map(([icon, label, val]) => (
          <div key={label} style={{ background: C.bgSecondary, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4 }}>{icon} {label}</div>
            <span style={{ fontSize: 22, fontWeight: 500 }}>{val}</span>
          </div>
        ))}
      </div>

      {isOpen ? (
        <Banner icon="🔒" text="Les résultats seront visibles une fois le vote clôturé par l'organisateur." variant="warning" />
      ) : (
        <Section style={{ marginBottom: "1rem" }}>
          {election.candidates.map((c, i) => {
            const n = tally[c];
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            const winner = n === maxV && n > 0;
            return (
              <div key={c} style={{ padding: "12px 14px", borderBottom: i < election.candidates.length - 1 ? `0.5px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: winner ? 500 : 400 }}>{winner ? "🏆 " : ""}{c}</span>
                  <span style={{ fontSize: 13, color: C.textMuted }}>{n} ({pct}%)</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.bgSecondary, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: winner ? "#1a1a1a" : "#d1d1d0", transition: "width 0.5s ease" }} />
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {!isOpen && (
        <button onClick={loadData} style={{ background: "none", border: "none", fontSize: 13, color: C.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: "0 0 12px" }}>
          🔄 Actualiser
        </button>
      )}

      <Divider />
      <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Administration</p>

      {!action ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isOpen && <Btn variant="secondary" onClick={() => setAction("close")}>🔒 Clôturer le vote</Btn>}
          <Btn variant="danger" onClick={() => setAction("reset")}>🗑️ Supprimer l'élection</Btn>
        </div>
      ) : (
        <Section style={{ padding: "1rem 1.25rem" }}>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 12px" }}>
            {action === "close" ? "Confirmer la clôture" : "Confirmer la suppression"} — entrez le code admin :
          </p>
          <Field value={pin} onChange={setPin} type="password" placeholder="Code admin" />
          {error && <p style={{ fontSize: 13, color: C.danger, margin: "0 0 10px" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant={action === "reset" ? "danger" : "primary"} onClick={doAction} disabled={busy}>{busy ? "…" : "Confirmer"}</Btn>
            <Btn variant="secondary" onClick={() => { setAction(null); setError(""); }}>Annuler</Btn>
          </div>
        </Section>
      )}
    </>
  );
}