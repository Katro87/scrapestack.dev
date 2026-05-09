const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const fileChip = document.getElementById('fileChip');
const fileName = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFile');
const inputFormat = document.getElementById('inputFormat');
const outputFormat = document.getElementById('outputFormat');
const statusMsg = document.getElementById('statusMsg');
const convertBtn = document.getElementById('convertBtn');

// API Base URL for VPS backend
const API_BASE_URL = window.location.origin;

if (window.location.protocol === 'file:') {
    console.error('ScrapeStack doc converter requires a local web server. Open it via http://localhost instead of file://.');
}

let selectedFile = null;
function setSelectedFile(file) {
    // Warn for large files
    if (file.size > 50 * 1024 * 1024) { // 50MB
        statusMsg.textContent = '⚠️ Large file detected (over 50MB). Conversion may take 2-5 minutes.';
        statusMsg.style.color = '#ff9800';
    } else if (file.size > 10 * 1024 * 1024) { // 10MB
        statusMsg.textContent = '📁 Large file. Please wait patiently...';
        statusMsg.style.color = '#2196f3';
    }
    
    // Rest of your existing code...
}
// Add at the top of script.js
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('step1').classList.add('active');
}

function updateLoadingStep(step) {
    const steps = {
        1: { el: 'step1', text: '📤 Uploading' },
        2: { el: 'step2', text: '⚙️ Processing' },
        3: { el: 'step3', text: '📥 Preparing Download' }
    };
    
    for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(steps[i].el);
        if (i < step) {
            stepEl.classList.remove('active');
            stepEl.classList.add('completed');
        } else if (i === step) {
            stepEl.classList.add('active');
            stepEl.classList.remove('completed');
        } else {
            stepEl.classList.remove('active', 'completed');
        }
    }
    
    const messages = {
        1: 'Uploading your file to the server...',
        2: 'Converting with LibreOffice...',
        3: 'Preparing download...'
    };
    document.getElementById('loadingSubtext').textContent = messages[step] || 'Processing...';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Update your convertFile function
async function convertFile(mode, file) {
    const formData = new FormData();
    formData.append('file', file);
    const endpoint = `${API_BASE_URL}/convert/${mode}`;
    
    // Step 1: Uploading
    updateLoadingStep(1);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(600000) // Increased to 10 minutes
        });

        // Step 2: Processing (LibreOffice)
        updateLoadingStep(2);

        if (!response.ok) {
            let message = `Server error (${response.status})`;
            try {
                const payload = await response.json();
                message = payload.error || message;
            } catch (_) {}
            throw new Error(message);
        }

        // Step 3: Preparing download
        updateLoadingStep(3);

        const blob = await response.blob();

        // Convert blob to base64
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve({
                    fileData: reader.result,
                    contentType: blob.type,
                    size: blob.size
                });
            };
            reader.onerror = () => reject(new Error('Failed to process file'));
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Document conversion failed:', error);
        throw error;
    }
}
const supportedOutputs = {
    pdf: [],
    doc: ['pdf'],
    docx: ['pdf'],
    ppt: ['pdf'],
    pptx: ['pdf'],
    jpg: ['pdf'],
    jpeg: ['pdf'],
    png: ['pdf'],
    gif: ['pdf'],
    bmp: ['pdf']
};

uploadBox.addEventListener('click', () => fileInput.click());
uploadBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
    }
});

uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('drag-over');
});

uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('drag-over');
});

uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
});

removeFileBtn.addEventListener('click', () => resetSelection());

outputFormat.addEventListener('change', updateConvertState);

convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const sourceExt = getExt(selectedFile.name);
    const targetExt = outputFormat.value;
    const mode = getMode(sourceExt, targetExt);

    if (!mode) {
        statusMsg.textContent = 'This conversion pair is not supported yet.';
        return;
    }

    convertBtn.disabled = true;
    convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';
    statusMsg.textContent = 'Converting file. Please wait...';
    console.log(`🔄 Starting conversion: ${sourceExt} → ${targetExt} (mode: ${mode})`);

    try {
        const result = await convertFile(mode, selectedFile);
        
        // Store download data with unique ID
        const downloadId = Date.now().toString();
        const downloadData = {
            id: downloadId,
            fileName: buildDownloadName(selectedFile.name, targetExt),
            sourceName: selectedFile.name,
            inputExt: sourceExt,
            outputExt: targetExt,
            fileData: result.fileData,
            contentType: result.contentType,
            size: result.size,
            createdAt: Date.now()
        };
        
        localStorage.setItem('scrapestack-download', JSON.stringify(downloadData));
        
        console.log(`📍 Redirecting to download page...`);
        window.location.href = `../../download.html?id=${downloadId}`;
        
    } catch (error) {
        console.error(`❌ Conversion error:`, error);
        statusMsg.textContent = error.message || 'Conversion failed. Please try again.';
        convertBtn.disabled = false;
        convertBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Convert';
    }
});

function setSelectedFile(file) {
    selectedFile = file;
    fileName.textContent = `${file.name} (${formatBytes(file.size)})`;
    fileChip.style.display = 'flex';

    const ext = getExt(file.name);
    inputFormat.value = ext ? ext.toUpperCase() : 'Unknown';
    hydrateOutputOptions(ext);
}

function hydrateOutputOptions(inputExt) {
    outputFormat.innerHTML = '<option value="">Choose output format</option>';
    const options = supportedOutputs[inputExt] || [];

    if (options.length === 0) {
        outputFormat.disabled = true;
        statusMsg.textContent = 'Unsupported file format. Please upload DOC, DOCX, PPT, PPTX, JPG, JPEG, PNG, GIF or BMP.';
        updateConvertState();
        return;
    }

    options.forEach((ext) => {
        const option = document.createElement('option');
        option.value = ext;
        option.textContent = ext.toUpperCase();
        outputFormat.appendChild(option);
    });

    outputFormat.disabled = false;
    outputFormat.value = options[0];
    statusMsg.textContent = 'Now choose output format and click convert.';
    updateConvertState();
}

function updateConvertState() {
    const canConvert = Boolean(selectedFile && outputFormat.value);
    convertBtn.disabled = !canConvert;
}

function resetSelection() {
    selectedFile = null;
    fileInput.value = '';
    fileChip.style.display = 'none';
    inputFormat.value = 'Waiting for file...';
    outputFormat.innerHTML = '<option value="">Choose output format</option>';
    outputFormat.disabled = true;
    statusMsg.textContent = 'Select a file to continue.';
    convertBtn.disabled = true;
    convertBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Convert';
}

async function convertFile(mode, file) {
    const formData = new FormData();
    formData.append('file', file);

    const endpoint = `${API_BASE_URL}/convert/${mode}`;
    console.log(`📡 Posting to: ${endpoint}`);

    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(300000)
    });

    if (!response.ok) {
        let message = `Server error (${response.status})`;
        try {
            const payload = await response.json();
            message = payload.error || message;
        } catch (_) {}
        throw new Error(message);
    }

    console.log(`✅ Got response from ${endpoint}`);
    
    // Get the blob from response
    const blob = await response.blob();
    
    // Convert blob to base64 for localStorage
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve({
                fileData: reader.result,
                contentType: blob.type,
                size: blob.size
            });
        };
        reader.onerror = () => reject(new Error('Failed to process file'));
        reader.readAsDataURL(blob);
    });
}

function getMode(inputExt, outputExt) {
    if ((inputExt === 'doc' || inputExt === 'docx') && outputExt === 'pdf') return 'doc-to-pdf';
    if ((inputExt === 'ppt' || inputExt === 'pptx') && outputExt === 'pdf') return 'ppt-to-pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(inputExt) && outputExt === 'pdf') return 'image-to-pdf';
    return '';
}

function getExt(name) {
    const parts = name.toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
}

function buildDownloadName(sourceName, targetExt) {
    const baseName = sourceName.replace(/\.[^/.]+$/, '');
    return `${baseName}.${targetExt}`;
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}