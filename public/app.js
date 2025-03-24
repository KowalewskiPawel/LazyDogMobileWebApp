// State management
const state = {
  net: null,
  isRunning: false,
  showSkeleton: true
};

// DOM elements
const videoElement = document.getElementById('videoElement');
const canvas = document.getElementById('canvas');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const toggleSkeletonButton = document.getElementById('toggleSkeletonButton');
const statusMessage = document.getElementById('statusMessage');

// Initialize canvas to match video dimensions
function setupCanvas() {
  canvas.width = videoElement.width;
  canvas.height = videoElement.height;
}

// Load PoseNet model
async function loadPoseNet() {
  try {
    updateStatus('Loading PoseNet model...');
    state.net = await posenet.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      inputResolution: { width: 640, height: 480 },
      multiplier: 0.75
    });
    updateStatus('PoseNet model loaded successfully', false);
    startButton.disabled = false;
  } catch (error) {
    console.error('Error loading PoseNet model:', error);
    updateStatus('Failed to load PoseNet model: ' + error.message, true);
  }
}

// Start pose detection
function startPoseDetection() {
  if (!state.net) {
    updateStatus('PoseNet model not loaded yet', true);
    return;
  }

  state.isRunning = true;
  startButton.disabled = true;
  stopButton.disabled = false;
  updateStatus('Pose detection running...');
  
  detectPoseInRealTime();
}

// Stop pose detection
function stopPoseDetection() {
  state.isRunning = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  updateStatus('Pose detection stopped');
}

// Toggle skeleton display
function toggleSkeleton() {
  state.showSkeleton = !state.showSkeleton;
  toggleSkeletonButton.textContent = state.showSkeleton ? 'Hide Skeleton' : 'Show Skeleton';
}

// Update status message
function updateStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = isError ? 'status error' : 'status';
}

// Detect pose in real-time
async function detectPoseInRealTime() {
  if (!state.isRunning) return;

  const ctx = canvas.getContext('2d');
  
  try {
    // Make sure canvas is sized correctly
    if (canvas.width !== videoElement.width || canvas.height !== videoElement.height) {
      canvas.width = videoElement.width;
      canvas.height = videoElement.height;
    }
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the image to canvas
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // Estimate pose
    const pose = await state.net.estimateSinglePose(canvas, {
      flipHorizontal: false
    });
    
    // If we have a pose with good confidence, draw it
    if (pose.score > 0.2) {
      drawPose(pose, ctx);
    }
    
    // Continue detection loop
    requestAnimationFrame(detectPoseInRealTime);
  } catch (error) {
    console.error('Pose detection error:', error);
    updateStatus('Error during pose detection: ' + error.message, true);
    
    // Try to restart detection after a brief pause
    setTimeout(() => {
      if (state.isRunning) {
        detectPoseInRealTime();
      }
    }, 1000);
  }
}

// Draw the detected pose
function drawPose(pose, ctx) {
  const { keypoints, score } = pose;
  
  // Only draw keypoints with reasonable confidence
  const confidenceThreshold = 0.5;
  
  // Draw keypoints
  keypoints.forEach((keypoint) => {
    if (keypoint.score >= confidenceThreshold) {
      const { x, y } = keypoint.position;
      
      // Draw a circle at the keypoint
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'red';
      ctx.fill();
    }
  });
  
  // Draw skeleton if enabled
  if (state.showSkeleton) {
    // Define the connected keypoint pairs for the skeleton
    const connectedParts = [
      ['nose', 'leftEye'], ['leftEye', 'leftEar'],
      ['nose', 'rightEye'], ['rightEye', 'rightEar'],
      ['leftShoulder', 'rightShoulder'],
      ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
      ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
      ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
      ['leftHip', 'rightHip'],
      ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'],
      ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle']
    ];
    
    // Draw lines between connected keypoints
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    
    connectedParts.forEach(([partA, partB]) => {
      const keypointA = keypoints.find(kp => kp.part === partA);
      const keypointB = keypoints.find(kp => kp.part === partB);
      
      if (keypointA && keypointB &&
          keypointA.score >= confidenceThreshold &&
          keypointB.score >= confidenceThreshold) {
        ctx.beginPath();
        ctx.moveTo(keypointA.position.x, keypointA.position.y);
        ctx.lineTo(keypointB.position.x, keypointB.position.y);
        ctx.stroke();
      }
    });
  }
  
  // Display overall pose confidence
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.font = '16px Arial';
  ctx.fillText(`Confidence: ${Math.round(score * 100)}%`, 10, 20);
  ctx.strokeText(`Confidence: ${Math.round(score * 100)}%`, 10, 20);
}

// Handle image load errors
function handleImageError() {
  updateStatus('Error loading camera feed. Check if the Raspberry Pi is accessible.', true);
  
  // Try to reload the image with a new timestamp to avoid caching
  setTimeout(() => {
    videoElement.src = '/video_feed?' + new Date().getTime();
  }, 5000); // Retry after 5 seconds
}

// Set up event listeners
function setupEventListeners() {
  // Image load event
  videoElement.onload = () => {
    updateStatus('Camera connected successfully');
    setupCanvas();
  };
  
  // Image error event
  videoElement.onerror = handleImageError;
  
  // Button events
  startButton.addEventListener('click', startPoseDetection);
  stopButton.addEventListener('click', stopPoseDetection);
  toggleSkeletonButton.addEventListener('click', toggleSkeleton);
}

// Initialize the application
async function initialize() {
  // Set up event listeners
  setupEventListeners();
  
  // Load PoseNet model
  await loadPoseNet();
}

// Start initialization when page is loaded
window.addEventListener('DOMContentLoaded', initialize);