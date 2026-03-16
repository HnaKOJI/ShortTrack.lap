const startButton = document.getElementById('startButton');
const lapButton = document.getElementById('lapButton');
const auditoryOffsetInput = document.getElementById('auditoryOffsetInput');
const visualOffsetInput = document.getElementById('visualOffsetInput');
const elapsedTimeMain = document.getElementById('elapsedTimeMain');
const elapsedTimeMillis = document.getElementById('elapsedTimeMillis');
const distanceSelect = document.getElementById('distanceSelect');
const customLapInput = document.getElementById('customLapInput');
const remainingLaps = document.getElementById('remainingLaps');
const currentLapLabel = document.getElementById('currentLapLabel');
const currentLapTime = document.getElementById('currentLapTime');
const currentLapPreview = document.getElementById('currentLapPreview');
const lapResults = document.getElementById('lapResults');
const saveNameInput = document.getElementById('saveNameInput');
const saveRecordButton = document.getElementById('saveRecordButton');
const exportPdfButton = document.getElementById('exportPdfButton');
const selectAllExportButton = document.getElementById('selectAllExportButton');
const clearExportSelectionButton = document.getElementById('clearExportSelectionButton');
const mergeSelectedButton = document.getElementById('mergeSelectedButton');
const confirmMergeButton = document.getElementById('confirmMergeButton');
const cancelMergeButton = document.getElementById('cancelMergeButton');
const selectionNote = document.getElementById('selectionNote');
const savedRecords = document.getElementById('savedRecords');

let startTimestamp;
let previousLapTimestamp;
let animationId;
let isRunning = false;
let lapCount = 0;
let selectedLapTotal = 5;
let remainingLapCount = 5;
let lapRecords = [];
let lastElapsedMilliseconds = 0;
let isMergeSelectionMode = false;
let mergeSelectionIndexes = new Set();
const REACTION_TIMING_STORAGE_KEY = 'reactionTimingModeStates_v1';
const LAP_MEAS_SAVE_KEY = 'lapMeasSavedRecords_v1';
const DISTANCE_TO_LAPS = {
    500: 5,
    1000: 9,
    1500: 14,
    3000: 27
};

function hasMobileSafariReactionTimingData() {
    const rawValue = localStorage.getItem(REACTION_TIMING_STORAGE_KEY);
    if (!rawValue) {
        return false;
    }

    try {
        const parsed = JSON.parse(rawValue);
        const visualState = parsed?.visual;
        const auditoryState = parsed?.auditory;
        const visualMeasured = Boolean(visualState?.measuredOnMobileSafari) && Array.isArray(visualState?.trials) && visualState.trials.length > 0;
        const auditoryMeasured = Boolean(auditoryState?.measuredOnMobileSafari) && Array.isArray(auditoryState?.trials) && auditoryState.trials.length > 0;
        return visualMeasured || auditoryMeasured;
    } catch (error) {
        return false;
    }
}

function shouldApplySafariOffset() {
    return isMobileSafari() && hasMobileSafariReactionTimingData();
}

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

function updateRemainingLapDisplay() {
    remainingLaps.textContent = `${Math.max(0, remainingLapCount)}周`;
}

function updateActionButtonsForRemainingLaps() {
    if (!isRunning) {
        lapButton.style.display = '';
        lapButton.disabled = true;
        startButton.style.width = '';
        return;
    }

    if (remainingLapCount <= 1) {
        lapButton.style.display = 'none';
        lapButton.disabled = true;
        startButton.style.width = '100%';
        return;
    }

    lapButton.style.display = '';
    lapButton.disabled = false;
    startButton.style.width = '';
}

function getValidatedCustomLapCount() {
    const digitsOnlyValue = String(customLapInput.value || '').replace(/\D+/g, '');
    const parsedLaps = Number.parseInt(digitsOnlyValue, 10);
    if (!Number.isInteger(parsedLaps)) {
        return 31;
    }

    return Math.max(31, parsedLaps);
}

function updateCustomLapInputVisibility() {
    const isCustomSelected = String(distanceSelect.value) === 'laps-custom';
    customLapInput.hidden = !isCustomSelected;
    customLapInput.disabled = !isCustomSelected;

    if (isCustomSelected && String(customLapInput.value || '').trim() === '') {
        customLapInput.value = String(getValidatedCustomLapCount());
    }
}

