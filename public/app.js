// State management
const state = {
  net: null,
  isRunning: false,
  showSkeleton: true,
  frameCount: 0,
  processEveryNFrames: 3,
  lastKeypoints: null,
  lastImageData: null,
  selectedExercise: 'plank', // Default exercise
  viewAngle: 'side', // 'side' or 'front'
  poseCorrectness: {
    isCorrect: false,
    feedback: [],
    incorrectParts: []
  },
  // Temporal smoothing for error detection
  errorPersistence: {
    duration: 2000, // milliseconds to persist error before showing
    errors: {}, // Map of bodyPart -> {startTime, count, active}
    activeFeedback: [], // Currently displayed feedback messages
    lastUpdateTime: 0
  }
};

// DOM elements
const videoElement = document.getElementById('videoElement');
const canvas = document.getElementById('canvas');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const toggleSkeletonButton = document.getElementById('toggleSkeletonButton');
const snapshotButton = document.getElementById('snapshotButton') || document.createElement('button');
const statusMessage = document.getElementById('statusMessage');
const fpsCounter = document.getElementById('fpsCounter') || document.createElement('div');
const feedbackElement = document.createElement('div');

// FPS calculation variables
let frameTimestamps = [];
let lastCalculatedFps = 0;
let lastProcessedFrameTime = 0;

// Reference poses for validation
const poseReferences = {
  plank: {
    front: {
      // Keypoint relationships for plank pose from front view
      alignment: [
        { parts: ['left_shoulder', 'left_hip', 'left_ankle'], tolerance: 0.1 },
        { parts: ['right_shoulder', 'right_hip', 'right_ankle'], tolerance: 0.1 }
      ],
      angles: [
        { joint: 'left_shoulder', limbs: ['left_elbow', 'left_hip'], target: 90, tolerance: 15 },
        { joint: 'right_shoulder', limbs: ['right_elbow', 'right_hip'], target: 90, tolerance: 15 },
        { joint: 'left_elbow', limbs: ['left_shoulder', 'left_wrist'], target: 180, tolerance: 20 },
        { joint: 'right_elbow', limbs: ['right_shoulder', 'right_wrist'], target: 180, tolerance: 20 }
      ]
    },
    side: {
      // Keypoint relationships for plank pose from side view - calibrated with user provided reference
      alignment: [
        { parts: ['right_shoulder', 'right_hip', 'right_ankle'], tolerance: 0.25 }, // Increased tolerance significantly
        { parts: ['left_shoulder', 'left_hip', 'left_ankle'], tolerance: 0.25 }  // Increased tolerance significantly
      ],
      angles: [
        { joint: 'right_shoulder', limbs: ['right_elbow', 'right_hip'], target: 85, tolerance: 30 }, // Adjusted target and increased tolerance
        { joint: 'left_shoulder', limbs: ['left_elbow', 'left_hip'], target: 85, tolerance: 30 }, // Adjusted target and increased tolerance
        { joint: 'right_elbow', limbs: ['right_shoulder', 'right_wrist'], target: 160, tolerance: 35 }, // Adjusted target and tolerance
        { joint: 'left_elbow', limbs: ['left_shoulder', 'left_wrist'], target: 160, tolerance: 35 }, // Adjusted target and tolerance
        { joint: 'right_hip', limbs: ['right_shoulder', 'right_knee'], target: 165, tolerance: 30 }, // Adjusted target and increased tolerance
        { joint: 'right_knee', limbs: ['right_hip', 'right_ankle'], target: 170, tolerance: 30 } // Adjusted target and increased tolerance
      ]
    }
  },
  chaturanga: {
    front: {
      // Keypoint relationships for chaturanga pose from front view
      alignment: [
        { parts: ['left_shoulder', 'left_hip', 'left_ankle'], tolerance: 0.12 },
        { parts: ['right_shoulder', 'right_hip', 'right_ankle'], tolerance: 0.12 }
      ],
      angles: [
        { joint: 'left_shoulder', limbs: ['left_elbow', 'left_hip'], target: 90, tolerance: 15 },
        { joint: 'right_shoulder', limbs: ['right_elbow', 'right_hip'], target: 90, tolerance: 15 },
        { joint: 'left_elbow', limbs: ['left_shoulder', 'left_wrist'], target: 90, tolerance: 20 },
        { joint: 'right_elbow', limbs: ['right_shoulder', 'right_wrist'], target: 90, tolerance: 20 }
      ]
    },
    side: {
      // Keypoint relationships for chaturanga pose from side view
      alignment: [
        { parts: ['right_shoulder', 'right_hip', 'right_ankle'], tolerance: 0.12 },
        { parts: ['left_shoulder', 'left_hip', 'left_ankle'], tolerance: 0.12 }
      ],
      angles: [
        { joint: 'right_shoulder', limbs: ['right_elbow', 'right_hip'], target: 90, tolerance: 15 },
        { joint: 'left_shoulder', limbs: ['left_elbow', 'left_hip'], target: 90, tolerance: 15 },
        { joint: 'right_elbow', limbs: ['right_shoulder', 'right_wrist'], target: 90, tolerance: 20 },
        { joint: 'left_elbow', limbs: ['left_shoulder', 'left_wrist'], target: 90, tolerance: 20 },
        { joint: 'right_hip', limbs: ['right_shoulder', 'right_knee'], target: 180, tolerance: 20 },
        { joint: 'right_knee', limbs: ['right_hip', 'right_ankle'], target: 180, tolerance: 15 }
      ]
    }
  }
};

