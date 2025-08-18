// src/config/firebaseAdmin.js
const admin = require('firebase-admin');

const initializeFirebaseAdmin = () => {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
};

module.exports = { initializeFirebaseAdmin, admin };
