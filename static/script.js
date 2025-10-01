// script.js

document.addEventListener('DOMContentLoaded', () => {
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

    // 時刻要素 (h4要素をIDで取得)
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
    const serverEndpoint = '/update'; // サーバー更新API

    // ----------------------------------------------------
    // 2. サーバーへのデータ送信・受信ロジック (ポーリング方式)
    // ----------------------------------------------------

    /**
     * サーバーに現在の状態を更新要求として送信
     * @param {object} data - サーバーのglobal_stateにマージするデータ
     */
    const postStateUpdate = async (data) => {
        try {
            const response = await fetch(serverEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            await response.json();
        } catch (error) {
            console.error('Failed to update server state:', error);
        }
    };

    /**
     * サーバーから最新の状態を取得し、DOMを更新する
     */
    const fetchAndSyncState = async () => {
        try {
            const response = await fetch('/state');
            const state = await response.json();
            
            // ★問題解決 1 & 2: すべてのデータを同期し、時刻のtextContentを更新
            lastMeasureElement.textContent = state.last_measure;
            nextMeasureElement.textContent = state.next_measure;
            pulseElement.innerHTML = `<span>脈拍</span> ${state.pulse}`;
            oxygenElement.innerHTML = `<span>血中酸素濃度</span> ${state.oxygen}％`; // ★問題解決 3: '%'を一つだけ表示
            conditionElement.innerHTML = `<span>体調</span> ${state.condition}`;
            sleepYoteElement.textContent = state.sleep_yote; // ★問題解決 2: 時刻部分の値も同期
            sleepFactElement.textContent = state.sleep_fact;
            wakeYoteElement.textContent = state.wake_yote;
            wakeFactElement.textContent = state.wake_fact;

            // ボタンの状態を同期
            const buttonState = state.button_state;
            isLockedOpen = buttonState.is_locked_open;
            fixedCircle.style.backgroundColor = buttonState.en_color; // ★問題解決 1: 円の色を同期
            emergencyButton.textContent = buttonState.text;
            emergencyButton.className = 'ema ' + buttonState.class; 

            // 時刻超過チェック
            checkNextMeasureOverdue();

        } catch (error) {
            console.error('Failed to fetch state from server:', error);
        }
    };

    // 5秒ごとに同期を実行
    setInterval(fetchAndSyncState, 5000); 
    // 初回実行
    fetchAndSyncState();


    // ----------------------------------------------------
    // 3. データ書き換えロジック (変更されたらpostStateUpdateを呼ぶ)
    // ----------------------------------------------------

    const updateCondition = (value) => {
        // ... (ロジックは変更なし) ...
        let conditionText = '';
        if (value === '1') {
            conditionText = '良い';
        } else if (value === '2') {
            conditionText = 'やや悪い';
        } else if (value === '3') {
            conditionText = '苦しい';
        }
        if (conditionText && conditionElement) {
            conditionElement.innerHTML = `<span>体調</span> ${conditionText}`;
            postStateUpdate({ 'condition': conditionText }); 
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
            postStateUpdate({ [key]: newValue }); 
            return true;
        }
        return false;
    };
    
    const updateMeasureTime = () => {
        if (!lastMeasureElement) return false;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        
        const currentDateTimeStr = `${year}年${month}月${day}日 ${hour}時${minute}分`;
        const newText = `【前回の測定】 ${currentDateTimeStr}`;
        
        lastMeasureElement.textContent = newText; 
        
        postStateUpdate({ 'last_measure': newText }); 
        return true;
    };

    const checkNextMeasureOverdue = () => {
        if (!nextMeasureElement || !lastMeasureElement) return;

        // ★HTMLの全角スペースを半角スペースに統一したため、正規表現を簡素化
        const lastMatch = lastMeasureElement.textContent.match(/(\d{4})年 (\d{1,2})月 (\d{1,2})日 (\d{1,2})時(\d{1,2})分/);
        
        if (!lastMatch) {
            const newText = `【次回測定予定】 4時間後`;
            nextMeasureElement.textContent = newText;
            nextMeasureElement.style.color = 'white';
            postStateUpdate({ 'next_measure': newText });
            return;
        }

        const [_, y, m, d, h, min] = lastMatch.map(Number);
        
        const lastMeasureDate = new Date(y, m - 1, d, h, min); 
        const nextMeasureDate = new Date(lastMeasureDate.getTime() + 4 * 60 * 60 * 1000);
        
        const now = new Date();

        const nextHour = String(nextMeasureDate.getHours()).padStart(2, '0');
        const nextMinute = String(nextMeasureDate.getMinutes()).padStart(2, '0');
        const nextTimeStr = `${nextHour}時${nextMinute}分`;
        
        const newText = `【次回測定予定】 ${nextTimeStr}`;
        nextMeasureElement.textContent = newText; 

        if (now.getTime() > nextMeasureDate.getTime()) {
            nextMeasureElement.style.color = 'red';
        } else {
            nextMeasureElement.style.color = 'white';
        }
        
        postStateUpdate({ 'next_measure': newText });
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
                pulseElement.innerHTML = `<span>脈拍</span> ${data}`;
                postStateUpdate({ 'pulse': data });
                commandProcessed = true;
            }
        } else if (command === 'o' && numRegex.test(data)) {
            if (oxygenElement) {
                pulseElement.innerHTML = `<span>血中酸素濃度</span> ${data}％`;
                postStateUpdate({ 'oxygen': data }); // ★単位なしでサーバーに送信
                commandProcessed = true;
            }
        } else if (command === 't' && /^[123]$/.test(data)) {
            commandProcessed = updateCondition(data);
        }

        return commandProcessed;
    };

    // ----------------------------------------------------
    // 4. 緊急開錠ボタンの処理
    // ----------------------------------------------------
    if (emergencyButton && fixedCircle) {
        emergencyButton.addEventListener('click', () => {
            const feedbackClass = isLockedOpen ? blueFeedback : redFeedback;
            emergencyButton.classList.add(feedbackClass);
            
            const newState = !isLockedOpen; 

            setTimeout(() => {
                emergencyButton.classList.remove(feedbackClass); 
                
                updateButtonState(newState);

                // サーバーに更新を通知
                const buttonData = {
                    text: emergencyButton.textContent,
                    is_locked_open: isLockedOpen,
                    class: emergencyButton.className.replace('ema', '').trim(), 
                    en_color: fixedCircle.style.backgroundColor 
                };
                
                postStateUpdate({ 'button_state': buttonData }); // ★オブジェクト全体を更新

            }, 200); 
        });
    }

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
    // 5. キーボード入力の処理 (変更なし)
    // ----------------------------------------------------
    
    // ... (keydownイベントリスナーは変更なし) ...
    document.addEventListener('keydown', (event) => {
        const keyName = event.key;
        let clearInput = false;

        if (keyName === 'Enter') {
            const success = processCommand(commandInput); 
            
            commandInput = ''; 
            clearInput = true; 

            if (success) {
                // コマンド成功時、ポーリングを待たずに即座に同期を行う（UX向上）
                fetchAndSyncState(); 
            }

            event.preventDefault(); 
        
        } else if (keyName === 'Backspace') {
            commandInput = ''; 
            clearInput = true;
            event.preventDefault();
        
        } else if (keyName.length === 1) {
            commandInput += keyName;
            
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

});