function updateSelectedLapTotal() {
    const selectedValue = String(distanceSelect.value || 'distance-500');

    if (selectedValue.startsWith('distance-')) {
        const parsedDistance = Number.parseInt(selectedValue.replace('distance-', ''), 10);
        selectedLapTotal = DISTANCE_TO_LAPS[parsedDistance] || 5;
    } else if (selectedValue === 'laps-custom') {
        selectedLapTotal = getValidatedCustomLapCount();
    } else if (selectedValue.startsWith('laps-')) {
        const parsedLaps = Number.parseInt(selectedValue.replace('laps-', ''), 10);
        selectedLapTotal = Number.isInteger(parsedLaps) ? Math.min(30, Math.max(1, parsedLaps)) : 5;
    } else {
        selectedLapTotal = 5;
    }

    if (!isRunning) {
        remainingLapCount = selectedLapTotal;
        updateRemainingLapDisplay();
    }
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

function isMergedRecord(record) {
    return Boolean(
        record
        && (
            (Array.isArray(record.mergedSegments) && record.mergedSegments.length > 0)
            || (Array.isArray(record.mergedFrom) && record.mergedFrom.length > 0)
        )
    );
}

function compareNamesAscending(leftName, rightName) {
    return String(leftName || '名称未設定').localeCompare(String(rightName || '名称未設定'), 'ja', {
        numeric: true,
        sensitivity: 'base'
    });
}

function getPdfNameSortGroup(name) {
    const normalizedName = String(name || '名称未設定').trim();
    const firstCharacter = normalizedName.charAt(0);

    if (/^[A-Za-z]/.test(firstCharacter)) {
        return 0;
    }

    if (/^[0-9]/.test(firstCharacter)) {
        return 0;
    }

    if (/^[ぁ-ゖゝゞー]/.test(firstCharacter)) {
        return 1;
    }

    if (/^[ァ-ヺーｦ-ﾟ]/.test(firstCharacter)) {
        return 2;
    }

    return 3;
}

function compareNamesForPdfExport(leftName, rightName) {
    const leftGroup = getPdfNameSortGroup(leftName);
    const rightGroup = getPdfNameSortGroup(rightName);

    if (leftGroup !== rightGroup) {
        return leftGroup - rightGroup;
    }

    return compareNamesAscending(leftName, rightName);
}

function reorderMergedRecordSegments(record) {
    if (!record || !Array.isArray(record.mergedSegments) || !Array.isArray(record.laps)) {
        return;
    }

    let lapIndexOffset = 0;
    const segmentEntries = record.mergedSegments.map((segment, index) => {
        const lapCount = Number(segment.lapCount) || 0;
        const laps = record.laps.slice(lapIndexOffset, lapIndexOffset + lapCount);
        lapIndexOffset += lapCount;

        return {
            segment,
            laps,
            originalIndex: index
        };
    });

    segmentEntries.sort((leftEntry, rightEntry) => {
        const byName = compareNamesAscending(leftEntry.segment.name, rightEntry.segment.name);
        if (byName !== 0) {
            return byName;
        }

        return leftEntry.originalIndex - rightEntry.originalIndex;
    });

    record.mergedSegments = segmentEntries.map((entry) => entry.segment);
    record.laps = segmentEntries.flatMap((entry) => entry.laps);
}

function updateMergeSelectionUi() {
    mergeSelectedButton.hidden = isMergeSelectionMode;
    confirmMergeButton.hidden = !isMergeSelectionMode;
    cancelMergeButton.hidden = !isMergeSelectionMode;

    if (isMergeSelectionMode) {
        selectionNote.textContent = `統合したいデータを選択してください (${mergeSelectionIndexes.size}件選択中)`;
    } else {
        selectionNote.textContent = '統合しても元データは残ります';
    }
}

function setMergeSelectionMode(enabled) {
    isMergeSelectionMode = enabled;
    if (enabled) {
        setAllExportSelection(false);
    }

    if (!enabled) {
        mergeSelectionIndexes = new Set();
    }

    updateMergeSelectionUi();
    renderSavedRecords();
}

function toggleMergeSelection(index) {
    if (mergeSelectionIndexes.has(index)) {
        mergeSelectionIndexes.delete(index);
    } else {
        mergeSelectionIndexes.add(index);
    }

    updateMergeSelectionUi();
    renderSavedRecords();
}

function deleteRecord(index) {
    const records = getSavedRecords();
    records.splice(index, 1);
    setSavedRecords(records);

    if (isMergeSelectionMode) {
        const nextSelectionIndexes = new Set();
        mergeSelectionIndexes.forEach((selectedIndex) => {
            if (selectedIndex < index) {
                nextSelectionIndexes.add(selectedIndex);
            } else if (selectedIndex > index) {
                nextSelectionIndexes.add(selectedIndex - 1);
            }
        });
        mergeSelectionIndexes = nextSelectionIndexes;
        updateMergeSelectionUi();
    }

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

function updateMergedSegmentName(recordIndex, segmentIndex, inputValue) {
    const records = getSavedRecords();
    const targetRecord = records[recordIndex];
    if (!targetRecord || !Array.isArray(targetRecord.mergedSegments)) {
        return;
    }

    const targetSegment = targetRecord.mergedSegments[segmentIndex];
    if (!targetSegment) {
        return;
    }

    const normalizedName = String(inputValue || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);

    targetSegment.name = normalizedName === '' ? '名称未設定' : normalizedName;
    reorderMergedRecordSegments(targetRecord);
    setSavedRecords(records);
    renderSavedRecords();
}

function renderSavedLapColumns(container, laps, recordIndex, lapIndexOffset = 0) {
    if (!Array.isArray(laps) || laps.length === 0) {
        const emptyLap = document.createElement('p');
        emptyLap.className = 'saved-lap-empty';
        emptyLap.textContent = 'ラップなし';
        container.appendChild(emptyLap);
        return;
    }

    const lapsPerColumn = 14;
    const columnCount = Math.ceil(laps.length / lapsPerColumn);
    container.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;

    if (columnCount > 1) {
        container.classList.add('saved-lap-columns-multi');
    } else {
        container.classList.remove('saved-lap-columns-multi');
    }

    const columns = Array.from({ length: columnCount }, () => {
        const column = document.createElement('div');
        column.className = 'saved-lap-column';
        container.appendChild(column);
        return column;
    });

    laps.forEach((lap, lapIndex) => {
        const lapRow = document.createElement('div');
        lapRow.className = 'saved-lap-row';

        const lapLabel = document.createElement('span');
        lapLabel.className = 'saved-lap-label';
        lapLabel.textContent = `${lap.lap}`;

        const lapCommentInput = document.createElement('input');
        lapCommentInput.type = 'text';
        lapCommentInput.className = 'saved-lap-comment';
        lapCommentInput.placeholder = 'Name';
        lapCommentInput.maxLength = 40;
        lapCommentInput.value = String(lap.comment || '');
        lapCommentInput.addEventListener('change', () => {
            updateLapComment(recordIndex, lapIndexOffset + lapIndex, lapCommentInput.value);
        });
        lapCommentInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                lapCommentInput.blur();
            }
        });

        const lapTime = document.createElement('span');
        lapTime.className = 'saved-lap-time';
        const lapDisplay = lap.elapsedMilliseconds != null
            ? formatLapDisplaySeconds(lap.elapsedMilliseconds, lap.lap)
            : getLapDisplaySecondsValue(lap).toFixed(2);
        lapTime.textContent = lapDisplay;

        lapRow.appendChild(lapLabel);
        lapRow.appendChild(lapCommentInput);
        lapRow.appendChild(lapTime);

        const columnIndex = Math.floor(lapIndex / lapsPerColumn);
        columns[columnIndex].appendChild(lapRow);
    });
}

