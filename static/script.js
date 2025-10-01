document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 0. Socket.IO接続
    // ----------------------------------------------------
    // デプロイ先によっては、RenderのURLを指定する必要がある場合がある
    const socket = io(); 

    // ----------------------------------------------------
    // 1. 要素の取得 (IDによる取得に統一)
    // ----------------------------------------------------
    const emergencyButton = document.querySelector('.ema');
    const fixedCircle = document.querySelector('.en');
    const keyOutputSpan = document.getElementById('key-output');

    // 測定データ要素
    const pulseElement = document.getElementById('pulse-data');
    const oxygenElement = document.getElementById('oxygen-data');
    const conditionElement = document.getElementById('condition-data');

    // 時刻要素
    const sleepYoteElement = document.getElementById('sleep-yote');
    const sleepFactElement = document.getElementById('sleep-fact');
    const wakeYoteElement = document.getElementById('wake-yote');
    const wakeFactElement = document.getElementById('wake-fact');
    
    // 測定日時関連の要素
    const lastMeasureElement = document.getElementById('last-measure');
    const nextMeasureElement = document.getElementById('next-measure');
    
    // 状態を管理する変数
    let isLockedOpen = false;
    let commandInput = ''; 
    const defaultButtonText = emergencyButton ? emergencyButton.textContent : '緊急開錠ボタン';
    const redFeedback = 'clicked-feedback-red';
    const blueFeedback = 'clicked-feedback-blue';

    // ----------------------------------------------------
    // 2. サーバーへのデータ送信ヘルパー関数
    // ----------------------------------------------------

    /**
     * サーバーにDOM要素のtextContentの変更を通知する
     * @param {string} key - サーバーのデータストアで使うキー (e.g., 'pulse', 'sleep_yote')
     * @param {string} value - 送信する値
     */
    const sendDataUpdate = (key, value) => {
        socket.emit('update_data', { key: key, value: value });
    };

    /**
     * サーバーにキー入力を送信する（キー入力同期用）
     * @param {string} keyName - 押されたキーの名前
     */
    const sendKeyInput = (keyName) => {
        socket.emit('key_input', { key_name: keyName });
    };

    // ----------------------------------------------------
    // 3. データ書き換えロジック (変更されたらsendDataUpdateを呼ぶ)
    // ----------------------------------------------------
    
    // ... (updateCondition, updateTime 関数は変更なし) ...

    const updateCondition = (value) => {
        let conditionText = '';
        if (value === '1') {
            conditionText = '良い';
        } else if (value === '2') {
            conditionText = 'やや悪い';
        } else if (value === '3') {
            conditionText = '苦しい';
        }
        if (conditionText && conditionElement) {
            const newValue = `<span>体調</span>　${conditionText}`;
            conditionElement.innerHTML = newValue;
            // サーバーに通知
            sendDataUpdate('condition', conditionText); 
            return true;
        }
        return false;
    };

    const updateTime = (element, timeStr, key) => {
        const match = timeStr.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (element && match) {
            const [_, hh, mm] = match;
            const newValue = `${hh}時${mm}分`;
            element.textContent = newValue;
            // サーバーに通知
            sendDataUpdate(key, newValue); 
            return true;
        }
        return false;
    };
    
    /**
     * 現在の日時を【前回の測定】に設定
     * (時刻計算ロジックはcheckNextMeasureOverdue内で完結させる)
     */
    const updateMeasureTime = () => {
        if (!lastMeasureElement) return false;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        
        const currentDateTimeStr = `${year}年${month}月${day}日 ${hour}時${minute}分`;
        const newText = `【前回の測定】　${currentDateTimeStr}`;
        
        lastMeasureElement.textContent = newText; 
        
        // サーバーに通知
        sendDataUpdate('last_measure', newText); 
        return true;
    };

    /**
     * 【次回測定予定】の時刻が現在の時刻を超過しているかチェックし、色を変更する
     */
    const checkNextMeasureOverdue = () => {
        if (!nextMeasureElement || !lastMeasureElement) return;

        // 【前回の測定】の時刻を抽出 (全角・半角スペース両方に対応した正規表現)
        const lastMatch = lastMeasureElement.textContent.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2})時\s*(\d{1,2})分/);
        
        if (!lastMatch) {
            const newText = `【次回測定予定】　4時間後`;
            nextMeasureElement.textContent = newText;
            nextMeasureElement.style.color = 'white';
            sendDataUpdate('next_measure', newText); // サーバーに通知
            return;
        }

        const [_, y, m, d, h, min] = lastMatch.map(Number);
        const lastMeasureDate = new Date(y, m - 1, d, h, min); 
        const nextMeasureDate = new Date(lastMeasureDate.getTime() + 4 * 60 * 60 * 1000);
        const now = new Date();

        const nextHour = String(nextMeasureDate.getHours()).padStart(2, '0');
        const nextMinute = String(nextMeasureDate.getMinutes()).padStart(2, '0');
        const nextTimeStr = `${nextHour}時${nextMinute}分`;
        
        const newText = `【次回測定予定】　${nextTimeStr}`;
        nextMeasureElement.textContent = newText; 

        // 比較：現在時刻が次回測定予定時刻を超えているか
        if (now.getTime() > nextMeasureDate.getTime()) {
            nextMeasureElement.style.color = 'red';
        } else {
            nextMeasureElement.style.color = 'white';
        }
        
        // サーバーに通知
        sendDataUpdate('next_measure', newText);
    };

    const processCommand = (input) => {
        let commandProcessed = false;
        
        const command = input.slice(0, 1);
        const longCommand = input.slice(0, 2);
        const data = input.slice(command.length);
        const longData = input.slice(longCommand.length);
        
        const numRegex = /^\d+$/;
        const timeRegex = /^\d{1,2}\/\d{1,2}$/;

        if (input === 's') {
            commandProcessed = updateMeasureTime(); 
        }
        else if (longCommand === 'sy' && timeRegex.test(longData)) {
            commandProcessed = updateTime(sleepYoteElement, longData, 'sleep_yote');
        } else if (longCommand === 'sz' && timeRegex.test(longData)) {
            commandProcessed = updateTime(sleepFactElement, longData, 'sleep_fact');
        } else if (longCommand === 'ky' && timeRegex.test(longData)) {
            commandProcessed = updateTime(wakeYoteElement, longData, 'wake_yote');
        } else if (longCommand === 'kz' && timeRegex.test(longData)) {
            commandProcessed = updateTime(wakeFactElement, longData, 'wake_fact');
        }
        else if (command === 'm' && numRegex.test(data)) {
            if (pulseElement) {
                const newValue = `<span>脈拍</span>　${data}`;
                pulseElement.innerHTML = newValue;
                sendDataUpdate('pulse', data);
                commandProcessed = true;
            }
        } else if (command === 'o' && numRegex.test(data)) {
            if (oxygenElement) {
                const newValue = `<span>血中酸素濃度</span>　${data}％`;
                oxygenElement.innerHTML = newValue;
                sendDataUpdate('oxygen', data);
                commandProcessed = true;
            }
        } else if (command === 't' && /^[123]$/.test(data)) {
            commandProcessed = updateCondition(data);
        }

        return commandProcessed;
    };

    // ----------------------------------------------------
    // 4. 緊急開錠ボタンの処理 (サーバー同期を追加)
    // ----------------------------------------------------
    if (emergencyButton && fixedCircle) {
    emergencyButton.addEventListener('click', () => {
        const feedbackClass = isLockedOpen ? blueFeedback : redFeedback;
        emergencyButton.classList.add(feedbackClass);
        
        // ボタン状態をサーバーに送るため、setTimeout外で処理
        const newState = !isLockedOpen; 

        setTimeout(() => {
            emergencyButton.classList.remove(feedbackClass); 
            
            // DOMを更新
            updateButtonState(newState);

            // ★修正点: updateButtonState実行後にDOMから最新の状態を取得して送信する
            const buttonData = {
                text: emergencyButton.textContent,
                is_locked_open: isLockedOpen,
                // クラス名全体から 'ema' を除いた状態クラス ('locked') のみを取得
                class: emergencyButton.className.replace('ema', '').trim(), 
                // ★最新の円の色をDOMから取得
                en_color: fixedCircle.style.backgroundColor 
            };
            
            sendDataUpdate('button_state', buttonData);

        }, 200); 
    });
}

    /**
     * ボタンのDOMと変数を更新するヘルパー関数
     * @param {boolean} newState - true: 開錠状態へ, false: 施錠状態へ
     */
    const updateButtonState = (newState) => {
         if (newState) {
            fixedCircle.style.backgroundColor = 'white';
            emergencyButton.textContent = '施錠';
            emergencyButton.classList.add('locked');
            isLockedOpen = true; 
        } else {
            fixedCircle.style.backgroundColor = 'transparent'; 
            emergencyButton.textContent = defaultButtonText;
            emergencyButton.classList.remove('locked');
            isLockedOpen = false; 
        }
    };


    // ----------------------------------------------------
    // 5. キーボード入力の処理 (サーバー同期を追加)
    // ----------------------------------------------------
    
    checkNextMeasureOverdue(); 
    
    document.addEventListener('keydown', (event) => {
        const keyName = event.key;
        let clearInput = false;

        if (keyName === 'Enter') {
            const success = processCommand(commandInput); 
            
            commandInput = ''; 
            clearInput = true; 

            if (success) {
                checkNextMeasureOverdue();
            }

            event.preventDefault(); 
        
        } else if (keyName === 'Backspace') {
            commandInput = ''; 
            clearInput = true;
            event.preventDefault();
        
        } else if (keyName.length === 1) {
            commandInput += keyName;
            
            // キー入力をサーバーに送信
            sendKeyInput(keyName); 
            
            const currentOutput = keyOutputSpan.textContent;
            if (currentOutput === '') {
                keyOutputSpan.textContent = keyName;
            } else {
                keyOutputSpan.textContent += ', ' + keyName;
            }
        }

        if (clearInput) {
            keyOutputSpan.textContent = '';
        }
    });


    // ----------------------------------------------------
    // 6. サーバーからのイベント受信処理 (同期ロジック)
    // ----------------------------------------------------

    /**
     * 初回接続時にサーバーから全データを受け取りDOMを初期化する
     */
    socket.on('initial_state', (state) => {
        console.log('Initial state received:', state);
        
        // データ同期
        lastMeasureElement.textContent = state.last_measure;
        nextMeasureElement.textContent = state.next_measure;
        pulseElement.innerHTML = `<span>脈拍</span>　${state.pulse}`;
        oxygenElement.innerHTML = `<span>血中酸素濃度</span>　${state.oxygen}％`;
        conditionElement.innerHTML = `<span>体調</span>　${state.condition}`;
        sleepYoteElement.textContent = state.sleep_yote;
        sleepFactElement.textContent = state.sleep_fact;
        wakeYoteElement.textContent = state.wake_yote;
        wakeFactElement.textContent = state.wake_fact;
        
        // ボタン同期
        const buttonState = state.button_state;
        isLockedOpen = buttonState.is_locked_open; // ★重要: ローカル変数を同期
        fixedCircle.style.backgroundColor = buttonState.en_color;
        emergencyButton.textContent = buttonState.text;
        emergencyButton.className = 'ema ' + buttonState.class; 
        
        // 【次回測定予定】の超過チェックは、データ受信後に手動で再実行
        checkNextMeasureOverdue();
    });

    /**
     * 他のクライアントからデータが更新されたときの処理
     */
    socket.on('data_updated', (data) => {
        console.log('Data updated:', data);
        const key = data.key;
        const value = data.value;
        
        // DOMの更新
        if (key === 'last_measure') {
            lastMeasureElement.textContent = value;
            checkNextMeasureOverdue();
        } else if (key === 'next_measure') {
            nextMeasureElement.textContent = value;
            // サーバーから来るのは色情報を含まないため、ローカルで超過チェックを実行して色を調整
            checkNextMeasureOverdue(); 
        } else if (key === 'pulse') {
            pulseElement.innerHTML = `<span>脈拍</span>　${value}`;
        } else if (key === 'oxygen') {
            oxygenElement.innerHTML = `<span>血中酸素濃度</span>　${value}％`;
        } else if (key === 'condition') {
            conditionElement.innerHTML = `<span>体調</span>　${value}`;
        } else if (key === 'sleep_yote') {
            sleepYoteElement.textContent = value;
        } else if (key === 'sleep_fact') {
            sleepFactElement.textContent = value;
        } else if (key === 'wake_yote') {
            wakeYoteElement.textContent = value;
        } else if (key === 'wake_fact') {
            wakeFactElement.textContent = value;
        }
    });

    /**
     * 他のクライアントからボタンの状態が更新されたときの処理
     */
    socket.on('button_state_updated', (state) => {
    console.log('Button state updated:', state);
    
    // ★重要1: ローカル変数 isLockedOpen を受信データで上書き
    isLockedOpen = state.is_locked_open;
    
    // ★重要2: 円の色とボタンのテキスト/クラスを受信データで上書き
    fixedCircle.style.backgroundColor = state.en_color;
    emergencyButton.textContent = state.text;
    emergencyButton.className = 'ema ' + state.class; 
});
    /**
     * 他のクライアントからのキー入力を表示に反映する処理
     */
    socket.on('key_received', (data) => {
        const keyName = data.key_name;
        // キーボード入力同期の表示
        const currentOutput = keyOutputSpan.textContent;
        if (keyName === 'Enter' || keyName === 'Backspace') {
             keyOutputSpan.textContent = '';
        } else {
             if (currentOutput === '') {
                keyOutputSpan.textContent = keyName;
            } else {
                keyOutputSpan.textContent += ', ' + keyName;
            }
        }
    });
});