// Feedback messages for pose corrections
const correctionMessages = {
  plank: {
    'left_shoulder': 'Align your left shoulder directly above your elbow',
    'right_shoulder': 'Align your right shoulder directly above your elbow',
    'left_elbow': 'Straighten your left arm',
    'right_elbow': 'Straighten your right arm',
    'left_hip': 'Lift your hips to create a straight line from head to heels',
    'right_hip': 'Lift your hips to create a straight line from head to heels',
    'left_knee': 'Straighten your left leg',
    'right_knee': 'Straighten your right leg',
    'general': 'Engage your core and maintain a straight line from head to heels'
  },
  chaturanga: {
    'left_shoulder': 'Lower your shoulders to elbow height',
    'right_shoulder': 'Lower your shoulders to elbow height',
    'left_elbow': 'Bend your left elbow to 90 degrees',
    'right_elbow': 'Bend your right elbow to 90 degrees',
    'left_hip': 'Maintain a straight line from head to heels',
    'right_hip': 'Maintain a straight line from head to heels',
    'left_knee': 'Keep your left leg straight',
    'right_knee': 'Keep your right leg straight',
    'general': 'Lower your body to hover above the ground with elbows at 90 degrees'
  }
};

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
  
  // Add feedback element
  feedbackElement.id = 'poseCorrections';
  feedbackElement.className = 'feedback-panel';
  feedbackElement.style.position = 'absolute';
  feedbackElement.style.left = '10px';
  feedbackElement.style.bottom = '10px';
  feedbackElement.style.width = '300px';
  feedbackElement.style.background = 'rgba(0,0,0,0.7)';
  feedbackElement.style.color = 'white';
  feedbackElement.style.padding = '10px';
  feedbackElement.style.borderRadius = '5px';
  feedbackElement.style.maxHeight = '200px';
  feedbackElement.style.overflowY = 'auto';
  document.body.appendChild(feedbackElement);
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
  updateStatus(`Pose detection running for ${state.selectedExercise}...`);
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
      
      // Validate pose
      if (state.lastKeypoints) {
        validatePose(state.lastKeypoints);
      }
    } catch (error) {
      console.error('Error during pose detection:', error);
    } finally {
      tf.engine().endScope(); // Dispose of all tensors created in this scope
    }
  }

  // Draw the latest pose (even on frames we don't process)
  if (state.lastKeypoints) {
    drawPose(state.lastKeypoints, ctx);
    updateFeedback();
  }
  
  requestAnimationFrame(detectPoseInRealTime);
}