function buildMergedSectionGroups(record) {
    const allLaps = Array.isArray(record.laps) ? record.laps : [];
    const segments = Array.isArray(record.mergedSegments) ? record.mergedSegments : [];
    const groups = [];
    const totalLapCount = allLaps.length;
    let globalLapIndexOffset = 0;

    if (totalLapCount <= 14) {
        const singleGroup = [];

        segments.forEach((segment, segmentIndex) => {
            const segmentLapCount = Number(segment.lapCount) || 0;
            const segmentLaps = allLaps.slice(globalLapIndexOffset, globalLapIndexOffset + segmentLapCount);

            singleGroup.push({
                name: String(segment.name || '名称未設定'),
                elapsedMilliseconds: segment.elapsedMilliseconds || 0,
                laps: segmentLaps,
                lapIndexOffset: globalLapIndexOffset,
                sourceSegmentIndex: segmentIndex,
                isContinuation: false
            });

            globalLapIndexOffset += segmentLapCount;
        });

        if (singleGroup.length > 0) {
            groups.push(singleGroup);
        }

        return groups;
    }

    segments.forEach((segment, segmentIndex) => {
        const segmentLapCount = Number(segment.lapCount) || 0;
        const segmentLaps = allLaps.slice(globalLapIndexOffset, globalLapIndexOffset + segmentLapCount);
        let segmentOffset = 0;
        let pieceIndex = 0;

        while (segmentOffset < segmentLaps.length) {
            const remainingSegmentLaps = segmentLaps.length - segmentOffset;
            const takeCount = Math.min(14, remainingSegmentLaps);

            const pieceLaps = segmentLaps.slice(segmentOffset, segmentOffset + takeCount);

            groups.push([{
                name: String(segment.name || '名称未設定'),
                elapsedMilliseconds: segment.elapsedMilliseconds || 0,
                laps: pieceLaps,
                lapIndexOffset: globalLapIndexOffset + segmentOffset,
                sourceSegmentIndex: segmentIndex,
                isContinuation: pieceIndex > 0
            }]);

            segmentOffset += takeCount;
            pieceIndex += 1;
        }

        globalLapIndexOffset += segmentLapCount;
    });

    return groups;
}

