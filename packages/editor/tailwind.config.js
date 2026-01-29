/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    // ✅ Importante: não aplicar reset em elementos do React Flow
    corePlugins: {
      preflight: true, // Manter habilitado mas com exceções via CSS
    },
    theme: {
      extend: {
        colors: {
          'node-video': '#4a90e2',
          'node-choice': '#ffa726',
          'node-end': '#ff6b6b',
        },
        boxShadow: {
          'node': '0 2px 10px rgba(0,0,0,0.1)',
          'node-selected': '0 4px 20px rgba(0,102,255,0.3)',
        }
      },
    },
    plugins: [],
  }
  