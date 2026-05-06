(async function () {
    const FFMPEG_VERSION = '0.12.6';
    const FFMPEG_SCRIPT_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd/ffmpeg.min.js`;
    const FFMPEG_ASSET_URLS = [
        {
            coreURL: `https://unpkg.com/@ffmpeg/core@${FFMPEG_VERSION}/dist/umd/ffmpeg-core.js`,
            wasmURL: `https://unpkg.com/@ffmpeg/core@${FFMPEG_VERSION}/dist/umd/ffmpeg-core.wasm`,
            workerURL: `https://unpkg.com/@ffmpeg/core@${FFMPEG_VERSION}/dist/umd/ffmpeg-core.worker.js`
        }
    ];

    let ffmpeg = null;
    let ffmpegReadyPromise = null;
    let selectedFile = null;
    let compressedBlob = null;
    let compressedOutputExt = 'mp4';

    const uploadArea = document.getElementById('uploadArea');
    const videoInput = document.getElementById('videoInput');
    const browseBtn = document.getElementById('browseBtn');
    const processingArea = document.getElementById('processingArea');
    const videoPreview = document.getElementById('videoPreview');
    const compressBtn = document.getElementById('compressBtn');
    const resetBtn = document.getElementById('resetBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const resultSection = document.getElementById('resultSection');
    const downloadBtn = document.getElementById('downloadBtn');
    const compressAgainBtn = document.getElementById('compressAgainBtn');
    const compressionLevel = document.getElementById('compressionLevel');
    const qualityValue = document.getElementById('qualityValue');

    function showNotification(message, type) {
        const existing = document.querySelector('.custom-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `custom-notification notification-${type || 'info'}`;
        notification.innerHTML = `
            <i class="fas fa-info-circle"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 2500);
    }

    function showLoading(message) {
        let overlay = document.querySelector('.loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p></p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.querySelector('p').textContent = message;
        overlay.style.display = 'flex';
    }

    function hideLoading() {
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function updateProgress(percent, text) {
        progressContainer.style.display = 'block';
        progressFill.style.width = `${percent}%`;
        progressText.textContent = text;
        progressPercent.textContent = `${percent}%`;
    }

    function formatSize(bytes) {
        if (!bytes) return '0 Bytes';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const existing = Array.from(document.scripts).find((script) => script.src === url);
            if (existing) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Script load failed'));
            document.head.appendChild(script);
        });
    }

    async function toBlobURL(url, mimeType) {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error('Asset load failed');
        }
        const blob = await response.blob();
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
    }

    async function ensureFFmpegReady() {
        if (ffmpeg) return ffmpeg;
        if (ffmpegReadyPromise) return ffmpegReadyPromise;

        ffmpegReadyPromise = (async () => {
            if (!(window.FFmpegWASM && window.FFmpegWASM.FFmpeg)) {
                await loadScript(FFMPEG_SCRIPT_URL);
            }

            const { FFmpeg } = window.FFmpegWASM;
            const instance = new FFmpeg();
            const assetSet = FFMPEG_ASSET_URLS[0];
            const coreURL = await toBlobURL(assetSet.coreURL, 'text/javascript');
            const wasmURL = await toBlobURL(assetSet.wasmURL, 'application/wasm');
            const workerURL = await toBlobURL(assetSet.workerURL, 'text/javascript');

            await instance.load({ coreURL, wasmURL, workerURL });
            ffmpeg = instance;
            return instance;
        })();

        try {
            return await ffmpegReadyPromise;
        } finally {
            ffmpegReadyPromise = null;
        }
    }

    function handleFile(file) {
        const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/x-flv'];
        const validExtensions = /\.(mp4|mov|avi|mkv|webm|flv)$/i;

        if (!validTypes.includes(file.type) && !validExtensions.test(file.name)) {
            showNotification('Compression failed. Please try again.', 'error');
            return;
        }

        if (file.size > 500 * 1024 * 1024) {
            showNotification('Compression failed. Please try again.', 'error');
            return;
        }

        selectedFile = file;
        compressedBlob = null;
        displayVideoInfo(file);
    }

    function displayVideoInfo(file) {
        uploadArea.style.display = 'none';
        processingArea.style.display = 'block';
        resultSection.style.display = 'none';
        progressContainer.style.display = 'none';

        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = formatSize(file.size);

        const url = URL.createObjectURL(file);
        videoPreview.src = url;

        videoPreview.onloadedmetadata = () => {
            const mins = Math.floor(videoPreview.duration / 60);
            const secs = Math.floor(videoPreview.duration % 60);
            document.getElementById('duration').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            document.getElementById('resolution').textContent = `${videoPreview.videoWidth}x${videoPreview.videoHeight}`;
        };
    }

    async function compressVideo() {
        if (!selectedFile) {
            showNotification('Compression failed. Please try again.', 'error');
            return;
        }

        compressBtn.disabled = true;
        resultSection.style.display = 'none';

        try {
            showLoading('Initializing...');
            const engine = await ensureFFmpegReady();
            if (!engine) throw new Error('engine');
            hideLoading();

            updateProgress(5, 'Compressing...');

            const quality = parseInt(compressionLevel.value, 10);
            const format = document.getElementById('outputFormat').value;
            const resolution = document.getElementById('outputResolution').value;
            const fps = document.getElementById('frameRate').value;
            compressedOutputExt = format;

            const inputExt = (selectedFile.name.split('.').pop() || 'mp4').toLowerCase();
            const inputName = `input.${inputExt}`;
            const outputName = `output.${format}`;
            const data = await selectedFile.arrayBuffer();

            await engine.writeFile(inputName, new Uint8Array(data));

            const args = ['-i', inputName, '-c:v', 'libx264', '-preset', 'medium'];
            const crf = Math.round(51 - (quality / 100) * 51);
            args.push('-crf', String(Math.max(0, Math.min(51, crf))));

            const resMap = {
                '1080p': '1920:1080',
                '720p': '1280:720',
                '480p': '854:480',
                '360p': '640:360'
            };

            if (resMap[resolution]) {
                args.push('-vf', `scale=${resMap[resolution]}`);
            }

            if (fps !== 'original') {
                args.push('-r', fps);
            }

            args.push('-c:a', 'aac', '-b:a', '128k', '-y', outputName);

            engine.on('progress', ({ progress }) => {
                const pct = Math.max(10, Math.min(95, Math.round(10 + progress * 85)));
                updateProgress(pct, 'Compressing...');
            });

            await engine.exec(args);

            updateProgress(98, 'Compressing...');
            const outputData = await engine.readFile(outputName);
            compressedBlob = new Blob([outputData.buffer], { type: `video/${format}` });

            document.getElementById('originalSizeResult').textContent = formatSize(selectedFile.size);
            document.getElementById('compressedSizeResult').textContent = formatSize(compressedBlob.size);

            const saved = selectedFile.size - compressedBlob.size;
            const savedPct = selectedFile.size > 0 ? Math.round((saved / selectedFile.size) * 100) : 0;
            document.getElementById('spaceSaved').textContent = `${formatSize(saved)} (${savedPct}%)`;

            updateProgress(100, 'Complete!');
            setTimeout(() => {
                progressContainer.style.display = 'none';
                resultSection.style.display = 'block';
            }, 300);

            showNotification('Complete!', 'success');
        } catch (_) {
            hideLoading();
            progressContainer.style.display = 'none';
            showNotification('Compression failed. Please try again.', 'error');
        } finally {
            compressBtn.disabled = false;
        }
    }

    function resetAll() {
        selectedFile = null;
        compressedBlob = null;
        compressedOutputExt = 'mp4';
        videoInput.value = '';
        videoPreview.src = '';
        uploadArea.style.display = 'block';
        processingArea.style.display = 'none';
        resultSection.style.display = 'none';
        progressContainer.style.display = 'none';
        hideLoading();
        compressBtn.disabled = false;
        compressionLevel.value = 70;
        qualityValue.textContent = '70%';
        document.getElementById('outputFormat').value = 'mp4';
        document.getElementById('outputResolution').value = 'original';
        document.getElementById('frameRate').value = 'original';
    }

    uploadArea.addEventListener('click', () => videoInput.click());

    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        videoInput.click();
    });

    videoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    compressionLevel.addEventListener('input', () => {
        qualityValue.textContent = `${compressionLevel.value}%`;
    });

    compressBtn.addEventListener('click', compressVideo);
    resetBtn.addEventListener('click', resetAll);
    compressAgainBtn.addEventListener('click', resetAll);

    downloadBtn.addEventListener('click', () => {
        if (!compressedBlob || !selectedFile) {
            showNotification('Compression failed. Please try again.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function () {
            const outputFormat = compressedOutputExt || 'mp4';
            const fileName = `compressed_${selectedFile.name.replace(/\.[^/.]+$/, '')}.${outputFormat}`;

            localStorage.setItem('scrapestack-download', JSON.stringify({
                sourceName: selectedFile.name,
                outputExt: outputFormat,
                size: compressedBlob.size,
                fileData: reader.result,
                fileName,
                contentType: `video/${outputFormat}`,
                toolName: 'video-compressor'
            }));

            window.location.href = '../download.html';
        };
        reader.readAsDataURL(compressedBlob);
    });

    document.querySelectorAll('.faq-question').forEach((q) => {
        q.addEventListener('click', () => {
            const item = q.parentElement;
            const isActive = item.classList.contains('active');

            document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('active'));
            document.querySelectorAll('.faq-question i').forEach((icon) => {
                icon.className = 'fas fa-chevron-down';
            });

            if (!isActive) {
                item.classList.add('active');
                q.querySelector('i').className = 'fas fa-chevron-up';
            }
        });
    });

    ensureFFmpegReady().catch(() => {});
})();