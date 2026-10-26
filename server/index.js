import express from "express";
import http from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import { randomBytes, randomUUID } from "node:crypto";

const PORT = process.env.PORT || 3001;
const origins = (process.env.CLIENT_ORIGIN || "*").split(",").map(x => x.trim()).filter(Boolean);
const origin = origins.includes("*") ? true : origins;
const app = express();
app.use(cors({ origin }));
app.get("/", (_req, res) => res.json({ name: "Quiz Clash API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok", rooms: rooms.size }));
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin, methods: ["GET", "POST"] }, pingInterval: 25000, pingTimeout: 20000 });

const RAW = [
["Which planet is known as the Red Planet?","Venus","Mars","Jupiter","Mercury",1,"Science"],
["What is the chemical symbol for gold?","Ag","Gd","Au","Go",2,"Science"],
["Which gas do plants absorb?","Oxygen","Nitrogen","Carbon dioxide","Hydrogen",2,"Science"],
["What is the hardest natural substance?","Iron","Quartz","Diamond","Granite",2,"Science"],
["How many bones are in a typical adult human body?","186","206","226","246",1,"Science"],
["Which organ pumps blood around the body?","Lungs","Brain","Liver","Heart",3,"Science"],
["What is H2O commonly called?","Salt","Water","Hydrogen","Oxygen",1,"Science"],
["Which force keeps planets in orbit?","Friction","Magnetism","Gravity","Pressure",2,"Science"],
["What is the nearest star to Earth?","Sirius","The Sun","Proxima Centauri","Polaris",1,"Science"],
["At sea level, water boils at what temperature in Celsius?","50","90","100","120",2,"Science"],
["Which language runs natively in web browsers?","Python","JavaScript","C++","Rust",1,"Computers"],
["What does CPU stand for?","Central Processing Unit","Computer Power Utility","Core Program Unit","Central Program Upload",0,"Computers"],
["Which data structure uses FIFO order?","Stack","Queue","Tree","Graph",1,"Computers"],
["What does HTML primarily define?","Database schema","Webpage structure","Network routing","Image compression",1,"Computers"],
["Which one is a version-control system?","Docker","Git","Figma","Linux",1,"Computers"],
["What does API stand for?","Application Programming Interface","Applied Program Internet","Automated Protocol Input","Application Process Instruction",0,"Computers"],
["Which protocol secures HTTP traffic?","FTP","SSH","TLS","SMTP",2,"Computers"],
["What is 1 byte equal to?","4 bits","8 bits","16 bits","32 bits",1,"Computers"],
["Which SQL command reads rows?","PUSH","SELECT","FETCHALL","OPEN",1,"Computers"],
["Which one is an operating system?","React","Node.js","Linux","PostgreSQL",2,"Computers"],
["What is 7 × 8?","54","56","64","58",1,"Reasoning"],
["What comes next: 2, 4, 8, 16, __?","18","24","30","32",3,"Reasoning"],
["How many sides does a hexagon have?","5","6","7","8",1,"Reasoning"],
["What is 15% of 200?","15","20","30","35",2,"Reasoning"],
["Which number is prime?","21","27","29","33",2,"Reasoning"],
["A dozen equals how many?","10","12","14","20",1,"Reasoning"],
["What is the square root of 144?","10","11","12","14",2,"Reasoning"],
["What is the capital of Japan?","Seoul","Beijing","Tokyo","Bangkok",2,"General Knowledge"],
["Which ocean is the largest?","Atlantic","Indian","Arctic","Pacific",3,"General Knowledge"],
["Which country is famous for the pyramids of Giza?","Mexico","Egypt","Greece","Peru",1,"General Knowledge"],
["What is the currency of the United Kingdom?","Euro","Dollar","Pound sterling","Yen",2,"General Knowledge"],
["Which is the largest mammal?","African elephant","Blue whale","Giraffe","Orca",1,"General Knowledge"],
["In football, how many players per team start on the field?","9","10","11","12",2,"Sports"],
["Which sport uses a shuttlecock?","Squash","Badminton","Tennis","Table tennis",1,"Sports"],
["How long is a standard marathon?","21.1 km","30 km","42.195 km","50 km",2,"Sports"],
["In chess, which piece moves in an L shape?","Bishop","Rook","Knight","Queen",2,"Sports"],
["What is the term for zero in tennis?","Nil","Love","Blank","Duck",1,"Sports"],
["Which Indian city is known as India's Silicon Valley?","Mumbai","Hyderabad","Bengaluru","Pune",2,"General Knowledge"],
["What is the national animal of India?","Lion","Bengal tiger","Elephant","Leopard",1,"General Knowledge"],
["Which festival is known as the festival of lights?","Holi","Eid","Diwali","Pongal",2,"General Knowledge"]
];
const QUESTIONS = RAW.map((q, i) => ({ id: i + 1, text: q[0], options: q.slice(1, 5), correctIndex: q[5], category: q[6] }));
const rooms = new Map(), socketRoom = new Map(), sessions = new Map();
const QUESTION_MS = 12000, MATCH_QUESTIONS = 10, MAX_PLAYERS = 8, GRACE_MS = 60000;

