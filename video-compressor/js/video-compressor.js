// Video Compressor - Works with existing download.html
(async function() {
    const FFMPEG_CDN_URLS = [
        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.min.js',
        'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.min.js'
    ];
    const FFMPEG_CORE_URLS = {
        coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',
        wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm'
    };
    const SERVER_UPLOAD_ENDPOINTS = [
        `${window.location.origin}/video-compressor/server/upload.php`,
        'https://206.189.85.232/video-compressor/server/upload.php',
        'http://206.189.85.232/video-compressor/server/upload.php'
    ];
    const isLocalMode = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    let ffmpeg = null;
    
    // DOM Elements
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
    const serverFallbackBtn = document.getElementById('serverFallbackBtn');
    const engineStatus = document.getElementById('engineStatus');
    const compressionLevel = document.getElementById('compressionLevel');
    const qualityValue = document.getElementById('qualityValue');

    let selectedFile = null;
    let compressedBlob = null;
    let compressedOutputExt = 'mp4';
    let ffmpegLoaded = false;
    let ffmpegLoadAttempted = false;
    let ffmpegLoadPromise = null; // Track background loading

    function uniqueList(items) {
        return [...new Set(items.filter(Boolean))];
    }

    async function toBlobURL(url, mimeType) {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
        }

        const blob = await response.blob();
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject(new Error('Missing script URL'));
                return;
            }

            const existingScript = Array.from(document.getElementsByTagName('script')).find((script) => script.src === url);
            if (existingScript) {
                if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) {
                    resolve();
                    return;
                }

                existingScript.addEventListener('load', () => resolve(), { once: true });
                existingScript.addEventListener('error', () => reject(new Error('Failed to load script: ' + url)), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load script: ' + url));
            document.head.appendChild(script);
        });
    }

    async function ensureFFmpegLibraryLoaded() {
        if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) {
            return true;
        }

        for (const url of uniqueList(FFMPEG_CDN_URLS)) {
            try {
                await loadScript(url);
                if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) {
                    return true;
                }
            } catch (_) {
                // Try the next CDN URL.
            }
        }

        return false;
    }

    function showServerFallback(message) {
        if (isLocalMode) {
            return;
        }
        if (engineStatus) {
            engineStatus.style.display = 'block';
            engineStatus.textContent = message;
        }
        if (serverFallbackBtn) {
            serverFallbackBtn.style.display = 'inline-flex';
        }
    }

    function hideServerFallback() {
        if (engineStatus) {
            engineStatus.style.display = 'none';
            engineStatus.textContent = '';
        }
        if (serverFallbackBtn) {
            serverFallbackBtn.style.display = 'none';
        }
    }

    // Custom notification
    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.custom-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `custom-notification notification-${type}`;
        const icons = { error: 'exclamation-circle', success: 'check-circle', info: 'info-circle', warning: 'exclamation-triangle' };
        notification.innerHTML = `
            <i class="fas fa-${icons[type] || icons.info}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // Loading overlay
    function showLoading(message = 'Loading...') {
        const existing = document.querySelector('.loading-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function hideLoading() {
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) overlay.remove();
    }

    // Load FFmpeg
    async function initFFmpeg() {
        ffmpegLoadAttempted = true;
        try {
            const hasLibrary = await ensureFFmpegLibraryLoaded();
            if (!hasLibrary) {
                throw new Error('FFmpeg library unavailable from configured CDNs');
            }

            const { FFmpeg } = window.FFmpegWASM;
            ffmpeg = new FFmpeg();
            const coreURL = await toBlobURL(FFMPEG_CORE_URLS.coreURL, 'text/javascript');
            const wasmURL = await toBlobURL(FFMPEG_CORE_URLS.wasmURL, 'application/wasm');
            await ffmpeg.load({ coreURL, wasmURL });
            ffmpegLoaded = true;
            hideServerFallback();
            console.log('✓ FFmpeg ready in background');
        } catch (error) {
            console.error('FFmpeg background load failed:', error);
            ffmpegLoaded = false;
            if (!isLocalMode) {
                showServerFallback('Browser compression unavailable. Server fallback ready.');
            }
        }
    }

    // Event Listeners
    uploadArea.addEventListener('click', () => videoInput.click());
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        videoInput.click();
    });

    videoInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
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
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    compressionLevel.addEventListener('input', () => {
        qualityValue.textContent = compressionLevel.value + '%';
    });

    compressBtn.addEventListener('click', handleCompressClick);
    if (serverFallbackBtn) {
        serverFallbackBtn.addEventListener('click', compressVideoOnServer);
    }
    resetBtn.addEventListener('click', resetAll);
    compressAgainBtn.addEventListener('click', resetAll);

    async function handleCompressClick() {
        if (!selectedFile) {
            showNotification('Please select a video first', 'error');
            return;
        }

        // If FFmpeg is already loaded, use it immediately
        if (ffmpegLoaded) {
            await compressVideo();
            return;
        }

        // If FFmpeg is still loading, show a quick "preparing" message and wait
        if (!ffmpegLoadAttempted || ffmpegLoadPromise) {
            showNotification('Preparing browser engine... If this takes too long, using server fallback.', 'info');
            
            // Wait up to 10 seconds for FFmpeg to load
            let waited = 0;
            while (!ffmpegLoaded && waited < 10000) {
                await new Promise(resolve => setTimeout(resolve, 500));
                waited += 500;
            }

            if (ffmpegLoaded) {
                showNotification('Browser engine ready! Compressing...', 'success');
                await compressVideo();
                return;
            }
        }

        // Fallback to server compression if FFmpeg not available
        if (isLocalMode) {
            showNotification('Local testing mode - server compression disabled. Use a real web server or browser compression.', 'warning');
            return;
        }

        showNotification('Using server compression (browser engine not ready)...', 'info');
        await compressVideoOnServer();
    }

    function handleFile(file) {
        const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/x-flv'];
        const validExtensions = /\.(mp4|mov|avi|mkv|webm|flv)$/i;

        if (!validTypes.includes(file.type) && !file.name.match(validExtensions)) {
            showNotification('Please select a valid video file (MP4, MOV, AVI, MKV, WEBM, FLV)', 'error');
            return;
        }

        if (file.size > 500 * 1024 * 1024) {
            showNotification('File size exceeds 500MB limit.', 'error');
            return;
        }

        selectedFile = file;
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
            showNotification('Please select a video first', 'error');
            return;
        }

        if (!ffmpegLoaded) {
            showNotification('Video engine still loading. Please wait...', 'error');
            return;
        }

        compressBtn.disabled = true;
        progressContainer.style.display = 'block';
        resultSection.style.display = 'none';
        updateProgress(0, 'Preparing...');

        try {
            const quality = parseInt(compressionLevel.value);
            const format = document.getElementById('outputFormat').value;
            const resolution = document.getElementById('outputResolution').value;
            const fps = document.getElementById('frameRate').value;
            compressedOutputExt = format;

            updateProgress(10, 'Reading video...');
            const data = await selectedFile.arrayBuffer();
            const inputExt = selectedFile.name.split('.').pop() || 'mp4';
            const inputName = 'input.' + inputExt;
            const outputName = 'output.' + format;
            
            await ffmpeg.writeFile(inputName, new Uint8Array(data));

            updateProgress(20, 'Compressing...');
            const args = ['-i', inputName, '-c:v', 'libx264', '-preset', 'medium'];
            
            const crf = Math.round(51 - (quality / 100) * 51);
            args.push('-crf', String(Math.max(0, Math.min(51, crf))));

            const resMap = { '1080p': '1920:1080', '720p': '1280:720', '480p': '854:480', '360p': '640:360' };
            if (resMap[resolution]) {
                args.push('-vf', `scale=${resMap[resolution]}`);
            }

            if (fps !== 'original') args.push('-r', fps);
            args.push('-c:a', 'aac', '-b:a', '128k', '-y', outputName);

            ffmpeg.on('progress', ({ progress }) => {
                const pct = Math.round(20 + progress * 70);
                updateProgress(pct, 'Compressing...');
            });

            await ffmpeg.exec(args);

            updateProgress(95, 'Finalizing...');
            const outputData = await ffmpeg.readFile(outputName);
            compressedBlob = new Blob([outputData.buffer], { type: `video/${format}` });

            updateProgress(100, 'Complete!');
            
            document.getElementById('originalSizeResult').textContent = formatSize(selectedFile.size);
            document.getElementById('compressedSizeResult').textContent = formatSize(compressedBlob.size);
            
            const saved = selectedFile.size - compressedBlob.size;
            const savedPct = Math.round((saved / selectedFile.size) * 100);
            document.getElementById('spaceSaved').textContent = `${formatSize(saved)} (${savedPct}%)`;

            setTimeout(() => {
                progressContainer.style.display = 'none';
                resultSection.style.display = 'block';
            }, 500);

            showNotification('Video compressed successfully!', 'success');

        } catch (err) {
            console.error(err);
            showNotification('Compression failed. Try a different format or smaller video.', 'error');
            progressContainer.style.display = 'none';
        } finally {
            compressBtn.disabled = false;
        }
    }

    async function compressVideoOnServer() {
        if (!selectedFile) {
            showNotification('Please select a video first', 'error');
            return;
        }

        if (isLocalMode) {
            showNotification('Server compression is disabled while running from a local file. Use a local web server or deploy to test the VPS fallback.', 'error');
            return;
        }

        const quality = parseInt(compressionLevel.value, 10);
        const resolution = document.getElementById('outputResolution').value;
        const fps = document.getElementById('frameRate').value;

        compressBtn.disabled = true;
        if (serverFallbackBtn) {
            serverFallbackBtn.disabled = true;
        }

        progressContainer.style.display = 'block';
        resultSection.style.display = 'none';
        updateProgress(5, 'Uploading to server...');

        const endpoints = uniqueList(SERVER_UPLOAD_ENDPOINTS);
        let lastError = 'Server compression failed.';

        try {
            for (const endpoint of endpoints) {
                const formData = new FormData();
                formData.append('video', selectedFile);
                formData.append('quality', String(quality));
                formData.append('resolution', resolution);
                formData.append('framerate', fps);

                try {
                    updateProgress(20, 'Uploading...');
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(errorText || `HTTP ${response.status}`);
                    }

                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const payload = await response.json();
                        throw new Error(payload.error || 'Server returned an error response');
                    }

                    updateProgress(85, 'Finalizing server output...');
                    const serverBlob = await response.blob();
                    if (!serverBlob || !serverBlob.size) {
                        throw new Error('Server returned an empty file');
                    }

                    compressedBlob = serverBlob;
                    compressedOutputExt = 'mp4';

                    updateProgress(100, 'Complete!');

                    document.getElementById('originalSizeResult').textContent = formatSize(selectedFile.size);
                    document.getElementById('compressedSizeResult').textContent = formatSize(compressedBlob.size);

                    const saved = selectedFile.size - compressedBlob.size;
                    const savedPct = selectedFile.size > 0 ? Math.round((saved / selectedFile.size) * 100) : 0;
                    document.getElementById('spaceSaved').textContent = `${formatSize(saved)} (${savedPct}%)`;

                    setTimeout(() => {
                        progressContainer.style.display = 'none';
                        resultSection.style.display = 'block';
                    }, 500);

                    showNotification('Video compressed successfully using server fallback.', 'success');
                    showServerFallback('Compression completed on VPS server. Output format is MP4.');
                    return;
                } catch (endpointError) {
                    lastError = endpointError.message || lastError;
                }
            }

            throw new Error(lastError);
        } catch (error) {
            console.error(error);
            showNotification('Server compression failed. ' + lastError, 'error');
            progressContainer.style.display = 'none';
            showServerFallback('Server compression failed. Verify VPS endpoint and HTTPS/CORS settings.');
        } finally {
            compressBtn.disabled = false;
            if (serverFallbackBtn) {
                serverFallbackBtn.disabled = false;
            }
        }
    }

    function updateProgress(percent, text) {
        progressFill.style.width = percent + '%';
        progressText.textContent = text;
        progressPercent.textContent = percent + '%';
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
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
        compressBtn.disabled = false;
        compressionLevel.value = 70;
        qualityValue.textContent = '70%';
        document.getElementById('outputFormat').value = 'mp4';
        document.getElementById('outputResolution').value = 'original';
        document.getElementById('frameRate').value = 'original';
    }

    // Download handler - saves to localStorage and redirects to download.html
    downloadBtn.addEventListener('click', () => {
        if (!compressedBlob) {
            showNotification('No compressed video available', 'error');
            return;
        }
        
        // Convert blob to base64 for localStorage (matches your download.html format)
        const reader = new FileReader();
        reader.onload = function() {
            const base64Data = reader.result;
            const outputFormat = compressedOutputExt || document.getElementById('outputFormat').value || 'mp4';
            const fileName = `compressed_${selectedFile.name.replace(/\.[^/.]+$/, '')}.${outputFormat}`;
            
            const downloadData = {
                sourceName: selectedFile.name,
                outputExt: outputFormat,
                size: compressedBlob.size,
                fileData: base64Data,
                fileName: fileName,
                contentType: `video/${outputFormat}`,
                toolName: 'video-compressor'
            };
            
            localStorage.setItem('scrapestack-download', JSON.stringify(downloadData));
            window.location.href = '../download.html';
        };
        reader.readAsDataURL(compressedBlob);
    });

    // FAQ Accordion
    document.querySelectorAll('.faq-question').forEach(q => {
        q.addEventListener('click', () => {
            const item = q.parentElement;
            const isActive = item.classList.contains('active');
            
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.faq-question i').forEach(i => {
                i.className = 'fas fa-chevron-down';
            });
            
            if (!isActive) {
                item.classList.add('active');
                q.querySelector('i').className = 'fas fa-chevron-up';
            }
        });
    });

    // Initialize
    // Start background loading of FFmpeg WITHOUT blocking the UI
    if (!isLocalMode) {
        ffmpegLoadPromise = initFFmpeg();
    }
})();