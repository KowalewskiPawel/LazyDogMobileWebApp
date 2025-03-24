async function setupCamera() {
  const video = document.getElementById('video');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true
  });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadPosenet() {
  const net = await posenet.load();
  return net;
}

async function detectPose(video, net) {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  async function poseDetectionFrame() {
    const pose = await net.estimateSinglePose(video, {
      flipHorizontal: false
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    pose.keypoints.forEach((keypoint) => {
      if (keypoint.score > 0.5) {
        ctx.beginPath();
        ctx.arc(keypoint.position.x, keypoint.position.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
      }
    });

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();
}

async function main() {
  const video = await setupCamera();
  video.play();
  const net = await loadPosenet();
  detectPose(video, net);
}

main();
