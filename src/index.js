const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { verifyToken } = require('./middlewares/authMiddleware');

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await auth.createUser({ email, password });
    res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    res.status(400).json({ message: 'Signup failed', error: error.message });
  }
});

// Protected route example with token verification
app.get('/api/protected', verifyToken, (req, res) => {
  res.status(200).json({ message: 'Access granted to protected resource' });
});

// Download endpoint with Firestore update
app.post('/api/download', verifyToken, async (req, res) => {
  const { url, source } = req.body;
  const userId = req.user.uid;

  try {
    let videoUrl;

    switch (source.toLowerCase()) {
      case "instagram":
        const igResult = await instagramGetUrl(url);
        videoUrl = igResult.url_list[0];
        break;
      case "tiktok":
        const ttResult = await TikTokScraper(url);
        videoUrl = ttResult.video;
        break;
      case "facebook":
        const fbResult = await getFbVideoInfo(url);
        videoUrl = fbResult.sd;
        break;
      default:
        return res.status(400).json({ error: "Unsupported source" });
    }

    if (!videoUrl) {
      throw new Error("No video URL found");
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
    res.status(500).json({ error: "Failed to download video", details: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Secure server running on port ${port}`);
});
