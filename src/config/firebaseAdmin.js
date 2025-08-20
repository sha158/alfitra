// src/config/firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Adjust filename if different

const initializeFirebaseAdmin = () => {
  try {
    // Check if Firebase app is already initialized to avoid re-initialization
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
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