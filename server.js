const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔐 Use your Render API key from env variable
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_API_URL = "https://api.render.com/v1/services";

app.post("/deploy", async (req, res) => {
  const { repoUrl } = req.body;

  if (!repoUrl || !repoUrl.startsWith("https://github.com/")) {
    return res.status(400).json({ error: "Invalid GitHub URL" });
  }

  const repoParts = repoUrl.split("/");
  const repoName = repoParts[repoParts.length - 1].replace(/\.git$/, "");
  const serviceName = `user-${Math.floor(Math.random() * 10000)}-${repoName}`;

  try {
    const response = await axios.post(
      RENDER_API_URL,
      {
        type: "web_service",
        name: serviceName,
        repo: repoUrl,
        branch: "main",
        env: "node",
        buildCommand: "npm install",
        startCommand: "npm start",
        plan: "starter"
      },
      {
        headers: {
          Authorization: `Bearer ${RENDER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      message: "Deployment started!",
      serviceId: response.data.id,
      serviceName: response.data.name,
      dashboardLink: `https://dashboard.render.com/web/${response.data.id}`,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: "Deployment failed",
      details: err.response?.data || err.message,
    });
  }
});

// ✅ Required for Render deployment
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
