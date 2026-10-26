import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { randomBytes } from "node:crypto";

const PORT = process.env.PORT || 3001;
const allowedOrigins = (process.env.CLIENT_ORIGIN || "*").split(",").map(s => s.trim());
const app = express();
app.use(cors({ origin: allowedOrigins.includes("*") ? true : allowedOrigins }));
app.get("/", (_req, res) => res.json({ name: "Quiz Clash API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok", rooms: rooms.size }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins.includes("*") ? true : allowedOrigins, methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 20000
});

const QUESTION_BANK = [
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
["What does RAM provide?","Long-term archive","Temporary working memory","Internet access","Power regulation",1,"Computers"],
["Which company created the Java language originally?","Sun Microsystems","Apple","IBM","Nokia",0,"Computers"],
["In programming, what does JSON stand for?","Java Source Object Notation","JavaScript Object Notation","Joined System Output Network","Java Syntax Order Number",1,"Computers"],
["Which symbol commonly starts a comment in JavaScript?","<!--","//","##","**",1,"Computers"],
["What is the result of 7 × 8?","54","56","64","58",1,"Reasoning"],
["What comes next: 2, 4, 8, 16, __?","18","24","30","32",3,"Reasoning"],
["If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?","Yes","No","Cannot say","Only sometimes",0,"Reasoning"],
["How many sides does a hexagon have?","5","6","7","8",1,"Reasoning"],
["What is 15% of 200?","15","20","30","35",2,"Reasoning"],
["Which number is prime?","21","27","29","33",2,"Reasoning"],
["A dozen equals how many?","10","12","14","20",1,"Reasoning"],
["If today is Monday, what day is it in 10 days?","Wednesday","Thursday","Friday","Saturday",1,"Reasoning"],
["What is the square root of 144?","10","11","12","14",2,"Reasoning"],
["Which is the odd one out?","Triangle","Square","Circle","Cube",3,"Reasoning"],
["What is the capital of Japan?","Seoul","Beijing","Tokyo","Bangkok",2,"General Knowledge"],
["How many continents are commonly taught?","5","6","7","8",2,"General Knowledge"],
["Which ocean is the largest?","Atlantic","Indian","Arctic","Pacific",3,"General Knowledge"],
["Which country is famous for the pyramids of Giza?","Mexico","Egypt","Greece","Peru",1,"General Knowledge"],
["What is the currency of the United Kingdom?","Euro","Dollar","Pound sterling","Yen",2,"General Knowledge"],
["Which is the largest mammal?","African elephant","Blue whale","Giraffe","Orca",1,"General Knowledge"],
["How many rings are on the Olympic flag?","4","5","6","7",1,"Sports"],
["In football (soccer), how many players per team start on the field?","9","10","11","12",2,"Sports"],
["Which sport uses a shuttlecock?","Squash","Badminton","Tennis","Table tennis",1,"Sports"],
["How long is a standard marathon, approximately?","21.1 km","30 km","42.195 km","50 km",2,"Sports"],
["Which country hosted the 2016 Summer Olympics?","China","Brazil","Japan","UK",1,"Sports"],
["In chess, which piece moves in an L shape?","Bishop","Rook","Knight","Queen",2,"Sports"],
["What is the term for zero in tennis?","Nil","Love","Blank","Duck",1,"Sports"],
["Which Indian city is known as India's Silicon Valley?","Mumbai","Hyderabad","Bengaluru","Pune",2,"General Knowledge"],
["What is the national animal of India?","Lion","Bengal tiger","Elephant","Leopard",1,"General Knowledge"],
["Which festival is known as the festival of lights?","Holi","Eid","Diwali","Pongal",2,"General Knowledge"]
].map((q, i) => ({ id: i + 1, text: q[0], options: q.slice(1,5), correctIndex: q[5], category: q[6] }));