function roomCode() { let c; do { c = randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(c)); return c; }
function shuffle(a) { a = [...a]; for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function publicQuestion(q) { return q ? { id:q.id, text:q.text, options:q.options, category:q.category } : null; }
function emitRoom(room) {
  for (const p of room.players.values()) if (p.socketId) io.to(p.socketId).emit("room:state", {
    code:room.code, hostId:room.hostId, status:room.status,
    players:[...room.players.values()].map(x=>({id:x.id,label:x.id===p.id?x.nickname:x.label,isHost:x.id===room.hostId,connected:x.connected,answered:x.answered,isMe:x.id===p.id})),
    questionIndex:room.questionIndex, questionCount:room.questions.length || MATCH_QUESTIONS,
    question:room.status==="playing"?publicQuestion(room.questions[room.questionIndex]):null,
    deadline:room.deadline, serverNow:Date.now(), answered:p.answered,
    scores:[...room.players.values()].map(x=>({id:x.id,label:x.id===p.id?x.nickname:x.label,score:x.score})).sort((a,b)=>b.score-a.score)
  });
}
function err(s, message) { s.emit("app:error", { message }); }
function stopTimer(r) { if (r.timer) clearTimeout(r.timer); r.timer=null; }
function closeRoom(r, message="The host left. This room has been closed.") {
  stopTimer(r);
  for (const p of r.players.values()) { if(p.socketId) io.to(p.socketId).emit("room:closed",{message}); sessions.delete(p.sessionToken); if(p.socketId) socketRoom.delete(p.socketId); }
  rooms.delete(r.code);
}
function scheduleAdvance(r) {
  if (r.advanceScheduled || r.status!=="playing") return;
  r.advanceScheduled=true;
  setTimeout(()=>{ if(rooms.get(r.code)!==r || r.status!=="playing") return; r.advanceScheduled=false; advance(r); },250);
}
function advance(r) {
  if(r.status!=="playing") return;
  stopTimer(r);
  if(r.questionIndex+1>=r.questions.length) { r.status="finished"; r.deadline=null; emitRoom(r); return; }
  r.questionIndex++; for(const p of r.players.values()) p.answered=false;
  r.deadline=Date.now()+QUESTION_MS;
  r.timer=setTimeout(()=>scheduleAdvance(r),QUESTION_MS);
  emitRoom(r);
}
function maybeAdvance(r) { const active=[...r.players.values()].filter(p=>p.connected); if(active.length && active.every(p=>p.answered)) scheduleAdvance(r); }
function removePlayer(r,p,message="The host removed you from the room.") {
  if(p.socketId) { io.to(p.socketId).emit("room:removed",{message}); io.sockets.sockets.get(p.socketId)?.leave(r.code); socketRoom.delete(p.socketId); }
  sessions.delete(p.sessionToken); if(p.reconnectTimer) clearTimeout(p.reconnectTimer); r.players.delete(p.id); emitRoom(r); maybeAdvance(r);
}
function makePlayer(socket,nickname,label,isHost,room) {
  const p={id:randomUUID(),sessionToken:randomBytes(24).toString("hex"),socketId:socket.id,nickname,label,isHost,connected:true,score:0,answered:false,reconnectTimer:null};
  room.players.set(p.id,p); sessions.set(p.sessionToken,{roomCode:room.code,playerId:p.id,expiresAt:Date.now()+GRACE_MS}); socketRoom.set(socket.id,room.code); socket.join(room.code); return p;
}
io.on("connection", socket=>{
  socket.on("room:create",({nickname}={})=>{
    nickname=String(nickname||"").trim().slice(0,20); if(!nickname) return err(socket,"Enter your nickname first.");
    if(socketRoom.has(socket.id)) return err(socket,"Leave your current room first.");
    const code=roomCode(), room={code,hostId:null,players:new Map(),status:"lobby",questions:[],questionIndex:-1,deadline:null,timer:null,advanceScheduled:false,lastActivity:Date.now()};
    rooms.set(code,room); const p=makePlayer(socket,nickname,"Player 1",true,room); room.hostId=p.id;
    socket.emit("room:created",{code,sessionToken:p.sessionToken}); emitRoom(room);
  });
  socket.on("room:join",({code,nickname}={})=>{
    code=String(code||"").trim().toUpperCase(); nickname=String(nickname||"").trim().slice(0,20);
    if(!nickname) return err(socket,"Enter your nickname first.");
    if(socketRoom.has(socket.id)) return err(socket,"Leave your current room first.");
    const r=rooms.get(code); if(!r) return err(socket,"Room not found. Check the code.");
    if(r.status!=="lobby") return err(socket,"This match has already started.");
    if(r.players.size>=MAX_PLAYERS) return err(socket,"This room is full.");
    if([...r.players.values()].some(p=>p.nickname.toLowerCase()===nickname.toLowerCase())) return err(socket,"That nickname is already in use.");
    const labels=new Set([...r.players.values()].map(p=>p.label)); let n=2; while(labels.has(`Player ${n}`)) n++;
    const p=makePlayer(socket,nickname,`Player ${n}`,false,r); socket.emit("room:joined",{code,sessionToken:p.sessionToken}); emitRoom(r);
  });
  socket.on("session:resume",({sessionToken}={})=>{
    const ses=sessions.get(String(sessionToken||"")); if(!ses || ses.expiresAt<Date.now()) { sessions.delete(String(sessionToken||"")); return socket.emit("session:resume-failed",{message:"Your session expired. Join the room again."}); }
    const r=rooms.get(ses.roomCode), p=r?.players.get(ses.playerId); if(!r||!p) { sessions.delete(String(sessionToken||"")); return socket.emit("session:resume-failed",{message:"That room is no longer available."}); }
    if(p.reconnectTimer) clearTimeout(p.reconnectTimer); p.socketId=socket.id; p.connected=true;
    sessions.set(p.sessionToken,{...ses,expiresAt:Date.now()+GRACE_MS}); socketRoom.set(socket.id,r.code); socket.join(r.code);
    socket.emit("session:resumed",{code:r.code,sessionToken:p.sessionToken}); emitRoom(r);
  });
  socket.on("match:start",()=>{
    const r=rooms.get(socketRoom.get(socket.id)), p=r&&[...r.players.values()].find(x=>x.socketId===socket.id);
    if(!r||!p) return err(socket,"Room no longer exists.");
    if(p.id!==r.hostId) return err(socket,"Only the host can start the match.");
    if(r.status!=="lobby") return err(socket,"The match has already started.");
    if(r.players.size<2) return err(socket,"Invite at least one more player before starting.");
    r.questions=shuffle(QUESTIONS).slice(0,MATCH_QUESTIONS); r.status="playing"; r.questionIndex=0; r.advanceScheduled=false;
    for(const x of r.players.values()){x.score=0;x.answered=false;}
    r.deadline=Date.now()+QUESTION_MS; r.timer=setTimeout(()=>scheduleAdvance(r),QUESTION_MS); emitRoom(r);
  });
  socket.on("answer:submit",({questionId,optionIndex}={})=>{
    const r=rooms.get(socketRoom.get(socket.id)), p=r&&[...r.players.values()].find(x=>x.socketId===socket.id);
    if(!r||!p||r.status!=="playing") return;
    const q=r.questions[r.questionIndex], index=Number(optionIndex);
    if(!q||q.id!==Number(questionId)||p.answered||Date.now()>=r.deadline||!Number.isInteger(index)||index<0||index>3) return;
    p.answered=true; if(index===q.correctIndex) p.score+=1000+Math.round(500*Math.max(0,r.deadline-Date.now())/QUESTION_MS);
    emitRoom(r); maybeAdvance(r);
  });
  socket.on("player:remove",({playerId}={})=>{
    const r=rooms.get(socketRoom.get(socket.id)), p=r&&[...r.players.values()].find(x=>x.socketId===socket.id);
    if(!r||!p||p.id!==r.hostId) return err(socket,"Only the host can remove players.");
    if(r.status!=="lobby") return err(socket,"Players can only be removed from the lobby.");
    const target=r.players.get(String(playerId)); if(target&&target.id!==r.hostId) removePlayer(r,target);
  });
  socket.on("match:replay",()=>{
    const r=rooms.get(socketRoom.get(socket.id)), p=r&&[...r.players.values()].find(x=>x.socketId===socket.id);
    if(!r||!p||p.id!==r.hostId) return err(socket,"Only the host can start a rematch.");
    if(r.status!=="finished") return err(socket,"The match has not finished.");
    stopTimer(r); r.status="lobby"; r.questions=[]; r.questionIndex=-1; r.deadline=null; r.advanceScheduled=false;
    for(const x of r.players.values()){x.score=0;x.answered=false;} emitRoom(r);
  });
  socket.on("room:leave",()=>{
    const r=rooms.get(socketRoom.get(socket.id)), p=r&&[...r.players.values()].find(x=>x.socketId===socket.id); if(!r||!p)return;
    if(p.id===r.hostId) return closeRoom(r);
    removePlayer(r,p,"You left the room."); socket.leave(r.code);
  });
  socket.on("disconnect",()=>{
    const code=socketRoom.get(socket.id); socketRoom.delete(socket.id); const r=rooms.get(code);
    const p=r&&[...r.players.values()].find(x=>x.socketId===socket.id); if(!r||!p)return;
    p.connected=false;p.socketId=null;sessions.set(p.sessionToken,{roomCode:r.code,playerId:p.id,expiresAt:Date.now()+GRACE_MS});emitRoom(r);
    p.reconnectTimer=setTimeout(()=>{
      if(rooms.get(r.code)!==r||p.connected)return;
      if(p.id===r.hostId) closeRoom(r,"The host disconnected and did not reconnect. This room has been closed.");
      else {sessions.delete(p.sessionToken);r.players.delete(p.id);emitRoom(r);maybeAdvance(r);}
    },GRACE_MS);
  });
});
httpServer.listen(PORT,"0.0.0.0",()=>console.log(`Quiz Clash server listening on ${PORT}`));
