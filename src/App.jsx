import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "firebase/firestore";

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

const electionRef = doc(db, "election", "current");
const votesCol = collection(db, "votes");
const codesCol = collection(db, "codes");

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Génère un code lisible ex: X7K2-9QLP (sans caractères ambigus 0/O, 1/I)
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Normalise avant de hasher : majuscules, sans tiret
function normalizeCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("home");
  const [election, setElection] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastVote, setLastVote] = useState(null);
  const [generatedCodes, setGeneratedCodes] = useState([]);
  const [verifyResult, setVerifyResult] = useState(undefined);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try { const s = await getDoc(electionRef); setElection(s.exists() ? s.data() : null); } catch { setElection(null); }
    try { const s = await getDocs(votesCol); setVotes(s.docs.map(d => d.data())); } catch { setVotes([]); }
    setLoading(false);
  }

  async function createElection(candidates, adminPin, numMembers) {
    const adminHash = await sha256(adminPin + "__admin__");
    const codes = Array.from({ length: numMembers }, generateCode);
    const codeHashes = await Promise.all(codes.map(c => sha256(normalizeCode(c))));

    const config = { candidates, adminHash, status: "open", totalCodes: numMembers };
    const batch = writeBatch(db);

    // Nettoyage de l'ancienne élection
    (await getDocs(codesCol)).docs.forEach(d => batch.delete(d.ref));
    (await getDocs(votesCol)).docs.forEach(d => batch.delete(d.ref));

    batch.set(electionRef, config);
    codeHashes.forEach(hash => batch.set(doc(codesCol, hash), { used: false }));
    await batch.commit();

    setElection(config); setVotes([]);
    setGeneratedCodes(codes);
    setScreen("codes");
  }

  async function castVote(code, candidate) {
    const hash = await sha256(normalizeCode(code));
    const codeRef = doc(db, "codes", hash);
    const snap = await getDoc(codeRef);

    if (!snap.exists()) return { error: "Code invalide." };
    if (snap.data().used) return { error: "Ce code a déjà été utilisé." };

    // Opération atomique : marquer le code utilisé + enregistrer le vote
    const batch = writeBatch(db);
    batch.update(codeRef, { used: true });
    batch.set(doc(votesCol), { candidate }); // ID aléatoire — non lié au code
    await batch.commit();

    const updated = await getDocs(votesCol);
    setVotes(updated.docs.map(d => d.data()));
    setLastVote({ candidate }); setScreen("voted");
    return { success: true };
  }

  async function verifyCode(code) {
    const hash = await sha256(normalizeCode(code));
    const snap = await getDoc(doc(db, "codes", hash));
    if (!snap.exists()) setVerifyResult("invalid");
    else setVerifyResult(snap.data().used ? "used" : "unused");
  }

  async function closeElection(adminPin) {
    const h = await sha256(adminPin + "__admin__");
    if (h !== election.adminHash) return false;
    const updated = { ...election, status: "closed" };
    await setDoc(electionRef, updated); setElection(updated); return true;
  }

  async function resetElection(adminPin) {
    const h = await sha256(adminPin + "__admin__");
    if (h !== election.adminHash) return false;
    try {
      const batch = writeBatch(db);
      batch.delete(electionRef);
      const [codesDocs, votesDocs] = await Promise.all([getDocs(codesCol), getDocs(votesCol)]);
      codesDocs.docs.forEach(d => batch.delete(d.ref));
      votesDocs.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setElection(null); setVotes([]); setScreen("home"); return true;
    } catch (e) {
      console.error("resetElection:", e);
      return { error: e.message || "Erreur Firestore" };
    }
  }

  const ctx = { election, votes, screen, setScreen, createElection, castVote, verifyCode, closeElection, resetElection, loadData, lastVote, generatedCodes, verifyResult, setVerifyResult };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
      <span style={{ fontSize: 15, color: C.textMuted }}>Chargement…</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "1.5rem 1rem 3rem", fontFamily: "system-ui, sans-serif" }}>
      <Header screen={screen} setScreen={setScreen} election={election} />
      {screen === "home"    && <HomeScreen    {...ctx} />}
      {screen === "create"  && <CreateScreen  {...ctx} />}
      {screen === "codes"   && <CodesScreen   {...ctx} />}
      {screen === "vote"    && <VoteScreen    {...ctx} />}
      {screen === "voted"   && <VotedScreen   {...ctx} />}
      {screen === "verify"  && <VerifyScreen  {...ctx} />}
      {screen === "results" && <ResultsScreen {...ctx} />}
    </div>
  );
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: "#fff", bgSecondary: "#f5f5f4", border: "#e5e5e3",
  text: "#1a1a1a", textMuted: "#737370",
  success: "#166534", successBg: "#f0fdf4", successBorder: "#bbf7d0",
  danger: "#991b1b", dangerBg: "#fef2f2", dangerBorder: "#fecaca",
  warning: "#92400e", warningBg: "#fffbeb", warningBorder: "#fde68a",
  info: "#1e40af", infoBg: "#eff6ff", infoBorder: "#bfdbfe",
  orange: "#f97316", orangeDark: "#ea580c",
  orangeLight: "#fff7ed", orangeMid: "#fed7aa",
  orangeText: "#7c2d12", orangeBorder: "#fdba74",
};

