import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./style.css";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");
function App() {
  const socket = useMemo(() => SERVER_URL ? io(SERVER_URL, { autoConnect: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 800, timeout: 8000, transports: ["websocket", "polling"] }) : null, []);
  const [nickname, setNickname] = useState(localStorage.getItem("qc-nickname") || "");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const me = room?.players?.find(p => p.id === socket?.id);
  const isHost = !!me?.isHost;
  useEffect(() => {
    if (!socket) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    const onState = s => { setRoom(s); setError(""); setSelected(null); };
    const onCreated = d => setRoomCode(d.code);
    const onError = e => setError(e.message || "Something went wrong.");
    const onClosed = e => { setRoom(null); setRoomCode(""); setSelected(null); setError(e.message || "Room closed."); };
    const onRemoved = e => { setRoom(null); setRoomCode(""); setSelected(null); setError(e.message || "You were removed."); };
    const onConnect = () => setError("");
    socket.on("connect", onConnect);
    socket.on("room:state", onState); socket.on("room:created", onCreated);
    socket.on("app:error", onError); socket.on("room:closed", onClosed); socket.on("room:removed", onRemoved);
    return () => { clearInterval(interval); socket.off("connect", onConnect); socket.off("room:state", onState); socket.off("room:created", onCreated); socket.off("app:error", onError); socket.off("room:closed", onClosed); socket.off("room:removed", onRemoved); socket.disconnect(); };
  }, [socket]);
  useEffect(() => { if (room?.questionIndex !== undefined) setSelected(null); }, [room?.questionIndex]);
  const submitName = () => { if (!socket?.connected) { setError(SERVER_URL ? "Connecting to the game server. Please wait a moment and try again." : "The game server is not configured yet. Set VITE_SERVER_URL and redeploy."); return; } const n = nickname.trim(); if (!n) return setError("Enter your nickname first."); localStorage.setItem("qc-nickname", n); return n; };
  const create = () => { const n = submitName(); if (n) socket?.emit("room:create", { nickname: n }); };
  const join = () => { const n = submitName(); if (n) socket?.emit("room:join", { code: joinCode, nickname: n }); };
  const leave = () => { socket?.emit("room:leave"); setRoom(null); setRoomCode(""); setSelected(null); };
  const copy = async () => { try { await navigator.clipboard.writeText(room?.code || roomCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError("Copy failed. Please copy the room code manually."); } };
  const seconds = room?.deadline ? Math.max(0, Math.ceil((room.deadline - now) / 1000)) : 0;
  const q = room?.question;
  const scoreRows = [...(room?.scores || [])].sort((a,b) => b.score-a.score);
  const answered = me?.answered;
  return <main className="shell">
    <header><div className="brand-mark">⚡</div><div><div className="brand">QUIZ<span>CLASH</span></div><div className="tagline">THINK FAST. PLAY TOGETHER.</div></div><div className={`connection ${socket?.connected ? "online" : ""}`}><i/>{!SERVER_URL ? "Server not configured" : socket?.connected ? "Connected" : "Reconnecting…"}</div></header>
    {error && <div className="toast" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
    {!room ? <section className="hero card"><div className="eyebrow">✦ THE FRIENDLY FACE-OFF</div><h1>Think fast.<br/><span>Claim the crown.</span></h1><p className="muted">A rapid-fire trivia battle for your crew. No installs. Just bragging rights.</p><label className="field-label">YOUR NICKNAME</label><input maxLength="20" value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="Enter a nickname"/>
      <button className="primary full" disabled={!socket?.connected} onClick={create}>＋ Create a room</button><div className="divider"><span>OR JOIN A ROOM</span></div><div className="join-row"><input maxLength="6" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="ROOM CODE"/><button className="secondary" disabled={!socket?.connected} onClick={join}>Join room →</button></div><div className="feature-row"><span>⚡ 12-second rounds</span><span>♟ Up to 8 players</span><span>🏆 Live leaderboard</span></div></section>
      : <section className="card game-card">
      <div className="room-top"><div><div className="eyebrow">{room.status==="lobby"?"✦ WAITING ROOM":room.status==="playing"?"✦ MATCH IN PROGRESS":"✦ FINAL RESULTS"}</div><h1>{room.status==="lobby"?"Room lobby":room.status==="playing"?`Question ${room.questionIndex+1}`:"The crown is claimed!"}</h1></div><button className="ghost" onClick={leave}>Leave room ↗</button></div>
      {room.status==="lobby" && <><div className="code-panel"><div><small>ROOM CODE</small><strong>{room.code}</strong></div><button className="secondary" onClick={copy}>{copied?"Copied ✓":"Copy code"}</button></div><div className="players-heading"><h3>Players <span>{room.players.length}/8</span></h3><span className="muted">Updates live</span></div><div className="players">{room.players.map(p=><div className="player" key={p.id}><div className="avatar">{p.isHost?"♛":"♟"}</div><div className="player-name">{p.label}{p.id===socket?.id&&<small>YOU</small>}{p.isHost&&<em>HOST</em>}</div>{isHost&&!p.isHost&&<button className="remove" onClick={()=>socket?.emit("player:remove",{playerId:p.id})}>Remove</button>}</div>)}</div>{isHost?<button className="primary full" disabled={!socket?.connected} onClick={()=>socket?.emit("match:start")}>Start match ⚡</button>:<div className="waiting">⏳ Waiting for the host to start the match…</div>}<p className="muted center">10 questions · 12 seconds each · fastest correct answers score more</p></>}
      {room.status==="playing" && q && <><div className="quiz-meta"><span>{q.category}</span><span>Question {room.questionIndex+1} of {room.questionCount}</span></div><div className="timer-row"><div className="timer-track"><div style={{width:`${Math.max(0,seconds/12*100)}%`}}/></div><strong className={seconds<=4?"urgent":""}>{seconds}s</strong></div><h2 className="question">{q.text}</h2><div className="options">{q.options.map((opt,i)=><button key={opt} disabled={answered||selected!==null||seconds===0} className={`option ${selected===i?"chosen":""}`} onClick={()=>{setSelected(i);socket?.emit("answer:submit",{questionId:q.id,optionIndex:i});}}><span>{String.fromCharCode(65+i)}</span>{opt}</button>)}</div>{answered||selected!==null?<div className="waiting">✓ Answer locked. Hang tight for the next question…</div>:<p className="muted center">Choose quickly! The next question advances automatically.</p>}<div className="score-strip">{scoreRows.map(s=><div key={s.id}><span>{s.label}</span><strong>{s.score.toLocaleString()}</strong></div>)}</div></>}
      {room.status==="finished" && <><div className="winner">🏆</div><h2 className="center">Final leaderboard</h2><div className="results">{scoreRows.map((s,i)=><div className="result-row" key={s.id}><b>#{i+1}</b><span>{s.label}{s.id===socket?.id?" (You)":""}</span><strong>{s.score.toLocaleString()} pts</strong></div>)}</div>{isHost?<button className="primary full" onClick={()=>socket?.emit("match:replay")}>Play again ↻</button>:<div className="waiting">Waiting for the host to start a rematch…</div>}</>}
    </section>}
    <footer>MADE FOR YOUR CREW <span>•</span> ONE ROOM. ONE CROWN.</footer>
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
