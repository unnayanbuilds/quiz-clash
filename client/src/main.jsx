import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./style.css";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? "http://localhost:3001" : "")).replace(/\/$/, "");
const SESSION_KEY = "qc-session-token";

function App() {
  const socket = useMemo(() => SERVER_URL ? io(SERVER_URL, {
    autoConnect:true, reconnection:true, reconnectionAttempts:Infinity,
    reconnectionDelay:800, timeout:10000, transports:["websocket","polling"]
  }) : null, []);
  const [nickname,setNickname]=useState(localStorage.getItem("qc-nickname")||"");
  const [joinCode,setJoinCode]=useState("");
  const [room,setRoom]=useState(null);
  const [roomCode,setRoomCode]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [now,setNow]=useState(Date.now());
  const [selected,setSelected]=useState(null);
  const [copied,setCopied]=useState(false);
  const [connection,setConnection]=useState("connecting");
  const me=room?.players?.find(p=>p.isMe);
  const isHost=!!me?.isHost;
  const seconds=room?.deadline ? Math.max(0,Math.ceil((room.deadline-(now+(room.clockOffset||0)))/1000)) : 0;
  const q=room?.question;
  const scoreRows=[...(room?.scores||[])].sort((a,b)=>b.score-a.score);
  const answered=!!room?.answered || selected!==null;

  useEffect(()=>{
    if(!socket)return;
    const tick=setInterval(()=>setNow(Date.now()),100);
    const onConnect=()=>{setConnection("connected");setError("");const token=localStorage.getItem(SESSION_KEY);if(token)socket.emit("session:resume",{sessionToken:token});};
    const onDisconnect=()=>setConnection("reconnecting");
    const onState=s=>{setRoom({...s,clockOffset:(s.serverNow||Date.now())-Date.now()});setRoomCode(s.code);setError("");setNotice("");};
    const saveSession=d=>{setRoomCode(d.code);if(d.sessionToken)localStorage.setItem(SESSION_KEY,d.sessionToken);};
    const onResumed=d=>{saveSession(d);setNotice("Reconnected to your match.");};
    const onResumeFailed=d=>{localStorage.removeItem(SESSION_KEY);setRoom(null);setRoomCode("");if(d?.message)setNotice(d.message);};
    const onError=d=>setError(d?.message||"Something went wrong.");
    const clearRoom=d=>{setRoom(null);setRoomCode("");setSelected(null);localStorage.removeItem(SESSION_KEY);setError(d?.message||"Room closed.");};
    socket.on("connect",onConnect);socket.on("disconnect",onDisconnect);socket.on("connect_error",onDisconnect);
    socket.on("room:state",onState);socket.on("room:created",saveSession);socket.on("room:joined",saveSession);
    socket.on("session:resumed",onResumed);socket.on("session:resume-failed",onResumeFailed);
    socket.on("app:error",onError);socket.on("room:closed",clearRoom);socket.on("room:removed",clearRoom);
    if(socket.connected)onConnect();
    return()=>{clearInterval(tick);socket.off("connect",onConnect);socket.off("disconnect",onDisconnect);socket.off("connect_error",onDisconnect);socket.off("room:state",onState);socket.off("room:created",saveSession);socket.off("room:joined",saveSession);socket.off("session:resumed",onResumed);socket.off("session:resume-failed",onResumeFailed);socket.off("app:error",onError);socket.off("room:closed",clearRoom);socket.off("room:removed",clearRoom);socket.disconnect();};
  },[socket]);

  useEffect(()=>{setSelected(null);},[room?.questionIndex,room?.status]);

  const getName=()=>{
    if(!socket?.connected){setError(SERVER_URL?"Connecting to the game server. Please try again shortly.":"Set VITE_SERVER_URL and redeploy the frontend.");return null;}
    const n=nickname.trim().slice(0,20);if(!n){setError("Enter your nickname first.");return null;}
    localStorage.setItem("qc-nickname",n);setNickname(n);return n;
  };
  const create=()=>{const n=getName();if(n)socket.emit("room:create",{nickname:n});};
  const join=()=>{const n=getName();if(!n)return;if(joinCode.trim().length!==6)return setError("Enter the 6-character room code.");socket.emit("room:join",{code:joinCode.trim().toUpperCase(),nickname:n});};
  const leave=()=>{socket?.emit("room:leave");setRoom(null);setRoomCode("");setSelected(null);localStorage.removeItem(SESSION_KEY);};
  const copy=async()=>{try{await navigator.clipboard.writeText(room?.code||roomCode);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setError("Copy failed. Copy the room code manually.");}};

  return <main className="shell">
    <header><div className="brand-mark">⚡</div><div><div className="brand">QUIZ<span>CLASH</span></div><div className="tagline">THINK FAST. PLAY TOGETHER.</div></div><div className={`connection ${connection==="connected"?"online":""}`}><i/>{!SERVER_URL?"Server not configured":connection==="connected"?"Connected":"Reconnecting…"}</div></header>
    {error&&<div className="toast" role="alert">{error}<button onClick={()=>setError("")}>×</button></div>}
    {notice&&<div className="toast">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    {!room?<section className="hero card">
      <div className="eyebrow">✦ THE FRIENDLY FACE-OFF</div><h1>Think fast.<br/><span>Claim the crown.</span></h1><p className="muted">A rapid-fire trivia battle for your crew. No installs. Just bragging rights.</p>
      <label className="field-label">YOUR NICKNAME</label><input maxLength="20" value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="Enter a nickname" onKeyDown={e=>e.key==="Enter"&&create()}/>
      <button className="primary full" disabled={connection!=="connected"} onClick={create}>＋ Create a room</button><div className="divider"><span>OR JOIN A ROOM</span></div>
      <div className="join-row"><input maxLength="6" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="ROOM CODE" onKeyDown={e=>e.key==="Enter"&&join()}/><button className="secondary" disabled={connection!=="connected"} onClick={join}>Join room →</button></div>
      <div className="feature-row"><span>⚡ 12-second rounds</span><span>♟ Up to 8 players</span><span>🏆 Live leaderboard</span></div>
    </section>:<section className="card game-card">
      <div className="room-top"><div><div className="eyebrow">{room.status==="lobby"?"✦ WAITING ROOM":room.status==="playing"?"✦ MATCH IN PROGRESS":"✦ FINAL RESULTS"}</div><h1>{room.status==="lobby"?"Room lobby":room.status==="playing"?`Question ${room.questionIndex+1}`:"The crown is claimed!"}</h1></div><button className="ghost" onClick={leave}>Leave room ↗</button></div>
      {room.status==="lobby"&&<>
        <div className="code-panel"><div><small>ROOM CODE</small><strong>{room.code}</strong></div><button className="secondary" onClick={copy}>{copied?"Copied ✓":"Copy code"}</button></div>
        <div className="players-heading"><h3>Players <span>{room.players.length}/8</span></h3><span className="muted">Updates live</span></div>
        <div className="players">{room.players.map(p=><div className="player" key={p.id}><div className="avatar">{p.isHost?"♛":"♟"}</div><div className="player-name">{p.label}{p.isMe&&<small>YOU</small>}{p.isHost&&<em>HOST</em>}</div><span className={`player-connection ${p.connected?"online":""}`}>{p.connected?"● READY":"○ RECONNECTING"}</span>{isHost&&!p.isHost&&<button className="remove" onClick={()=>socket.emit("player:remove",{playerId:p.id})}>Remove</button>}</div>)}</div>
        {isHost?<button className="primary full" disabled={!socket?.connected||room.players.length<2} onClick={()=>socket.emit("match:start")}>Start match ⚡</button>:<div className="waiting">⏳ Waiting for the host to start the match…</div>}
        <p className="muted center">10 questions · 12 seconds each · fastest correct answers score more</p>
      </>}
      {room.status==="playing"&&q&&<>
        <div className="quiz-meta"><span>{q.category}</span><span>Question {room.questionIndex+1} of {room.questionCount}</span></div>
        <div className="timer-row"><div className="timer-track"><div style={{width:`${Math.max(0,Math.min(100,seconds/12*100))}%`}}/></div><strong className={seconds<=4?"urgent":""}>{seconds}s</strong></div>
        <h2 className="question">{q.text}</h2>
        <div className="options">{q.options.map((option,index)=><button key={`${q.id}-${index}`} disabled={answered||seconds===0||!socket?.connected} className={`option ${selected===index?"chosen":""}`} onClick={()=>{setSelected(index);socket.emit("answer:submit",{questionId:q.id,optionIndex:index});}}><span>{String.fromCharCode(65+index)}</span>{option}</button>)}</div>
        {answered?<div className="waiting">✓ Answer locked. Waiting for the next question…</div>:<p className="muted center">Choose quickly! The next question advances automatically.</p>}
        <div className="score-strip">{scoreRows.map(s=><div key={s.id}><span>{s.label}</span><strong>{s.score.toLocaleString()}</strong></div>)}</div>
      </>}
      {room.status==="finished"&&<>
        <div className="winner">🏆</div><h2 className="center">Final leaderboard</h2>
        <div className="results">{scoreRows.map((s,i)=><div className="result-row" key={s.id}><b>#{i+1}</b><span>{s.label}{s.id===me?.id?" (You)":""}</span><strong>{s.score.toLocaleString()} pts</strong></div>)}</div>
        {isHost?<button className="primary full" onClick={()=>socket.emit("match:replay")}>Play again ↻</button>:<div className="waiting">Waiting for the host to start a rematch…</div>}
      </>}
    </section>}
    <footer>MADE FOR YOUR CREW <span>•</span> ONE ROOM. ONE CROWN.</footer>
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