// ─── Composants réutilisables ─────────────────────────────────────────────────

function Header({ screen, setScreen, election }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {screen !== "home" && (
        <button onClick={() => setScreen("home")} style={{ background: C.orangeLight, border: `0.5px solid ${C.orangeBorder}`, borderRadius: 6, cursor: "pointer", color: C.orangeText, fontSize: 13, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", marginBottom: "1rem" }}>
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
  const [hover, setHover] = useState(false);
  const v = {
    primary:   { bg: hover ? C.orangeDark : C.orange, color: "#fff", border: C.orange },
    secondary: { bg: hover ? C.orangeMid : C.orangeLight, color: C.orangeText, border: C.orangeBorder },
    danger:    { bg: hover ? "#fecaca" : C.dangerBg, color: C.danger, border: C.dangerBorder },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: "100%", padding: "10px 16px", borderRadius: 8, fontWeight: 500, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, border: `0.5px solid ${v.border}`, background: v.bg, color: v.color, transition: "background 0.15s" }}>
      {children}
    </button>
  );
}

function PrimaryBtn({ icon, label, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 20px", borderRadius: 12, background: hover ? C.orangeDark : C.orange, border: "none", cursor: "pointer", transition: "background 0.15s, transform 0.1s", transform: hover ? "translateY(-1px)" : "translateY(0)" }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 500, color: "#fff" }}>{label}</span>
    </button>
  );
}

function ActionButton({ icon, label, sublabel, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: hover ? C.orangeMid : C.orangeLight, border: `0.5px solid ${C.orangeBorder}`, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>{sublabel}</div>}
      </div>
      <span style={{ fontSize: 14, color: C.textMuted }}>›</span>
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", hint }) {
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      {label && <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 14, outline: "none", color: C.text, background: C.bg }} />
      {hint && <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>{hint}</p>}
    </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `0.5px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>Votes reçus</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{votes.length} / {election.totalCodes}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>Codes distribués</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{election.totalCodes}</span>
          </div>
        </Section>
      )}

      {!election && <Banner icon="ℹ️" text="Aucune élection active. L'organisateur crée une élection et distribue les codes aux membres." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!election && <PrimaryBtn icon="➕" label="Créer une élection" onClick={() => setScreen("create")} />}
        {election?.status === "open" && <PrimaryBtn icon="🗳️" label="Voter avec mon code" onClick={() => setScreen("vote")} />}
        {election && <ActionButton icon="📊" label="Voir les résultats" sublabel={election.status === "open" ? "Masqués jusqu'à la clôture" : "Résultats finaux"} onClick={() => { loadData(); setScreen("results"); }} />}
        {election && <ActionButton icon="🔍" label="Vérifier mon code" sublabel="Confirmer que mon vote est bien enregistré" onClick={() => setScreen("verify")} />}
        {election && <ActionButton icon="🔄" label="Nouvelle élection" sublabel="Remplacer l'élection actuelle" onClick={() => setScreen("create")} />}
      </div>

      {!election && (
        <>
          <Divider />
          <div style={{ background: C.bgSecondary, borderRadius: 12, padding: "1rem 1.25rem" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 12px" }}>Comment ça fonctionne</p>
            {[
              ["🎟️", "L'organisateur génère un code unique par membre"],
              ["📩", "Chaque membre reçoit son code en privé"],
              ["🗳️", "On vote avec son code — un seul vote possible par code"],
              ["🔒", "Les codes sont hashés : personne (même pas l'organisateur) ne peut savoir qui a voté pour qui"],
            ].map(([icon, txt]) => (
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
  const [numMembers, setNumMembers] = useState("5");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cleaned = candidates.map(c => c.trim()).filter(Boolean);
    if (cleaned.length < 2) return setError("Entrez au moins 2 candidats.");
    const n = parseInt(numMembers);
    if (!n || n < 1 || n > 200) return setError("Nombre de membres invalide (1–200).");
    if (pin.length < 4) return setError("Le code admin doit avoir au moins 4 caractères.");
    if (pin !== confirm) return setError("Les codes ne correspondent pas.");
    setError(""); setBusy(true);
    await createElection(cleaned, pin, n);
    setBusy(false);
  }

  return (
    <>
      <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 1rem" }}>L'app génèrera un code unique par membre, à distribuer en privé.</p>

      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Candidats</label>
      <Section style={{ marginBottom: "1rem" }}>
        {candidates.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", borderBottom: i < candidates.length - 1 ? `0.5px solid ${C.border}` : "none" }}>
            <span style={{ fontSize: 12, color: C.textMuted, padding: "0 10px", minWidth: 24, fontWeight: 500 }}>{i + 1}</span>
            <input type="text" value={c} onChange={e => { const u = [...candidates]; u[i] = e.target.value; setCandidates(u); }} placeholder={`Candidat ${i + 1}`}
              style={{ flex: 1, border: "none", outline: "none", padding: "10px 8px", fontSize: 14, background: C.bg, color: C.text }} />
            {candidates.length > 2 && (
              <button onClick={() => setCandidates(candidates.filter((_, j) => j !== i))} style={{ background: C.orangeLight, border: "none", cursor: "pointer", color: C.orangeText, fontSize: 16, padding: "0 12px" }}>✕</button>
            )}
          </div>
        ))}
        <button onClick={() => setCandidates([...candidates, ""])} style={{ width: "100%", background: C.orangeLight, border: "none", borderTop: `0.5px solid ${C.orangeBorder}`, cursor: "pointer", padding: "10px 14px", fontSize: 13, color: C.orangeText, textAlign: "left" }}>
          + Ajouter un candidat
        </button>
      </Section>

      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <Field label="Nombre de membres votants" value={numMembers} onChange={setNumMembers} placeholder="Ex : 12" hint="Un code unique sera généré pour chaque membre." />
        <Field label="Code admin" value={pin} onChange={setPin} type="password" placeholder="Minimum 4 caractères" hint="Pour clôturer ou supprimer l'élection." />
        <Field label="Confirmer le code" value={confirm} onChange={setConfirm} type="password" placeholder="Même code" />
      </Section>

      {error && <p style={{ fontSize: 13, color: C.danger, margin: "0 0 12px" }}>{error}</p>}
      <Btn onClick={submit} disabled={busy}>{busy ? "Génération des codes…" : "Créer l'élection"}</Btn>
    </>
  );
}

function CodesScreen({ generatedCodes, setScreen }) {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

  function copyCode(code, i) {
    navigator.clipboard.writeText(code).then(() => { setCopiedIndex(i); setTimeout(() => setCopiedIndex(null), 1500); });
  }

  function copyAll() {
    const text = generatedCodes.map((c, i) => `Membre ${i + 1} : ${c}`).join("\n");
    navigator.clipboard.writeText(text).then(() => { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); });
  }

  return (
    <>
      <div style={{ textAlign: "center", padding: "1rem 0" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.successBg, border: `0.5px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 28 }}>✅</div>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 4px" }}>Codes générés</h2>
        <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{generatedCodes.length} codes — un par membre</p>
      </div>

      <Banner icon="⚠️" text="Distribuez chaque code en privé (WhatsApp, SMS…). Une fois cette page quittée, les codes en clair ne seront plus accessibles." variant="warning" />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={copyAll} style={{ background: C.orangeLight, border: `0.5px solid ${C.orangeBorder}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: C.orangeText }}>
          {copiedAll ? "✓ Tout copié" : "📋 Copier tous les codes"}
        </button>
      </div>

      <Section style={{ maxHeight: 320, overflowY: "auto" }}>
        {generatedCodes.map((code, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: i < generatedCodes.length - 1 ? `0.5px solid ${C.border}` : "none" }}>
            <div>
              <span style={{ fontSize: 12, color: C.textMuted, marginRight: 10 }}>Membre {i + 1}</span>
              <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 600, letterSpacing: "0.1em", color: C.text }}>{code}</span>
            </div>
            <button onClick={() => copyCode(code, i)} style={{ background: C.orangeLight, border: `0.5px solid ${C.orangeBorder}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: copiedIndex === i ? C.success : C.orangeText }}>
              {copiedIndex === i ? "✓" : "Copier"}
            </button>
          </div>
        ))}
      </Section>

      <div style={{ marginTop: "0.75rem" }}>
        <Btn onClick={() => setScreen("home")}>J'ai distribué tous les codes</Btn>
      </div>
    </>
  );
}

