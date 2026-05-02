// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const qualityControl = document.getElementById('qualityControl');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const previewSection = document.getElementById('previewSection');
const originalPreview = document.getElementById('originalPreview');
const compressedPreview = document.getElementById('compressedPreview');
const originalSizeSpan = document.getElementById('originalSize');
const compressedSizeSpan = document.getElementById('compressedSize');
const savingInfo = document.getElementById('savingInfo');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

// State
let currentOriginalFile = null;
let currentCompressedDataURL = null;
let currentCompressedBlob = null;
let currentOutputFormat = 'image/jpeg';

// Upload handlers
uploadArea.addEventListener('click', () => fileInput.click());
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
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleImageFile(file);
    } else {
        alert('Please drop a valid image file (JPG, PNG, or WEBP)');
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        handleImageFile(e.target.files[0]);
    }
});

// Quality slider
qualitySlider.addEventListener('input', (e) => {
    const quality = e.target.value;
    qualityValue.textContent = quality;
    if (currentOriginalFile) {
        compressAndPreview(currentOriginalFile, quality / 100);
    }
});

// Download button
downloadBtn.addEventListener('click', () => {
    if (currentCompressedBlob) {
        const url = URL.createObjectURL(currentCompressedBlob);
        const a = document.createElement('a');
        a.href = url;
        
        // Smart filename: suggest WEBP for best compression
        let extension = 'jpg';
        if (currentOutputFormat === 'image/png') extension = 'png';
        if (currentOutputFormat === 'image/webp') extension = 'webp';
        if (currentOutputFormat === 'image/jpeg') extension = 'jpg';
        
        a.download = `compressed_${Date.now()}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});

resetBtn.addEventListener('click', () => {
    resetUI();
    fileInput.value = '';
});

// Main compression function
function handleImageFile(file) {
    currentOriginalFile = file;
    const originalSizeKB = (file.size / 1024).toFixed(2);
    originalSizeSpan.textContent = originalSizeKB;
    
    // Show original preview
    const reader = new FileReader();
    reader.onload = (e) => {
        originalPreview.src = e.target.result;
        previewSection.style.display = 'block';
        qualityControl.style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    // Start compression with current quality
    compressAndPreview(file, qualitySlider.value / 100);
}

function compressAndPreview(file, quality) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            // SMART FORMAT SELECTION:
            // For photos: use JPEG (smaller files)
            // For PNG with transparency: keep PNG
            // For everything else: use WEBP (best compression)
            
            let outputFormat = 'image/jpeg';
            let formatName = 'JPEG';
            
            // Check if image has transparency
            const hasTransparency = checkIfImageHasTransparency(img, canvas, ctx);
            
            if (file.type === 'image/png') {
                if (hasTransparency) {
                    // PNG with transparency - must keep PNG
                    outputFormat = 'image/png';
                    formatName = 'PNG (transparent)';
                } else {
                    // PNG without transparency - convert to WEBP (smaller)
                    outputFormat = 'image/webp';
                    formatName = 'WEBP (better compression)';
                }
            } else if (file.type === 'image/jpeg') {
                // JPEG photos - keep as JPEG (good quality/size ratio)
                outputFormat = 'image/jpeg';
                formatName = 'JPEG';
            } else if (file.type === 'image/webp') {
                outputFormat = 'image/webp';
                formatName = 'WEBP';
            }
            
            currentOutputFormat = outputFormat;
            
            // For JPEG and WEBP, use quality setting
            // For PNG, quality parameter is ignored (lossless)
            let compressedDataURL;
            if (outputFormat === 'image/png') {
                // PNG compression is lossless, quality param does nothing
                compressedDataURL = canvas.toDataURL(outputFormat);
            } else {
                compressedDataURL = canvas.toDataURL(outputFormat, quality);
            }
            
            currentCompressedDataURL = compressedDataURL;
            compressedPreview.src = compressedDataURL;
            
            // Calculate compressed size
            const compressedBlob = dataURLToBlob(compressedDataURL);
            currentCompressedBlob = compressedBlob;
            const compressedSizeKB = (compressedBlob.size / 1024).toFixed(2);
            compressedSizeSpan.textContent = compressedSizeKB;
            
            // Calculate savings
            const originalSize = file.size;
            const compressedSize = compressedBlob.size;
            const savedBytes = originalSize - compressedSize;
            const savedPercent = ((savedBytes / originalSize) * 100).toFixed(1);
            
            if (savedPercent <= 0) {
                savingInfo.textContent = `⚠️ PNGs are already compressed. Try: Use a JPG image instead, or drag again and set quality to 50%`;
                savingInfo.style.color = '#f59e0b';
            } else {
                savingInfo.innerHTML = `💾 Saved ${savedPercent}% (${(savedBytes / 1024).toFixed(2)} KB) • Format: ${formatName}`;
                savingInfo.style.color = '#10b981';
            }
            
            // Add hint for PNG users
            if (file.type === 'image/png' && !hasTransparency && savedPercent < 5) {
                savingInfo.innerHTML += `<br>💡 Tip: Convert to JPG for 70-80% smaller file (you'll lose transparency, but files will be tiny)`;
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Helper: Check if image has transparency
function checkIfImageHasTransparency(img, canvas, ctx) {
    // Draw image
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    // Get pixel data
    const imageData = ctx.getImageData(0, 0, img.width, Math.min(img.height, 100));
    const data = imageData.data;
    
    // Check alpha channel (every 4th pixel)
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) { // Not fully opaque
            return true;
        }
    }
    return false;
}

// Helper functions
function dataURLToBlob(dataURL) {
    const parts = dataURL.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
}

function getFileExtension(mimeType) {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
}

function resetUI() {
    previewSection.style.display = 'none';
    qualityControl.style.display = 'none';
    originalPreview.src = '';
    compressedPreview.src = '';
    currentOriginalFile = null;
    currentCompressedDataURL = null;
    currentCompressedBlob = null;
    qualitySlider.value = 70;
    qualityValue.textContent = '70';
}
// Mobile menu toggle
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

if (navToggle) {
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
}

// Close mobile menu when clicking a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
    });
});