function renderSavedLapList(lapsContainer, record, recordIndex) {
    const lapsTitle = document.createElement('p');
    lapsTitle.textContent = 'ラップ';
    lapsContainer.appendChild(lapsTitle);

    if (Array.isArray(record.mergedSegments) && record.mergedSegments.length > 0) {
        const mergedSectionsWrap = document.createElement('div');
        mergedSectionsWrap.className = 'saved-merged-sections';
        const sectionGroups = buildMergedSectionGroups(record);
        if (sectionGroups.length > 1) {
            mergedSectionsWrap.classList.add('saved-merged-sections-two-columns');
        }

        sectionGroups.forEach((group) => {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'saved-merged-group';

            group.forEach((segmentPiece) => {
                const section = document.createElement('div');
                section.className = 'saved-merged-section';

                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'saved-merged-section-title';
                const sectionNameInput = document.createElement('input');
                sectionNameInput.type = 'text';
                sectionNameInput.className = 'saved-merged-name-input';
                sectionNameInput.maxLength = 60;
                sectionNameInput.value = String(segmentPiece.name || '名称未設定');
                sectionNameInput.addEventListener('change', () => {
                    updateMergedSegmentName(recordIndex, segmentPiece.sourceSegmentIndex, sectionNameInput.value);
                });
                sectionNameInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        sectionNameInput.blur();
                    }
                });
                sectionNameInput.addEventListener('blur', () => {
                    const normalizedName = String(sectionNameInput.value || '')
                        .replace(/[\r\n]+/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 60);
                    sectionNameInput.value = normalizedName === '' ? '名称未設定' : normalizedName;
                    updateMergedSegmentName(recordIndex, segmentPiece.sourceSegmentIndex, sectionNameInput.value);
                });
                sectionTitle.appendChild(sectionNameInput);

                const continuationSuffix = segmentPiece.isContinuation ? ' 続き' : '';
                if (continuationSuffix !== '') {
                    const continuationText = document.createElement('span');
                    continuationText.className = 'saved-merged-continuation';
                    continuationText.textContent = continuationSuffix;
                    sectionTitle.appendChild(continuationText);
                }
                section.appendChild(sectionTitle);

                const sectionMeta = document.createElement('p');
                sectionMeta.className = 'saved-merged-section-meta';
                sectionMeta.textContent = `タイム: ${formatTime(segmentPiece.elapsedMilliseconds || 0)}`;
                section.appendChild(sectionMeta);

                const lapColumns = document.createElement('div');
                lapColumns.className = 'saved-lap-columns';
                section.appendChild(lapColumns);
                renderSavedLapColumns(lapColumns, segmentPiece.laps, recordIndex, segmentPiece.lapIndexOffset);
                groupContainer.appendChild(section);
            });

            mergedSectionsWrap.appendChild(groupContainer);
        });

        lapsContainer.appendChild(mergedSectionsWrap);

        return;
    }

    const lapColumns = document.createElement('div');
    lapColumns.className = 'saved-lap-columns';
    lapsContainer.appendChild(lapColumns);
    renderSavedLapColumns(lapColumns, record.laps, recordIndex);
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
        if (Array.isArray(record.laps) && record.laps.length >= 15) {
            item.classList.add('saved-record-item-wide');
        }
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
        checkboxText.textContent = '選択';

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

        if (isMergeSelectionMode) {
            const mergeRecordButton = document.createElement('button');
            mergeRecordButton.type = 'button';
            mergeRecordButton.className = `merge-record-button${mergeSelectionIndexes.has(index) ? ' merge-record-button-active' : ''}`;
            mergeRecordButton.textContent = mergeSelectionIndexes.has(index) ? '統合対象から外す' : '統合対象にする';
            mergeRecordButton.addEventListener('click', () => {
                toggleMergeSelection(index);
            });
            actionGroup.appendChild(mergeRecordButton);
        }

        actionGroup.appendChild(deleteButton);

        heading.appendChild(title);
        heading.appendChild(renameButton);

        const elapsed = document.createElement('p');
        if (isMergedRecord(record)) {
            elapsed.textContent = '';
            elapsed.hidden = true;
        } else {
            elapsed.textContent = `タイム: ${formatTime(record.elapsedMilliseconds || 0)}`;
        }

        const laps = document.createElement('div');
        laps.className = 'saved-lap-list';
        renderSavedLapList(laps, record, index);

        item.appendChild(heading);
        item.appendChild(elapsed);
        item.appendChild(laps);

        const footer = document.createElement('div');
        footer.className = 'saved-record-footer';
        footer.appendChild(checkboxLabel);
        footer.appendChild(actionGroup);
        item.appendChild(footer);

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

