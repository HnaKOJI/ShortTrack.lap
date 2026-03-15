const startButton = document.getElementById('startButton');
const lapButton = document.getElementById('lapButton');
const auditoryOffsetInput = document.getElementById('auditoryOffsetInput');
const visualOffsetInput = document.getElementById('visualOffsetInput');
const elapsedTimeMain = document.getElementById('elapsedTimeMain');
const elapsedTimeMillis = document.getElementById('elapsedTimeMillis');
const lapResults = document.getElementById('lapResults');
const saveNameInput = document.getElementById('saveNameInput');
const saveRecordButton = document.getElementById('saveRecordButton');
const exportPdfButton = document.getElementById('exportPdfButton');
const selectAllExportButton = document.getElementById('selectAllExportButton');
const clearExportSelectionButton = document.getElementById('clearExportSelectionButton');
const savedRecords = document.getElementById('savedRecords');

let startTimestamp;
let previousLapTimestamp;
let animationId;
let isRunning = false;
let lapCount = 0;
let lapRecords = [];
let lastElapsedMilliseconds = 0;
const REACTION_TIMING_STORAGE_KEY = 'reactionTimingModeStates_v1';
const LAP_MEAS_SAVE_KEY = 'lapMeasSavedRecords_v1';

function calcAverage(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function applyReactionTimingAverages() {
    const rawValue = localStorage.getItem(REACTION_TIMING_STORAGE_KEY);
    if (!rawValue) {
        return;
    }

    try {
        const parsed = JSON.parse(rawValue);
        const auditoryAverage = calcAverage(parsed?.auditory?.trials);
        const visualAverage = calcAverage(parsed?.visual?.trials);

        if (auditoryAverage !== null) {
            auditoryOffsetInput.value = auditoryAverage.toFixed(3);
        }

        if (visualAverage !== null) {
            visualOffsetInput.value = visualAverage.toFixed(3);
        }
    } catch (error) {
        // 反応タイミング側の保存データが壊れている場合は自動入力しない。
    }
}

function getOffsetMilliseconds(inputElement) {
    const rawValue = inputElement.value.trim();
    if (rawValue === '') {
        return 0;
    }

    const normalizedValue = rawValue.replace(',', '.');
    const seconds = Number.parseFloat(normalizedValue);
    if (!Number.isFinite(seconds)) {
        return 0;
    }

    return seconds * 1000;
}

function formatTime(milliseconds) {
    const totalMilliseconds = Math.max(0, Math.floor(milliseconds));
    const minutes = Math.floor(totalMilliseconds / 60000);
    const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
    const millis = totalMilliseconds % 1000;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function formatElapsedParts(milliseconds) {
    const totalMilliseconds = Math.max(0, Math.floor(milliseconds));
    const minutes = Math.floor(totalMilliseconds / 60000);
    const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
    const millis = totalMilliseconds % 1000;

    return {
        main: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
        millis: `.${String(millis).padStart(3, '0')}`
    };
}

function renderElapsedTime(milliseconds) {
    const elapsedParts = formatElapsedParts(milliseconds);
    elapsedTimeMain.textContent = elapsedParts.main;
    elapsedTimeMillis.textContent = elapsedParts.millis;
}

function getSavedRecords() {
    const rawValue = localStorage.getItem(LAP_MEAS_SAVE_KEY);
    if (!rawValue) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function setSavedRecords(records) {
    localStorage.setItem(LAP_MEAS_SAVE_KEY, JSON.stringify(records));
}

function deleteRecord(index) {
    const records = getSavedRecords();
    records.splice(index, 1);
    setSavedRecords(records);
    renderSavedRecords();
}

function renameRecord(index) {
    const records = getSavedRecords();
    const targetRecord = records[index];
    if (!targetRecord) {
        return;
    }

    const currentName = String(targetRecord.name || '');
    const inputName = window.prompt('新しい保存名を入力してください。', currentName);
    if (inputName === null) {
        return;
    }

    const normalizedName = inputName.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (normalizedName === '') {
        window.alert('保存名を入力してください。');
        return;
    }

    targetRecord.name = normalizedName;
    setSavedRecords(records);
    renderSavedRecords();
}

function updateLapComment(recordIndex, lapIndex, inputValue) {
    const records = getSavedRecords();
    const targetRecord = records[recordIndex];
    if (!targetRecord || !Array.isArray(targetRecord.laps)) {
        return;
    }

    const targetLap = targetRecord.laps[lapIndex];
    if (!targetLap) {
        return;
    }

    const comment = String(inputValue || '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 40);

    targetLap.comment = comment;
    setSavedRecords(records);
}

function renderSavedRecords() {
    const records = getSavedRecords();
    if (records.length === 0) {
        savedRecords.innerHTML = '<p class="result-empty">保存データはまだありません</p>';
        return;
    }

    savedRecords.innerHTML = '';
    records.forEach((record, index) => {
        const item = document.createElement('div');
        item.className = 'saved-record-item';
        const createdAtText = record.createdAt ? formatDateTime(new Date(record.createdAt)) : '';

        const heading = document.createElement('div');
        heading.className = 'saved-record-heading';

        const checkboxLabel = document.createElement('label');
        checkboxLabel.className = 'export-check-label';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'export-check';
        checkbox.dataset.recordIndex = String(index);
        checkbox.checked = true;

        const checkboxText = document.createElement('span');
        checkboxText.textContent = '書き出し対象';

        checkboxLabel.appendChild(checkbox);
        checkboxLabel.appendChild(checkboxText);

        const title = document.createElement('p');
        title.className = 'saved-record-title';
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = String(record.name || '名称未設定');
        const meta = document.createElement('span');
        meta.className = 'saved-meta';
        meta.textContent = createdAtText;
        title.appendChild(nameStrong);
        title.appendChild(meta);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-record-button';
        deleteButton.textContent = '削除';
        deleteButton.addEventListener('click', () => {
            if (window.confirm(`「${String(record.name || '名称未設定')}」を削除しますか？`)) {
                deleteRecord(index);
            }
        });

        const renameButton = document.createElement('button');
        renameButton.type = 'button';
        renameButton.className = 'edit-record-button';
        renameButton.textContent = '名前変更';
        renameButton.addEventListener('click', () => {
            renameRecord(index);
        });

        const actionGroup = document.createElement('div');
        actionGroup.className = 'saved-record-actions';
        actionGroup.appendChild(renameButton);
        actionGroup.appendChild(deleteButton);

        heading.appendChild(checkboxLabel);
        heading.appendChild(title);
        heading.appendChild(actionGroup);

        const elapsed = document.createElement('p');
        elapsed.textContent = `タイム: ${formatTime(record.elapsedMilliseconds || 0)}`;

        const laps = document.createElement('div');
        laps.className = 'saved-lap-list';

        const lapsTitle = document.createElement('p');
        lapsTitle.textContent = 'ラップ';
        laps.appendChild(lapsTitle);

        if (Array.isArray(record.laps) && record.laps.length > 0) {
            record.laps.forEach((lap, lapIndex) => {
                const lapRow = document.createElement('div');
                lapRow.className = 'saved-lap-row';

                const lapLabel = document.createElement('span');
                lapLabel.className = 'saved-lap-label';
                lapLabel.textContent = `${lap.lap}`; // ラップ周数

                const lapCommentInput = document.createElement('input');
                lapCommentInput.type = 'text';
                lapCommentInput.className = 'saved-lap-comment';
                lapCommentInput.placeholder = 'Name';
                lapCommentInput.maxLength = 40;
                lapCommentInput.value = String(lap.comment || '');
                lapCommentInput.addEventListener('change', () => {
                    updateLapComment(index, lapIndex, lapCommentInput.value);
                });
                lapCommentInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        lapCommentInput.blur();
                    }
                });

                const lapTime = document.createElement('span');
                lapTime.className = 'saved-lap-time';
                lapTime.textContent = lap.displaySeconds.toFixed(2);

                lapRow.appendChild(lapLabel);
                lapRow.appendChild(lapCommentInput);
                lapRow.appendChild(lapTime);
                laps.appendChild(lapRow);
            });
        } else {
            const emptyLap = document.createElement('p');
            emptyLap.className = 'saved-lap-empty';
            emptyLap.textContent = 'ラップなし';
            laps.appendChild(emptyLap);
        }

        item.appendChild(heading);
        item.appendChild(elapsed);
        item.appendChild(laps);
        savedRecords.appendChild(item);
    });
}

function setAllExportSelection(checked) {
    const checkboxes = savedRecords.querySelectorAll('.export-check');
    checkboxes.forEach((checkbox) => {
        checkbox.checked = checked;
    });
}

function getSelectedRecordsForExport() {
    const selectedIndexes = Array.from(savedRecords.querySelectorAll('.export-check:checked'))
        .map((checkbox) => Number.parseInt(checkbox.dataset.recordIndex || '', 10))
        .filter((index) => Number.isInteger(index) && index >= 0);

    if (selectedIndexes.length === 0) {
        return [];
    }

    const records = getSavedRecords();
    return selectedIndexes
        .map((index) => records[index])
        .filter((record) => Boolean(record));
}

function getAuditoryOffsetMilliseconds() {
    return getOffsetMilliseconds(auditoryOffsetInput);
}

function getCorrectedElapsedMilliseconds(now) {
    return (now - startTimestamp) + getAuditoryOffsetMilliseconds();
}

function getCorrectedLapElapsed(now) {
    const visualOffset = getOffsetMilliseconds(visualOffsetInput);
    return Math.max(0, (now - previousLapTimestamp) + visualOffset);
}

function getLapDisplayMilliseconds(lapElapsed) {
    if (lapElapsed >= 10000) {
        return lapElapsed - 10000;
    }

    return lapElapsed;
}

function formatLapDisplaySeconds(lapElapsed) {
    const displayMilliseconds = getLapDisplayMilliseconds(lapElapsed);
    return (displayMilliseconds / 1000).toFixed(2);
}

function appendLapResult(lapElapsed) {
    lapCount += 1;
    lapRecords.push({ lap: lapCount, elapsed: lapElapsed });
    renderLapResults();
}

function renderLapResults() {
    if (lapRecords.length === 0) {
        lapResults.innerHTML = '<p class="result-empty">まだラップ記録がありません</p>';
        return;
    }

    const fastestCandidate = lapRecords
        .filter((record) => record.lap !== 1)
        .reduce((best, record) => {
            if (!best || record.elapsed < best.elapsed) {
                return record;
            }
            return best;
        }, null);

    lapResults.innerHTML = '';

    // 直近ラップを上に表示する
    for (let i = lapRecords.length - 1; i >= 0; i -= 1) {
        const record = lapRecords[i];
        const isFastest = fastestCandidate && record.lap === fastestCandidate.lap;
        const lapRow = document.createElement('div');
        lapRow.className = `lap-row${isFastest ? ' lap-row-fastest' : ''}`;
        lapRow.innerHTML = `
            <span>Lap ${record.lap}</span>
            <span>${formatLapDisplaySeconds(record.elapsed)}</span>
        `;
        lapResults.appendChild(lapRow);
    }
}

function updateElapsedTime() {
    if (!isRunning) {
        return;
    }

    const now = performance.now();
    lastElapsedMilliseconds = getCorrectedElapsedMilliseconds(now);
    renderElapsedTime(lastElapsedMilliseconds);
    animationId = requestAnimationFrame(updateElapsedTime);
}

function resetMeasurement() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    startTimestamp = performance.now();
    previousLapTimestamp = startTimestamp;
    lapCount = 0;
    lapRecords = [];
    lastElapsedMilliseconds = getAuditoryOffsetMilliseconds();
    renderElapsedTime(lastElapsedMilliseconds);
    renderLapResults();
}

