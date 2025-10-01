# app.py

from flask import Flask, render_template, request, jsonify
import os
import logging

# ロギング設定
logging.basicConfig(level=logging.INFO)

# Flaskアプリケーションの初期化
app = Flask(__name__)

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default_secret_key') 

# 初期データストア (サイトの現在の状態を保持)
# HTMLの初期値をここに合わせる
global_state = {
    # 測定データ
    'last_measure': '【前回の測定】　2025年9月30日 16時30分',
    'next_measure': '【次回測定予定】　4時間後',
    'pulse': '125',
    'oxygen': '98', # ★単位の'%'は含めず数値のみを保持する
    'condition': '良い',
    # 時刻データ
    'sleep_yote': '12時30分',
    'sleep_fact': '12時30分',
    'wake_yote': '12時30分',
    'wake_fact': '12時30分',
    # ボタン・円の状態
    'en_color': 'transparent', # 左上の円の色
    'button_state': {'text': '緊急開錠ボタン', 'is_locked_open': False, 'class': ''}
}


@app.route('/')
def index():
    """ルートパスでindex.htmlをレンダリング"""
    return render_template('index.html')


@app.route('/state', methods=['GET'])
def get_state():
    """クライアントからの問い合わせに対し、現在の全状態を返す"""
    return jsonify(global_state)


@app.route('/update', methods=['POST'])
def update_state():
    """クライアントからの更新リクエストを受け付け、グローバルステートを更新する"""
    data = request.json
    
    # データをグローバルステートにマージ
    for key, value in data.items():
        if key in global_state:
            global_state[key] = value
        elif key == 'button_state':
            global_state['button_state'] = value
            global_state['en_color'] = value.get('en_color', 'transparent')
            
    app.logger.info(f"State updated by {request.remote_addr}")
    return jsonify({"status": "ok", "state": global_state})


if __name__ == '__main__':
    # 開発環境での実行
    app.run(host='0.0.0.0', port=5000)
