import os
from flask import Flask, request, render_template

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

# 曲選択を受信
@app.route("/choose_music", methods=["POST"])
def choose_music():
    music_name = request.form.get("music_name")
    return render_template("index.html", music_name=music_name)

# 歌唱ページに遷移
@app.route("/sing")
def sing():
    music_name = request.args.get("music_name")
    return render_template("sing.html", music_name=music_name)

# 採点画面に遷移
@app.route("/result")
def result():
    return render_template("result.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)