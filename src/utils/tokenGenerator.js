// src/utils/tokenGenerator.js
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (payload, expiresIn = process.env.JWT_EXPIRE) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn
  });
};

// Verify JWT Token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Generate tokens for different purposes
const generateAuthTokens = (user) => {
  // Access token - short lived (1 day)
  const accessToken = generateToken({
    id: user._id,
    tenant: user.tenant,
    role: user.role,
    email: user.email
  }, '1d');
  
  // Refresh token - long lived (7 days)
  const refreshToken = generateToken({
    id: user._id,
    tenant: user.tenant,
    type: 'refresh'
  }, '7d');
  
  return {
    accessToken,
    refreshToken
  };
};

// Send token response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();
  
  const options = {
    expires: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    ),
    httpOnly: true
  };
  
  // Set secure flag in production
  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }
  
  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        tenant: user.tenant,
        isSuperAdmin: user.isSuperAdmin || false
      }
    });
};

module.exports = {
  generateToken,
  verifyToken,
  generateAuthTokens,
  sendTokenResponse
};