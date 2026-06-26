importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDZvF5sKBaGwt9rGJc2awfgQV6qPeeqpBM',
  authDomain: 'consultorio-diego.firebaseapp.com',
  projectId: 'consultorio-diego',
  storageBucket: 'consultorio-diego.firebasestorage.app',
  messagingSenderId: '891539781587',
  appId: '1:891539781587:web:da680d4fdd59e8aac1a126',
})

const messaging = firebase.messaging()
