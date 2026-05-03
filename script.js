// 🔥 Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore, collection, getDocs, query, orderBy, limit,
  doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth, signInWithPopup, GoogleAuthProvider, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 🔥 config
const firebaseConfig = {
  apiKey: "AIzaSyBKt_8xBpD8p1LJJKTGKXcy8HMOeUeCuCA",
  authDomain: "infinite-wordle-b7151.firebaseapp.com",
  projectId: "infinite-wordle-b7151",
  storageBucket: "infinite-wordle-b7151.firebasestorage.app",
  messagingSenderId: "508762473322",
  appId: "1:508762473322:web:cecbabc1bebe51f9959b13",
  measurementId: "G-SMN4Y8HSFG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 요소
const board = document.getElementById("board");
const messageEl = document.getElementById("message");
const restartBtn = document.getElementById("restartBtn");

// 상태
let dictionary = [];
let answer = "";
let currentRow = 0;
let currentCol = 0;
let gameOver = false;
let isAnimating = false;
let currentRankingType = "winRate";

let playerName = "";

// 통계
let stats = {
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  distribution: [0,0,0,0,0,0]
};

// 저장
function loadStats() {
  const saved = localStorage.getItem("wordleStats_" + playerName);
  if (saved) stats = JSON.parse(saved);
}

function saveStats() {
  localStorage.setItem("wordleStats_" + playerName, JSON.stringify(stats));
}

// UI
function updateStatsUI() {
  const winRate = stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
  const max = Math.max(...stats.distribution, 1);

  let bars = "";
  for (let i = 0; i < 6; i++) {
    const width = (stats.distribution[i] / max) * 100;

    bars += `
      <div class="bar-row">
        <div class="bar-label">${i + 1}</div>
        <div class="bar" style="width:${width}%">
          ${stats.distribution[i]}
        </div>
      </div>
    `;
  }

  document.getElementById("stats").innerHTML = `
    <h3>${playerName}</h3>
    플레이: ${stats.played} | 맞힘: ${stats.wins} | 승률: ${winRate}%
    연승: ${stats.streak} (최대 ${stats.maxStreak})
    
    <br><br>
    <b>분포</b>
    ${bars}
  `;
}

// 사전
async function loadDictionary() {
  const res = await fetch("words.txt");
  const text = await res.text();
  dictionary = text.split("\n").map(w => w.trim().toUpperCase()).filter(w => w.length === 5);
}

// 보드
function createBoard() {
  board.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const row = document.createElement("div");
    row.classList.add("row");

    for (let j = 0; j < 5; j++) {
      const tile = document.createElement("div");
      tile.classList.add("tile");
      row.appendChild(tile);
    }

    board.appendChild(row);
  }
}

// 키보드
function createKeyboard() {
  const keyboard = document.getElementById("keyboard");
  keyboard.innerHTML = "";

  const layout = [
    "QWERTYUIOP",
    "ASDFGHJKL",
    "ZXCVBNM"
  ];

  layout.forEach((rowStr, rowIndex) => {
    const row = document.createElement("div");
    row.classList.add("key-row");

    // 🔥 3번째 줄이면 ENTER 먼저 추가
    if (rowIndex === 2) {
      const enterKey = document.createElement("div");
      enterKey.classList.add("key");
      enterKey.textContent = "ENTER";
      enterKey.style.width = "60px";

      enterKey.addEventListener("click", checkGuess);
      row.appendChild(enterKey);
    }

    // 🔥 알파벳 키들
    for (let char of rowStr) {
      const key = document.createElement("div");
      key.classList.add("key");
      key.textContent = char;
      key.id = "key-" + char;
      key.dataset.state = "";

      key.addEventListener("click", () => {
        if (gameOver || isAnimating) return;

        const rows = document.querySelectorAll(".row");

        if (currentCol < 5) {
          rows[currentRow].children[currentCol].textContent = char;
          currentCol++;
        }
      });

      row.appendChild(key);
    }

    // 🔥 3번째 줄이면 BACKSPACE 마지막에 추가
    if (rowIndex === 2) {
      const backKey = document.createElement("div");
      backKey.classList.add("key");
      backKey.textContent = "⌫";
      backKey.style.width = "60px";

      backKey.addEventListener("click", () => {
        if (gameOver || isAnimating) return;

        const rows = document.querySelectorAll(".row");

        if (currentCol > 0) {
          currentCol--;
          rows[currentRow].children[currentCol].textContent = "";
        }
      });

      row.appendChild(backKey);
    }

    keyboard.appendChild(row);
  });
}

// 키 색
function updateKeyColor(letter, status) {
  const key = document.getElementById("key-" + letter);
  if (!key) return;

  const current = key.dataset.state;
  if (current === "correct") return;
  if (current === "present" && status === "absent") return;

  key.dataset.state = status;

  if (status === "correct") key.style.backgroundColor = "green";
  else if (status === "present") key.style.backgroundColor = "gold";
  else key.style.backgroundColor = "lightgray";
}