// Draw the detected pose
function drawPose(keypoints, ctx) {
  if (!keypoints || !state.showSkeleton) return;

  // Define keypoint names for reference
  const keypointNames = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
  ];

  // Create a map of keypoint names to their data for easier reference
  const keypointsMap = {};
  keypoints.forEach((keypoint, i) => {
    keypointsMap[keypointNames[i]] = {
      y: keypoint[0],
      x: keypoint[1],
      score: keypoint[2],
      index: i
    };
  });

  // Draw keypoints
  keypoints.forEach((keypoint, i) => {
    const [y, x, score] = keypoint;
    const name = keypointNames[i];
    if (score > 0.3) {
      const pixelX = x * canvas.width;
      const pixelY = y * canvas.height;
      
      // Check if this part is incorrect and should be highlighted
      const isIncorrect = state.poseCorrectness.incorrectParts.includes(name);
      
      // Set color based on correctness
      ctx.fillStyle = isIncorrect ? 'red' : 'lime';
      
      // Draw keypoint
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Optionally draw keypoint names
      if (state.showLabels) {
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(name, pixelX + 10, pixelY);
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
    const name1 = keypointNames[i];
    const name2 = keypointNames[j];
    
    if (score1 > 0.2 && score2 > 0.2) {
      // Check if either endpoint is incorrect
      const isIncorrect = state.poseCorrectness.incorrectParts.includes(name1) || 
                         state.poseCorrectness.incorrectParts.includes(name2);
      
      // Set color based on correctness
      ctx.strokeStyle = isIncorrect ? 'red' : 'lime';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.moveTo(x1 * canvas.width, y1 * canvas.height);
      ctx.lineTo(x2 * canvas.width, y2 * canvas.height);
      ctx.stroke();
    }
  });
  
  // Draw exercise name and viewing angle
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`Exercise: ${state.selectedExercise.toUpperCase()} (${state.viewAngle} view)`, 10, 30);
  
  // Draw overall pose status
  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = state.poseCorrectness.isCorrect ? 'lime' : 'red';
  ctx.fillText(state.poseCorrectness.isCorrect ? 'CORRECT POSE ✓' : 'INCORRECT POSE ✗', 10, 60);
}

// Calculate angle between three points (in degrees)
function calculateAngle(pointA, pointB, pointC) {
  // Vector BA
  const BA = {
    x: pointA.x - pointB.x,
    y: pointA.y - pointB.y
  };
  
  // Vector BC
  const BC = {
    x: pointC.x - pointB.x,
    y: pointC.y - pointB.y
  };
  
  // Dot product
  const dotProduct = BA.x * BC.x + BA.y * BC.y;
  
  // Magnitudes
  const magBA = Math.sqrt(BA.x * BA.x + BA.y * BA.y);
  const magBC = Math.sqrt(BC.x * BC.x + BC.y * BC.y);
  
  // Angle in radians
  const angleRad = Math.acos(dotProduct / (magBA * magBC));
  
  // Convert to degrees
  return angleRad * (180 / Math.PI);
}

// Check if points are in a straight line (alignment)
function checkAlignment(points, tolerance) {
  if (points.length < 3) return true; // Need at least 3 points
  
  // For plank side view, use a more sophisticated alignment check that's less sensitive
  // to small variations
  if (state.selectedExercise === 'plank' && state.viewAngle === 'side') {
    return checkAlignmentForPlankSideView(points, tolerance);
  }
  
  // Calculate slopes between consecutive points
  const slopes = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i+1].x - points[i].x;
    // Avoid division by zero
    if (Math.abs(dx) < 0.001) {
      slopes.push(999999); // Vertical line
    } else {
      slopes.push((points[i+1].y - points[i].y) / dx);
    }
  }
  
  // Check if all slopes are approximately equal
  const firstSlope = slopes[0];
  for (let i = 1; i < slopes.length; i++) {
    if (Math.abs(slopes[i] - firstSlope) > tolerance) {
      return false;
    }
  }
  
  return true;
}