function getSelectedRecordEntries() {
    const selectedIndexes = Array.from(mergeSelectionIndexes)
        .filter((index) => Number.isInteger(index) && index >= 0)
        .sort((a, b) => a - b);

    if (selectedIndexes.length === 0) {
        return [];
    }

    const records = getSavedRecords();
    return selectedIndexes
        .map((index) => ({ index, record: records[index] }))
        .filter(({ record }) => Boolean(record));
}

function getLapDisplaySecondsValue(lap) {
    if (typeof lap.displaySeconds === 'number' && Number.isFinite(lap.displaySeconds)) {
        return lap.displaySeconds;
    }

    if (typeof lap.elapsedMilliseconds === 'number' && Number.isFinite(lap.elapsedMilliseconds)) {
        return Number.parseFloat(formatLapDisplaySeconds(lap.elapsedMilliseconds, lap.lap));
    }

    return 0;
}

function cloneLapForMergedRecord(lap) {
    return {
        lap: Number.isInteger(lap?.lap) ? lap.lap : 1,
        elapsedMilliseconds: typeof lap?.elapsedMilliseconds === 'number' && Number.isFinite(lap.elapsedMilliseconds)
            ? lap.elapsedMilliseconds
            : null,
        displaySeconds: getLapDisplaySecondsValue(lap),
        comment: String(lap?.comment || '')
    };
}

function mergeSelectedRecords() {
    const selectedEntries = getSelectedRecordEntries();
    if (selectedEntries.length < 2) {
        window.alert('統合する保存データを2件以上選択してください。');
        return;
    }

    const orderedEntries = [...selectedEntries].sort((a, b) => {
        const byName = compareNamesAscending(a.record?.name, b.record?.name);
        if (byName !== 0) {
            return byName;
        }

        const aCreatedAt = new Date(a.record.createdAt || 0).getTime();
        const bCreatedAt = new Date(b.record.createdAt || 0).getTime();
        if (aCreatedAt !== bCreatedAt) {
            return aCreatedAt - bCreatedAt;
        }

        return a.index - b.index;
    });

    const defaultName = `統合 ${orderedEntries.map(({ record }) => String(record.name || '名称未設定')).join(' + ')}`
        .slice(0, 60);
    const inputName = window.prompt('統合後の保存名を入力してください。元データは残ります。', defaultName);
    if (inputName === null) {
        return;
    }

    const mergedName = inputName.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (mergedName === '') {
        window.alert('保存名を入力してください。');
        return;
    }

    const mergedLaps = [];
    const mergedSegments = [];
    let mergedElapsed = 0;

    orderedEntries.forEach(({ record }) => {
        const segmentElapsed = Number(record.elapsedMilliseconds) || 0;
        mergedElapsed += segmentElapsed;

        if (!Array.isArray(record.laps) || record.laps.length === 0) {
            return;
        }

        const segmentLaps = record.laps.map(cloneLapForMergedRecord);
        mergedLaps.push(...segmentLaps);
        mergedSegments.push({
            name: String(record.name || '名称未設定'),
            lapCount: segmentLaps.length,
            elapsedMilliseconds: segmentElapsed
        });
    });

    if (mergedLaps.length === 0) {
        window.alert('選択したデータに統合できるラップ記録がありません。');
        return;
    }

    const records = getSavedRecords();
    const mergedRecord = {
        name: mergedName,
        createdAt: new Date().toISOString(),
        elapsedMilliseconds: mergedElapsed,
        laps: mergedLaps,
        mergedSegments,
        mergedFrom: orderedEntries.map(({ record }) => String(record.name || '名称未設定'))
    };

    reorderMergedRecordSegments(mergedRecord);
    records.unshift(mergedRecord);

    setSavedRecords(records.slice(0, 50));
    isMergeSelectionMode = false;
    mergeSelectionIndexes = new Set();
    updateMergeSelectionUi();
    renderSavedRecords();
}

