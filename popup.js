document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.getElementById('startRecording');
  const stopButton = document.getElementById('stopRecording');
  const timerDisplay = document.getElementById('timer');
  let mediaRecorder;
  let audioChunks = [];
  let timerInterval;
  let startTime;

  // アジェンダ関連の要素
  const agendaItems = document.getElementById('agenda-items');
  const addAgendaButton = document.getElementById('addAgenda');
  const saveAgendaButton = document.getElementById('saveAgenda');

  // アジェンダアイテムのテンプレート作成
  function createAgendaItem() {
    const agendaItem = document.createElement('div');
    agendaItem.className = 'agenda-item';
    
    agendaItem.innerHTML = `
      <input type="text" class="agenda-title" placeholder="アジェンダタイトル">
      <div class="goals-container">
        <div class="goals-list"></div>
        <button class="add-goal">ゴールを追加</button>
      </div>
      <button class="remove-agenda">このアジェンダを削除</button>
    `;

    const goalsList = agendaItem.querySelector('.goals-list');
    const addGoalButton = agendaItem.querySelector('.add-goal');
    const removeAgendaButton = agendaItem.querySelector('.remove-agenda');

    addGoalButton.addEventListener('click', () => {
      const goalItem = document.createElement('div');
      goalItem.className = 'goal-item';
      goalItem.innerHTML = `
        <input type="text" class="goal-condition" placeholder="ゴールの条件">
        <button class="remove-goal">削除</button>
      `;

      goalItem.querySelector('.remove-goal').addEventListener('click', () => {
        goalItem.remove();
      });

      goalsList.appendChild(goalItem);
    });

    removeAgendaButton.addEventListener('click', () => {
      agendaItem.remove();
    });

    return agendaItem;
  }

  // アジェンダ追加ボタンのイベントリスナー
  addAgendaButton.addEventListener('click', () => {
    agendaItems.appendChild(createAgendaItem());
  });

  // フォームデータの収集関数
  function collectFormData() {
    const items = [];
    const agendaElements = document.querySelectorAll('.agenda-item');

    agendaElements.forEach(agendaElement => {
      const agendaTitle = agendaElement.querySelector('.agenda-title').value;
      const goals = [];

      agendaElement.querySelectorAll('.goal-item').forEach(goalItem => {
        const condition = goalItem.querySelector('.goal-condition').value;
        if (condition) {
          goals.push({ condition });
        }
      });

      if (agendaTitle && goals.length > 0) {
        items.push({
          agenda: agendaTitle,
          goals: goals
        });
      }
    });

    return { items };
  }

  // タイマー表示を更新する関数
  function updateTimer() {
    const elapsed = Date.now() - startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // 録音開始ボタンのクリックイベント
  startButton.addEventListener('click', async () => {
    try {
      chrome.tabCapture.capture({
        audio: true,
        video: false
      }, (stream) => {
        if (!stream) {
          console.error('ストリームの取得に失敗しました');
          return;
        }

        // オリジナルの音声を再生し続けるためのAudioContextを作成
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(audioContext.destination);

        // 録音用にストリームをクローン
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'video/webm' });
          
          // タイマーをリセット
          clearInterval(timerInterval);
          timerDisplay.textContent = '00:00';
          
          // ストリームとオーディオコンテキストをクリーンアップ
          stream.getTracks().forEach(track => track.stop());
          audioContext.close();
          
          // FormDataオブジェクトを作成して必要なデータを追加
          const formData = new FormData();
          formData.append('host_audio', audioBlob, 'recorded-audio.webm');
          formData.append('meet_audio', audioBlob, 'recorded-audio.webm');
          
          // アジェンダとゴールのデータを収集
          const meetingData = collectFormData();
          
          // json_dataとしてJSONデータを追加
          formData.append('json_data', JSON.stringify(meetingData));

          try {
            // APIにデータをPOST
            const response = await fetch('https://facilitation-api-171753805737.asia-northeast1.run.app/agenda', {
              method: 'POST',
              body: formData,
              headers: {
                'accept': 'application/json',
                'key': '1234567890'
              },
              mode: 'cors'
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('サーバーレスポンス:', errorText);
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            // レスポンスの処理
            const responseData = await response.json();
            console.log('APIレスポンス:', responseData);

            // 結果表示エリアを表示
            const resultArea = document.getElementById('result-area');
            const resultContent = document.getElementById('result-content');
            resultArea.classList.add('show');
            
            // 結果セクションを自動的に開く
            const resultCollapsible = resultArea.previousElementSibling;
            resultCollapsible.classList.add('active');

            // レスポンスの内容を整形して表示
            let resultHTML = '';

            // アジェンダ項目の表示
            if (responseData.items) {
              responseData.items.forEach(item => {
                resultHTML += `
                  <div class="result-item">
                    <h4>${item.agenda}</h4>
                    <p>ステータス：${item.status}</p>
                    ${item.minutes ? `<p>議事録：${item.minutes}</p>` : ''}
                    <div class="goals-section">
                      <h5>ゴール</h5>
                      <ul>
                        ${item.goals.map(goal => `
                          <li>
                            <div class="goal-condition">${goal.condition}</div>
                            <div class="goal-status">
                              達成：${goal.done ? '✅' : '❌'}
                            </div>
                            ${goal.result ? `<div class="goal-result">${goal.result}</div>` : ''}
                          </li>
                        `).join('')}
                      </ul>
                    </div>
                  </div>
                `;
              });
            }

            resultContent.innerHTML = resultHTML;

          } catch (error) {
            console.error('APIへのアップロードに失敗しました:', error);
            // エラーメッセージを表示
            const resultArea = document.getElementById('result-area');
            const resultContent = document.getElementById('result-content');
            resultArea.classList.add('show');
            
            // 結果セクションを自動的に開く
            const resultCollapsible = resultArea.previousElementSibling;
            resultCollapsible.classList.add('active');
            
            resultContent.innerHTML = `<p style="color: red;">エラーが発生しました：${error.message}</p>`;
          }
        };

        mediaRecorder.start();
        startButton.disabled = true;
        stopButton.disabled = false;

        // タイマーを開始
        startTime = Date.now();
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
      });
    } catch (err) {
      console.error('録音の開始に失敗しました:', err);
    }
  });

  // 録音停止ボタンのクリックイベント
  stopButton.addEventListener('click', () => {
    mediaRecorder.stop();
    startButton.disabled = false;
    stopButton.disabled = true;
  });

  // アジェンダの保存処理を追加
  function saveAgendaToStorage() {
    const agendaData = collectFormData();
    chrome.storage.local.set({ 'savedAgenda': agendaData }, () => {
      alert('アジェンダを保存しました');
    });
  }

  // アジェンダの読み込み処理を追加
  function loadSavedAgenda() {
    chrome.storage.local.get('savedAgenda', (result) => {
      if (result.savedAgenda) {
        // 既存のアジェンダアイテムをクリア
        agendaItems.innerHTML = '';
        
        // 保存されたアジェンダを復元
        result.savedAgenda.items.forEach(item => {
          const agendaItem = createAgendaItem();
          agendaItem.querySelector('.agenda-title').value = item.agenda;
          
          item.goals.forEach(goal => {
            const goalItem = document.createElement('div');
            goalItem.className = 'goal-item';
            goalItem.innerHTML = `
              <input type="text" class="goal-condition" value="${goal.condition}">
              <button class="remove-goal">削除</button>
            `;
            
            goalItem.querySelector('.remove-goal').addEventListener('click', () => {
              goalItem.remove();
            });
            
            agendaItem.querySelector('.goals-list').appendChild(goalItem);
          });
          
          agendaItems.appendChild(agendaItem);
        });
      }
    });
  }

  // 保存ボタンのイベントリスナー
  saveAgendaButton.addEventListener('click', saveAgendaToStorage);
  
  // ページ読み込み時に保存されたアジェンダを読み込む
  loadSavedAgenda();

  // 折りたたみ機能の実装
  const collapsibles = document.querySelectorAll('.collapsible');
  collapsibles.forEach(button => {
    button.addEventListener('click', function() {
      this.classList.toggle('active');
      const content = this.nextElementSibling;
      content.classList.toggle('show');
    });
  });
});