// Special alignment check for plank side view which is more tolerant of small deviations
function checkAlignmentForPlankSideView(points, tolerance) {
  // Use linear regression to find best fit line
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = points.length;
  
  // Calculate sums for linear regression
  for (let i = 0; i < n; i++) {
    sumX += points[i].x;
    sumY += points[i].y;
    sumXY += points[i].x * points[i].y;
    sumX2 += points[i].x * points[i].x;
  }
  
  // Calculate slope and y-intercept of best-fit line (y = mx + b)
  const avgX = sumX / n;
  const avgY = sumY / n;
  
  // Check if points are approximately vertical
  if (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)) < 0.1) {
    // For vertical lines, check if x values are close enough
    const avgX = sumX / n;
    return points.every(p => Math.abs(p.x - avgX) < tolerance);
  }
  
  // Otherwise calculate linear regression
  const slope = (sumXY - sumX * avgY) / (sumX2 - sumX * avgX);
  const intercept = avgY - slope * avgX;
  
  // Calculate how well points fit this line
  let deviationSum = 0;
  for (let i = 0; i < n; i++) {
    const expectedY = slope * points[i].x + intercept;
    const deviation = Math.abs(points[i].y - expectedY);
    deviationSum += deviation;
  }
  
  // Calculate average deviation and check if it's within tolerance
  // Allow for a slight upward curve in the body line which is common in proper planks
  const avgDeviation = deviationSum / n;
  
  // If the regression line is somewhat diagonal (as expected in side plank)
  // we can be more forgiving with the alignment
  const isDiagonal = Math.abs(slope) > 0.2 && Math.abs(slope) < 2.0;
  const adjustedTolerance = isDiagonal ? tolerance * 1.5 : tolerance;
  
  return avgDeviation <= adjustedTolerance;
}

// Extract keypoints in usable format
function extractKeypoints(rawKeypoints) {
  const keypointNames = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
  ];
  
  const keypoints = {};
  
  rawKeypoints.forEach((keypoint, index) => {
    const [y, x, score] = keypoint;
    keypoints[keypointNames[index]] = {
      x: x,
      y: y,
      score: score
    };
  });
  
  return keypoints;
}

// Validate pose against reference with temporal smoothing
function validatePose(rawKeypoints) {
  const keypoints = extractKeypoints(rawKeypoints);
  const exercise = state.selectedExercise;
  const viewAngle = state.viewAngle;
  
  const reference = poseReferences[exercise][viewAngle];
  const detectedErrors = { // Current frame errors
    incorrectParts: [],
    feedback: [],
    isCorrect: true
  };
  
  // Minimum confidence threshold for keypoints
  const confidenceThreshold = 0.3;
  
  // Check alignments
  reference.alignment.forEach(alignCheck => {
    const points = [];
    let allPointsDetected = true;
    
    // Extract points for alignment check
    alignCheck.parts.forEach(part => {
      if (keypoints[part] && keypoints[part].score > confidenceThreshold) {
        points.push(keypoints[part]);
      } else {
        allPointsDetected = false;
      }
    });
    
    // Only check alignment if all required points are detected
    // and there are enough points (at least 3) for a meaningful alignment check
    if (allPointsDetected && points.length >= 3) {
      const isAligned = checkAlignment(points, alignCheck.tolerance);
      
      // Special relaxed check for plank side view since camera angle can affect alignment
      const isPlankSideView = exercise === 'plank' && viewAngle === 'side';
      const shouldMarkError = !isAligned && (!isPlankSideView || 
                              // For plank side view, only report severe misalignments
                              (isPlankSideView && !checkAlignment(points, alignCheck.tolerance * 1.5)));
      
      if (shouldMarkError) {
        detectedErrors.isCorrect = false;
        alignCheck.parts.forEach(part => {
          if (!detectedErrors.incorrectParts.includes(part)) {
            detectedErrors.incorrectParts.push(part);
          }
        });
        
        // Add general alignment feedback
        const generalMessage = correctionMessages[exercise].general;
        if (!detectedErrors.feedback.includes(generalMessage)) {
          detectedErrors.feedback.push(generalMessage);
        }
      }
    }
  });
  
  // Check angles
  reference.angles.forEach(angleCheck => {
    const { joint, limbs, target, tolerance } = angleCheck;
    
    // Make sure all required keypoints are detected with sufficient confidence
    if (keypoints[joint] && keypoints[joint].score > confidenceThreshold &&
        keypoints[limbs[0]] && keypoints[limbs[0]].score > confidenceThreshold &&
        keypoints[limbs[1]] && keypoints[limbs[1]].score > confidenceThreshold) {
        
      const angle = calculateAngle(keypoints[limbs[0]], keypoints[joint], keypoints[limbs[1]]);
      const angleError = Math.abs(angle - target);
      
      if (angleError > tolerance) {
        detectedErrors.isCorrect = false;
        
        if (!detectedErrors.incorrectParts.includes(joint)) {
          detectedErrors.incorrectParts.push(joint);
        }
        
        // Add specific joint feedback
        if (correctionMessages[exercise][joint] && 
            !detectedErrors.feedback.includes(correctionMessages[exercise][joint])) {
          detectedErrors.feedback.push(correctionMessages[exercise][joint]);
        }
      }
    }
  });
  
  // Process temporal smoothing of errors
  processErrorsOverTime(detectedErrors);
}

