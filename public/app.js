// State management
const state = {
  net: null,
  isRunning: false,
  showSkeleton: true,
  frameCount: 0,        // Track frame count
  processEveryNFrames: 3, // Process every N frames (adjust as needed)
  lastKeypoints: null,   // Store last detected keypoints
  lastImageData: null    // Store last image data for snapshot
};

// DOM elements
const videoElement = document.getElementById('videoElement');
const canvas = document.getElementById('canvas');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const toggleSkeletonButton = document.getElementById('toggleSkeletonButton');
const snapshotButton = document.getElementById('snapshotButton') || document.createElement('button');
const statusMessage = document.getElementById('statusMessage');
const fpsCounter = document.getElementById('fpsCounter') || document.createElement('div'); // Optional FPS counter

// FPS calculation variables
let frameTimestamps = [];
let lastCalculatedFps = 0;
let lastProcessedFrameTime = 0;

// Initialize canvas to match video dimensions
function setupCanvas() {
  canvas.width = videoElement.width;
  canvas.height = videoElement.height;
  
  // Add FPS counter if it doesn't exist
  if (!document.getElementById('fpsCounter')) {
    fpsCounter.id = 'fpsCounter';
    fpsCounter.className = 'status fps';
    fpsCounter.style.position = 'absolute';
    fpsCounter.style.top = '10px';
    fpsCounter.style.right = '10px';
    fpsCounter.style.background = 'rgba(0,0,0,0.5)';
    fpsCounter.style.color = 'white';
    fpsCounter.style.padding = '5px';
    fpsCounter.style.borderRadius = '3px';
    document.body.appendChild(fpsCounter);
  }
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
  state.frameCount = 0;
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

// Calculate and update FPS
function updateFps() {
  const now = performance.now();
  
  // Add current timestamp
  frameTimestamps.push(now);
  
  // Remove timestamps older than 1 second
  while (frameTimestamps.length > 0 && frameTimestamps[0] < now - 1000) {
    frameTimestamps.shift();
  }
  
  // Calculate FPS every 500ms to avoid too frequent updates
  if (now - lastCalculatedFps > 500) {
    const fps = Math.round(frameTimestamps.length);
    fpsCounter.textContent = `${fps} FPS (Processed: ${Math.round(fps/state.processEveryNFrames)})`;
    lastCalculatedFps = now;
  }
}

// Detect pose in real-time with frame skipping
async function detectPoseInRealTime() {
  if (!state.isRunning) return;

  const ctx = canvas.getContext('2d');
  
  // Always draw the video frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  
  // Store the current frame's image data for snapshots
  state.lastImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Update frame counter
  state.frameCount++;
  
  // Update FPS counter
  updateFps();

  // Process every Nth frame
  if (state.frameCount % state.processEveryNFrames === 0) {
    const now = performance.now();
    const timeSinceLastProcess = now - lastProcessedFrameTime;
    lastProcessedFrameTime = now;
    
    // Skip this frame if we're processing frames too quickly
    // This adds another layer of throttling if needed
    if (timeSinceLastProcess < 16.67) { // < 60 FPS
      requestAnimationFrame(detectPoseInRealTime);
      return;
    }
    
    tf.engine().startScope(); // Use scoping to help with memory management
    try {
      // Preprocess the image
      const inputTensor = tf.browser.fromPixels(canvas)
        .resizeBilinear([192, 192])
        .expandDims(0)
        .toInt(); // Convert to int32

      // Run the model
      const result = await state.net.executeAsync(inputTensor);
      state.lastKeypoints = result.arraySync()[0][0];
    } catch (error) {
      console.error('Error during pose detection:', error);
    } finally {
      tf.engine().endScope(); // Dispose of all tensors created in this scope
    }
  }

  // Draw the latest pose (even on frames we don't process)
  if (state.lastKeypoints) {
    drawPose(state.lastKeypoints, ctx);
  }
  
  requestAnimationFrame(detectPoseInRealTime);
}

// Draw the detected pose
function drawPose(keypoints, ctx) {
  if (!keypoints || !state.showSkeleton) return;

  ctx.fillStyle = 'red';
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;

  // Define keypoint names for reference
  const keypointNames = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
  ];

  keypoints.forEach((keypoint, i) => {
    const [y, x, score] = keypoint;
    if (score > 0.3) {
      const pixelX = x * canvas.width;
      const pixelY = y * canvas.height;
      
      // Draw keypoint
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Optionally draw keypoint names
      if (state.showLabels) {
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(keypointNames[i], pixelX + 10, pixelY);
        ctx.fillStyle = 'red'; // Reset for the next point
      }
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
    if (score1 > 0.2 && score2 > 0.2) {
      ctx.beginPath();
      ctx.moveTo(x1 * canvas.width, y1 * canvas.height);
      ctx.lineTo(x2 * canvas.width, y2 * canvas.height);
      ctx.stroke();
    }
  });
}

// Configuration slider for frame processing rate
function addConfigControls() {
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'config-controls';
  controlsDiv.style.margin = '10px 0';
  
  const label = document.createElement('label');
  label.textContent = 'Process every N frames: ';
  label.style.marginRight = '10px';
  
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '1';
  slider.max = '10';
  slider.value = state.processEveryNFrames;
  slider.style.verticalAlign = 'middle';
  
  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = state.processEveryNFrames;
  valueDisplay.style.marginLeft = '10px';
  
  slider.addEventListener('input', () => {
    state.processEveryNFrames = parseInt(slider.value);
    valueDisplay.textContent = state.processEveryNFrames;
  });
  
  controlsDiv.appendChild(label);
  controlsDiv.appendChild(slider);
  controlsDiv.appendChild(valueDisplay);
  
  // Insert after the existing controls
  const buttonsContainer = startButton.parentNode;
  buttonsContainer.parentNode.insertBefore(controlsDiv, buttonsContainer.nextSibling);
}

// Initialize the application
async function initialize() {
  setupCanvas();
  addConfigControls();
  await loadMoveNet();
}

// Function to take and save a snapshot
function takeSnapshot() {
  if (!state.lastKeypoints) {
    updateStatus('No pose detected yet. Cannot save snapshot.', true);
    return;
  }
  
  try {
    // Define keypoint names
    const keypointNames = [
      "nose", "left_eye", "right_eye", "left_ear", "right_ear",
      "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
      "left_wrist", "right_wrist", "left_hip", "right_hip",
      "left_knee", "right_knee", "left_ankle", "right_ankle"
    ];
    
    // Create a structured object with named keypoints
    const poseData = {
      timestamp: new Date().toISOString(),
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      keypoints: state.lastKeypoints.map((keypoint, i) => {
        const [y, x, score] = keypoint;
        return {
          name: keypointNames[i],
          position: {
            x: Math.round(x * canvas.width),
            y: Math.round(y * canvas.height)
          },
          score: score,
          // Add normalized coordinates (0-1 range)
          normalized: {
            x: x,
            y: y
          }
        };
      })
    };
    
    // Convert to JSON string
    const jsonData = JSON.stringify(poseData, null, 2);
    
    // Create a blob for downloading
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a download link
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `pose-snapshot-${new Date().getTime()}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // Optionally also save the image if canvas is accessible
    if (state.lastImageData) {
      const snapshotCanvas = document.createElement('canvas');
      snapshotCanvas.width = canvas.width;
      snapshotCanvas.height = canvas.height;
      const ctx = snapshotCanvas.getContext('2d');
      
      // Draw the image data
      ctx.putImageData(state.lastImageData, 0, 0);
      
      // Draw the keypoints and skeleton for reference
      drawPose(state.lastKeypoints, ctx);
      
      // Create download for the image
      snapshotCanvas.toBlob((blob) => {
        const imgUrl = URL.createObjectURL(blob);
        const imgLink = document.createElement('a');
        imgLink.href = imgUrl;
        imgLink.download = `pose-snapshot-${new Date().getTime()}.png`;
        document.body.appendChild(imgLink);
        imgLink.click();
        document.body.removeChild(imgLink);
      });
    }
    
    updateStatus('Snapshot saved successfully!');
  } catch (error) {
    console.error('Error saving snapshot:', error);
    updateStatus('Failed to save snapshot: ' + error.message, true);
  }
}

// Add snapshot button if it doesn't exist
function setupSnapshotButton() {
  if (!document.getElementById('snapshotButton')) {
    snapshotButton.id = 'snapshotButton';
    snapshotButton.textContent = 'Take Snapshot';
    snapshotButton.className = 'button';
    snapshotButton.style.backgroundColor = '#4CAF50';
    snapshotButton.style.marginLeft = '10px';
    
    // Add it after the existing buttons
    const buttonsContainer = startButton.parentNode;
    buttonsContainer.appendChild(snapshotButton);
  }
  
  snapshotButton.addEventListener('click', takeSnapshot);
}

// Toggle keypoint labels
function toggleLabels() {
  state.showLabels = !state.showLabels;
  
  const labelButton = document.getElementById('toggleLabelsButton');
  if (labelButton) {
    labelButton.textContent = state.showLabels ? 'Hide Labels' : 'Show Labels';
  }
}

// Add label toggle button
function setupLabelToggleButton() {
  if (!document.getElementById('toggleLabelsButton')) {
    const labelButton = document.createElement('button');
    labelButton.id = 'toggleLabelsButton';
    labelButton.textContent = 'Show Labels';
    labelButton.className = 'button';
    labelButton.style.marginLeft = '10px';
    
    const buttonsContainer = startButton.parentNode;
    buttonsContainer.appendChild(labelButton);
    
    labelButton.addEventListener('click', toggleLabels);
  }
}

// Update initialize function to include new UI elements
function initialize() {
  setupCanvas();
  addConfigControls();
  setupSnapshotButton();
  setupLabelToggleButton();
  loadMoveNet();
  
  // Initialize state
  state.showLabels = false;
}

window.addEventListener('DOMContentLoaded', initialize);

// Set up event listeners
startButton.addEventListener('click', startPoseDetection);
stopButton.addEventListener('click', stopPoseDetection);
toggleSkeletonButton.addEventListener('click', toggleSkeleton);