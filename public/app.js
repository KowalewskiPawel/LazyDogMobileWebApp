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

// Load MoveNet model
async function loadMoveNet() {
  try {
    updateStatus('Loading MoveNet model...');
    state.net = await tf.loadGraphModel('https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4', {fromTFHub: true});
    updateStatus('MoveNet model loaded successfully', false);
    startButton.disabled = false;
  } catch (error) {
    console.error('Error loading MoveNet model:', error);
    updateStatus('Failed to load MoveNet model: ' + error.message, true);
  }
}

// Start pose detection
function startPoseDetection() {
  if (!state.net) {
    updateStatus('MoveNet model not loaded yet', true);
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  // Preprocess the image
  const inputTensor = tf.browser.fromPixels(canvas)
    .resizeBilinear([192, 192])
    .expandDims(0)
    .toInt(); // Convert to int32

  // Run the model
  const result = await state.net.executeAsync(inputTensor);
  const keypoints = result.arraySync()[0][0];
  inputTensor.dispose();

  drawPose(keypoints, ctx);
  requestAnimationFrame(detectPoseInRealTime);
}

// Draw the detected pose
function drawPose(keypoints, ctx) {
  if (!keypoints || !state.showSkeleton) return;

  ctx.fillStyle = 'red';
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;

  keypoints.forEach(keypoint => {
    const [y, x, score] = keypoint;
    if (score > 0.3) {
      ctx.beginPath();
      ctx.arc(x * canvas.width, y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  });

  // Draw skeleton connections
  const adjacentKeyPoints = [
    [0, 1], [1, 3], [3, 5], [0, 2], [2, 4], [4, 6],
    [5, 7], [7, 9], [6, 8], [8, 10], [5, 6],
    [5, 11], [6, 12], [11, 12], [11, 13], [13, 15],
    [12, 14], [14, 16]
  ];

  adjacentKeyPoints.forEach(([i, j]) => {
    const [y1, x1, score1] = keypoints[i];
    const [y2, x2, score2] = keypoints[j];
    if (score1 > 0.3 && score2 > 0.3) {
      ctx.beginPath();
      ctx.moveTo(x1 * canvas.width, y1 * canvas.height);
      ctx.lineTo(x2 * canvas.width, y2 * canvas.height);
      ctx.stroke();
    }
  });
}

// Initialize the application
async function initialize() {
  setupCanvas();
  await loadMoveNet();
}

window.addEventListener('DOMContentLoaded', initialize);

// Set up event listeners
startButton.addEventListener('click', startPoseDetection);
stopButton.addEventListener('click', stopPoseDetection);
toggleSkeletonButton.addEventListener('click', toggleSkeleton);