// Process errors over time to reduce noise
function processErrorsOverTime(currentDetectedErrors) {
  const now = performance.now();
  const { errors } = state.errorPersistence;
  const persistenceDuration = state.errorPersistence.duration;
  
  // Reset parts that are no longer detected as incorrect
  Object.keys(errors).forEach(part => {
    if (!currentDetectedErrors.incorrectParts.includes(part)) {
      delete errors[part];
    }
  });
  
  // Update or add parts that are currently detected as incorrect
  currentDetectedErrors.incorrectParts.forEach(part => {
    if (!errors[part]) {
      // Initialize new error tracking
      errors[part] = {
        startTime: now,
        count: 1,
        active: false
      };
    } else {
      // Update existing error tracking
      errors[part].count++;
      
      // Mark as active if it has persisted for the required duration
      if (!errors[part].active && now - errors[part].startTime >= persistenceDuration) {
        errors[part].active = true;
      }
    }
  });
  
  // Build active incorrect parts list and feedback
  const activeIncorrectParts = [];
  const activeFeedback = [];
  
  Object.keys(errors).forEach(part => {
    if (errors[part].active) {
      activeIncorrectParts.push(part);
      
      // Add corresponding feedback message if available
      const exercise = state.selectedExercise;
      if (correctionMessages[exercise][part] && 
          !activeFeedback.includes(correctionMessages[exercise][part])) {
        activeFeedback.push(correctionMessages[exercise][part]);
      }
    }
  });
  
  // Add general feedback if there are active errors
  if (activeIncorrectParts.length > 0 && 
      !activeFeedback.includes(correctionMessages[state.selectedExercise].general)) {
    activeFeedback.push(correctionMessages[state.selectedExercise].general);
  }
  
  // Update state with persistent pose correctness
  state.poseCorrectness = {
    isCorrect: activeIncorrectParts.length === 0,
    incorrectParts: activeIncorrectParts,
    feedback: activeFeedback
  };
  
  // Store active feedback for reference
  state.errorPersistence.activeFeedback = activeFeedback;
  state.errorPersistence.lastUpdateTime = now;
}

