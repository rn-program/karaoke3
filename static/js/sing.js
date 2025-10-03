// ==================================================
// sing.js 完全版 (曲再生・停止にマイク同期)
// ==================================================

// HTML要素取得
const player = document.getElementById("player");
const music_name = document.getElementById("music_name").innerText;

const audioURL_wav = `static/sound/music/${music_name}/${music_name}.wav`;
const audioURL_lyrics = `static/sound/music/${music_name}/${music_name}_lyric.json`;
const audioURL_pitch = `static/sound/music/${music_name}/${music_name}_pitch.json`;

const lyricsContainer = document.getElementById("lyrics");
const canvas = document.getElementById("pitchCanvas");
const marker = document.getElementById("timeMarker");
const ctx = canvas.getContext("2d");

// ==================================================
// オーディオ設定
// ==================================================
player.src = audioURL_wav;

// ==================================================
// 歌詞読み込み
// ==================================================
let lyrics = [];
fetch(audioURL_lyrics)
    .then(response => response.json())
    .then(data => {
        lyrics = data.lyrics;
        lyrics.forEach(line => {
            const div = document.createElement("div");
            div.classList.add("lyric-line", "future");
            div.dataset.time = line.time;
            div.textContent = line.text;
            lyricsContainer.appendChild(div);
        });
    })
    .catch(err => console.error('歌詞読み込みエラー:', err));

// ==================================================
// 歌詞自動スクロール
// ==================================================
player.addEventListener("timeupdate", () => {
    const currentTime = player.currentTime;
    const lines = document.querySelectorAll(".lyric-line");
    if (lines.length === 0) return;

    let currentIndex = -1;
    lines.forEach((line, idx) => {
        const lineTime = parseFloat(line.dataset.time);
        if (currentTime >= lineTime) currentIndex = idx;
    });

    let currentLine = null;
    lines.forEach((line, idx) => {
        line.classList.remove("past", "current", "future");
        if (idx < currentIndex) {
            line.classList.add("past");
        } else if (idx === currentIndex) {
            line.classList.add("current");
            currentLine = line;
        } else {
            line.classList.add("future");
        }
    });

    if (currentLine) currentLine.scrollIntoView({ behavior: "smooth", block: "center" });
});

// ==================================================
// ピッチ描画設定
// ==================================================
let pitchData = null;
fetch(audioURL_pitch)
    .then(r => r.json())
    .then(data => {
        pitchData = data;
        resizeCanvas();
        drawPitch();
    })
    .catch(err => console.error("ピッチ読み込みエラー:", err));

// ==================================================
// Canvasリサイズ対応
// ==================================================
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    drawPitch();
}
window.addEventListener("resize", resizeCanvas);

// ==================================================
// ピッチ描画ユーティリティ
// ==================================================
const fmin = 65;
const fmax = 1500;

function freqToY(freq) {
    const H = canvas.clientHeight;
    if (!freq || freq <= 0) return H;
    const logMin = Math.log2(fmin);
    const logMax = Math.log2(fmax);
    const val = (Math.log2(freq) - logMin) / (logMax - logMin);
    return H - val * H;
}

function timeToX(t) {
    const W = canvas.clientWidth;
    const total = player.duration || (pitchData.frames.length > 0 ? pitchData.frames[pitchData.frames.length - 1].t : 0);
    return (t / total) * W;
}

function drawPitch() {
    if (!pitchData) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    ctx.save();
    ctx.globalAlpha = 0.55;
    pitchData.segments.forEach(seg => {
        const x1 = timeToX(seg.start);
        const x2 = timeToX(seg.end);
        const y = freqToY(seg.freq);
        ctx.fillStyle = "#00aa66";
        ctx.fillRect(x1, y - 5, Math.max(2, x2 - x1), 10);
    });
    ctx.restore();
}