function startMeasurement() {
    resetMeasurement();
    isRunning = true;
    lapButton.disabled = false;
    startButton.textContent = 'ストップ';
    updateElapsedTime();
}

function stopMeasurement() {
    if (!isRunning) {
        return;
    }

    const now = performance.now();
    const lapElapsed = getCorrectedLapElapsed(now);

    previousLapTimestamp = now;
    appendLapResult(lapElapsed);
    lastElapsedMilliseconds = getCorrectedElapsedMilliseconds(now);
    renderElapsedTime(lastElapsedMilliseconds);

    isRunning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    lapButton.disabled = true;
    startButton.textContent = 'スタート';
}

function recordLap() {
    if (!isRunning) {
        return;
    }

    const now = performance.now();
    const lapElapsed = getCorrectedLapElapsed(now);
    previousLapTimestamp = now;
    appendLapResult(lapElapsed);
}

function saveCurrentRecord() {
    const normalizedName = saveNameInput.value.replace(/\s+/g, ' ').trim();
    const name = normalizedName.slice(0, 60);
    if (name === '') {
        window.alert('保存名を入力してください。');
        return;
    }

    const elapsed = isRunning
        ? getCorrectedElapsedMilliseconds(performance.now())
        : lastElapsedMilliseconds;

    const laps = lapRecords.map((record) => ({
        lap: record.lap,
        elapsedMilliseconds: record.elapsed,
        displaySeconds: Number.parseFloat(formatLapDisplaySeconds(record.elapsed))
    }));

    const record = {
        name,
        createdAt: new Date().toISOString(),
        elapsedMilliseconds: elapsed,
        laps
    };

    const records = getSavedRecords();
    records.unshift(record);
    setSavedRecords(records.slice(0, 50));
    renderSavedRecords();
    saveNameInput.value = '';
}

