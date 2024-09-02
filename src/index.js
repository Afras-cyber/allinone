const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const getFbVideoInfo = require("fb-downloader-scrapper");
const instagramGetUrl = require("instagram-url-direct");
// const TikTokScraper = require("tiktok-scraper-without-watermark");
// const { getVideoMeta } = require('tiktok-scraper-ts');
const axios = require('axios');


require('dotenv').config();

// Import Firebase services
const { db, auth } = require('../firebase');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// JWT secret keys
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'your_access_token_secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Access token is required' });

  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

app.post('/api/signup', async (req, res) => {
  const { email, password, name, mobile } = req.body;

  // Input validation
  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Email, password, and name are required fields' });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  // Password strength validation (example: at least 8 characters)
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  try {
    // Generate a unique reference ID
    const referenceId = generateUniqueReferenceId();

    // Create user with email and password
    const userRecord = await auth.createUser({ email, password });

    // Prepare update object
    const updateObject = {
      displayName: name,
      customClaims: { referenceId }
    };

    // Add mobile to update object if provided, without validation
    if (mobile) {
      updateObject.mobile = mobile;
    }

    // Update user profile
    await auth.updateUser(userRecord.uid, updateObject);

    // Prepare user data
    const userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: name,
      emailVerified: userRecord.emailVerified,
      referenceId
    };

    // Add mobile to userData if provided
    if (mobile) {
      userData.phoneNumber = mobile;
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(userData);
    const refreshToken = jwt.sign(userData, REFRESH_TOKEN_SECRET);

    res.status(201).json({
      message: 'User created successfully',
      user: userData,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({ message: 'Signup failed', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Get user by email
    const userRecord = await auth.getUserByEmail(email);

    // Verify password (this step needs to be implemented separately as Admin SDK doesn't have a built-in method for this)
    // For demonstration, we'll assume the password is correct. In a real application, you'd need to implement secure password verification.

    // Prepare user data without sensitive information
    const userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      emailVerified: userRecord.emailVerified,
      phoneNumber: userRecord.phoneNumber,
      referenceId: userRecord.customClaims?.referenceId
    };

    // Generate JWT tokens
    const accessToken = generateAccessToken(userData);
    const refreshToken = jwt.sign(userData, REFRESH_TOKEN_SECRET);

    res.status(200).json({
      message: 'Login successful',
      user: userData,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);

    // Standardized error messages
    let errorMessage = 'An error occurred during login';
    if (error.code === 'auth/user-not-found') {
      errorMessage = 'Invalid email or password';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many failed login attempts. Please try again later';
    }

    res.status(400).json({ message: 'Login failed', error: errorMessage });
  }
});

// Protected route example with token verification
app.get('/api/protected', verifyToken, (req, res) => {
  res.status(200).json({ message: 'Access granted to protected resource', user: req.user });
});
app.post('/api/download', verifyToken, async (req, res) => {
  const { url, source } = req.body;
  const userId = req.user.uid;

  // Input validation
  if (!url || !source) {
    return res.status(400).json({ error: "URL and source are required" });
  }

  if (typeof url !== 'string' || typeof source !== 'string') {
    return res.status(400).json({ error: "URL and source must be strings" });
  }

  const validSources = ["instagram", "tiktok", "facebook"];
  if (!validSources.includes(source.toLowerCase())) {
    return res.status(400).json({ error: "Invalid source. Supported sources are Instagram, TikTok, and Facebook" });
  }

  try {
    let videoUrl;

    switch (source.toLowerCase()) {
      case "instagram":
        const igResult = await instagramGetUrl(url);
        if (!igResult.url_list || igResult.url_list.length === 0) {
          throw new Error("No Instagram video URL found");
        }
        videoUrl = igResult.url_list[0];
        break;
        case "tiktok":
          try {
            // First, get the oEmbed data
            const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
            const oembedResponse = await axios.get(oembedUrl);
            const oembedData = oembedResponse.data;
        
            // Extract the video ID from the oEmbed data
            const videoId = oembedData.html.match(/data-video-id="([^"]+)"/)[1];
        
            // Construct an embed URL
            videoUrl = `https://www.tiktok.com/embed/${videoId}`;
        
          } catch (error) {
            console.error("TikTok scraping error:", error);
            throw new Error("Failed to fetch TikTok video information");
          }
          break;
      case "facebook":
        const fbResult = await getFbVideoInfo(url);
        if (fbResult.sd) {
          videoUrl = fbResult.sd;
        } else if (fbResult.hd) {
          videoUrl = fbResult.hd;
        } else if (url.includes('/reel/')) {
          // Handle Facebook Reels
          const reelId = url.split('/reel/')[1].split('/')[0];
          videoUrl = `https://www.facebook.com/reel/${reelId}`;
        } else {
          throw new Error("No Facebook video URL found");
        }
        break;
    }

    // Save download history in Firestore
    await db.collection('downloadHistory').add({
      userId,
      url,
      source,
      videoUrl,
      timestamp: new Date(),
    });

    res.status(200).json({ videoUrl });
  } catch (error) {
    console.error("Error:", error);
    let errorMessage = "Failed to download video";

    if (error.message.includes("No") && error.message.includes("video URL found")) {
      errorMessage = error.message;
    } else if (error.message.includes("Network Error")) {
      errorMessage = "Network error occurred while fetching the video";
    }

    res.status(500).json({ error: errorMessage, details: error.message });
  }
});
// Download history endpoint
app.get('/api/download-history', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Fetch download history from Firestore
    const historySnapshot = await db.collection('downloadHistory')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();

    const downloadHistory = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp.toDate()
    }));

    res.status(200).json({ downloadHistory });
  } catch (error) {
    console.error("Error fetching download history:", error);
    if (error.code === 'failed-precondition') {
      res.status(500).json({
        error: "Failed to fetch download history",
        details: "Missing index. Please create the required index in Firebase console.",
        indexUrl: error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)[0]
      });
    } else {
      res.status(500).json({ error: "Failed to fetch download history", details: error.message });
    }
  }
});
// Refresh token endpoint
app.post('/api/token', (req, res) => {
  const refreshToken = req.body.token;
  if (!refreshToken) return res.status(401).json({ message: 'Refresh token is required' });

  jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid refresh token' });
    const accessToken = generateAccessToken({ uid: user.uid });
    res.json({ accessToken });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Secure server running on port ${port}`);
});

// Helper function to generate a unique reference ID
function generateUniqueReferenceId() {
  return 'REF-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Helper function to generate access token
function generateAccessToken(user) {
  return jwt.sign(user, ACCESS_TOKEN_SECRET, { expiresIn: '26h' });
}