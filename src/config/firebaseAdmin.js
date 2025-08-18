// src/config/firebaseAdmin.js
const admin = require('firebase-admin');

// Initialize Firebase Admin
const initializeFirebaseAdmin = () => {
  try {
    // Option 1: Using service account JSON file
    const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    // Option 2: Using environment variables
    // admin.initializeApp({
    //   credential: admin.credential.cert({
    //     projectId: process.env.FIREBASE_PROJECT_ID,
    //     clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    //     privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    //   })
    // });
    
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
};

module.exports = { initializeFirebaseAdmin, admin };