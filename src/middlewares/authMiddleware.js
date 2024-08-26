const { auth } = require("../../firebase");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ message: "Unauthorized: Token has expired" });
    }
    res.status(401).json({ message: "Unauthorized: Invalid token", error: error.message });
  }
};

module.exports = { verifyToken };