// Update feedback element with pose corrections
function updateFeedback() {
  // Clear previous feedback
  feedbackElement.innerHTML = '';
  
  if (state.poseCorrectness.feedback.length > 0) {
    // Create title
    const title = document.createElement('h3');
    title.style.margin = '0 0 10px 0';
    title.style.color = 'red';
    title.textContent = 'Pose Corrections:';
    feedbackElement.appendChild(title);
    
    // Create list of corrections
    const list = document.createElement('ul');
    list.style.margin = '0';
    list.style.paddingLeft = '20px';
    
    state.poseCorrectness.feedback.forEach(message => {
      if (!message) return;
      
      const item = document.createElement('li');
      item.textContent = message;
      item.style.marginBottom = '5px';
      list.appendChild(item);
    });
    
    feedbackElement.appendChild(list);
  } else if (state.poseCorrectness.isCorrect) {
    // Show positive feedback
    const perfectMessage = document.createElement('p');
    perfectMessage.style.color = 'lime';
    perfectMessage.style.fontWeight = 'bold';
    perfectMessage.style.margin = '0';
    perfectMessage.textContent = '✓ Perfect! Maintain this pose.';
    feedbackElement.appendChild(perfectMessage);
  }
}

// Configuration slider for frame processing rate
function addConfigControls() {
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'config-controls';
  controlsDiv.style.margin = '10px 0';
  
  // Frame rate control
  const frameRateLabel = document.createElement('label');
  frameRateLabel.textContent = 'Process every N frames: ';
  frameRateLabel.style.marginRight = '10px';
  
  const frameRateSlider = document.createElement('input');
  frameRateSlider.type = 'range';
  frameRateSlider.min = '1';
  frameRateSlider.max = '10';
  frameRateSlider.value = state.processEveryNFrames;
  frameRateSlider.style.verticalAlign = 'middle';
  
  const frameRateDisplay = document.createElement('span');
  frameRateDisplay.textContent = state.processEveryNFrames;
  frameRateDisplay.style.marginLeft = '10px';
  frameRateDisplay.style.marginRight = '20px';
  
  frameRateSlider.addEventListener('input', () => {
    state.processEveryNFrames = parseInt(frameRateSlider.value);
    frameRateDisplay.textContent = state.processEveryNFrames;
  });
  
  controlsDiv.appendChild(frameRateLabel);
  controlsDiv.appendChild(frameRateSlider);
  controlsDiv.appendChild(frameRateDisplay);
  
  // Error persistence duration control
  const errorPersistenceLabel = document.createElement('label');
  errorPersistenceLabel.textContent = 'Error persistence (seconds): ';
  errorPersistenceLabel.style.marginRight = '10px';
  
  const errorPersistenceSlider = document.createElement('input');
  errorPersistenceSlider.type = 'range';
  errorPersistenceSlider.min = '1';
  errorPersistenceSlider.max = '5';
  errorPersistenceSlider.step = '0.5';
  errorPersistenceSlider.value = state.errorPersistence.duration / 1000; // Convert ms to seconds
  errorPersistenceSlider.style.verticalAlign = 'middle';
  
  const errorPersistenceDisplay = document.createElement('span');
  errorPersistenceDisplay.textContent = state.errorPersistence.duration / 1000;
  errorPersistenceDisplay.style.marginLeft = '10px';
  errorPersistenceDisplay.style.marginRight = '20px';
  
  errorPersistenceSlider.addEventListener('input', () => {
    const seconds = parseFloat(errorPersistenceSlider.value);
    state.errorPersistence.duration = seconds * 1000; // Convert to ms
    errorPersistenceDisplay.textContent = seconds;
    
    // Reset all currently tracked errors when changing the persistence time
    state.errorPersistence.errors = {};
  });
  
  controlsDiv.appendChild(document.createElement('br'));
  controlsDiv.appendChild(errorPersistenceLabel);
  controlsDiv.appendChild(errorPersistenceSlider);
  controlsDiv.appendChild(errorPersistenceDisplay);
  
  // Exercise selection
  const exerciseLabel = document.createElement('label');
  exerciseLabel.textContent = 'Exercise: ';
  exerciseLabel.style.marginRight = '10px';
  
  const exerciseSelect = document.createElement('select');
  exerciseSelect.style.padding = '5px';
  exerciseSelect.style.marginRight = '20px';
  
  const plankOption = document.createElement('option');
  plankOption.value = 'plank';
  plankOption.textContent = 'Plank';
  
  const chaturangaOption = document.createElement('option');
  chaturangaOption.value = 'chaturanga';
  chaturangaOption.textContent = 'Chaturanga';
  
  exerciseSelect.appendChild(plankOption);
  exerciseSelect.appendChild(chaturangaOption);
  exerciseSelect.value = state.selectedExercise;
  
  exerciseSelect.addEventListener('change', () => {
    state.selectedExercise = exerciseSelect.value;
    updateStatus(`Selected exercise: ${state.selectedExercise.toUpperCase()}`);
  });
  
  controlsDiv.appendChild(exerciseLabel);
  controlsDiv.appendChild(exerciseSelect);
  
  // View angle selection
  const viewLabel = document.createElement('label');
  viewLabel.textContent = 'View: ';
  viewLabel.style.marginRight = '10px';
  
  const viewSelect = document.createElement('select');
  viewSelect.style.padding = '5px';
  
  const sideOption = document.createElement('option');
  sideOption.value = 'side';
  sideOption.textContent = 'Side View';
  
  const frontOption = document.createElement('option');
  frontOption.value = 'front';
  frontOption.textContent = 'Front View';
  
  viewSelect.appendChild(sideOption);
  viewSelect.appendChild(frontOption);
  viewSelect.value = state.viewAngle;
  
  viewSelect.addEventListener('change', () => {
    state.viewAngle = viewSelect.value;
    updateStatus(`Selected view: ${state.viewAngle}`);
  });
  
  controlsDiv.appendChild(viewLabel);
  controlsDiv.appendChild(viewSelect);
  
  // Insert after the existing controls
  const buttonsContainer = startButton.parentNode;
  buttonsContainer.parentNode.insertBefore(controlsDiv, buttonsContainer.nextSibling);
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
      exercise: state.selectedExercise,
      viewAngle: state.viewAngle,
      isCorrect: state.poseCorrectness.isCorrect,
      keypoints: state.lastKeypoints.map((keypoint, i) => {
        const [y, x, score] = keypoint;
        return {
          name: keypointNames[i],
          position: {
            x: Math.round(x * canvas.width),
            y: Math.round(y * canvas.height)
          },
          score: score,
          normalized: {
            x: x,
            y: y
          },
          isCorrect: !state.poseCorrectness.incorrectParts.includes(keypointNames[i])
        };
      }),
      feedback: state.poseCorrectness.feedback
    };
    
    // Convert to JSON string
    const jsonData = JSON.stringify(poseData, null, 2);
    
    // Create a blob for downloading
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a download link
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `${state.selectedExercise}-${state.viewAngle}-${state.poseCorrectness.isCorrect ? 'good' : 'bad'}-${new Date().getTime()}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // Also save the image with the skeleton
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
        imgLink.download = `${state.selectedExercise}-${state.viewAngle}-${state.poseCorrectness.isCorrect ? 'good' : 'bad'}-${new Date().getTime()}.png`;
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

// Add styles for the app
function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      transition: background-color 0.3s;
    }
    .button:hover {
      opacity: 0.9;
    }
    .button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #startButton {
      background-color: #4CAF50;
      color: white;
    }
    #stopButton {
      background-color: #f44336;
      color: white;
    }
    .config-controls {
      margin: 15px 0;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 5px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .feedback-panel h3 {
      margin-top: 0;
    }
  `;
  document.head.appendChild(style);
}

// Initialize the application
function initialize() {
  setupCanvas();
  addConfigControls();
  setupSnapshotButton();
  setupLabelToggleButton();
  addStyles();
  loadMoveNet();
  
  // Initialize state
  state.showLabels = false;
  
  // Update status with initial exercise selection
  updateStatus(`Ready to detect ${state.selectedExercise.toUpperCase()} pose (${state.viewAngle} view)`);
}

// Set up event listeners
window.addEventListener('DOMContentLoaded', initialize);
startButton.addEventListener('click', startPoseDetection);
stopButton.addEventListener('click', stopPoseDetection);
toggleSkeletonButton.addEventListener('click', toggleSkeleton);