const SAFARI_LAP_OFFSET_MS = -400; //safari補正定数

function isMobileSafari() {
    const ua = navigator.userAgent;
    if (/iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua)) return true;
    if (/iPad/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)) return true;
    if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua) && navigator.maxTouchPoints > 1) return true;
    return false;
}

function getAuditoryOffsetMilliseconds() {
    return getOffsetMilliseconds(auditoryOffsetInput);
}

function getCorrectedElapsedMilliseconds(now) {
    const safariOffset = shouldApplySafariOffset() ? SAFARI_LAP_OFFSET_MS : 0;
    return (now - startTimestamp) + getAuditoryOffsetMilliseconds() - safariOffset;
}

function getCorrectedLapElapsed(now) {
    const visualOffset = getOffsetMilliseconds(visualOffsetInput);
    const safariOffset = shouldApplySafariOffset() ? SAFARI_LAP_OFFSET_MS : 0;
    return Math.max(0, (now - previousLapTimestamp) - visualOffset - safariOffset);
}

function getStopCorrectedElapsedMilliseconds(now) {
    const elapsed = getCorrectedElapsedMilliseconds(now);
    const visualOffset = getOffsetMilliseconds(visualOffsetInput);
    return Math.max(0, elapsed - visualOffset);
}

function getLapDisplayMilliseconds(lapElapsed, lapNumber) {
    const normalizedLapNumber = Number.parseInt(String(lapNumber), 10);

    if (normalizedLapNumber !== 1 && lapElapsed >= 10000) {
        return lapElapsed - 10000;
    }

    return lapElapsed;
}

function formatLapDisplaySeconds(lapElapsed, lapNumber) {
    const displayMilliseconds = getLapDisplayMilliseconds(lapElapsed, lapNumber);
    return (displayMilliseconds / 1000).toFixed(2);
}

function formatLiveLapSeconds(lapElapsed) {
    const safeMilliseconds = Math.max(0, Math.floor(lapElapsed));
    return (safeMilliseconds / 1000).toFixed(2);
}

function renderCurrentLapPreview(lapElapsed = 0) {
    if (!isRunning) {
        currentLapPreview.hidden = true;
        return;
    }

    currentLapPreview.hidden = false;
    const currentLapNumber = lapCount + 1;
    currentLapLabel.textContent = `Lap ${currentLapNumber}`;
    currentLapTime.textContent = formatLiveLapSeconds(lapElapsed);
    currentLapPreview.classList.toggle('lap-current-row-running', isRunning);
}

function appendLapResult(lapElapsed) {
    lapCount += 1;
    lapRecords.push({ lap: lapCount, elapsed: lapElapsed, comment: '' });
    remainingLapCount = Math.max(0, selectedLapTotal - lapCount);
    updateRemainingLapDisplay();
    updateActionButtonsForRemainingLaps();
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

        const lapLabel = document.createElement('span');
        lapLabel.textContent = `Lap ${record.lap}`;

        const lapNameInput = document.createElement('input');
        lapNameInput.type = 'text';
        lapNameInput.className = 'lap-name-input';
        lapNameInput.placeholder = 'Name';
        lapNameInput.maxLength = 40;
        lapNameInput.value = String(record.comment || '');
        lapNameInput.addEventListener('input', () => {
            const normalizedValue = String(lapNameInput.value || '')
                .replace(/[\r\n]+/g, ' ')
                .slice(0, 40);
            record.comment = normalizedValue;
            if (lapNameInput.value !== normalizedValue) {
                lapNameInput.value = normalizedValue;
            }
        });

        const lapTime = document.createElement('span');
        lapTime.textContent = formatLapDisplaySeconds(record.elapsed, record.lap);

        lapRow.appendChild(lapLabel);
        lapRow.appendChild(lapTime);
        lapRow.appendChild(lapNameInput);
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
    renderCurrentLapPreview(getCorrectedLapElapsed(now));
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
    updateSelectedLapTotal();
    remainingLapCount = selectedLapTotal;
    updateRemainingLapDisplay();
    lapRecords = [];
    lastElapsedMilliseconds = getAuditoryOffsetMilliseconds();
    renderElapsedTime(lastElapsedMilliseconds);
    renderCurrentLapPreview(0);
    renderLapResults();
}

