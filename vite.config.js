import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    host: '0.0.0.0', 
    proxy: {
      // Proxy API requests to our Express server
      '/video_feed': 'http://localhost:3000',
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
