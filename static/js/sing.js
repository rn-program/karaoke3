// ==================================================
// sing.js 完全版（長尺曲対応・自動横スクロール・マイク同期・オフセット調整可能）
// ==================================================

document.addEventListener("DOMContentLoaded", () => {
    const player = document.getElementById("player");
    const music_name = document.getElementById("music_name").innerText;

    const audioURL_wav = `static/sound/music/${music_name}/${music_name}.wav`;
    const audioURL_lyrics = `static/sound/music/${music_name}/${music_name}_lyric.json`;
    const audioURL_pitch = `static/sound/music/${music_name}/${music_name}_pitch.json`;

    const lyricsContainer = document.getElementById("lyrics");
    const canvas = document.getElementById("pitchCanvas");
    const wrapper = document.getElementById("pitchWrapper");
    const marker = document.getElementById("timeMarker");
    const ctx = canvas.getContext("2d");

    // ==================================================
    // オーディオ設定
    // ==================================================
    player.src = audioURL_wav;
    player.load();

    const playBtn = document.getElementById("playBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const reloadBtn = document.getElementById("reloadBtn");

    let micStarted = false;
    playBtn.addEventListener("click", async () => {
        if (!micStarted) {
            await initMic();
            micStarted = true;
        }
        player.play();
    });
    pauseBtn.addEventListener("click", () => {
        player.pause();
        stopMic();
        micStarted = false;
    });
    reloadBtn.addEventListener("click", () => location.reload());
    player.addEventListener("ended", () => {
        stopMic();
        location.href = "/";
    });

    // ==================================================
    // ピッチオフセットスライダー
    // ==================================================
    let delay_offset = 0.45;
    const offsetSlider = document.getElementById("offsetSlider");
    const offsetValue = document.getElementById("offsetValue");
    offsetSlider.addEventListener("input", () => {
        delay_offset = parseFloat(offsetSlider.value);
        offsetValue.textContent = delay_offset.toFixed(2);
        if (pitchData) pitchData.segments.forEach(seg => {
            seg.start = seg.origStart + delay_offset;
            seg.end = seg.origEnd + delay_offset;
        });
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
        if (!lines.length) return;
        let currentIndex = -1;
        lines.forEach((line, idx) => {
            if (currentTime >= parseFloat(line.dataset.time)) currentIndex = idx;
        });
        lines.forEach((line, idx) => {
            line.classList.remove("past", "current", "future");
            if (idx < currentIndex) line.classList.add("past");
            else if (idx === currentIndex) line.classList.add("current");
            else line.classList.add("future");
        });
        if (currentIndex >= 0) lines[currentIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // ==================================================
    // ピッチ描画設定
    // ==================================================
    let pitchData = null;
    fetch(audioURL_pitch)
        .then(r => r.json())
        .then(data => {
            pitchData = data;
            // 元の開始・終了時刻を保存しておく
            pitchData.segments.forEach(seg => {
                seg.origStart = seg.start;
                seg.origEnd = seg.end;
                seg.start += delay_offset;
                seg.end += delay_offset;
            });
            if (player.readyState >= 1) { resizeCanvas(); drawPitch(); }
            else player.addEventListener("loadedmetadata", () => { resizeCanvas(); drawPitch(); }, { once: true });
        })
        .catch(err => console.error("ピッチ読み込みエラー:", err));

    const MAX_WIDTH = 2000;
    function resizeCanvas() {
        if (!pitchData) return;
        const rect = canvas.getBoundingClientRect();
        const totalDuration = player.duration || 1;
        const canvasWidth = Math.max(rect.width, MAX_WIDTH, totalDuration * (MAX_WIDTH / 30));
        canvas.width = Math.round(canvasWidth * devicePixelRatio);
        canvas.height = Math.round(rect.height * devicePixelRatio);
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        drawPitch();
    }
    window.addEventListener("resize", resizeCanvas);

    const fmin = 65, fmax = 1500;
    function freqToY(freq) {
        const H = canvas.clientHeight;
        if (!freq || freq <= 0) return H;
        return H - ((Math.log2(freq) - Math.log2(fmin)) / (Math.log2(fmax) - Math.log2(fmin))) * H;
    }

    function timeToX(t) {
        const totalDuration = player.duration || 1;
        return (t / totalDuration) * canvas.clientWidth;
    }

    let userPitchHistory = [];
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

        // ユーザーピッチ（水色）
        if (userPitchHistory.length > 1) {
            ctx.save();
            ctx.strokeStyle = "#3399ff";
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            userPitchHistory.forEach((p, idx) => {
                const x = timeToX(p.time);
                const y = freqToY(p.freq);
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
        }

        requestAnimationFrame(drawPitch);
    }

    // ==================================================
    // 自動横スクロール
    // ==================================================
    player.addEventListener("timeupdate", () => {
        const t = player.currentTime;
        const scrollWidth = canvas.clientWidth - wrapper.clientWidth;
        wrapper.scrollLeft = (t / (player.duration || 1)) * scrollWidth;
        marker.style.left = (t / (player.duration || 1) * canvas.clientWidth) + "px";
    });
    player.addEventListener("seeking", () => player.currentTime = player.lastTime || 0);
    player.addEventListener("timeupdate", () => player.lastTime = player.currentTime);

    // ==================================================
    // マイク・リアルタイムピッチ
    // ==================================================
    let audioCtx, analyser, micStream;
    let pitchLoopId = null;

    async function initMic() {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            const source = audioCtx.createMediaStreamSource(micStream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            detectPitch();
        } catch (err) { console.error("マイク初期化エラー:", err); }
    }

    function detectPitch() {
        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        const freq = autoCorrelate(buffer, audioCtx.sampleRate);
        if (freq > 0) {
            const t = player.currentTime;
            userPitchHistory.push({ time: t, freq: freq });
            updatePitchUI(freq);
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

    function freqToNote(freq) { return Math.round(12 * (Math.log2(freq / 440)) + 69); }
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    function noteFromMidi(midi) { return noteNames[midi % 12] + Math.floor(midi / 12 - 1); }
});