function startMeasurement() {
    resetMeasurement();
    isRunning = true;
    startButton.textContent = 'ストップ';
    renderCurrentLapPreview(0);
    updateActionButtonsForRemainingLaps();
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
    lastElapsedMilliseconds = getStopCorrectedElapsedMilliseconds(now);
    renderElapsedTime(lastElapsedMilliseconds);

    isRunning = false;
    renderCurrentLapPreview(0);
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    startButton.textContent = 'スタート';
    updateActionButtonsForRemainingLaps();
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
        displaySeconds: Number.parseFloat(formatLapDisplaySeconds(record.elapsed, record.lap)),
        comment: String(record.comment || '').replace(/\s+/g, ' ').trim().slice(0, 40)
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
        '@page { size: A4; margin: 10mm; }',
        'body { font-family: "Yu Gothic UI", "Segoe UI", sans-serif; margin: 24px; color: #111827; font-size: 150%; }',
        '.record-group { margin-bottom: 16px; }',
        '.record-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }',
        '.record-card { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; font-size: 18px; break-inside: avoid; }',
        '.record-name { font-weight: 700; margin-bottom: 4px; }',
        '.record-elapsed { margin-bottom: 4px; }',
        '.merged-groups { display: grid; grid-template-columns: 1fr; gap: 8px; }',
        '.merged-groups.wrapped { column-gap: 10px; row-gap: 8px; }',
        '.merged-group { min-width: 0; }',
        '.merged-group-divider { border-left: 1px solid #9ca3af; padding-left: 8px; }',
        '.merged-group-with-right-gap { padding-right: 8px; }',
        '.merged-section { margin-top: 6px; padding-top: 0; border-top: none; }',
        '.merged-section:first-child { margin-top: 0; }',
        '.segment-title { margin: 0 0 2px; font-weight: 700; }',
        '.segment-meta { margin: 0 0 4px; color: #6b7280; font-size: 15px; }',
        '.lap-line { margin: 0 0 2px; font-weight: 700; display: grid; grid-template-columns: 36px minmax(0, 1fr) 56px; align-items: center; column-gap: 6px; }',
        '.lap-label { padding-left: 5px; padding-right: 0; font-variant-numeric: tabular-nums; text-align: left; }',
        '.lap-comment { font-weight: 400; color: #374151; font-size: 16.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.lap-comment-empty { color: #9ca3af; }',
        '.lap-time { padding-left: 6px; border-left: 1px solid #9ca3af; text-align: right; }',
        '.lap-empty { color: #6b7280; }'
    ].join('');
    doc.head.appendChild(style);

    const sortedRecords = [...records].sort((a, b) => {
        const aName = String(a.name || '');
        const bName = String(b.name || '');
        const byName = compareNamesForPdfExport(aName, bName);
        if (byName !== 0) {
            return byName;
        }

        const aCreatedAt = new Date(a.createdAt || 0).getTime();
        const bCreatedAt = new Date(b.createdAt || 0).getTime();
        return aCreatedAt - bCreatedAt;
    });

    const COLS = 4;
    const groupWrapper = doc.createElement('div');
    groupWrapper.className = 'record-group';

    for (let rowStart = 0; rowStart < sortedRecords.length; rowStart += COLS) {
        const grid = doc.createElement('div');
        grid.className = 'record-grid';

        const rowRecords = sortedRecords.slice(rowStart, rowStart + COLS);
        rowRecords.forEach((record) => {
                const card = doc.createElement('div');
                card.className = 'record-card';

                const nameDiv = doc.createElement('div');
                nameDiv.className = 'record-name';
                nameDiv.textContent = String(record.name || '名称未設定');
                card.appendChild(nameDiv);

                const elapsedDiv = doc.createElement('div');
                elapsedDiv.className = 'record-elapsed';
                if (isMergedRecord(record)) {
                    elapsedDiv.textContent = '';
                } else {
                    elapsedDiv.textContent = formatTime(record.elapsedMilliseconds || 0);
                    card.appendChild(elapsedDiv);
                }

                if (Array.isArray(record.mergedSegments) && record.mergedSegments.length > 0) {
                    const sectionGroups = buildMergedSectionGroups(record);
                    const mergedGroups = doc.createElement('div');
                    mergedGroups.className = 'merged-groups';
                    const mergedDataCount = Array.isArray(record.mergedSegments) ? record.mergedSegments.length : sectionGroups.length;
                    const columnCount = Math.max(1, Math.min(COLS, mergedDataCount));

                    if (sectionGroups.length > 1) {
                        mergedGroups.classList.add('wrapped');
                        mergedGroups.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
                        const spanCols = columnCount;
                        card.style.gridColumn = `span ${spanCols}`;
                    }

                    sectionGroups.forEach((group, groupIndex) => {
                        const groupContainer = doc.createElement('div');
                        groupContainer.className = 'merged-group';

                        if (sectionGroups.length > 1) {
                            const positionInRow = groupIndex % columnCount;
                            if (positionInRow > 0) {
                                groupContainer.classList.add('merged-group-divider');
                            }
                            if (positionInRow < columnCount - 1) {
                                groupContainer.classList.add('merged-group-with-right-gap');
                            }
                        }

                        group.forEach((segmentPiece) => {
                            const section = doc.createElement('div');
                            section.className = 'merged-section';

                            const segmentTitle = doc.createElement('div');
                            segmentTitle.className = 'segment-title';
                            const continuationSuffix = segmentPiece.isContinuation ? ' 続き' : '';
                            segmentTitle.textContent = `${segmentPiece.name}${continuationSuffix}`;
                            section.appendChild(segmentTitle);

                            const segmentMeta = doc.createElement('div');
                            segmentMeta.className = 'segment-meta';
                            segmentMeta.textContent = `タイム: ${formatTime(segmentPiece.elapsedMilliseconds || 0)}`;
                            section.appendChild(segmentMeta);

                            (Array.isArray(segmentPiece.laps) ? segmentPiece.laps : []).forEach((lap) => {
                                const line = doc.createElement('div');
                                line.className = 'lap-line';
                                const lapDisplay = lap.elapsedMilliseconds != null
                                    ? formatLapDisplaySeconds(lap.elapsedMilliseconds, lap.lap)
                                    : getLapDisplaySecondsValue(lap).toFixed(2);
                                const lapLabel = doc.createElement('span');
                                lapLabel.className = 'lap-label';
                                lapLabel.textContent = `${lap.lap}`;

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
                                section.appendChild(line);
                            });

                            groupContainer.appendChild(section);
                        });

                        mergedGroups.appendChild(groupContainer);
                    });

                    card.appendChild(mergedGroups);
                } else if (Array.isArray(record.laps) && record.laps.length > 0) {
                    record.laps.forEach((lap) => {
                        const line = doc.createElement('div');
                        line.className = 'lap-line';
                        const lapDisplay = lap.elapsedMilliseconds != null
                            ? formatLapDisplaySeconds(lap.elapsedMilliseconds, lap.lap)
                            : getLapDisplaySecondsValue(lap).toFixed(2);
                        const lapLabel = doc.createElement('span');
                        lapLabel.className = 'lap-label';
                        lapLabel.textContent = `${lap.lap}`;

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

        groupWrapper.appendChild(grid);
    }

    doc.body.appendChild(groupWrapper);

    exportWindow.document.close();
    exportWindow.focus();
    exportWindow.print();
}

applyReactionTimingAverages();
updateCustomLapInputVisibility();
updateSelectedLapTotal();
updateRemainingLapDisplay();
renderCurrentLapPreview(0);
renderSavedRecords();
updateMergeSelectionUi();
startButton.addEventListener('click', () => {
    if (isRunning) {
        stopMeasurement();
        return;
    }

    startMeasurement();
});
lapButton.addEventListener('click', recordLap);
distanceSelect.addEventListener('change', () => {
    updateCustomLapInputVisibility();
    updateSelectedLapTotal();
});
customLapInput.addEventListener('input', () => {
    customLapInput.value = String(customLapInput.value || '').replace(/\D+/g, '');

    if (String(distanceSelect.value) === 'laps-custom') {
        updateSelectedLapTotal();
    }
});
customLapInput.addEventListener('blur', () => {
    customLapInput.value = String(getValidatedCustomLapCount());

    if (String(distanceSelect.value) === 'laps-custom') {
        updateSelectedLapTotal();
    }
});
saveRecordButton.addEventListener('click', saveCurrentRecord);
exportPdfButton.addEventListener('click', exportSavedRecordsToPdf);
selectAllExportButton.addEventListener('click', () => setAllExportSelection(true));
clearExportSelectionButton.addEventListener('click', () => setAllExportSelection(false));
mergeSelectedButton.addEventListener('click', () => setMergeSelectionMode(true));
confirmMergeButton.addEventListener('click', () => {
    mergeSelectedRecords();
});
cancelMergeButton.addEventListener('click', () => setMergeSelectionMode(false));