// 흔들림
function shakeRow(rowIndex) {
  const row = document.querySelectorAll(".row")[rowIndex];
  row.classList.add("error");
  row.classList.remove("shake");
  void row.offsetWidth;
  row.classList.add("shake");

  setTimeout(() => {
    row.classList.remove("shake");
    row.classList.remove("error");
  }, 400);
}

// 시작
async function startGame() {
  if (dictionary.length === 0) await loadDictionary();

  answer = dictionary[Math.floor(Math.random() * dictionary.length)];

  currentRow = 0;
  currentCol = 0;
  gameOver = false;
  isAnimating = false;

  createBoard();
  createKeyboard();

  messageEl.textContent = "";
  restartBtn.style.display = "none";
}

// 입력
function getGuess() {
  const tiles = document.querySelectorAll(".row")[currentRow].children;
  return Array.from(tiles).map(t => t.textContent).join("");
}

// ⭐ 핵심: Wordle 애니메이션 복구
async function checkGuess() {
  if (gameOver || isAnimating) return;

  const rows = document.querySelectorAll(".row");
  const tiles = rows[currentRow].children;
  const guess = getGuess();

  if (guess.length < 5) return;

  if (!dictionary.includes(guess)) {
    messageEl.textContent = "없는 단어입니다!";
    shakeRow(currentRow);
    return;
  }

  isAnimating = true;

  const result = Array(5).fill("absent");
  const letterCount = {};

  for (let c of answer) {
    letterCount[c] = (letterCount[c] || 0) + 1;
  }

  // correct 먼저
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      letterCount[guess[i]]--;
    }
  }

  // present
  for (let i = 0; i < 5; i++) {
    if (result[i] === "correct") continue;
    if (letterCount[guess[i]] > 0) {
      result[i] = "present";
      letterCount[guess[i]]--;
    }
  }

  // 🔥 flip 애니메이션
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const tile = tiles[i];
      tile.classList.add("flip");

      setTimeout(() => {
        if (result[i] === "correct") tile.style.backgroundColor = "green";
        else if (result[i] === "present") tile.style.backgroundColor = "gold";
        else tile.style.backgroundColor = "lightgray";

        updateKeyColor(guess[i], result[i]);
      }, 250);

    }, i * 300);
  }

  setTimeout(async () => {
    if (guess === answer) {
      stats.played++;
      stats.wins++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.distribution[currentRow]++;
      saveStats();

      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "scores", user.uid), {
          name: user.displayName,
          wins: stats.wins,
          played: stats.played,
          streak: stats.streak,
          winRate: stats.wins / stats.played,
          timestamp: Date.now()
        });
      }

      messageEl.textContent = "정답! 🎉";
      gameOver = true;
      restartBtn.style.display = "block";

    } else {
      currentRow++;
      currentCol = 0;

      if (currentRow === 6) {
        stats.played++;
        stats.streak = 0;
        saveStats();

        messageEl.textContent = "실패! 정답: " + answer;
        gameOver = true;
        restartBtn.style.display = "block";
      }
    }

    updateStatsUI();
    loadRanking(currentRankingType);
    isAnimating = false;

  }, 1600);
}

// 키 입력
document.addEventListener("keydown", (e) => {
  if (gameOver || isAnimating) return;

  const rows = document.querySelectorAll(".row");

  if (/^[a-zA-Z]$/.test(e.key) && currentCol < 5) {
    rows[currentRow].children[currentCol].textContent = e.key.toUpperCase();
    currentCol++;
  }

  if (e.key === "Backspace" && currentCol > 0) {
    currentCol--;
    rows[currentRow].children[currentCol].textContent = "";
  }

  if (e.key === "Enter") checkGuess();
});

// 다시하기
restartBtn.addEventListener("click", startGame);

// 랭킹
async function loadRanking(type = "winRate") {
  currentRankingType = type;

  const q = query(
    collection(db, "scores"),
    orderBy(type, "desc"),
    limit(10)
  );

  const snapshot = await getDocs(q);

  let html = "";
  let rank = 1;

  snapshot.forEach(docSnap => {
    const d = docSnap.data();

    let value =
      type === "streak" ? `${d.streak} 연승` :
      type === "wins" ? `${d.wins}회` :
      `${Math.round(d.winRate * 100)}%`;

    let cls =
      rank === 1 ? "rank-1" :
      rank === 2 ? "rank-2" :
      rank === 3 ? "rank-3" : "";

    html += `<div>${rank}. <span class="${cls}">${d.name}</span> - ${value}</div>`;
    rank++;
  });

  document.getElementById("ranking").innerHTML = html;
}

// 로그인
async function login() {
  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  playerName = user.displayName;

  loadStats();
  updateStatsUI();
  startGame();
  loadRanking();
}

// 로그아웃
async function logout() {
  await signOut(auth);
  location.reload();
}

const themeToggle = document.getElementById("themeToggle");

// 저장된 테마 불러오기
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
}

// 버튼 클릭
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  if (document.body.classList.contains("dark")) {
    localStorage.setItem("theme", "dark");
    themeToggle.textContent = "☀️ 라이트모드";
  } else {
    localStorage.setItem("theme", "light");
    themeToggle.textContent = "🌙 다크모드";
  }
});

// 전역
window.login = login;
window.logout = logout;
window.loadRanking = loadRanking;