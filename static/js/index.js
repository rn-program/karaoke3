function display_music(music_name) {
    const searched_music = document.getElementById("searched_music");

    if (!music_name) return;

    const music_btn = document.createElement("button");
    music_btn.textContent = music_name; // 曲名の表示
    music_btn.type = "button";
    
    music_btn.addEventListener("click", () => {
        const url = `/sing?music_name=${encodeURIComponent(music_name)}`;
        location.href = url;
    });

    searched_music.appendChild(music_btn)
}