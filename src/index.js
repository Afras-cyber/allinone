import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import jwt from "jsonwebtoken";
import getFbVideoInfo from "fb-downloader-scrapper";
import instagramGetUrl from "instagram-url-direct";
import s from "videos-downloader";
// import pkg from 'nayan-media-downloader';
import dotenv from "dotenv";
import { db, auth } from "../firebase.js";
// const { tikdown } = pkg;
import tik from 'rahad-media-downloader'
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

// Constants
const ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET || "your_access_token_secret";
const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || "your_refresh_token_secret";

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token)
    return res.status(401).json({ message: "Access token is required" });

  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token" });
    req.user = user;
    next();
  });
};

// Routes
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running" });
});

app.post("/api/signup", async (req, res) => {
  const { email, password, name, mobile } = req.body;

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ message: "Email, password, and name are required fields" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long" });
  }

  try {
    const referenceId = generateUniqueReferenceId();
    const userRecord = await auth.createUser({ email, password });

    const updateObject = {
      displayName: name,
      customClaims: { referenceId },
    };

    if (mobile) updateObject.phoneNumber = mobile;

    await auth.updateUser(userRecord.uid, updateObject);

    const userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: name,
      emailVerified: userRecord.emailVerified,
      referenceId,
      ...(mobile && { phoneNumber: mobile }),
    };

    const accessToken = generateAccessToken(userData);
    const refreshToken = jwt.sign(userData, REFRESH_TOKEN_SECRET);

    res.status(201).json({
      message: "User created successfully",
      user: userData,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(400).json({ message: "Signup failed", error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const userRecord = await auth.getUserByEmail(email);
    // Note: Implement proper password verification here

    const userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      emailVerified: userRecord.emailVerified,
      phoneNumber: userRecord.phoneNumber,
      referenceId: userRecord.customClaims?.referenceId,
    };

    const accessToken = generateAccessToken(userData);
    const refreshToken = jwt.sign(userData, REFRESH_TOKEN_SECRET);

    res.status(200).json({
      message: "Login successful",
      user: userData,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    const errorMessage =
      error.code === "auth/user-not-found"
        ? "Invalid email or password"
        : "An error occurred during login";
    res.status(400).json({ message: "Login failed", error: errorMessage });
  }
});

app.post("/api/update-download", verifyToken, async (req, res) => {
  const { url, video_url, source, date, status, thumbnail, fileName } =
    req.body;
  const userId = req.user.uid;

  if (!url || !source || !status) {
    return res
      .status(400)
      .json({ error: "URL, source, and status are required" });
  }

  try {
    const downloadRecord = {
      userId,
      url,
      source,
      video_url,
      status,
      timestamp: date ? new Date(date) : new Date(),
      ...(thumbnail && { thumbnail }),
      ...(fileName && { fileName }),
    };

    const docRef = await db.collection("downloadHistory").add(downloadRecord);

    res
      .status(201)
      .json({
        message: "Download history updated successfully",
        id: docRef.id,
      });
  } catch (error) {
    console.error("Error updating download history:", error);
    res
      .status(500)
      .json({
        error: "Failed to update download history",
        details: error.message,
      });
  }
});

app.post("/api/download", verifyToken, async (req, res) => {
  const { url, source } = req.body;
  const userId = req.user.uid;

  if (
    !url ||
    !source ||
    typeof url !== "string" ||
    typeof source !== "string"
  ) {
    return res
      .status(400)
      .json({ error: "URL and source are required and must be strings" });
  }

  const validSources = ["instagram", "tiktok", "facebook", "twitter"];
  if (!validSources.includes(source.toLowerCase())) {
    return res
      .status(400)
      .json({
        error: `Invalid source. Supported sources are ${validSources.join(
          ", "
        )}`,
      });
  }

  try {
    const data = await getVideoData(url, source.toLowerCase());
    res.status(200).json(data);
  } catch (error) {
    console.error("Error:", error);
    res
      .status(500)
      .json({ error: "Failed to download video", details: error.message });
  }
});

// Helper functions
async function getVideoData(url, source) {
  switch (source) {
    case "twitter":
      const twitterData = s.twitter(url);
      if (!twitterData?.media_extended[0]?.url) {
        throw new Error("No Twitter video URL found");
      }
      return {
        videoUrl: twitterData.media_extended[0].url,
        thumbnail_url: twitterData.media_extended[0].thumbnail_url,
      };
    case "instagram":
      const igResult = await instagramGetUrl(url);
      if (!igResult.url_list || igResult.url_list.length === 0) {
        throw new Error("No Instagram video URL found");
      }
      return {
        videoUrl: igResult.url_list[0],
        thumbnail_url: null,
      };
    case "tiktok":
      // const tiktokData = await tikdown(url);
      const tiktokData = await tik.rahadtikdl(url);
        if (!tiktokData?.data?.noWatermarkMp4) {
        throw new Error("No TikTok video URL found");
        }
      return {
        videoUrl: tiktokData?.data?.noWatermarkMp4,
        thumbnail_url: tiktokData?.data?.avatar
      };
      break;

    case "facebook":
      const fbResult = await getFbVideoInfo(url);
      if (!fbResult) {
        throw new Error("No Facebook video info found");
      }
      return {
        videoUrl:
          fbResult.sd ||
          fbResult.hd ||
          `https://www.facebook.com/reel/${url.split("/reel/")[1]?.split("/")[0]
          }`,
        thumbnail_url: fbResult.thumbnail,
      };
    default:
      throw new Error("Unsupported source");
  }
}

function generateUniqueReferenceId() {
  return "REF-" + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function generateAccessToken(user) {
  return jwt.sign(user, ACCESS_TOKEN_SECRET, { expiresIn: "26h" });
}

app.listen(port, () => {
  console.log(`Secure server running on port ${port}`);
});
