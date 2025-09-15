// Firebase 設定檔案
// 請將你的 Firebase 設定貼到這裡
const firebaseConfig = {
    apiKey: "AIzaSyDAhVXGN_C1rT9sZnseXLYSVRvy5GYlgRk",
    authDomain: "expense-tracker-9523d.firebaseapp.com",
    projectId: "expense-tracker-9523d",
    storageBucket: "expense-tracker-9523d.firebasestorage.app",
    messagingSenderId: "345966353793",
    appId: "1:345966353793:web:4c3aecf936dbb3f6301c80",
    measurementId: "G-EC64QEY45T"
  };
  
  // 初始化 Firebase
  firebase.initializeApp(firebaseConfig);
  
  // 初始化 Firestore - 使用 window 對象使其全局可用
  window.db = firebase.firestore();