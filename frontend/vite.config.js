import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [react(), tailwindcss()],
        // Dev-only proxy; set VITE_API_URL instead to call the backend directly.
        server: { proxy: { '/api': env.VITE_PROXY_TARGET || 'http://localhost:5000' } },
    };
});
