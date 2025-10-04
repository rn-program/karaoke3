document.getElementById("search_btn").addEventListener("click", () => {
    const music_name = document.getElementById("music_input").value.trim();
    display_music(music_name);
});

async function display_music(music_name) {
    const searched_music = document.getElementById("searched_music");
    searched_music.innerHTML = "";

    if (!music_name) return;

    try {
        const res = await fetch("/static/sound/song_list.json");
        const songList = await res.json();

        // 完全一致検索（タイトルのみ）
        const matchedSongs = songList.filter(
            s => s.title.trim().toLowerCase() === music_name.toLowerCase()
        );

        if (matchedSongs.length > 0) {
            matchedSongs.forEach(song => {
                // 曲情報行の div
                const song_div = document.createElement("div");
                song_div.className = "song_item";

                // 曲名テキスト
                const text_div = document.createElement("div");
                text_div.textContent = `${song.title} / ${song.artist}`;

                // 選択ボタン
                const music_btn = document.createElement("button");
                music_btn.textContent = "選択";
                music_btn.addEventListener("click", () => {
                    location.href = `/sing?music_name=${encodeURIComponent(song.title)}`;
                });

                // div に追加
                song_div.appendChild(text_div);
                song_div.appendChild(music_btn);

                searched_music.appendChild(song_div);
            });
        } else {
            const div = document.createElement("div");
            div.className = "no_song";
            div.textContent = "曲が登録されていません";
            searched_music.appendChild(div);
        }
    } catch (err) {
        console.error(err);
        const div = document.createElement("div");
        div.className = "no_song";
        div.textContent = "曲リストの読み込みに失敗しました";
        searched_music.appendChild(div);
    }
}