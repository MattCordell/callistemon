import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure correct paths when deploying to GitHub Pages under /PatientReception/
  base: '/PatientReception/',
});