function VoteScreen({ election, setScreen, castVote }) {
  const [code, setCode] = useState("");
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
    if (!code.trim()) return setError("Entrez votre code.");
    if (!candidate) return setError("Sélectionnez un candidat.");
    setError(""); setBusy(true);
    const res = await castVote(code, candidate);
    if (res.error) { setError(res.error); setBusy(false); }
  }

  return (
    <>
      <Banner icon="🎟️" text="Entrez le code que vous avez reçu de l'organisateur. Chaque code ne peut être utilisé qu'une seule fois." variant="info" />

      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Votre code</label>
        <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Ex : X7K2-9QLP" maxLength={9}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 18, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", outline: "none", color: C.text, background: C.bg }} />
      </Section>

      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Votre candidat</label>
      <Section style={{ marginBottom: "1rem" }}>
        {election.candidates.map((c, i) => (
          <button key={c} onClick={() => setCandidate(c)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: candidate === c ? C.bgSecondary : "transparent", border: "none", borderBottom: i < election.candidates.length - 1 ? `0.5px solid ${C.border}` : "none", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 16, color: C.text }}>{candidate === c ? "⦿" : "○"}</span>
            <span style={{ fontSize: 14, fontWeight: candidate === c ? 500 : 400, color: C.text }}>{c}</span>
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
      <Banner icon="🔒" text="Votre code a été consommé. Il n'est plus possible de voter à nouveau avec ce code." variant="info" />
      <Btn variant="secondary" onClick={() => setScreen("home")}>Retour à l'accueil</Btn>
    </div>
  );
}

