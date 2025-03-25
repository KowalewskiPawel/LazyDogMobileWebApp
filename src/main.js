// Main entry point for the application
import * as tf from '@tensorflow/tfjs';
import { initApp } from './app.js';

// Wait for DOM to be loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Application starting...');
  console.log('TensorFlow.js version:', tf.version.tfjs);
  
  // Initialize the pose detection app
  initApp();
});
