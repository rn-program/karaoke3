// ==================================================
// sing.js 完全版 (iPad対応・ボタン再生・マイク同期・シーク禁止・初回ズレ修正・曲終了遷移・100点満点採点)
// ==================================================

document.addEventListener("DOMContentLoaded", () => {
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
    player.load();

    // ==================================================
    // 再生・停止ボタン
    // ==================================================
    const playBtn = document.getElementById("playBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const reloadBtn = document.getElementById("reloadBtn");

    let micStarted = false;

    playBtn.addEventListener("click", async () => {
        if (!micStarted) {
            await initMic();       // マイク初期化
            micStarted = true;
        }
        player.play();             // 曲再生
    });

    pauseBtn.addEventListener("click", () => {
        player.pause();
        stopMic();
        micStarted = false;
    });

    reloadBtn.addEventListener("click", () => {
        location.reload();
    });

    // ==================================================
    // 曲終了時に result.html に遷移
    // ==================================================
    player.addEventListener("ended", () => {
        stopMic();
        location.href = "/result";
    });

    // ==================================================
    // 歌詞読み込み
    // ==================================================
    let lyrics = [];
    fetch(audioURL_lyrics)
        .then(r => r.json())
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
            if (idx < currentIndex) line.classList.add("past");
            else if (idx === currentIndex) {
                line.classList.add("current");
                currentLine = line;
            } else line.classList.add("future");
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
            if (player.readyState >= 1) { // メタデータ取得済み
                resizeCanvas();
                drawPitch();
            } else {
                player.addEventListener("loadedmetadata", () => {
                    resizeCanvas();
                    drawPitch();
                }, { once: true });
            }
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
    const fmin = 65, fmax = 1500;
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
        const total = player.duration || (pitchData?.segments?.length ? pitchData.segments[pitchData.segments.length - 1].end : 1);
        return (t / total) * W;
    }

    let userPitchHistory = []; // ユーザーの声のピッチ履歴

    function drawPitch() {
        if (!pitchData) return;
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

        // 曲のピッチ（緑）
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

        // ユーザーのピッチ（水色）
        if (userPitchHistory.length > 0) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = "#3399ff";
            userPitchHistory.forEach(p => {
                const x = timeToX(p.time);
                const y = freqToY(p.freq);
                ctx.fillRect(x - 1, y - 5, 2, 10);
            });
            ctx.restore();
        }
    }

    // ==================================================
    // マーカー移動
    // ==================================================
    player.addEventListener("timeupdate", () => {
        if (!pitchData) return;
        const t = player.currentTime;
        const W = canvas.clientWidth;
        marker.style.left = (t / (player.duration || 1) * W) + "px";
    });

    // ==================================================
    // ユーザーによるシーク禁止
    // ==================================================
    player.addEventListener("seeking", () => {
        player.currentTime = player.lastTime || 0;
    });
    player.addEventListener("timeupdate", () => {
        player.lastTime = player.currentTime;
    });

    // ==================================================
    // マイク・リアルタイム採点設定（100点満点）
    // ==================================================
    let audioCtx, analyser, micStream;
    let totalScore = 0;     // 累積スコア
    let sampleCount = 0;    // サンプル数
    let pitchLoopId = null;

    async function initMic() {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            const source = audioCtx.createMediaStreamSource(micStream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            detectPitch();
        } catch (err) {
            console.error("マイク初期化エラー:", err);
        }
    }

    function detectPitch() {
        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        const freq = autoCorrelate(buffer, audioCtx.sampleRate);
        if (freq > 0) {
            const t = player.currentTime;
            userPitchHistory.push({ time: t, freq: freq }); // 保存
            updatePitchUI(freq);
            updateScore(freq);
            drawPitch();
        }
        pitchLoopId = requestAnimationFrame(detectPitch);
    }

    function stopMic() {
        if (micStream) micStream.getTracks().forEach(track => track.stop());
        micStream = null;
        if (pitchLoopId) cancelAnimationFrame(pitchLoopId);
        pitchLoopId = null;
        document.getElementById("pitch").textContent = "— Hz";
        document.getElementById("note").textContent = "—";
    }

    function autoCorrelate(buf, sampleRate) {
        const SIZE = buf.length;
        const rms = Math.sqrt(buf.reduce((sum, val) => sum + val * val, 0) / SIZE);
        if (rms < 0.01) return -1;
        let r1 = 0, r2 = SIZE - 1;
        while (Math.abs(buf[r1]) < 0.01) r1++;
        while (Math.abs(buf[r2]) < 0.01) r2--;
        const newBuf = buf.slice(r1, r2);
        const len = newBuf.length;
        let bestOffset = -1, bestCorr = 0;
        for (let offset = 50; offset < 1000; offset++) {
            let corr = 0;
            for (let i = 0; i < len - offset; i++) corr += newBuf[i] * newBuf[i + offset];
            if (corr > bestCorr) { bestCorr = corr; bestOffset = offset; }
        }
        return bestOffset > -1 ? sampleRate / bestOffset : -1;
    }

    function updatePitchUI(freq) {
        document.getElementById("pitch").textContent = freq.toFixed(1) + " Hz";
        const midi = freqToNote(freq);
        const noteName = noteFromMidi(midi);
        document.getElementById("note").textContent = noteName;
    }

    function updateScore(userFreq) {
        if (!pitchData) return;
        const t = player.currentTime;
        const seg = pitchData.segments.find(s => s.start <= t && t <= s.end);
        if (!seg) return;

        const diff = Math.abs(12 * Math.log2(userFreq / seg.freq));
        const sampleScore = Math.max(0, 100 * (1 - diff / 0.5));

        totalScore += sampleScore;
        sampleCount++;
        const avgScore = sampleCount > 0 ? totalScore / sampleCount : 0;
        document.getElementById("score").textContent = Math.round(avgScore);
    }

    function freqToNote(freq) {
        return Math.round(12 * (Math.log2(freq / 440)) + 69);
    }

    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    function noteFromMidi(midi) {
        return noteNames[midi % 12] + Math.floor(midi / 12 - 1);
    }
});