// ==================================================
// マーカー移動
// ==================================================
player.addEventListener("timeupdate", () => {
    if (!pitchData) return;
    const t = player.currentTime;
    const W = canvas.clientWidth;
    const left = (t / player.duration) * W;
    marker.style.left = left + "px";
});

// ==================================================
// マイク・リアルタイム採点設定
// ==================================================
let audioCtx, analyser, micStream;
let score = 0;
let pitchLoopId = null;

// マイク初期化
async function initMic() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioCtx.createMediaStreamSource(micStream);

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        detectPitch(); // ループ開始
    } catch (err) {
        console.error("マイク初期化エラー:", err);
    }
}

// ピッチ検出ループ
function detectPitch() {
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const freq = autoCorrelate(buffer, audioCtx.sampleRate);
    if (freq > 0) {
        updatePitchUI(freq);
        updateScore(freq);
    }

    pitchLoopId = requestAnimationFrame(detectPitch);
}

// 停止用
function stopMic() {
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (pitchLoopId) {
        cancelAnimationFrame(pitchLoopId);
        pitchLoopId = null;
    }
    document.getElementById("pitch").textContent = "— Hz";
    document.getElementById("note").textContent = "—";
}

// 自己相関法による簡易ピッチ検出
function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    const rms = Math.sqrt(buf.reduce((sum, val) => sum + val*val, 0) / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE-1;
    while (Math.abs(buf[r1]) < 0.01) r1++;
    while (Math.abs(buf[r2]) < 0.01) r2--;
    const newBuf = buf.slice(r1, r2);
    const len = newBuf.length;

    let bestOffset = -1;
    let bestCorr = 0;
    for (let offset = 50; offset < 1000; offset++) {
        let corr = 0;
        for (let i = 0; i < len - offset; i++) {
            corr += newBuf[i] * newBuf[i + offset];
        }
        if (corr > bestCorr) {
            bestCorr = corr;
            bestOffset = offset;
        }
    }
    return bestOffset > -1 ? sampleRate / bestOffset : -1;
}

// ピッチ表示更新
function updatePitchUI(freq) {
    document.getElementById("pitch").textContent = freq.toFixed(1) + " Hz";
    const midi = freqToNote(freq);
    const noteName = noteFromMidi(midi);
    document.getElementById("note").textContent = noteName;
}

// スコア更新
function updateScore(userFreq) {
    if (!pitchData) return;
    const t = player.currentTime;
    const seg = pitchData.segments.find(s => s.start <= t && t <= s.end);
    if (!seg) return;

    const diff = Math.abs(12 * Math.log2(userFreq / seg.freq));
    if (diff < 0.5) { // 半音以内
        score++;
        document.getElementById("score").textContent = score;
    }
}

// Hz → MIDI
function freqToNote(freq) {
    return Math.round(12 * (Math.log2(freq / 440)) + 69);
}

// MIDI → 音名
const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function noteFromMidi(midi) {
    return noteNames[midi % 12] + Math.floor(midi / 12 - 1);
}

// ==================================================
// 曲再生・停止にマイク同期
// ==================================================
let micStarted = false;

// 曲再生時にマイク起動
player.addEventListener("play", async () => {
    if (!micStarted) {
        await initMic();
        micStarted = true;
    }
});

// 曲停止/一時停止時にマイク停止
player.addEventListener("pause", () => {
    stopMic();
    micStarted = false;
});
player.addEventListener("ended", () => {
    stopMic();
    micStarted = false;
});

// ==================================================
// 再生・停止ボタン制御
// ==================================================
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

// ボタンで再生
playBtn.addEventListener("click", () => {
    player.play();
});

// ボタンで停止
pauseBtn.addEventListener("click", () => {
    player.pause();
});

// ユーザーによるシーク禁止
player.addEventListener("seeking", () => {
    // 現在位置を最後の自動更新位置に戻す
    player.currentTime = player.lastTime || 0;
});

player.addEventListener("timeupdate", () => {
    player.lastTime = player.currentTime;
});