function VerifyScreen({ verifyCode, verifyResult, setVerifyResult }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (verifyResult !== undefined) {
    const states = {
      used:    { icon: "✅", title: "Vote bien enregistré",    text: "Votre code a été utilisé — votre vote est pris en compte.",    variant: "success" },
      unused:  { icon: "⏳", title: "Code non encore utilisé", text: "Ce code est valide mais n'a pas encore servi à voter.",          variant: "warning" },
      invalid: { icon: "❌", title: "Code invalide",           text: "Ce code ne correspond à aucun code distribué pour cette élection.", variant: "danger"  },
    }[verifyResult];
    return (
      <div style={{ textAlign: "center", padding: "2rem 0" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: C[states.variant + "Bg"] || C.bgSecondary, border: `0.5px solid ${C[states.variant + "Border"] || C.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 28 }}>{states.icon}</div>
        <h3 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px" }}>{states.title}</h3>
        <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 1.5rem" }}>{states.text}</p>
        <Btn variant="secondary" onClick={() => setVerifyResult(undefined)}>Réessayer</Btn>
      </div>
    );
  }

  return (
    <>
      <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 1rem" }}>Entrez votre code pour vérifier qu'il a bien été enregistré.</p>
      <Section style={{ padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Votre code</label>
        <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Ex : X7K2-9QLP" maxLength={9}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 18, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", outline: "none", color: C.text, background: C.bg }} />
      </Section>
      <Btn onClick={async () => { setBusy(true); await verifyCode(code); setBusy(false); }} disabled={busy}>
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
    setBusy(false);
    if (!ok) { setError("Code admin incorrect."); }
    else if (ok?.error) { setError(ok.error); }
    else { setAction(null); setPin(""); }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
        {[["🗳️", "Votes reçus", `${total} / ${election.totalCodes}`], ["👥", "Candidats", election.candidates.length]].map(([icon, label, val]) => (
          <div key={label} style={{ background: C.bgSecondary, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4 }}>{icon} {label}</div>
            <span style={{ fontSize: 20, fontWeight: 500 }}>{val}</span>
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
        <button onClick={loadData} style={{ background: C.orangeLight, border: `0.5px solid ${C.orangeBorder}`, borderRadius: 6, fontSize: 13, color: C.orangeText, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", marginBottom: 12 }}>
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
            {action === "close" ? "Confirmer la clôture" : "Confirmer la suppression"} — code admin :
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