// Google Analytics 4 初始化（評估 ID 從 script 標籤的 data-id 讀取，設定在 js/site-config.js）
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag("js", new Date());
gtag("config", document.currentScript.dataset.id, { anonymize_ip: true });
