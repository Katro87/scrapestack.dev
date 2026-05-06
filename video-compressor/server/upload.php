<?php
// Server-side video compression using FFmpeg on DigitalOcean VPS
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Configuration
$maxFileSize = 500 * 1024 * 1024; // 500MB
$allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
$uploadDir = '/var/www/scrapestack/temp/';
$ffmpegPath = '/usr/bin/ffmpeg'; // Path to FFmpeg on Ubuntu

// Create upload directory if not exists
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

try {
    if (!isset($_FILES['video'])) {
        throw new Exception('No video file uploaded');
    }
    
    $file = $_FILES['video'];
    
    // Validate file
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('Upload error: ' . $file['error']);
    }
    
    if ($file['size'] > $maxFileSize) {
        throw new Exception('File exceeds maximum size of 500MB');
    }
    
    // Generate unique filenames
    $inputFile = $uploadDir . uniqid('video_') . '.mp4';
    $outputFile = $uploadDir . uniqid('compressed_') . '.mp4';
    
    // Move uploaded file
    if (!move_uploaded_file($file['tmp_name'], $inputFile)) {
        throw new Exception('Failed to save uploaded file');
    }
    
    // Get compression parameters
    $quality = isset($_POST['quality']) ? intval($_POST['quality']) : 70;
    $resolution = isset($_POST['resolution']) ? $_POST['resolution'] : 'original';
    $frameRate = isset($_POST['framerate']) ? $_POST['framerate'] : 'original';
    
    // Build FFmpeg command
    $crf = round(51 - ($quality / 100) * 51);
    $crf = max(0, min(51, $crf));
    
    $cmd = "$ffmpegPath -i " . escapeshellarg($inputFile);
    $cmd .= " -c:v libx264 -crf $crf -preset medium";
    $cmd .= " -c:a aac -b:a 128k";
    
    // Add resolution scaling
    if ($resolution !== 'original') {
        $resolutions = [
            '1080p' => '1920:1080',
            '720p' => '1280:720',
            '480p' => '854:480',
            '360p' => '640:360'
        ];
        if (isset($resolutions[$resolution])) {
            $cmd .= " -vf scale=" . $resolutions[$resolution];
        }
    }
    
    // Add frame rate
    if ($frameRate !== 'original') {
        $cmd .= " -r " . intval($frameRate);
    }
    
    $cmd .= " -y " . escapeshellarg($outputFile) . " 2>&1";
    
    // Execute FFmpeg
    exec($cmd, $output, $returnCode);
    
    if ($returnCode !== 0) {
        throw new Exception('Compression failed: ' . implode("\n", $output));
    }
    
    // Check if output file exists and has size
    if (!file_exists($outputFile) || filesize($outputFile) === 0) {
        throw new Exception('Compression produced empty file');
    }
    
    // Return compressed file
    $compressedSize = filesize($outputFile);
    $originalSize = filesize($inputFile);
    
    header('Content-Type: video/mp4');
    header('Content-Disposition: attachment; filename="compressed_video.mp4"');
    header('Content-Length: ' . $compressedSize);
    
    readfile($outputFile);
    
    // Cleanup
    unlink($inputFile);
    unlink($outputFile);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    
    // Cleanup on error
    if (isset($inputFile) && file_exists($inputFile)) {
        unlink($inputFile);
    }
    if (isset($outputFile) && file_exists($outputFile)) {
        unlink($outputFile);
    }
}
?>