const rooms = new Map();
const playerRoom = new Map();
const QUESTION_MS = 12000;
const MATCH_QUESTIONS = 10;
const MAX_PLAYERS = 8;

function code() {
  let c;
  do { c = randomBytes(3).toString("hex").slice(0, 6).toUpperCase(); } while (rooms.has(c));
  return c;
}
function safePlayer(p, viewerId) {
  return { id: p.id, label: p.id === viewerId ? p.nickname : p.label, isHost: p.isHost, connected: p.connected };
}
function roomPayload(room, viewerId) {
  return {
    code: room.code, hostId: room.hostId, status: room.status,
    players: [...room.players.values()].map(p => safePlayer(p, viewerId)),
    questionIndex: room.questionIndex,
    questionCount: room.questions.length,
    question: room.status === "playing" ? publicQuestion(room.questions[room.questionIndex]) : null,
    deadline: room.deadline,
    scores: [...room.players.values()].map(p => ({ id: p.id, label: p.id === viewerId ? p.nickname : p.label, score: p.score })),
    results: room.status === "finished" ? [...room.players.values()].map(p => ({ id: p.id, label: p.id === viewerId ? p.nickname : p.label, score: p.score })).sort((a,b) => b.score-a.score) : null
  };
}
function publicQuestion(q) {
  if (!q) return null;
  return { id: q.id, text: q.text, options: q.options, category: q.category };
}
function emitRoom(room) {
  for (const p of room.players.values()) io.to(p.id).emit("room:state", roomPayload(room, p.id));
}
function stopTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}
function startQuestionTimer(room) {
  stopTimer(room);
  room.deadline = Date.now() + QUESTION_MS;
  room.timer = setTimeout(() => advanceQuestion(room.code), QUESTION_MS);
}
function advanceQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") return;
  room.advanceScheduled = false;
  stopTimer(room);
  if (room.questionIndex + 1 >= room.questions.length) {
    room.status = "finished"; room.deadline = null; emitRoom(room); return;
  }
  room.questionIndex++;
  for (const p of room.players.values()) p.answered = false;
  startQuestionTimer(room);
  emitRoom(room);
}
function maybeAdvance(room) {
  const active = [...room.players.values()].filter(p => p.connected);
  if (!active.length || !active.every(p => p.answered) || room.advanceScheduled) return;
  room.advanceScheduled = true;
  setTimeout(() => {
    const current = rooms.get(room.code);
    if (current !== room || room.status !== "playing") return;
    room.advanceScheduled = false;
    advanceQuestion(room.code);
  }, 350);
}
function closeRoom(room, reason = "The host left. This room has been closed.") {
  stopTimer(room);
  for (const p of room.players.values()) {
    io.to(p.id).emit("room:closed", { message: reason });
    playerRoom.delete(p.id);
  }
  rooms.delete(room.code);
}
function shuffle(a) {
  const copy = [...a];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function error(socket, message) { socket.emit("app:error", { message }); }

io.on("connection", socket => {
  socket.on("room:create", ({ nickname } = {}) => {
    nickname = String(nickname || "").trim().slice(0, 20);
    if (!nickname) return error(socket, "Enter a nickname first.");
    const roomCode = code();
    const p = { id: socket.id, nickname, label: "Player 1", isHost: true, connected: true, score: 0, answered: false };
    const room = { code: roomCode, hostId: socket.id, players: new Map([[socket.id, p]]), status: "lobby", questions: [], questionIndex: -1, deadline: null, timer: null, advanceScheduled: false };
    rooms.set(roomCode, room); playerRoom.set(socket.id, roomCode); socket.join(roomCode); socket.emit("room:created", { code: roomCode }); emitRoom(room);
  });
  socket.on("room:join", ({ code: roomCode, nickname } = {}) => {
    roomCode = String(roomCode || "").trim().toUpperCase();
    nickname = String(nickname || "").trim().slice(0, 20);
    const room = rooms.get(roomCode);
    if (!nickname) return error(socket, "Enter a nickname first.");
    if (!room) return error(socket, "Room not found. Check the code.");
    if (room.status !== "lobby") return error(socket, "This match has already started.");
    if (room.players.size >= MAX_PLAYERS) return error(socket, "This room is full.");
    if ([...room.players.values()].some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) return error(socket, "That nickname is already in use in this room.");
    const usedLabels = new Set([...room.players.values()].map(player => player.label));
    let labelNumber = 2;
    while (usedLabels.has(`Player ${labelNumber}`)) labelNumber++;
    const p = { id: socket.id, nickname, label: `Player ${labelNumber}`, isHost: false, connected: true, score: 0, answered: false };
    room.players.set(socket.id, p); playerRoom.set(socket.id, roomCode); socket.join(roomCode); emitRoom(room);
  });
  socket.on("match:start", () => {
    const room = rooms.get(playerRoom.get(socket.id));
    if (!room) return error(socket, "Room no longer exists.");
    if (room.hostId !== socket.id) return error(socket, "Only the host can start the match.");
    if (room.status !== "lobby") return error(socket, "The match has already started.");
    if (room.players.size < 2) return error(socket, "Invite at least one more player before starting.");
    room.questions = shuffle(QUESTION_BANK).slice(0, MATCH_QUESTIONS);
    room.status = "playing"; room.questionIndex = 0;
    for (const p of room.players.values()) { p.score = 0; p.answered = false; }
    startQuestionTimer(room); emitRoom(room);
  });
  socket.on("answer:submit", ({ questionId, optionIndex } = {}) => {
    const room = rooms.get(playerRoom.get(socket.id));
    const p = room?.players.get(socket.id);
    if (!room || !p || room.status !== "playing") return;
    const q = room.questions[room.questionIndex];
    if (!q || q.id !== Number(questionId) || p.answered || Date.now() >= room.deadline) return;
    p.answered = true;
    if (Number(optionIndex) === q.correctIndex) {
      const remaining = Math.max(0, room.deadline - Date.now());
      p.score += 1000 + Math.round(500 * remaining / QUESTION_MS);
    }
    emitRoom(room); maybeAdvance(room);
  });
  socket.on("player:remove", ({ playerId } = {}) => {
    const room = rooms.get(playerRoom.get(socket.id));
    if (!room || room.hostId !== socket.id || playerId === socket.id) return error(socket, "Only the host can remove another player.");
    const p = room.players.get(playerId);
    if (!p) return;
    io.to(playerId).emit("room:removed", { message: "The host removed you from the room." });
    io.sockets.sockets.get(playerId)?.leave(room.code);
    playerRoom.delete(playerId); room.players.delete(playerId); emitRoom(room); maybeAdvance(room);
  });
  socket.on("match:replay", () => {
    const room = rooms.get(playerRoom.get(socket.id));
    if (!room || room.hostId !== socket.id || room.status !== "finished") return error(socket, "Only the host can start a replay.");
    room.status = "lobby"; room.questions = []; room.questionIndex = -1; room.deadline = null;
    for (const p of room.players.values()) { p.score = 0; p.answered = false; }
    emitRoom(room);
  });
  socket.on("room:leave", () => {
    const room = rooms.get(playerRoom.get(socket.id));
    if (!room) return;
    if (room.hostId === socket.id) return closeRoom(room);
    room.players.delete(socket.id); playerRoom.delete(socket.id); socket.leave(room.code); emitRoom(room); maybeAdvance(room);
  });
  socket.on("disconnect", () => {
    const room = rooms.get(playerRoom.get(socket.id));
    if (!room) return;
    if (room.hostId === socket.id) return closeRoom(room);
    const p = room.players.get(socket.id);
    if (p) { room.players.delete(socket.id); playerRoom.delete(socket.id); emitRoom(room); maybeAdvance(room); }
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Quiz Clash server listening on ${PORT}`));
