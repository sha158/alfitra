// src/config/firebaseAdmin.js
const admin = require('firebase-admin');

const initializeFirebaseAdmin = () => {
  try {
    // const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

    admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
};

module.exports = { initializeFirebaseAdmin, admin };
