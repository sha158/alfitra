// src/config/firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // <-- Correct path

const initializeFirebaseAdmin = () => {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin SDK initialized successfully');
    } else {
      console.log('Firebase Admin SDK already initialized');
    }
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
};

module.exports = { initializeFirebaseAdmin, admin };
