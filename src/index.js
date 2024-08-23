const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

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

// Endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

app.post('/api/data', (req, res) => {
  // TODO: Implement data validation
  const data = req.body;
  // TODO: Process the data (e.g., save to database)
  res.status(201).json({ message: 'Data received successfully', data });
});

app.get('/api/protected', (req, res) => {
  // TODO: Implement proper authentication middleware
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }
  // TODO: Verify the token
  res.status(200).json({ message: 'Access granted to protected resource' });
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

// Download endpoint
app.get('/api/download/:id', async (req, res) => {
  const fileId = req.params.id;
  try {
    const file = await db.collection('files').doc(fileId).get();
    if (!file.exists) {
      return res.status(404).json({ message: 'File not found' });
    }
    const fileData = file.data();
    res.download(fileData.path, fileData.name, (err) => {
      if (err) {
        res.status(500).json({ message: 'Download failed', error: err.message });
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Download endpoint for various social media platforms
app.post('/api/download', async (req, res) => {
  const { url, source } = req.body;

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
