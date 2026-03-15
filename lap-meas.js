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
        const lapText = Array.isArray(record.laps) && record.laps.length > 0
            ? record.laps.map((lap) => `Lap ${lap.lap}: ${lap.displaySeconds.toFixed(2)}`).join(' / ')
            : 'ラップなし';
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

        heading.appendChild(checkboxLabel);
        heading.appendChild(title);

        const elapsed = document.createElement('p');
        elapsed.textContent = `計測時間: ${formatTime(record.elapsedMilliseconds || 0)}`;

        const laps = document.createElement('p');
        laps.textContent = `ラップ: ${lapText}`;

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
        'table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }',
        'td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: left; }',
        '.lap-line { margin: 0 0 4px; }',
        '.lap-empty { color: #6b7280; }'
    ].join('');
    doc.head.appendChild(style);

    records.forEach((record) => {
        const table = doc.createElement('table');
        const tbody = doc.createElement('tbody');

        const nameRow = doc.createElement('tr');
        const nameTd = doc.createElement('td');
        nameTd.textContent = String(record.name || '名称未設定');
        nameRow.appendChild(nameTd);
        tbody.appendChild(nameRow);

        const elapsedRow = doc.createElement('tr');
        const elapsedTd = doc.createElement('td');
        elapsedTd.textContent = formatTime(record.elapsedMilliseconds || 0);
        elapsedRow.appendChild(elapsedTd);
        tbody.appendChild(elapsedRow);

        const lapsRow = doc.createElement('tr');
        const lapsTd = doc.createElement('td');
        if (Array.isArray(record.laps) && record.laps.length > 0) {
            record.laps.forEach((lap) => {
                const line = doc.createElement('div');
                line.className = 'lap-line';
                line.textContent = `Lap ${lap.lap}: ${lap.displaySeconds.toFixed(2)}`;
                lapsTd.appendChild(line);
            });
        } else {
            const empty = doc.createElement('div');
            empty.className = 'lap-empty';
            empty.textContent = 'ラップなし';
            lapsTd.appendChild(empty);
        }
        lapsRow.appendChild(lapsTd);
        tbody.appendChild(lapsRow);

        table.appendChild(tbody);
        doc.body.appendChild(table);
    });

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
