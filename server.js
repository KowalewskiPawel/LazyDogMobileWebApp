import express from 'express';
import http from 'http';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configuration
const config = {
  robotIp: process.env.ROBOT_IP || '192.168.2.3', // Replace with your Raspberry Pi's IP
  robotPort: process.env.ROBOT_PORT || 5000
};

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the dist directory in production
app.use(express.static(path.join(__dirname, '../dist')));

// Create a proxy route for video feed
app.get('/video_feed', async (req, res) => {
  try {
    console.log('Proxying video feed request to robot');
    
    // Use node's http module to proxy the request
    const piUrl = `http://${config.robotIp}:${config.robotPort}/video_feed`;
    
    const piRequest = http.get(piUrl, (piResponse) => {
      console.log(`Received response from Pi with status: ${piResponse.statusCode}`);
      
      // MJPEG streams should have this content type
      // If missing from Pi response, add it explicitly
      if (!piResponse.headers['content-type']) {
        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
      }
      
      // Copy all headers from Pi response
      Object.keys(piResponse.headers).forEach(key => {
        res.setHeader(key, piResponse.headers[key]);
      });
      
      // Set cache-control header to prevent caching issues
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Pipe the response directly
      piResponse.pipe(res);
      
      // Handle errors on the Pi response stream
      piResponse.on('error', (err) => {
        console.error('Error in Pi response stream:', err);
        if (!res.headersSent) {
          res.status(500).send('Stream error from Pi camera');
        }
      });
    });
    
    // Handle errors on the request to Pi
    piRequest.on('error', (err) => {
      console.error('Error connecting to Pi:', err.message);
      res.status(502).send(`Cannot connect to Pi camera at ${config.robotIp}:${config.robotPort} - ${err.message}`);
    });
    
    // Set a timeout for Pi connection
    piRequest.setTimeout(10000, () => {
      console.error('Connection to Pi camera timed out');
      piRequest.destroy();
      if (!res.headersSent) {
        res.status(504).send('Connection to Pi camera timed out - check if the camera service is running');
      }
    });
    
    // Handle client disconnect
    req.on('close', () => {
      console.log('Client closed connection, aborting proxy request');
      piRequest.destroy();
    });
    
  } catch (error) {
    console.error('Error proxying video feed:', error);
    res.status(500).send('Error fetching video feed');
  }
});

// Serve the Vite-built frontend for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start HTTP server
const PORT = process.env.PORT || 3000;
http.createServer(app).listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Pi camera feed will be available at http://localhost:${PORT}/video_feed`);
});
