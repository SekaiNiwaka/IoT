# app.py

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import logging

# ロギング設定 (Render環境でのデバッグ用)
logging.basicConfig(level=logging.INFO)

# Flaskアプリケーションの初期化
app = Flask(__name__)

# Render環境でのデプロイ時に必要な設定
# 環境変数からシークレットキーを取得。本番環境では必ず設定してください。
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default_secret_key') 

# Flask-SocketIOの初期化
# async_mode='gevent'はRender/Gunicornで推奨される設定
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# 初期データストア (サイトの現在の状態を保持)
# 起動時のHTMLの初期値をここに合わせる
initial_state = {
    # 時刻・測定データは、HTMLの初期値に合わせてください
    'last_measure': '【前回の測定】　2025年9月30日 16時30分',
    'next_measure': '【次回測定予定】　4時間後',
    'pulse': '125',
    'oxygen': '98％',
    'condition': '良い',
    'sleep_yote': '12時30分',
    'sleep_fact': '12時30分',
    'wake_yote': '12時30分',
    'wake_fact': '12時30分',
    'en_color': 'transparent', # 左上の円の色
    'button_state': {'text': '緊急開錠ボタン', 'is_locked_open': False, 'class': ''}
}

# サイトの現在の状態を保持するグローバル変数
global_state = initial_state.copy()


@app.route('/')
def index():
    """ルートパスでindex.htmlをレンダリング"""
    return render_template('index.html')


@socketio.on('connect')
def handle_connect():
    """クライアントが接続したときの処理"""
    app.logger.info(f'Client connected: {request.sid}')
    
    # 新規接続者に対し、最新のグローバルステートを送信して同期させる
    emit('initial_state', global_state)


@socketio.on('update_data')
def handle_update_data(data):
    """クライアントからデータ更新リクエストが来たときの処理"""
    app.logger.info(f'Received update from {request.sid}: {data["key"]}')
    
    key = data.get('key')
    value = data.get('value')
    
    if key in global_state:
        # グローバルステートを更新
        global_state[key] = value
        
        # 自身を除く全てのクライアントに更新されたデータをブロードキャスト
        emit('data_updated', {'key': key, 'value': value}, broadcast=True, include_self=False)
        
    elif key == 'button_state':
        # ★修正点: button_state全体を更新
        global_state['button_state'] = value
        
        # ★修正点: 左上の円の色をグローバルステートの最上位に反映
        global_state['en_color'] = value['en_color'] 
        
        # 自身を除く全てのクライアントにボタン状態をブロードキャスト
        emit('button_state_updated', value, broadcast=True, include_self=False)


@socketio.on('key_input')
def handle_key_input(data):
    """クライアントからキー入力が来たときの処理 (同期用)"""
    # 自身を除く全てのクライアントに、入力されたキーをブロードキャスト
    emit('key_received', {'key_name': data.get('key_name')}, broadcast=True, include_self=False)


if __name__ == '__main__':
    # 開発環境での実行
    # 本番環境(Render)ではGunicornがsocketio.run()を呼び出す
    socketio.run(app, host='0.0.0.0', port=5000)
