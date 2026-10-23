import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import App from './App.vue';
import { i18n } from './i18n';
import './styles/app.css';

// follow the light/dark setting of the system
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches);
applyTheme();
dark.addEventListener('change', applyTheme);

createApp(App).use(createPinia()).use(i18n).use(ElementPlus).mount('#app');