function exportSavedRecordsToPdf() {
    const records = getSelectedRecordsForExport();
    if (records.length === 0) {
        window.alert('PDFに書き出す保存データを選択してください。');
        return;
    }

    const exportWindow = window.open('', '_blank');
    if (!exportWindow) {
        window.alert('ポップアップがブロックされています。許可して再試行してください。');
        return;
    }

    const doc = exportWindow.document;
    doc.open();
    doc.write('<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>ラップ計測 保存データ</title></head><body></body></html>');
    doc.close();

    const style = doc.createElement('style');
    style.textContent = [
        'body { font-family: "Yu Gothic UI", "Segoe UI", sans-serif; margin: 24px; color: #111827; }',
        '.record-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }',
        '.record-card { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; font-size: 12px; break-inside: avoid; }',
        '.record-name { font-weight: 700; margin-bottom: 4px; }',
        '.record-meta { color: #6b7280; font-size: 11px; margin-bottom: 4px; }',
        '.record-elapsed { margin-bottom: 4px; }',
        '.lap-line { margin: 0 0 2px; font-weight: 700; display: grid; grid-template-columns: 56px minmax(0, 1fr) 72px; align-items: center; column-gap: 8px; }',
        '.lap-label { padding-right: 8px; font-variant-numeric: tabular-nums; }',
        '.lap-comment { font-weight: 400; color: #374151; font-size: 11px; overflow-wrap: anywhere; }',
        '.lap-comment-empty { color: #9ca3af; }',
        '.lap-time { padding-left: 8px; border-left: 1px solid #9ca3af; text-align: right; }',
        '.lap-empty { color: #6b7280; }'
    ].join('');
    doc.head.appendChild(style);

    const COLS = 4;
    for (let rowStart = 0; rowStart < records.length; rowStart += COLS) {
        const grid = doc.createElement('div');
        grid.className = 'record-grid';

        const rowRecords = records.slice(rowStart, rowStart + COLS);
        rowRecords.forEach((record) => {
            const card = doc.createElement('div');
            card.className = 'record-card';

            const nameDiv = doc.createElement('div');
            nameDiv.className = 'record-name';
            nameDiv.textContent = String(record.name || '名称未設定');
            card.appendChild(nameDiv);

            if (record.createdAt) {
                const metaDiv = doc.createElement('div');
                metaDiv.className = 'record-meta';
                metaDiv.textContent = formatDateTime(new Date(record.createdAt));
                card.appendChild(metaDiv);
            }

            const elapsedDiv = doc.createElement('div');
            elapsedDiv.className = 'record-elapsed';
            elapsedDiv.textContent = formatTime(record.elapsedMilliseconds || 0);
            card.appendChild(elapsedDiv);

            if (Array.isArray(record.laps) && record.laps.length > 0) {
                record.laps.forEach((lap) => {
                    const line = doc.createElement('div');
                    line.className = 'lap-line';
                    const lapDisplay = lap.elapsedMilliseconds != null
                        ? formatLapDisplaySeconds(lap.elapsedMilliseconds)
                        : lap.displaySeconds.toFixed(2);
                    const lapLabel = doc.createElement('span');
                    lapLabel.className = 'lap-label';
                    lapLabel.textContent = `${lap.lap}`; // PDFラップ周数

                    const lapComment = doc.createElement('span');
                    const normalizedComment = String(lap.comment || '').trim();
                    lapComment.className = normalizedComment === '' ? 'lap-comment lap-comment-empty' : 'lap-comment';
                    lapComment.textContent = normalizedComment === '' ? '-' : normalizedComment;

                    const lapTime = doc.createElement('span');
                    lapTime.className = 'lap-time';
                    lapTime.textContent = lapDisplay;

                    line.appendChild(lapLabel);
                    line.appendChild(lapComment);
                    line.appendChild(lapTime);
                    card.appendChild(line);
                });
            } else {
                const empty = doc.createElement('div');
                empty.className = 'lap-empty';
                empty.textContent = 'ラップなし';
                card.appendChild(empty);
            }

            grid.appendChild(card);
        });

        doc.body.appendChild(grid);
    }

    exportWindow.document.close();
    exportWindow.focus();
    exportWindow.print();
}

applyReactionTimingAverages();
renderSavedRecords();
startButton.addEventListener('click', () => {
    if (isRunning) {
        stopMeasurement();
        return;
    }

    startMeasurement();
});
lapButton.addEventListener('click', recordLap);
saveRecordButton.addEventListener('click', saveCurrentRecord);
exportPdfButton.addEventListener('click', exportSavedRecordsToPdf);
selectAllExportButton.addEventListener('click', () => setAllExportSelection(true));
clearExportSelectionButton.addEventListener('click', () => setAllExportSelection(false));
